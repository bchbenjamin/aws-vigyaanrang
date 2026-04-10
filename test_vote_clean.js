const { io } = require('socket.io-client');
const http = require('http');

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runTest() {
  const adminHost = 'http://localhost:3001';
  
  const adminSocket = io(adminHost, { transports: ['websocket'] });
  adminSocket.on('connect', () => console.log('Admin connected'));

  adminSocket.emit('admin_register_user', { name: 'Player 1', code: 'C1' });
  adminSocket.emit('admin_register_user', { name: 'Player 2', code: 'C2' });
  await wait(500);

  const p1 = io(adminHost, { transports: ['websocket'] });
  const p2 = io(adminHost, { transports: ['websocket'] });
  
  p1.emit('join_game', { code: 'C1' });
  p2.emit('join_game', { code: 'C2' });
  await wait(500);

  adminSocket.emit('admin_start_with_roles', { [p1.id]: 'developer', [p2.id]: 'hacker' });
  await wait(500);

  p1.emit('call_standup');
  await wait(500);

  p1.emit('cast_vote', p2.id);
  p2.emit('cast_vote', p2.id);
  
  await wait(1000);
  
  const res = await fetch(adminHost + '/api/admin/state');
  const state = await res.json();
  console.log('Final Phase:', state.phase);
  console.log('Final WinSide:', state.winSide);
  
  process.exit(0);
}

runTest();
