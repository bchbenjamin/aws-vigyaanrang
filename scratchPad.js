let gameState = {
  phase: 'standup',
  players: {
    'p1': { id: 'p1', role: 'developer', status: 'alive' },
    'p2': { id: 'p2', role: 'hacker', status: 'alive' }
  },
  standupData: {
    votes: { 'p1': 'p2', 'p2': 'p2' }
  },
  scores: {},
  gameTimer: null
};

function getAlivePlayers() { return Object.values(gameState.players).filter(p => p.status === 'alive'); }
function getAliveHackers() { return getAlivePlayers().filter(p => p.role === 'hacker'); }
function getAliveDevelopers() { return getAlivePlayers().filter(p => p.role === 'developer'); }
function addScore(pid, pts) { gameState.scores[pid] = (gameState.scores[pid] || 0) + pts; }

function resolveVoting() {
  const votes = gameState.standupData.votes;
  const tally = {};
  Object.values(votes).forEach(t => tally[t] = (tally[t] || 0) + 1);

  let ejectedId = null; let maxVotes = 0; let tie = false;
  Object.entries(tally).forEach(([id, count]) => {
    if (count > maxVotes) { maxVotes = count; ejectedId = id; tie = false; }
    else if (count === maxVotes) { tie = true; }
  });
  if (tie || maxVotes === 0) ejectedId = null;

  let ejectedPlayer = null;
  if (ejectedId && gameState.players[ejectedId]) {
    ejectedPlayer = gameState.players[ejectedId];
    ejectedPlayer.status = 'ejected';
  }

  gameState.phase = 'playing';
  gameState.standupData = null;
  checkWinConditions();
}

function endGame(winSide) {
  gameState.phase = 'ended';
  gameState.winSide = winSide;
}

function checkWinConditions() {
  if (gameState.phase !== 'playing') return;
  const aliveDevs = getAliveDevelopers();
  const aliveHackers = getAliveHackers();
  
  if (aliveHackers.length === 0) return endGame('developers');
  if (aliveDevs.length <= aliveHackers.length) return endGame('hackers');
}

resolveVoting();
console.log('Phase:', gameState.phase);
console.log('WinSide:', gameState.winSide);
console.log('Hacker status:', gameState.players.p2.status);
