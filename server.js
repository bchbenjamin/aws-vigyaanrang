// ============================================================
//  Breach & Defend — Complete Game Server
//  Custom Next.js server with Socket.io game engine
// ============================================================
require('dotenv').config();
const { createServer } = require('http');
const os = require('os');
const next = require('next');
const { Server } = require('socket.io');
const { 
  loadAdminConfig, saveAdminConfig, 
  saveCumulativeScores, loadCumulativeScores, resetCumulativeScores,
  loadRegisteredUsers, saveRegisteredUser, removeRegisteredUser 
} = require('./src/lib/dbConfig');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';
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
    adminConfig: {
      pointsEasy: 1,
      pointsMedium: 2,
      pointsHard: 3,
      pointsSabotage: 2,
      pointsEjectHacker: 2,
      pointsSurvive: 3,
      pointsWin: 3,
      standupDurationMs: 90000,
      firewallBufferMs: 300000,
      easySpeedLimitMs: 120000,
      easyCooldownMs: 60000,
    }
  };
}

// ─── DATA DRIVEN PUZZLES ────────────────────────────────────
const fs = require('fs');
const path = require('path');
let ALL_PUZZLES = [];
try {
  ALL_PUZZLES = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'data', 'puzzles.json'), 'utf8'));
} catch (e) {
  console.error("Failed to load puzzles.json:", e);
}

let realPuzzlesDB = ALL_PUZZLES;
let hackPuzzlesDB = ALL_PUZZLES.filter(p => p.difficulty === 'hard');
let fakePuzzlesDB = [];

function getPointsForDifficulty(difficulty) {
  if (difficulty === 'hard') return gameState.adminConfig.pointsHard;
  if (difficulty === 'medium') return gameState.adminConfig.pointsMedium;
  return gameState.adminConfig.pointsEasy;
}

function getRandomTaskId(playerId, difficulty = 'easy') {
  const solvedObj = playerId && gameState.players[playerId] ? gameState.players[playerId].solvedTasks || [] : [];
  let pool = realPuzzlesDB.filter(p => p.difficulty === difficulty);
  let unsolved = pool.filter(p => !solvedObj.includes(p.id));
  if (unsolved.length === 0) unsolved = pool;
  if (unsolved.length === 0) return null;
  return unsolved[Math.floor(Math.random() * unsolved.length)].id;
}

function getHackTaskId(playerId) {
  const solvedObj = playerId && gameState.players[playerId] ? gameState.players[playerId].solvedTasks || [] : [];
  let pool = hackPuzzlesDB;
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
  return Object.values(gameState.players).filter(p => p.room === room && p.status !== 'disconnected' && p.status !== 'ejected');
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

function getProtectablePlayers() {
  return getAlivePlayers();
}

function getRoomCounts() {
  const counts = {};
  ALL_ROOMS.forEach(room => {
    counts[room] = getPlayersInRoom(room).length;
  });
  return counts;
}

function getConnectedPlayerCount() {
  return Object.values(gameState.players).filter(p => p.status !== 'disconnected' && p.status !== 'ejected').length;
}

function getRoomPlayers(room) {
  return getPlayersInRoom(room).map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    status: p.status,
    isProtected: !!p.isProtected,
  }));
}

function addMotionEvent(room) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const entry = { time, message: `Motion detected in ${room}`, timestamp: Date.now() };
  gameState.motionLog.push(entry);
  if (gameState.motionLog.length > 15) gameState.motionLog.shift();
  // Broadcast live log to ALL connected clients
  const io = globalThis.__io;
  if (io) {
    io.emit('motion_log_update', { motionLog: gameState.logsCorrupted ? null : gameState.motionLog, logsCorrupted: gameState.logsCorrupted });
  }
}

function addScore(playerId, points) {
  if (!gameState.scores[playerId]) gameState.scores[playerId] = 0;
  gameState.scores[playerId] += points;
}

function clearAllActiveTasks(io) {
  Object.values(gameState.players).forEach(player => {
    if (player.status === 'disconnected') return;
    player.currentTaskId = null;
    player.activeHackTargetId = null;
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.emit('task_assigned', { taskId: null, hackTaskId: null });
    }
  });
}

function getGameEndTime() {
  if (gameState.gameEndTime) return gameState.gameEndTime;
  if (!gameState.gameStartTime) return null;
  return gameState.gameStartTime + GAME_DURATION_MS;
}

function getNetworkUrls(portNumber) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach(entries => {
    (entries || []).forEach(entry => {
      if (!entry || entry.internal || entry.family !== 'IPv4') return;
      urls.push(`http://${entry.address}:${portNumber}`);
    });
  });

  return [...new Set(urls)];
}

function checkWinConditions(io) {
  if (gameState.phase !== 'playing') return false;

  const aliveDevs = getAliveDevelopers();
  const aliveHackers = getAliveHackers();
  
  io.emit('alive_developers_update', getProtectablePlayers().map(p => ({ id: p.id, name: p.name })));
  
  if (gameState.globalProgress >= 100) {
    endGame(io, 'developers', 'Project completed to 100%!');
    return true;
  }
  if (aliveHackers.length === 0) {
    endGame(io, 'developers', 'All hackers have been identified and ejected!');
    return true;
  }
  if (aliveDevs.length <= aliveHackers.length) {
    endGame(io, 'hackers', 'Hackers have overwhelmed the developers!');
    return true;
  }
  if (gameState.totalSabotageDone >= SABOTAGE_WIN_THRESHOLD) {
    endGame(io, 'hackers', 'Critical sabotage threshold reached!');
    return true;
  }
  return false;
}

function endGame(io, winSide, reason) {
  gameState.phase = 'ended';
  gameState.winSide = winSide;
  gameState.gameEndTime = Date.now();
  if (gameState.gameTimer) clearTimeout(gameState.gameTimer);
  if (gameState.standupTimerId) clearTimeout(gameState.standupTimerId);
  clearAllActiveTasks(io);

  Object.values(gameState.players).forEach(p => {
    if (p.status === 'disconnected') return;
    const isSideWin = (winSide === 'developers' && p.role === 'developer') || (winSide === 'hackers' && p.role === 'hacker');
    if (isSideWin) addScore(p.id, gameState.adminConfig.pointsWin);
  });

  if (winSide === 'developers') {
    const aliveDev = getAliveDevelopers();
    if (aliveDev.length === 1) addScore(aliveDev[0].id, gameState.adminConfig.pointsSurvive);
  }

  io.emit('game_ended', { winSide, reason, players: gameState.players, scores: gameState.scores });
}

function resolveVoting(io) {
  console.log("resolveVoting called!");
  if (gameState.phase !== 'standup' || !gameState.standupData) return;

  if (gameState.standupTimerId) {
    clearTimeout(gameState.standupTimerId);
    gameState.standupTimerId = null;
  }

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
        if (targetId === ejectedId) addScore(voterId, gameState.adminConfig.pointsEjectHacker || 2);
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
app.prepare().then(async () => {
  // Load admin config from DB before anything else
  try {
    const dbConfig = await loadAdminConfig(gameState.adminConfig);
    gameState.adminConfig = dbConfig;
    console.log('[BOOT] Admin config loaded from DB.');
  } catch (e) {
    console.warn('[BOOT] Could not load DB config, using defaults.');
  }
  
  try {
    const dbUsers = await loadRegisteredUsers();
    gameState.registeredUsers = dbUsers;
    console.log('[BOOT] Registered users loaded from DB.');
  } catch (e) {
    console.warn('[BOOT] Could not load registered users.');
  }

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
      const code = (data?.code || '').trim().toUpperCase();
      const registeredName = gameState.registeredUsers[code];
      
      if (!registeredName) {
        socket.emit('error_msg', 'Invalid access code! Get an access code from the admin.');
        return;
      }
      
      const name = registeredName.substring(0, 20);
      const activePlayerEntry = Object.entries(gameState.players).find(
        ([id, p]) => id !== socket.id && p.name === name && p.status !== 'disconnected'
      );
      if (activePlayerEntry) {
        socket.emit('error_msg', 'This access code is already active in another tab or device.');
        return;
      }
      const ejectedPlayerEntry = Object.entries(gameState.players).find(
        ([_, p]) => p.name === name && p.status === 'ejected'
      );
      if (ejectedPlayerEntry && gameState.phase !== 'lobby') {
        socket.emit('error_msg', 'You were removed from the active round by the admin.');
        return;
      }

      // Check if this player was disconnected and is reconnecting
      const oldPlayerEntry = Object.entries(gameState.players).find(
        ([_, p]) => p.name === name && p.status === 'disconnected'
      );

      let targetRoom = 'Breakroom';

      if (oldPlayerEntry) {
        const [oldId, oldP] = oldPlayerEntry;
        // Fully restore their state — including role, firewall status, cooldowns
        const restoredStatus = oldP._preDisconnectStatus || 'alive';
        gameState.players[socket.id] = { 
          ...oldP, 
          id: socket.id, 
          status: restoredStatus,
          isMoving: false,
        };
        gameState.scores[socket.id] = gameState.scores[oldId] || 0;
        targetRoom = oldP.room;

        // Clean up the old, disconnected ghost record
        delete gameState.players[oldId];
        delete gameState.scores[oldId];
        console.log(`[RECONNECT] ${name} restored as ${restoredStatus} in ${targetRoom}`);

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
          activeHackTargetId: null,
          isMoving: false,
          solvedTasks: [],
          isProtected: false,
          firewallNextTaskAt: 0,
          easyCooldownEndsAt: 0,
          recentEasyTimes: [],
        };
        gameState.scores[socket.id] = 0;
      }
      
      socket.join(targetRoom);

      socket.emit('state_sync', {
        phase: gameState.phase,
        you: gameState.players[socket.id],
        roomPlayers: getRoomPlayers(targetRoom),
        aliveDevelopers: getProtectablePlayers().map(p => ({ id: p.id, name: p.name })),
        globalProgress: gameState.globalProgress,
        motionLog: gameState.logsCorrupted ? null : gameState.motionLog,
        logsCorrupted: gameState.logsCorrupted,
        gameEndTime: getGameEndTime(),
        standupData: gameState.phase === 'standup' && gameState.standupData ? {
          reportedBy: gameState.standupData.reportedBy,
          durationMs: Math.max(0, gameState.standupData.durationMs - (Date.now() - gameState.standupData.startTime)),
          alivePlayers: getAlivePlayers().map(p => ({ id: p.id, name: p.name }))
        } : null,
        hasVoted: gameState.phase === 'standup' && gameState.standupData ? (gameState.standupData.votes[socket.id] !== undefined) : false
      });

      io.to(targetRoom).emit('player_joined', { id: socket.id, name });
      
      // Update the room for everyone now that they've appeared/re-appeared
      io.to(targetRoom).emit('room_update', {
        players: getRoomPlayers(targetRoom),
      });

      io.emit('player_count', getConnectedPlayerCount());
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
      gameState.gameEndTime = getGameEndTime();

      playerIds.forEach(id => {
        gameState.players[id].role = rolesMap[id] === 'hacker' ? 'hacker' : 'developer';
        gameState.players[id].status = 'alive';
        gameState.players[id].activeHackTargetId = null;
      });

      playerIds.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s) {
          s.emit('game_started', {
            role: gameState.players[id].role,
            hackerCount,
            totalPlayers: playerIds.length,
            gameEndTime: gameState.gameEndTime,
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

    // ── ADMIN STOP GAME (with mode) ──────────────────────
    socket.on('admin_stop_game', async (mode) => {
      const stopMode = mode || 'discard'; // 'fresh' | 'retain' | 'discard'
      
      // Clear timers
      if (gameState.gameTimer) clearTimeout(gameState.gameTimer);
      if (gameState.logsCorruptedTimer) clearTimeout(gameState.logsCorruptedTimer);
      if (gameState.standupTimerId) clearTimeout(gameState.standupTimerId);

      if (stopMode === 'retain') {
        // Save this round's scores to cumulative DB
        await saveCumulativeScores(gameState.scores, gameState.players);
        const oldUsers = gameState.registeredUsers;
        const oldScores = { ...gameState.scores };
        // Build a name->score map for the scoreboard
        const nameScores = {};
        Object.values(gameState.players).forEach(p => {
          nameScores[p.name] = oldScores[p.id] || 0;
        });
        gameState = createFreshState();
        gameState.registeredUsers = oldUsers;
        gameState.cumulativeNameScores = nameScores;
        globalThis.__gameState = gameState;
        io.emit('game_reset');
      } else if (stopMode === 'discard') {
        // Don't save points, keep users
        const oldUsers = gameState.registeredUsers;
        gameState = createFreshState();
        gameState.registeredUsers = oldUsers;
        globalThis.__gameState = gameState;
        io.emit('game_reset');
      } else {
        // 'fresh' — full nuke
        await resetCumulativeScores();
        gameState = createFreshState();
        globalThis.__gameState = gameState;
        io.emit('force_disconnect');
        io.emit('game_reset');
      }

      io.emit('player_count', 0);
    });

    // ── MOVE ROOM ────────────────────────────────────────
    socket.on('move_room', (targetRoom) => {
      const player = gameState.players[socket.id];
      if (!player || player.status === 'ejected' || player.status === 'disconnected') return;
      if (!ALL_ROOMS.includes(targetRoom)) return;
      if (player.room === targetRoom || player.isMoving) return;
      if (gameState.phase !== 'playing') return;

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
        if (player.role === 'hacker') {
          player.activeHackTargetId = null;
        }

        addMotionEvent(targetRoom);

        io.to(oldRoom).emit('room_update', {
          players: getRoomPlayers(oldRoom),
        });

        io.to(targetRoom).emit('room_update', {
          players: getRoomPlayers(targetRoom),
        });

        const roomData = { room: targetRoom };
        if (targetRoom === 'The Log Room') {
          roomData.motionLog = gameState.logsCorrupted ? null : gameState.motionLog;
          roomData.logsCorrupted = gameState.logsCorrupted;
        } else if (TASK_ROOMS.includes(targetRoom)) {
          if (player.status === 'alive') {
            roomData.taskId = getRandomTaskId(socket.id, player.role === 'hacker' ? 'medium' : 'easy');
          }
        }
        socket.emit('entered_room', roomData);

        io.emit('room_counts', getRoomCounts());
      }, delay);
    });

    // ── REQUEST TASK ──────────────────────────────────────
    socket.on('request_task', (data) => {
      const difficulty = data?.difficulty || 'easy';
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'playing') return;
      if (player.status === 'ejected' || player.status === 'disconnected') return;
      
      // Firewalls can solve from anywhere, devs/hackers need to be in TASK_ROOMS
      if (player.status !== 'firewall' && !TASK_ROOMS.includes(player.room)) return;

      if (difficulty === 'hard' && player.role === 'developer' && player.status === 'alive') {
        socket.emit('error_msg', 'Developers cannot access Hard tasks.');
        return;
      }

      if (difficulty === 'hard' && player.role === 'hacker' && player.status === 'alive' && !player.activeHackTargetId) {
        socket.emit('error_msg', 'Select a target before requesting a Hard task.');
        return;
      }

      if (player.status === 'firewall' && !data?.protectTargetId) {
        socket.emit('error_msg', 'Select a developer to protect before requesting a task.');
        return;
      }

      if (player.status === 'firewall' && player.firewallNextTaskAt > Date.now()) {
         socket.emit('task_cooldown', { remaining: Math.ceil((player.firewallNextTaskAt - Date.now()) / 1000) });
         return;
      }

      if (difficulty === 'easy' && player.easyCooldownEndsAt > Date.now()) {
         socket.emit('task_cooldown', { remaining: Math.ceil((player.easyCooldownEndsAt - Date.now()) / 1000), msg: 'Solving too fast! Easy tasks on cooldown.' });
         return;
      }

      const nextTaskId = getRandomTaskId(socket.id, difficulty);
      player.currentTaskId = nextTaskId;
      if (difficulty === 'hard' && player.role === 'hacker' && player.status === 'alive') {
        socket.emit('task_assigned', { hackTaskId: nextTaskId, taskId: null });
        return;
      }
      socket.emit('task_assigned', { taskId: nextTaskId, hackTaskId: null });
    });

    // ── SUBMIT TASK ───────────────────────────────────────
    socket.on('task_complete', (data) => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'playing') return;
      if (player.status !== 'alive' && player.status !== 'firewall') return;

      if (data.taskId && player.solvedTasks && player.solvedTasks.includes(data.taskId)) {
        return;
      }

      const taskDef = realPuzzlesDB.find(p => p.id === data.taskId);
      if (!taskDef) return;
      const protectedTarget = player.status === 'firewall' ? gameState.players[data.protectedTargetId] : null;
      if (player.status === 'firewall' && (!protectedTarget || protectedTarget.status !== 'alive' || protectedTarget.status === 'firewall')) {
        socket.emit('error_msg', 'Protection target is no longer valid.');
        return;
      }

      gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + getPointsForDifficulty(taskDef.difficulty);
      
      if (player.solvedTasks) {
         player.solvedTasks.push(data.taskId);
      }

      gameState.totalTasksSolved += 1;
      if (player.role === 'developer' || player.status === 'firewall') {
        const increment = (1 / TASKS_FOR_WIN) * 100;
        gameState.globalProgress = Math.min(100, gameState.globalProgress + increment);
      }

      if (taskDef.difficulty === 'hard' && player.role === 'hacker' && player.activeHackTargetId) {
        player.hackCooldownUntil = 0;
        socket.emit('hack_cooldown_reset', { message: 'Hard task solved! Hack cooldown eliminated.' });
      }

      if (player.status === 'firewall') {
        protectedTarget.isProtected = true;
        player.firewallNextTaskAt = Date.now() + gameState.adminConfig.firewallBufferMs;
        socket.emit('task_result', { success: true, message: `${protectedTarget.name} is now protected.` });
        io.to(protectedTarget.room).emit('room_update', { players: getRoomPlayers(protectedTarget.room) });
      } else {
        socket.emit('task_result', { success: true, message: 'Task completed.', isHackTask: false });
      }

      if (taskDef.difficulty === 'easy') {
        player.recentEasyTimes.push(Date.now());
        if (player.recentEasyTimes.length > 10) player.recentEasyTimes.shift();
        
        if (player.recentEasyTimes.length === 10) {
            const timeDiff = player.recentEasyTimes[9] - player.recentEasyTimes[0];
            if (timeDiff < gameState.adminConfig.easySpeedLimitMs) {
                player.easyCooldownEndsAt = Date.now() + gameState.adminConfig.easyCooldownMs;
                player.recentEasyTimes = [];
                socket.emit('error_msg', 'Solving Easy tasks too fast! 1-minute penalty applied.');
            }
        }
      }

      player.currentTaskId = null;
      if (player.status !== 'firewall') {
        player.activeHackTargetId = null;
      }

      io.emit('progress_update', {
        globalProgress: Math.round(gameState.globalProgress * 100) / 100,
        totalTasks: gameState.totalTasksSolved,
      });

      socket.emit('your_score', { score: gameState.scores[socket.id] || 0 });
      socket.emit('task_assigned', { taskId: null, hackTaskId: null });

      checkWinConditions(io);
    });

    // ── HACK PLAYER ──────────────────────────────────────
    socket.on('start_hack', (targetId) => {
      const hacker = gameState.players[socket.id];
      const target = gameState.players[targetId];
      if (!hacker || !target) return;
      if (hacker.role !== 'hacker' || hacker.status !== 'alive') return;
      if (target.id === socket.id) {
        socket.emit('error_msg', 'You cannot hack yourself.');
        return;
      }
      if (target.status !== 'alive') return;
      if (target.role === 'hacker') return;
      if (hacker.room !== target.room) return;
      if (Date.now() < hacker.hackCooldownUntil) {
        const remaining = Math.ceil((hacker.hackCooldownUntil - Date.now()) / 1000);
        socket.emit('error_msg', `Hack on cooldown. ${remaining}s remaining.`);
        return;
      }
      if (gameState.phase !== 'playing') return;

      hacker.activeHackTargetId = targetId;
      const hackTaskId = getHackTaskId(socket.id);
      hacker.currentTaskId = hackTaskId;
      socket.emit('task_assigned', { hackTaskId });
    });

    socket.on('submit_hack', (data) => {
      const hacker = gameState.players[socket.id];
      const target = gameState.players[data.targetId];
      if (!hacker || hacker.role !== 'hacker' || hacker.status !== 'alive') return;
      if (target && target.id === socket.id) {
        socket.emit('error_msg', 'You cannot hack yourself.');
        return;
      }

      // Give points for solving the hack puzzle
      const taskDef = hackPuzzlesDB.find(p => p.id === data.taskId);
      const pts = taskDef ? getPointsForDifficulty(taskDef.difficulty) : gameState.adminConfig.pointsSabotage;
      gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + pts;
      socket.emit('your_score', { score: gameState.scores[socket.id] });

      if (hacker.solvedTasks && taskDef) hacker.solvedTasks.push(data.taskId);

      // Check if target is still in the room
      if (!target || target.room !== hacker.room || target.status !== 'alive') {
        socket.emit('hack_success', { target: target ? target.name : 'Unknown', cooldownUntil: Date.now() + 15000, message: 'Target escaped. Puzzle solved, points awarded.' });
        hacker.hackCooldownUntil = Date.now() + 15000;
        hacker.currentTaskId = null;
        hacker.activeHackTargetId = null;
        return;
      }

      if (target.role === 'hacker') {
        socket.emit('error_msg', 'Hackers cannot hack hackers.');
        return;
      }

      if (target.isProtected) {
        target.isProtected = false;
        io.emit('sabotage_alert', { room: hacker.room, msg: `FIREWALL ERROR: Unauthorized access blocked in ${hacker.room}` });
        hacker.hackCooldownUntil = Date.now() + 15000;
        hacker.currentTaskId = null;
        hacker.activeHackTargetId = null;
        io.to(target.room).emit('room_update', { players: getRoomPlayers(target.room) });
        socket.emit('error_msg', `${target.name} was protected. The hack bounced.`);
        socket.emit('hack_success', { target: target.name, cooldownUntil: hacker.hackCooldownUntil, message: 'Hack attempt blocked by firewall protection.' });
        return;
      }

      target.status = 'firewall';
      target.anomalyAlertUsed = false;
      target.isProtected = false;
      hacker.hackCooldownUntil = Date.now() + HACK_COOLDOWN_MS;
      hacker.currentTaskId = null;
      hacker.activeHackTargetId = null;

      const victimSocket = io.sockets.sockets.get(data.targetId);
      if (victimSocket) {
        victimSocket.emit('you_were_hacked', { message: 'You have been eliminated. Transitioning to Firewall mode...' });
      }

      socket.emit('hack_success', { target: target.name, cooldownUntil: hacker.hackCooldownUntil, message: `Successfully compromised ${target.name}.` });

      io.to(target.room).emit('room_update', { players: getRoomPlayers(target.room) });

      checkWinConditions(io);
    });



    // ── ANOMALY ALERT ────────────────────────────────────
    socket.on('anomaly_alert', () => {});

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

      gameState.standupData = {
        reportedBy: player.name,
        votes: {},
        startTime: Date.now(),
        durationMs: gameState.adminConfig.standupDurationMs,
      };

      io.emit('standup_started', {
        reportedBy: player.name,
        duration: gameState.adminConfig.standupDurationMs,
        alivePlayers: getAlivePlayers().map(p => ({ id: p.id, name: p.name })),
      });
      
      // Crucial: Tell everyone in Breakroom they are now there together
      io.to('Breakroom').emit('room_update', { players: getRoomPlayers('Breakroom') });

      gameState.standupTimerId = setTimeout(() => {
        if (gameState.phase === 'standup') resolveVoting(io);
      }, gameState.adminConfig.standupDurationMs);
    });

    // ── ADMIN ADD STANDUP TIME ────────────────────────────────
    socket.on('admin_extend_standup', (data) => {
      if (gameState.phase !== 'standup' || !gameState.standupData) return;
      if (gameState.standupTimerId) clearTimeout(gameState.standupTimerId);
      
      const extraMs = Math.max(0, Number(data?.amount) || 0);
      const elapsed = Date.now() - gameState.standupData.startTime;
      const currentRemaining = Math.max(0, gameState.standupData.durationMs - elapsed);
      const newRemaining = currentRemaining + extraMs;
      
      gameState.standupData.startTime = Date.now();
      gameState.standupData.durationMs = newRemaining;

      io.emit('extend_timer_update', { durationMs: newRemaining });

      gameState.standupTimerId = setTimeout(() => {
        if (gameState.phase === 'standup') resolveVoting(io);
      }, newRemaining);
    });

    socket.on('admin_kick_player', (targetId) => {
      const target = gameState.players[targetId];
      if (!target) return;

      const targetRoom = target.room;
      target._preDisconnectStatus = 'ejected';
      target.status = 'ejected';
      target.currentTaskId = null;
      target.activeHackTargetId = null;

      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.emit('error_msg', 'You were removed from the current round by the admin.');
        targetSocket.emit('force_disconnect');
      }

      io.to(targetRoom).emit('room_update', { players: getRoomPlayers(targetRoom) });
      io.emit('player_count', getConnectedPlayerCount());
      checkWinConditions(io);
    });

    // ── ADMIN STATE SYNC ─────────────────────────────────────
    socket.on('admin_get_state', () => {
      if (globalThis.__getGameState) {
        socket.emit('admin_state', globalThis.__getGameState());
      }
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
      socket.emit('error_msg', 'Log wiping is disabled on this server.');
    });

    // ── ADMIN SETTINGS ──────────────────────────────────────
    socket.on('admin_update_config', async (newConfig) => {
      gameState.adminConfig = { ...gameState.adminConfig, ...newConfig };
      // Persist to DB
      try { await saveAdminConfig(newConfig); } catch(e) { console.error('[DB] Config save error', e.message); }
    });

    // ── DISCONNECT ───────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      const player = gameState.players[socket.id];
      if (player) {
        const room = player.room;
        // Preserve current status so reconnection can restore it
        player._preDisconnectStatus = player.status;
        player.status = 'disconnected';
        io.to(room).emit('room_update', {
          players: getRoomPlayers(room),
        });
        io.emit('player_count', getConnectedPlayerCount());
      }
    });

    // ── ADMIN RESET (alias for fresh stop) ────────────────
    socket.on('admin_reset', async () => {
      if (gameState.gameTimer) clearTimeout(gameState.gameTimer);
      if (gameState.logsCorruptedTimer) clearTimeout(gameState.logsCorruptedTimer);
      if (gameState.standupTimerId) clearTimeout(gameState.standupTimerId);
      await resetCumulativeScores();
      gameState = createFreshState();
      globalThis.__gameState = gameState;
      io.emit('force_disconnect');
      io.emit('game_reset');
      io.emit('player_count', 0);
    });

    // ── ADMIN REGISTRATION ────────────────────────────────
    socket.on('admin_register_user', async (data) => {
      if (data?.code && data?.name) {
        const code = data.code.toUpperCase();
        gameState.registeredUsers[code] = data.name;
        try { await saveRegisteredUser(code, data.name); } catch(e) {}
      }
    });

    socket.on('admin_remove_user', async (code) => {
      if (code) {
        delete gameState.registeredUsers[code];
        try { await removeRegisteredUser(code); } catch(e) {}
      }
    });
  });

  // ── EXPOSE STATE FOR API ROUTES ────────────────────────
  globalThis.__getGameState = () => {
    // Build name-keyed scores for admin display
    const nameScores = { ...(gameState.cumulativeNameScores || {}) };
    Object.values(gameState.players).forEach(p => {
      nameScores[p.name] = (nameScores[p.name] || 0) + (gameState.scores[p.id] || 0);
    });
    return {
      phase: gameState.phase,
      playerCount: getConnectedPlayerCount(),
      players: Object.values(gameState.players).map(p => ({
        id: p.id, name: p.name, room: p.room, role: p.role, status: p.status,
      })),
      globalProgress: gameState.globalProgress,
      totalTasksSolved: gameState.totalTasksSolved,
      totalSabotageDone: gameState.totalSabotageDone,
      registeredUsers: gameState.registeredUsers,
      scores: gameState.scores,
      nameScores,
      roomCounts: getRoomCounts(),
      winSide: gameState.winSide,
      gameStartTime: gameState.gameStartTime,
      gameEndTime: getGameEndTime(),
      adminConfig: gameState.adminConfig,
      standupData: gameState.standupData,
    };
  };

  server.listen(port, host, () => {
    console.log(`> Breach & Defend Server Ready`);
    console.log(`> Local:   http://localhost:${port}`);
    getNetworkUrls(port).forEach((url, index) => {
      console.log(`> Network ${index + 1}: ${url}`);
    });
  });
});
