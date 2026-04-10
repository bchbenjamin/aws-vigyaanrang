// ============================================================
//  Breach & Defend — Complete Game Server
//  Custom Next.js server with Socket.io game engine
// ============================================================
require('dotenv').config();
const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

// ─── CONSTANTS ──────────────────────────────────────────────
const ALL_ROOMS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab', 'The Log Room', 'Breakroom'];
const TASK_ROOMS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab'];
const MOVE_DELAY_MS = 3000;
const HACK_COOLDOWN_MS = 180000; // 3 minutes
const STANDUP_DURATION_MS = 90000; // 90 seconds
const GAME_DURATION_MS = 1800000; // 30 minutes
const TASKS_FOR_WIN = 50;
const SABOTAGE_WIN_THRESHOLD = 20;

// ─── GAME STATE ─────────────────────────────────────────────
let gameState = createFreshState();

function createFreshState() {
  return {
    phase: 'lobby',
    players: {},
    registeredUsers: {},
    globalProgress: 0,
    totalTasksSolved: 0,
    totalSabotageDone: 0,
    motionLog: [],
    logsCorrupted: false,
    logsCorruptedTimer: null,
    standupData: null,
    gameTimer: null,
    gameStartTime: null,
    gameEndTime: null,
    winSide: null,
    scores: {},
  };
}

// ─── DATA DRIVEN PUZZLES ────────────────────────────────────
const puzzlesDB = require('./src/data/puzzles.json');
const realPuzzlesDB = puzzlesDB.filter(p => !p.isSabotage && !p.isFake);
const sabotagePuzzlesDB = puzzlesDB.filter(p => p.isSabotage);
const fakePuzzlesDB = puzzlesDB.filter(p => p.isFake);

function getPointsForDifficulty(difficulty) {
  if (difficulty === 'hard') return 3;
  if (difficulty === 'medium') return 2;
  return 1; // default easy
}

function getRandomTaskId(room, playerId) {
  const solvedObj = playerId && gameState.players[playerId] ? gameState.players[playerId].solvedTasks || [] : [];
  let pool = realPuzzlesDB.filter(p => p.room === room || p.room === '*');
  let unsolved = pool.filter(p => !solvedObj.includes(p.id));
  if (unsolved.length === 0) unsolved = pool; // recycle
  if (unsolved.length === 0) return null;
  return unsolved[Math.floor(Math.random() * unsolved.length)].id;
}

function getSabotageTaskId(playerId) {
  const solvedObj = playerId && gameState.players[playerId] ? gameState.players[playerId].solvedTasks || [] : [];
  let pool = sabotagePuzzlesDB;
  let unsolved = pool.filter(p => !solvedObj.includes(p.id));
  if (unsolved.length === 0) unsolved = pool;
  if (unsolved.length === 0) return null;
  return unsolved[Math.floor(Math.random() * unsolved.length)].id;
}

function getFakeTaskId(playerId) {
  const solvedObj = playerId && gameState.players[playerId] ? gameState.players[playerId].solvedTasks || [] : [];
  let pool = fakePuzzlesDB;
  let unsolved = pool.filter(p => !solvedObj.includes(p.id));
  if (unsolved.length === 0) unsolved = pool;
  if (unsolved.length === 0) return null;
  return unsolved[Math.floor(Math.random() * unsolved.length)].id;
}

// ─── HELPERS ────────────────────────────────────────────────
function getPlayersInRoom(room) {
  return Object.values(gameState.players).filter(p => p.room === room && p.status !== 'disconnected');
}

function getAlivePlayers() {
  return Object.values(gameState.players).filter(p => p.status === 'alive');
}

function getAliveHackers() {
  return getAlivePlayers().filter(p => p.role === 'hacker');
}

function getAliveDevelopers() {
  return getAlivePlayers().filter(p => p.role === 'developer');
}

function getRoomCounts() {
  const counts = {};
  ALL_ROOMS.forEach(room => {
    counts[room] = getPlayersInRoom(room).length;
  });
  return counts;
}

function addMotionEvent(room) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  gameState.motionLog.push({ time, message: `Motion detected in ${room}`, timestamp: Date.now() });
  if (gameState.motionLog.length > 15) gameState.motionLog.shift();
}

function addScore(playerId, points) {
  if (!gameState.scores[playerId]) gameState.scores[playerId] = 0;
  gameState.scores[playerId] += points;
}

function checkWinConditions(io) {
  console.log("checkWinConditions called!");
  if (gameState.phase !== 'playing') return;

  const aliveDevs = getAliveDevelopers();
  
  const aliveHackers = getAliveHackers();
  if (gameState.globalProgress >= 100) {
    endGame(io, 'developers', 'Project completed to 100%!');
    return;
  }
  if (aliveHackers.length === 0) {
    endGame(io, 'developers', 'All hackers have been identified and ejected!');
    return;
  }
  if (aliveDevs.length <= aliveHackers.length) {
    endGame(io, 'hackers', 'Hackers have overwhelmed the developers!');
    return;
  }
  if (gameState.totalSabotageDone >= SABOTAGE_WIN_THRESHOLD) {
    endGame(io, 'hackers', 'Critical sabotage threshold reached!');
    return;
  }
}

function endGame(io, winSide, reason) {
  console.log("endGame called:", winSide, reason);
  gameState.phase = 'ended';
  gameState.winSide = winSide;
  if (gameState.gameTimer) clearTimeout(gameState.gameTimer);

  Object.values(gameState.players).forEach(p => {
    if (p.status === 'disconnected') return;
    const isSideWin = (winSide === 'developers' && p.role === 'developer') || (winSide === 'hackers' && p.role === 'hacker');
    if (isSideWin) addScore(p.id, 3);
  });

  if (winSide === 'developers') {
    const aliveDev = getAliveDevelopers();
    if (aliveDev.length === 1) addScore(aliveDev[0].id, 2);
  }

  io.emit('game_ended', { winSide, reason, players: gameState.players, scores: gameState.scores });
}

function resolveVoting(io) {
  console.log("resolveVoting called!");
  if (gameState.phase !== 'standup' || !gameState.standupData) return;

  const votes = gameState.standupData.votes;
  const tally = {};

  Object.values(votes).forEach(targetId => {
    if (targetId === 'skip') return;
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  let ejectedId = null;
  let maxVotes = 0;
  let tie = false;

  Object.entries(tally).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      ejectedId = id;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  if (tie || maxVotes === 0) ejectedId = null;

  let ejectedPlayer = null;
  if (ejectedId && gameState.players[ejectedId]) {
    ejectedPlayer = gameState.players[ejectedId];
    ejectedPlayer.status = 'ejected';

    if (ejectedPlayer.role === 'hacker') {
      Object.entries(votes).forEach(([voterId, targetId]) => {
        if (targetId === ejectedId) addScore(voterId, 1);
      });
    }
  }

  gameState.phase = 'playing';
  gameState.standupData = null;

  io.emit('standup_resolved', {
    ejected: ejectedPlayer ? { id: ejectedPlayer.id, name: ejectedPlayer.name, role: ejectedPlayer.role } : null,
    tie,
    tally,
  });

  io.to('Breakroom').emit('room_update', { players: getRoomPlayers('Breakroom') });
  io.emit('room_counts', getRoomCounts());
  checkWinConditions(io);
}

// ─── SERVER INIT ────────────────────────────────────────────
app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    perMessageDeflate: true,
    path: '/socket.io',
  });

  globalThis.__io = io;
  globalThis.__gameState = gameState;

  io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    // ── JOIN GAME ─────────────────────────────────────────
    socket.on('join_game', (data) => {
      const code = (data?.code || '').trim();
      const registeredName = gameState.registeredUsers[code];
      
      if (!registeredName) {
        socket.emit('error_msg', 'Invalid access code! Get an access code from the admin.');
        socket.emit('force_disconnect'); // Custom event for the frontend
        return;
      }
      
      const name = registeredName.substring(0, 20);

      // Check if this player was disconnected and is reconnecting
      const oldPlayerEntry = Object.entries(gameState.players).find(
        ([_, p]) => p.name === name && p.status === 'disconnected'
      );

      let targetRoom = 'Breakroom';

      if (oldPlayerEntry) {
        const [oldId, oldP] = oldPlayerEntry;
        // Restore their state to the new socket connection
        gameState.players[socket.id] = { ...oldP, id: socket.id, status: 'alive' };
        gameState.scores[socket.id] = gameState.scores[oldId] || 0;
        targetRoom = oldP.room;

        // Clean up the old, disconnected ghost record
        delete gameState.players[oldId];
        delete gameState.scores[oldId];

        // Also fix standup votes if active
        if (gameState.standupData && gameState.standupData.votes[oldId]) {
          gameState.standupData.votes[socket.id] = gameState.standupData.votes[oldId];
          delete gameState.standupData.votes[oldId];
        }
      } else {
        // Standard totally new player connection
        gameState.players[socket.id] = {
          id: socket.id,
          name,
          room: 'Breakroom',
          role: 'developer',
          status: 'alive',
          hackCooldownUntil: 0,
          anomalyAlertUsed: false,
          currentTaskId: null,
          isMoving: false,
          solvedTasks: [],
        };
        gameState.scores[socket.id] = 0;
      }
      
      socket.join(targetRoom);

      socket.emit('state_sync', {
        phase: gameState.phase,
        you: gameState.players[socket.id],
        roomPlayers: getPlayersInRoom(targetRoom).map(p => ({ id: p.id, name: p.name, status: p.status })),
        globalProgress: gameState.globalProgress,
        motionLog: gameState.logsCorrupted ? null : gameState.motionLog,
        logsCorrupted: gameState.logsCorrupted,
      });

      io.to(targetRoom).emit('player_joined', { id: socket.id, name });
      
      // Update the room for everyone now that they've appeared/re-appeared
      io.to(targetRoom).emit('room_update', {
        players: getPlayersInRoom(targetRoom).map(p => ({ id: p.id, name: p.name, status: p.status })),
      });

      io.emit('player_count', Object.values(gameState.players).filter(p => p.status !== 'disconnected').length);
    });

    // ── ADMIN START WITH ROLES ────────────────────────────
    socket.on('admin_start_with_roles', (rolesMap) => {
      if (gameState.phase !== 'lobby') return;

      const playerIds = Object.keys(gameState.players);
      if (playerIds.length < 1) {
        socket.emit('error_msg', 'Need at least 1 player to start');
        return;
      }

      // Count hackers in the provided mapping
      let hackerCount = 0;
      for (const id of playerIds) {
        if (rolesMap[id] === 'hacker') hackerCount++;
      }

      if (hackerCount < 1) {
        socket.emit('error_msg', 'Cannot start game without at least 1 Hacker.');
        return;
      }

      gameState.phase = 'playing';
      gameState.gameStartTime = Date.now();

      playerIds.forEach(id => {
        gameState.players[id].role = rolesMap[id] === 'hacker' ? 'hacker' : 'developer';
        gameState.players[id].status = 'alive';
      });

      playerIds.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s) {
          s.emit('game_started', {
            role: gameState.players[id].role,
            hackerCount,
            totalPlayers: playerIds.length,
          });
        }
      });

      gameState.gameTimer = setTimeout(() => {
        if (gameState.globalProgress >= 50) {
          endGame(io, 'developers', 'Time expired — Developers had majority progress!');
        } else {
          endGame(io, 'hackers', 'Time expired — Hackers prevented project completion!');
        }
      }, GAME_DURATION_MS);

      io.emit('phase_change', { phase: 'playing' });
    });

    // ── ADMIN STOP GAME ──────────────────────────────────
    socket.on('admin_stop_game', () => {
      // Disconnect clients to login page
      io.emit('force_disconnect');

      // Clear timers
      if (gameState.gameTimer) clearTimeout(gameState.gameTimer);
      if (gameState.logsCorruptedTimer) clearTimeout(gameState.logsCorruptedTimer);
      
      // Reset State
      const oldUsers = gameState.registeredUsers; 
      gameState = createFreshState();
      gameState.registeredUsers = oldUsers;
      globalThis.__gameState = gameState;
      
      io.emit('game_reset');
    });

    // ── MOVE ROOM ────────────────────────────────────────
    socket.on('move_room', (targetRoom) => {
      const player = gameState.players[socket.id];
      if (!player || player.status === 'ejected' || player.status === 'disconnected') return;
      if (!ALL_ROOMS.includes(targetRoom)) return;
      if (player.room === targetRoom || player.isMoving) return;
      if (gameState.phase === 'standup') return;

      const oldRoom = player.room;
      const isFirewall = player.status === 'firewall';
      const delay = isFirewall ? 0 : MOVE_DELAY_MS;

      player.isMoving = true;
      socket.emit('moving', { to: targetRoom, delay });

      setTimeout(() => {
        player.isMoving = false;
        socket.leave(oldRoom);
        player.room = targetRoom;
        socket.join(targetRoom);
        player.currentTaskId = null;

        addMotionEvent(targetRoom);

        io.to(oldRoom).emit('room_update', {
          players: getPlayersInRoom(oldRoom).map(p => ({ id: p.id, name: p.name, status: p.status })),
        });

        io.to(targetRoom).emit('room_update', {
          players: getPlayersInRoom(targetRoom).map(p => ({ id: p.id, name: p.name, status: p.status })),
        });

        const roomData = { room: targetRoom };
        if (targetRoom === 'The Log Room') {
          roomData.motionLog = gameState.logsCorrupted ? null : gameState.motionLog;
          roomData.logsCorrupted = gameState.logsCorrupted;
        } else if (TASK_ROOMS.includes(targetRoom)) {
          if (player.role === 'hacker') {
            roomData.fakeTaskId = getFakeTaskId(socket.id);
            roomData.sabotageTaskId = getSabotageTaskId(socket.id);
          } else if (player.status === 'alive') {
            roomData.taskId = getRandomTaskId(targetRoom, socket.id);
          }
        }
        socket.emit('entered_room', roomData);

        io.emit('room_counts', getRoomCounts());
      }, delay);
    });

    // ── REQUEST TASK ──────────────────────────────────────
    socket.on('request_task', () => {
      const player = gameState.players[socket.id];
      if (!player || player.status !== 'alive' || gameState.phase !== 'playing') return;
      if (!TASK_ROOMS.includes(player.room)) return;

      if (player.role === 'hacker') {
        socket.emit('task_assigned', { fakeTaskId: getFakeTaskId(socket.id), sabotageTaskId: getSabotageTaskId(socket.id) });
      } else {
        socket.emit('task_assigned', { taskId: getRandomTaskId(player.room, socket.id) });
      }
    });

    // ── SUBMIT TASK ───────────────────────────────────────
    socket.on('task_complete', (data) => {
      const player = gameState.players[socket.id];
      if (!player || player.status !== 'alive' || gameState.phase !== 'playing') return;

      if (data.taskId && player.solvedTasks && player.solvedTasks.includes(data.taskId)) {
        return; // Prevent spamming duplicate submissions
      }

      if (data.isSabotage) {
        gameState.totalSabotageDone++;
        
        const sabotageTaskDef = sabotagePuzzlesDB.find(p => p.id === data.taskId);
        const pts = sabotageTaskDef ? getPointsForDifficulty(sabotageTaskDef.difficulty) : 1;
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + pts;
        
        if (sabotageTaskDef && player.solvedTasks) {
           player.solvedTasks.push(data.taskId);
        }
        
        socket.emit('task_result', { success: true, message: 'Sabotage planted successfully.', isSabotage: true });
        io.emit('sabotage_alert', { room: player.room, msg: `Critical corruption unfolding in ${player.room}!` });
      } else {
        // Complete real task or fake task
        const taskDef = realPuzzlesDB.find(p => p.id === data.taskId) || fakePuzzlesDB.find(p => p.id === data.taskId);
        const pts = taskDef ? getPointsForDifficulty(taskDef.difficulty) : 1;
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + pts;
        
        if (player.solvedTasks && taskDef) {
           player.solvedTasks.push(data.taskId);
        }

        gameState.totalTasksSolved += 1;
        if (player.role === 'developer') {
          const increment = (1 / TASKS_FOR_WIN) * 100;
          gameState.globalProgress = Math.min(100, gameState.globalProgress + increment);
        }
        socket.emit('task_result', { success: true, message: 'Task completed.', isSabotage: false });
      }

      io.emit('progress_update', {
        globalProgress: Math.round(gameState.globalProgress * 100) / 100,
        totalTasks: gameState.totalTasksSolved,
      });

      if (TASK_ROOMS.includes(player.room)) {
        if (player.role === 'hacker') {
          socket.emit('task_assigned', { fakeTaskId: getFakeTaskId(socket.id), sabotageTaskId: getSabotageTaskId(socket.id) });
        } else {
          socket.emit('task_assigned', { taskId: getRandomTaskId(player.room, socket.id) });
        }
      }

      checkWinConditions(io);
    });

    // ── HACK PLAYER ──────────────────────────────────────
    socket.on('hack_player', (targetId) => {
      const hacker = gameState.players[socket.id];
      const target = gameState.players[targetId];
      if (!hacker || !target) return;
      if (hacker.role !== 'hacker' || hacker.status !== 'alive') return;
      if (target.status !== 'alive' || target.role !== 'developer') return;
      if (hacker.room !== target.room) return;
      if (Date.now() < hacker.hackCooldownUntil) {
        const remaining = Math.ceil((hacker.hackCooldownUntil - Date.now()) / 1000);
        socket.emit('error_msg', `Hack on cooldown. ${remaining}s remaining.`);
        return;
      }
      if (gameState.phase !== 'playing') return;

      target.status = 'firewall';
      target.anomalyAlertUsed = false;
      hacker.hackCooldownUntil = Date.now() + HACK_COOLDOWN_MS;

      addScore(hacker.id, 2);

      io.emit('connection_lost', { victimName: target.name, room: target.room });

      const victimSocket = io.sockets.sockets.get(targetId);
      if (victimSocket) {
        victimSocket.emit('you_were_hacked', { message: 'You have been eliminated. Transitioning to Firewall mode...' });
      }

      socket.emit('hack_success', { target: target.name, cooldownUntil: hacker.hackCooldownUntil });

      io.to(target.room).emit('room_update', {
        players: getPlayersInRoom(target.room).map(p => ({ id: p.id, name: p.name, status: p.status })),
      });

      checkWinConditions(io);
    });

    // ── ANOMALY ALERT ────────────────────────────────────
    socket.on('anomaly_alert', (data) => {
      const player = gameState.players[socket.id];
      if (!player || player.status !== 'firewall') return;
      if (player.anomalyAlertUsed) {
        socket.emit('error_msg', 'You have already used your Anomaly Alert this round.');
        return;
      }

      player.anomalyAlertUsed = true;
      const room = data?.room || player.room;

      io.emit('anomaly_alert_broadcast', {
        message: `ANOMALY DETECTED: Suspicious activity flagged in ${room}`,
      });
    });

    // ── EMERGENCY STANDUP ────────────────────────────────────
    socket.on('call_standup', () => {
      const player = gameState.players[socket.id];
      if (!player || player.status !== 'alive') return;
      if (gameState.phase !== 'playing') return;

      gameState.phase = 'standup';

      Object.values(gameState.players).forEach(p => {
        if (p.status === 'alive') {
          const s = io.sockets.sockets.get(p.id);
          if (s) {
            s.leave(p.room);
            p.room = 'Breakroom';
            s.join('Breakroom');
          }
        }
      });

      gameState.standupData = { reportedBy: player.name, votes: {}, startTime: Date.now() };

      io.emit('standup_started', {
        reportedBy: player.name,
        duration: STANDUP_DURATION_MS,
        alivePlayers: getAlivePlayers().map(p => ({ id: p.id, name: p.name })),
      });
      
      // Crucial: Tell everyone in Breakroom they are now there together
      io.to('Breakroom').emit('room_update', { players: getRoomPlayers('Breakroom') });

      setTimeout(() => {
        if (gameState.phase === 'standup') resolveVoting(io);
      }, STANDUP_DURATION_MS);
    });

    // ── CAST VOTE ────────────────────────────────────────
    socket.on('cast_vote', (targetId) => {
      const player = gameState.players[socket.id];
      if (!player || player.status !== 'alive' || gameState.phase !== 'standup') return;
      if (!gameState.standupData) return;
      if (player.status === 'firewall') return;

      gameState.standupData.votes[socket.id] = targetId;

      const aliveIds = getAlivePlayers().map(p => p.id);
      const allVoted = aliveIds.every(id => gameState.standupData.votes[id] !== undefined);
      if (allVoted) resolveVoting(io);
    });

    // ── WIPE LOGS ────────────────────────────────────────
    socket.on('wipe_logs', () => {
      const player = gameState.players[socket.id];
      if (!player || player.role !== 'hacker' || player.status !== 'alive') return;
      if (player.room !== 'The Log Room') return;
      if (gameState.logsCorrupted) return;

      gameState.logsCorrupted = true;

      io.to('The Log Room').emit('logs_corrupted', { message: 'ERROR: LOGS CORRUPTED BY MALWARE' });

      gameState.logsCorruptedTimer = setTimeout(() => {
        gameState.logsCorrupted = false;
        gameState.motionLog = [];
        io.to('The Log Room').emit('logs_restored', { message: 'System logs restored.', motionLog: [] });
      }, 60000);
    });

    // ── DISCONNECT ───────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      const player = gameState.players[socket.id];
      if (player) {
        const room = player.room;
        player.status = 'disconnected';
        io.to(room).emit('room_update', {
          players: getPlayersInRoom(room).map(p => ({ id: p.id, name: p.name, status: p.status })),
        });
        io.emit('player_count', Object.values(gameState.players).filter(p => p.status !== 'disconnected').length);
      }
    });

    // ── ADMIN RESET ──────────────────────────────────────
    socket.on('admin_reset', () => {
      if (gameState.gameTimer) clearTimeout(gameState.gameTimer);
      if (gameState.logsCorruptedTimer) clearTimeout(gameState.logsCorruptedTimer);
      const oldUsers = gameState.registeredUsers; // preserve registered users across reset
      gameState = createFreshState();
      gameState.registeredUsers = oldUsers;
      globalThis.__gameState = gameState;
      io.emit('game_reset');
    });

    // ── ADMIN REGISTRATION ────────────────────────────────
    socket.on('admin_register_user', (data) => {
      if (data?.code && data?.name) {
        gameState.registeredUsers[data.code] = data.name;
      }
    });

    socket.on('admin_remove_user', (code) => {
      if (code) {
        delete gameState.registeredUsers[code];
      }
    });
  });

  // ── EXPOSE STATE FOR API ROUTES ────────────────────────
  globalThis.__getGameState = () => ({
    phase: gameState.phase,
    playerCount: Object.values(gameState.players).filter(p => p.status !== 'disconnected').length,
    players: Object.values(gameState.players).map(p => ({
      id: p.id, name: p.name, room: p.room, role: p.role, status: p.status,
    })),
    globalProgress: gameState.globalProgress,
    totalTasksSolved: gameState.totalTasksSolved,
    totalSabotageDone: gameState.totalSabotageDone,
    registeredUsers: gameState.registeredUsers,
    scores: gameState.scores,
    roomCounts: getRoomCounts(),
    winSide: gameState.winSide,
    gameStartTime: gameState.gameStartTime,
  });

  server.listen(port, () => {
    console.log(`> Breach & Defend Server Ready on http://localhost:${port}`);
  });
});
