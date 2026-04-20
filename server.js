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
  loadRegisteredUsers, saveRegisteredUser, removeRegisteredUser,
  saveLiveScore, clearLiveScores
} = require('./src/lib/dbConfig');
const { isTaskPlayable, normalizeDifficulty, verifyAnswer, sanitizeTaskForClient } = require('./src/lib/puzzleEngine');

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
const HACK_NOTICE_DELAY_MS = 15000; // 15 seconds
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
    pendingHackTimers: {},
    scores: {},
    scoreSyncQueue: {},
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
      incorrectDelayMs: 5000,
    }
  };
}

// ─── DATA DRIVEN PUZZLES ────────────────────────────────────
const fs = require('fs');
const path = require('path');
const PUZZLES_PATH = path.join(__dirname, 'data', 'puzzles.json');
let ALL_PUZZLES = [];
try {
  ALL_PUZZLES = JSON.parse(fs.readFileSync(PUZZLES_PATH, 'utf8'));
} catch (e) {
  console.error('Failed to load puzzles.json:', e);
}

const incompatiblePuzzles = ALL_PUZZLES.filter(p => !isTaskPlayable(p));
if (incompatiblePuzzles.length > 0) {
  console.warn(`[PuzzleEngine] Removed ${incompatiblePuzzles.length} illogical/unplayable puzzle(s) from runtime pool.`);
}

ALL_PUZZLES = ALL_PUZZLES.filter(isTaskPlayable);

let realPuzzlesDB = ALL_PUZZLES;
let fakePuzzlesDB = [];
const PUZZLE_MAP = new Map(ALL_PUZZLES.map(p => [p.id, p]));

function getTaskDef(taskId) {
  return PUZZLE_MAP.get(taskId) || null;
}

function sanitizeTask(taskId) {
  const taskDef = getTaskDef(taskId);
  if (!taskDef) return null;
  return sanitizeTaskForClient(taskDef, { shuffleRearrange: false });
}

function gradeTaskAnswer(taskDef, lang, payload = {}) {
  return verifyAnswer(taskDef, {
    activeLang: lang,
    userAnswer: payload.answer ?? '',
    fillState: payload.fillState || {},
    dragOrder: Array.isArray(payload.dragOrder) ? payload.dragOrder : [],
    rearrangedLines: Array.isArray(payload.rearrangedLines) ? payload.rearrangedLines : undefined,
  });
}

function emitTaskAssigned(socket, payload = {}) {
  const taskId = payload.taskId || null;
  const hackTaskId = payload.hackTaskId || null;
  const activeTaskId = taskId || hackTaskId;
  const taskPayload = activeTaskId ? sanitizeTask(activeTaskId) : null;

  socket.emit('task_assigned', {
    taskId,
    hackTaskId,
    isHackTask: !!hackTaskId,
    taskPayload,
  });
}

function getCurrentTaskAssignment(player) {
  if (!player || !player.currentTaskId) {
    return { taskId: null, hackTaskId: null, isHackTask: false, taskPayload: null };
  }

  const isHackTask = player.role === 'hacker' && player.status === 'alive' && !!player.activeHackTargetId;
  return {
    taskId: isHackTask ? null : player.currentTaskId,
    hackTaskId: isHackTask ? player.currentTaskId : null,
    isHackTask,
    taskPayload: sanitizeTask(player.currentTaskId),
  };
}

function getPointsForDifficulty(difficulty) {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  if (normalizedDifficulty === 'hard') return gameState.adminConfig.pointsHard;
  if (normalizedDifficulty === 'medium') return gameState.adminConfig.pointsMedium;
  return gameState.adminConfig.pointsEasy;
}

function getFirewallProtectionDurationMs() {
  return gameState.adminConfig.firewallBufferMs;
}

function getHackerFirewallBlockDurationMs() {
  return Math.max(1000, Math.floor(getFirewallProtectionDurationMs() / 2));
}

function createAssignedTaskHistory() {
  return {
    easy: [],
    medium: [],
    hard: [],
  };
}

function getRandomTaskId(playerId, difficulty = 'easy') {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const assignedHistory = playerId && gameState.players[playerId]
    ? gameState.players[playerId].assignedTasksByDifficulty?.[normalizedDifficulty] || []
    : [];
  let pool = realPuzzlesDB.filter(p => normalizeDifficulty(p.difficulty) === normalizedDifficulty);
  let available = pool.filter(p => !assignedHistory.includes(p.id));
  if (available.length === 0) {
    if (playerId && gameState.players[playerId]) {
      gameState.players[playerId].assignedTasksByDifficulty[normalizedDifficulty] = [];
    }
    available = pool;
  }
  if (available.length === 0) return null;
  const nextTaskId = available[Math.floor(Math.random() * available.length)].id;
  if (playerId && gameState.players[playerId]) {
    gameState.players[playerId].assignedTasksByDifficulty[normalizedDifficulty].push(nextTaskId);
  }
  return nextTaskId;
}

function hasTasksForDifficulty(difficulty) {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  return realPuzzlesDB.some(p => normalizeDifficulty(p.difficulty) === normalizedDifficulty);
}

function getDifficultyOrderForPlayer(player, requestedDifficulty) {
  const requested = normalizeDifficulty(requestedDifficulty || player?.preferredDifficulty || 'easy');

  if (!player) {
    return [requested, 'medium', 'hard', 'easy'];
  }

  if (player.status === 'firewall') {
    return [requested, 'medium', 'hard', 'easy'];
  }

  if (player.role === 'developer') {
    if (requested === 'hard') return ['medium', 'easy'];
    if (requested === 'medium') return ['medium', 'easy'];
    return ['easy', 'medium'];
  }

  if (player.role === 'hacker') {
    if (requested === 'hard') {
      if (player.activeHackTargetId) return ['hard', 'medium', 'easy'];
      return ['medium', 'easy'];
    }
    if (requested === 'medium') return ['medium', 'easy'];
    return ['easy', 'medium'];
  }

  return [requested, 'medium', 'hard', 'easy'];
}

function resolveDifficultyForPlayer(player, requestedDifficulty) {
  const order = getDifficultyOrderForPlayer(player, requestedDifficulty);
  for (const difficulty of order) {
    if (hasTasksForDifficulty(difficulty)) return difficulty;
  }
  return null;
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
  syncTransientPlayerState();
  return Object.values(gameState.players).filter(p => p.room === room && p.status !== 'disconnected' && p.status !== 'ejected');
}

function getAlivePlayers() {
  syncTransientPlayerState();
  return Object.values(gameState.players).filter(p => p.status === 'alive');
}

function getAliveHackers() {
  return getAlivePlayers().filter(p => p.role === 'hacker');
}

function getAliveDevelopers() {
  return getAlivePlayers().filter(p => p.role === 'developer');
}

function getProtectablePlayers() {
  syncTransientPlayerState();
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
  syncTransientPlayerState();
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
  const player = gameState.players[playerId];
  if (player?.name) {
    saveLiveScore(player.name, gameState.scores[playerId]).catch(err => {
      console.error('[DB] Failed to persist live score:', err.message);
    });
  }
}

function syncTransientPlayerState() {
  const now = Date.now();
  Object.values(gameState.players).forEach(player => {
    if (!player) return;
    if (player.isProtected && player.protectionExpiresAt && player.protectionExpiresAt <= now) {
      player.isProtected = false;
      player.protectionExpiresAt = 0;
    }
    if (player.protectionBlockedUntil && player.protectionBlockedUntil <= now) {
      player.protectionBlockedUntil = 0;
    }
  });
}

function clearPendingHackTimer(playerId) {
  const timer = gameState.pendingHackTimers[playerId];
  if (timer) {
    clearTimeout(timer);
    delete gameState.pendingHackTimers[playerId];
  }
}

function clearAllPendingHackTimers() {
  Object.keys(gameState.pendingHackTimers).forEach(clearPendingHackTimer);
}

function convertPlayerToFirewall(player) {
  if (!player) return;
  clearPendingHackTimer(player.id);
  player.pendingHack = null;
  player.status = 'firewall';
  player.currentTaskId = null;
  player.activeHackTargetId = null;
  player.isProtected = false;
  player.protectionExpiresAt = 0;
}

function emitHackNotice(io) {
  io.emit('global_alert', { type: 'warning', message: 'Someone got hacked.' });
}

function resolvePendingHack(io, targetId, options = {}) {
  const target = gameState.players[targetId];
  if (!target || !target.pendingHack) return false;

  clearPendingHackTimer(targetId);

  if (target.status === 'disconnected') {
    target.pendingHack = null;
    target._preDisconnectStatus = 'firewall';
  } else {
    convertPlayerToFirewall(target);
    const victimSocket = io.sockets.sockets.get(targetId);
    if (victimSocket) {
      victimSocket.emit('you_were_hacked');
    }
  }

  if (options.announce !== false) {
    emitHackNotice(io);
  }

  io.to(target.room).emit('room_update', { players: getRoomPlayers(target.room) });
  io.emit('room_counts', getRoomCounts());
  io.emit('alive_developers_update', getProtectablePlayers().map(p => ({ id: p.id, name: p.name })));

  return checkWinConditions(io);
}

function resolveAllPendingHacks(io, options = {}) {
  const pendingIds = Object.values(gameState.players)
    .filter(player => player?.pendingHack)
    .map(player => player.id);

  pendingIds.forEach(playerId => {
    resolvePendingHack(io, playerId, options);
  });
}

function schedulePendingHackReveal(io, targetId, delayMs = HACK_NOTICE_DELAY_MS) {
  clearPendingHackTimer(targetId);
  gameState.pendingHackTimers[targetId] = setTimeout(() => {
    resolvePendingHack(io, targetId);
  }, delayMs);
}

function getPreferredDifficulty(player, requestedDifficulty) {
  const resolved = resolveDifficultyForPlayer(player, requestedDifficulty);
  if (resolved) return resolved;

  const difficulty = normalizeDifficulty(requestedDifficulty || player?.preferredDifficulty || 'medium');
  if (!player) return difficulty;
  if (player.status === 'firewall') return difficulty;
  if (player.role === 'developer' && difficulty === 'hard') return 'medium';
  if (player.role === 'hacker' && difficulty === 'hard' && !player.activeHackTargetId) return 'medium';
  return difficulty;
}

function getEligibleTaskRooms(player) {
  if (!player) return TASK_ROOMS;
  const visitedRooms = player.visitedTaskRooms || [];
  let unseenRooms = TASK_ROOMS.filter(room => !visitedRooms.includes(room));
  if (unseenRooms.length === 0) {
    player.visitedTaskRooms = [];
    unseenRooms = [...TASK_ROOMS];
  }
  return unseenRooms;
}

function canAssignTaskInCurrentRoom(player) {
  if (!player) return false;
  if (!TASK_ROOMS.includes(player.room)) return false;
  // Relaxed strictness: allow multiple tasks in same room for smoother gameplay
  // if (player.lastTaskRoom && player.lastTaskRoom === player.room) return false;
  const eligibleRooms = getEligibleTaskRooms(player);
  return true; // allow anywhere if they are in a TASK_ROOM
}

function getTaskRoomGuidance(player) {
  if (!player) return TASK_ROOMS;
  return getEligibleTaskRooms(player).filter(room => room !== player.lastTaskRoom);
}

function clearAllActiveTasks(io) {
  Object.values(gameState.players).forEach(player => {
    if (player.status === 'disconnected') return;
    player.currentTaskId = null;
    player.activeHackTargetId = null;
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      emitTaskAssigned(playerSocket, { taskId: null, hackTaskId: null });
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
  clearAllPendingHackTimers();
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
    convertPlayerToFirewall(ejectedPlayer);
    ejectedPlayer.protectionBlockedUntil = 0;
    ejectedPlayer.firewallNextTaskAt = 0;

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

  Object.keys(gameState.scores).forEach(playerId => {
    const playerSocket = io.sockets.sockets.get(playerId);
    if (playerSocket) {
      playerSocket.emit('your_score', { score: gameState.scores[playerId] || 0 });
    }
  });

  io.to('Breakroom').emit('room_update', { players: getRoomPlayers('Breakroom') });
  io.emit('room_counts', getRoomCounts());
  io.emit('alive_developers_update', getProtectablePlayers().map(p => ({ id: p.id, name: p.name })));
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
    cors: { origin: process.env.ALLOWED_DEV_ORIGINS && process.env.ALLOWED_DEV_ORIGINS !== '*' ? process.env.ALLOWED_DEV_ORIGINS.split(',').map(o=>o.trim()) : '*', methods: ['GET', 'POST'] },
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
          assignedTasksByDifficulty: oldP.assignedTasksByDifficulty || createAssignedTaskHistory(),
          visitedTaskRooms: oldP.visitedTaskRooms || [],
          lastTaskRoom: oldP.lastTaskRoom || null,
          preferredDifficulty: oldP.preferredDifficulty || 'easy',
        };
        gameState.scores[socket.id] = gameState.scores[oldId] || 0;
        targetRoom = oldP.room;

        if (oldP.pendingHack) {
          const remainingRevealMs = Math.max(0, oldP.pendingHack.revealAt - Date.now());
          clearPendingHackTimer(oldId);
          gameState.players[socket.id].pendingHack = oldP.pendingHack;
          schedulePendingHackReveal(io, socket.id, remainingRevealMs);
        }

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
          assignedTasksByDifficulty: createAssignedTaskHistory(),
          visitedTaskRooms: [],
          lastTaskRoom: null,
          preferredDifficulty: 'easy',
          isProtected: false,
          protectionExpiresAt: 0,
          protectionBlockedUntil: 0,
          firewallNextTaskAt: 0,
          easyCooldownEndsAt: 0,
          recentEasyTimes: [],
          pendingHack: null,
        };
        gameState.scores[socket.id] = 0;
      }
      
      socket.join(targetRoom);

      const syncedTask = getCurrentTaskAssignment(gameState.players[socket.id]);

      socket.emit('state_sync', {
        phase: gameState.phase,
        you: gameState.players[socket.id],
        taskId: syncedTask.taskId,
        hackTaskId: syncedTask.hackTaskId,
          isHackTask: syncedTask.isHackTask,
          taskPayload: syncedTask.taskPayload,
        roomPlayers: getRoomPlayers(targetRoom),
        aliveDevelopers: getProtectablePlayers().map(p => ({ id: p.id, name: p.name })),
        globalProgress: gameState.globalProgress,
        motionLog: gameState.logsCorrupted ? null : gameState.motionLog,
        logsCorrupted: gameState.logsCorrupted,
        gameEndTime: getGameEndTime(),
        score: gameState.scores[socket.id] || 0,
        roomCounts: getRoomCounts(),
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
      clearLiveScores().catch(err => console.error('[DB] Failed to clear live scores:', err.message));

      playerIds.forEach(id => {
        gameState.players[id].role = rolesMap[id] === 'hacker' ? 'hacker' : 'developer';
        gameState.players[id].status = 'alive';
        gameState.players[id].activeHackTargetId = null;
        gameState.players[id].currentTaskId = null;
        gameState.players[id].assignedTasksByDifficulty = createAssignedTaskHistory();
        gameState.players[id].visitedTaskRooms = [];
        gameState.players[id].lastTaskRoom = null;
        gameState.players[id].preferredDifficulty = 'easy';
        gameState.players[id].isProtected = false;
        gameState.players[id].protectionExpiresAt = 0;
        gameState.players[id].protectionBlockedUntil = 0;
        gameState.players[id].firewallNextTaskAt = 0;
        gameState.players[id].pendingHack = null;
        gameState.scores[id] = 0;
      });

      playerIds.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s) {
          s.emit('game_started', {
            role: gameState.players[id].role,
            hackerCount,
            totalPlayers: playerIds.length,
            gameEndTime: gameState.gameEndTime,
            score: gameState.scores[id] || 0,
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

      clearTimeout(gameState.gameTimer);
      gameState.gameTimer = setTimeout(() => {
        endGame(io, 'developers', 'Time expired. Hackers failed to take the servers down.');
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
      clearAllPendingHackTimers();

      if (stopMode === 'retain') {
        // Save this round's scores to cumulative DB
        await saveCumulativeScores(gameState.scores, gameState.players);
        const oldUsers = gameState.registeredUsers;
        const oldScores = { ...gameState.scores };
        await clearLiveScores();
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
        await clearLiveScores();
        gameState = createFreshState();
        gameState.registeredUsers = oldUsers;
        globalThis.__gameState = gameState;
        io.emit('game_reset');
      } else {
        // 'fresh' — full nuke
        await resetCumulativeScores();
        await clearLiveScores();
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

        const roomData = { room: targetRoom, taskPayload: null, isHackTask: false };
        if (targetRoom === 'The Log Room') {
          roomData.motionLog = gameState.logsCorrupted ? null : gameState.motionLog;
          roomData.logsCorrupted = gameState.logsCorrupted;
        } else if (TASK_ROOMS.includes(targetRoom)) {
          if (player.status === 'alive' && canAssignTaskInCurrentRoom(player)) {
            const preferredDifficulty = getPreferredDifficulty(player);
            const nextTaskId = getRandomTaskId(socket.id, preferredDifficulty);
            player.currentTaskId = nextTaskId;
            roomData.taskPayload = nextTaskId ? sanitizeTask(nextTaskId) : null;
            roomData.isHackTask = false;
            if (!nextTaskId) {
              roomData.taskError = 'No compatible tasks are available for this difficulty right now.';
            }
          } else if (player.status === 'alive') {
            roomData.taskError = 'Move through a different task room before solving another task here.';
          }
        }
        socket.emit('entered_room', roomData);

        io.emit('room_counts', getRoomCounts());
      }, delay);
    });

    socket.on('request_current_task', () => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'playing') return;

      const payload = getCurrentTaskAssignment(player);
      emitTaskAssigned(socket, { taskId: payload.taskId, hackTaskId: payload.hackTaskId });
    });

    // ── REQUEST TASK ──────────────────────────────────────
    socket.on('request_task', (data) => {
      const requestedDifficulty = data?.difficulty || 'easy';
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'playing') return;
      if (player.status === 'ejected' || player.status === 'disconnected') return;
      syncTransientPlayerState();

      if (player.status !== 'firewall' && !TASK_ROOMS.includes(player.room)) return;

      if (player.status === 'alive' && requestedDifficulty !== 'hard' && !canAssignTaskInCurrentRoom(player)) {
        const nextRooms = getTaskRoomGuidance(player);
        socket.emit('error_msg', `Move to a different task room next: ${nextRooms.join(', ')}`);
        return;
      }

      if (requestedDifficulty === 'hard' && player.role === 'developer' && player.status === 'alive') {
        socket.emit('error_msg', 'Developers cannot access Hard tasks.');
        return;
      }

      if (requestedDifficulty === 'hard' && player.role === 'hacker' && player.status === 'alive' && !player.activeHackTargetId) {
        socket.emit('error_msg', 'Select a target before requesting a Hard task.');
        return;
      }

      if (player.status === 'firewall' && !data?.protectTargetId) {
        socket.emit('error_msg', 'Select a live player before requesting a task.');
        return;
      }

      if (player.status === 'firewall' && player.firewallNextTaskAt > Date.now()) {
        socket.emit('task_cooldown', {
          remaining: Math.ceil((player.firewallNextTaskAt - Date.now()) / 1000),
          cooldownUntil: player.firewallNextTaskAt,
        });
        return;
      }

      const difficulty = getPreferredDifficulty(player, requestedDifficulty);
      if (difficulty === 'easy' && player.easyCooldownEndsAt > Date.now()) {
        socket.emit('task_cooldown', {
          remaining: Math.ceil((player.easyCooldownEndsAt - Date.now()) / 1000),
          msg: 'Solving too fast! Easy tasks on cooldown.',
        });
        return;
      }

      player.preferredDifficulty = difficulty;

      const nextTaskId = getRandomTaskId(socket.id, difficulty);

      if (!nextTaskId) {
        player.currentTaskId = null;
        emitTaskAssigned(socket, {});
        socket.emit('error_msg', 'No compatible tasks are available for this request. Try a different difficulty.');
        return;
      }

      player.currentTaskId = nextTaskId;
      const isHackTask = player.role === 'hacker' && player.status === 'alive' && !!player.activeHackTargetId;
      emitTaskAssigned(socket, isHackTask ? { hackTaskId: nextTaskId } : { taskId: nextTaskId });
    });

    // ── SUBMIT TASK ───────────────────────────────────────
    socket.on('task_complete', (data) => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'playing') return;
      if (player.status !== 'alive' && player.status !== 'firewall') return;

      if (data.taskId && player.solvedTasks && player.solvedTasks.includes(data.taskId)) return;

      const taskDef = realPuzzlesDB.find(p => p.id === data.taskId);
      if (!taskDef) return;

      const lang = data.lang;
      if (!lang) {
        socket.emit('task_result', { success: false, message: 'Missing language selection.' });
        return;
      }

      if (!taskDef.versions || !taskDef.versions[lang]) {
        socket.emit('task_result', { success: false, message: 'Unsupported language for this task.' });
        return;
      }

      const grade = gradeTaskAnswer(taskDef, lang, {
        answer: data.answer ?? '',
        fillState: data.fillState,
        dragOrder: data.dragOrder,
        rearrangedLines: data.rearrangedLines,
      });

      if (grade.status === 'unparseable') {
        const replacementDifficulty = getPreferredDifficulty(player, taskDef.difficulty);
        const replacementTaskId = getRandomTaskId(socket.id, replacementDifficulty);
        player.currentTaskId = replacementTaskId;
        emitTaskAssigned(socket, replacementTaskId ? { taskId: replacementTaskId } : {});
        return;
      }

      if (grade.status !== 'correct') {
        socket.emit('task_result', { success: false, message: 'Incorrect. Solving locked temporarily.', penaltyMs: gameState.adminConfig.incorrectDelayMs });
        return;
      }

      const protectedTarget = player.status === 'firewall' ? gameState.players[data.protectedTargetId] : null;
      syncTransientPlayerState();
      if (player.status === 'firewall' && (!protectedTarget || protectedTarget.status !== 'alive' || protectedTarget.status === 'firewall')) {
        socket.emit('error_msg', 'Selected target is no longer valid.');
        return;
      }
      if (player.status === 'firewall' && player.role !== 'hacker' && protectedTarget.protectionBlockedUntil > Date.now()) {
        socket.emit('error_msg', 'That player cannot be protected yet.');
        player.currentTaskId = null;
        socket.emit('task_assigned', { taskPayload: null, isHackTask: false });
        return;
      }

      addScore(socket.id, getPointsForDifficulty(taskDef.difficulty));
      if (player.solvedTasks) player.solvedTasks.push(data.taskId);

      gameState.totalTasksSolved += 1;
      if (player.role === 'developer' && player.status === 'alive') {
        const increment = (1 / TASKS_FOR_WIN) * 100;
        gameState.globalProgress = Math.min(100, gameState.globalProgress + increment);
      }

      const normalizedTaskDifficulty = normalizeDifficulty(taskDef.difficulty);
      if (normalizedTaskDifficulty === 'hard' && player.role === 'hacker' && player.activeHackTargetId) {
        player.hackCooldownUntil = 0;
        socket.emit('hack_cooldown_reset', { message: 'System optimization complete. Special action re-enabled.' });
      }

      if (player.status === 'firewall') {
        player.firewallNextTaskAt = Date.now() + gameState.adminConfig.firewallBufferMs;

        if (player.role === 'hacker') {
          if (protectedTarget.isProtected) {
            protectedTarget.isProtected = false;
            protectedTarget.protectionExpiresAt = 0;
          } else {
            protectedTarget.protectionBlockedUntil = Math.max(
              protectedTarget.protectionBlockedUntil || 0,
              Date.now() + getHackerFirewallBlockDurationMs()
            );
          }
        } else {
          protectedTarget.isProtected = true;
          protectedTarget.protectionExpiresAt = Date.now() + getFirewallProtectionDurationMs();
          protectedTarget.protectionBlockedUntil = 0;
        }

        socket.emit('task_result', {
          success: true,
          message: 'Task completed.',
          firewallNextTaskAt: player.firewallNextTaskAt,
        });
      } else {
        socket.emit('task_result', { success: true, message: 'Task completed.', isHackTask: false });
      }

      if (TASK_ROOMS.includes(player.room)) {
        player.lastTaskRoom = player.room;
        if (!player.visitedTaskRooms.includes(player.room)) {
          player.visitedTaskRooms.push(player.room);
        }
      }

      if (normalizedTaskDifficulty === 'easy') {
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
      if (player.status !== 'firewall') player.activeHackTargetId = null;

      io.emit('progress_update', {
        globalProgress: Math.round(gameState.globalProgress * 100) / 100,
        totalTasks: gameState.totalTasksSolved,
      });

      socket.emit('your_score', { score: gameState.scores[socket.id] || 0 });
      emitTaskAssigned(socket, {});

      checkWinConditions(io);
    });

    // ── HACK PLAYER ──────────────────────────────────────
    socket.on('start_hack', (targetId) => {
      const hacker = gameState.players[socket.id];
      const target = gameState.players[targetId];
      if (!hacker || !target) return;
      syncTransientPlayerState();
      if (gameState.phase !== 'playing') return;
      if (hacker.role !== 'hacker' || hacker.status !== 'alive') return;
      if (target.id === socket.id) {
        socket.emit('error_msg', 'You cannot target yourself.');
        return;
      }
      if (target.status !== 'alive') return;
      if (target.pendingHack) return;
      if (target.room !== hacker.room) {
        socket.emit('error_msg', 'Target is no longer in your room.');
        return;
      }

      hacker.activeHackTargetId = target.id;
      if (hacker.currentTaskId) {
        emitTaskAssigned(socket, { hackTaskId: hacker.currentTaskId });
      }
    });

    socket.on('submit_hack', (data = {}) => {
      const hacker = gameState.players[socket.id];
      if (!hacker || hacker.role !== 'hacker' || hacker.status !== 'alive') return;
      syncTransientPlayerState();

      const targetId = hacker.activeHackTargetId || data.targetId;
      const target = targetId ? gameState.players[targetId] : null;

      if (target && target.id === socket.id) {
        socket.emit('error_msg', 'You cannot target yourself.');
        return;
      }
      if (target?.pendingHack) return;

      const taskId = data.taskId || hacker.currentTaskId;
      const taskDef = taskId ? getTaskDef(taskId) : null;
      if (!taskDef) return;
      const isHardHackTask = normalizeDifficulty(taskDef.difficulty) === 'hard';

      const lang = data.lang;
      if (!lang) {
        socket.emit('task_result', { success: false, message: 'Missing language selection.' });
        return;
      }
      if (!taskDef.versions || !taskDef.versions[lang]) {
        socket.emit('task_result', { success: false, message: 'Unsupported language for this task.' });
        return;
      }

      const grade = gradeTaskAnswer(taskDef, lang, {
        answer: data.answer ?? '',
        fillState: data.fillState,
        dragOrder: data.dragOrder,
        rearrangedLines: data.rearrangedLines,
      });

      if (grade.status === 'unparseable') {
        const replacementDifficulty = getPreferredDifficulty(hacker, taskDef.difficulty);
        const replacementHackTaskId = getRandomTaskId(socket.id, replacementDifficulty);
        hacker.currentTaskId = replacementHackTaskId;
        emitTaskAssigned(socket, replacementHackTaskId ? { hackTaskId: replacementHackTaskId } : {});
        return;
      }

      if (grade.status !== 'correct') {
        socket.emit('task_result', { success: false, message: 'Incorrect. System locked temporarily.', penaltyMs: gameState.adminConfig.incorrectDelayMs });
        emitTaskAssigned(socket, { hackTaskId: taskId });
        return;
      }

      if (isHardHackTask) {
        hacker.hackCooldownUntil = 0;
        socket.emit('hack_cooldown_reset', { message: 'System optimization complete. Special action re-enabled.' });
      }

      const pts = getPointsForDifficulty(taskDef.difficulty);
      addScore(socket.id, pts);
      socket.emit('your_score', { score: gameState.scores[socket.id] });

      if (hacker.solvedTasks) hacker.solvedTasks.push(taskId);

      if (!target || target.room !== hacker.room || target.status !== 'alive') {
        const cooldownUntil = isHardHackTask ? Date.now() : Date.now() + 15000;
        socket.emit('hack_success', { target: target ? target.name : 'Unknown', cooldownUntil, message: 'Target escaped. Challenge solved, points awarded.' });
        hacker.hackCooldownUntil = cooldownUntil;
        hacker.currentTaskId = null;
        hacker.activeHackTargetId = null;
        return;
      }

      if (target.isProtected || target.role === 'hacker') {
        hacker.hackCooldownUntil = isHardHackTask ? Date.now() : Date.now() + 15000;
        hacker.currentTaskId = null;
        hacker.activeHackTargetId = null;
        socket.emit('hack_success', { target: target.name, cooldownUntil: hacker.hackCooldownUntil, message: 'Task completed.' });
        return;
      }

      if (target.pendingHack) return;

      target.pendingHack = {
        hackerId: socket.id,
        revealAt: Date.now() + HACK_NOTICE_DELAY_MS,
      };
      target.anomalyAlertUsed = false;
      target.isProtected = false;
      target.protectionExpiresAt = 0;
      hacker.hackCooldownUntil = isHardHackTask ? Date.now() : Date.now() + HACK_COOLDOWN_MS;
      hacker.currentTaskId = null;
      hacker.activeHackTargetId = null;
      schedulePendingHackReveal(io, target.id);

      socket.emit('hack_success', { target: target.name, cooldownUntil: hacker.hackCooldownUntil, message: 'Task completed.' });
    });



    // ── ANOMALY ALERT ────────────────────────────────────
    socket.on('anomaly_alert', () => {});

    // ── EMERGENCY STANDUP ────────────────────────────────────
    socket.on('call_standup', () => {
      const player = gameState.players[socket.id];
      if (!player || player.status !== 'alive') return;
      if (gameState.phase !== 'playing') return;
      if (player.pendingHack) return;

      resolveAllPendingHacks(io, { announce: false });
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
      
      const extraSeconds = Math.max(0, Number(data?.amountSeconds) || 0);
      const extraMs = extraSeconds * 1000;
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

    socket.on('admin_end_standup', () => {
      if (gameState.phase !== 'standup' || !gameState.standupData) return;
      resolveVoting(io);
    });

    socket.on('admin_kick_player', (targetId) => {
      const target = gameState.players[targetId];
      if (!target) return;

      const targetRoom = target.room;
      clearPendingHackTimer(targetId);
      target.pendingHack = null;
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
      clearAllPendingHackTimers();
      await resetCumulativeScores();
      await clearLiveScores();
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

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      console.error(`> Port ${port} is already in use on ${host}.`);
      console.error('> Stop the existing dev/server process or start with a different PORT value.');
      process.exit(1);
    }
    console.error('> Server failed to start:', error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`> Breach & Defend Server Ready`);
    console.log(`> Local:   http://localhost:${port}`);
    getNetworkUrls(port).forEach((url, index) => {
      console.log(`> Network ${index + 1}: ${url}`);
    });
  });
});
