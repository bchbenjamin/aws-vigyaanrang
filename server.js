import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    // Compress payloads for low-bandwidth LANs
    perMessageDeflate: true,
  });

  const gameState = {
    globalProgress: 0,
    players: {},
  };

  io.on('connection', (socket) => {
    console.log(`[+] Connection established: ${socket.id}`);

    socket.on('join_game', (playerData) => {
      gameState.players[socket.id] = {
        id: socket.id,
        name: playerData.name || 'Anonymous',
        room: 'Breakroom',
        isHacker: false, // Default Assignment
      };
      // Only broadcast to players in the Breakroom initially to optimize traffic
      socket.join('Breakroom');
      io.to('Breakroom').emit('player_joined', gameState.players[socket.id]);
    });

    socket.on('move_room', (newRoom) => {
      if (gameState.players[socket.id]) {
        const oldRoom = gameState.players[socket.id].room;
        socket.leave(oldRoom);
        gameState.players[socket.id].room = newRoom;
        socket.join(newRoom);
        io.to(oldRoom).emit('player_left', socket.id);
        io.to(newRoom).emit('player_entered', gameState.players[socket.id]);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[-] Connection dropped: ${socket.id}`);
      if (gameState.players[socket.id]) {
        const room = gameState.players[socket.id].room;
        delete gameState.players[socket.id];
        io.to(room).emit('player_left', socket.id);
      }
    });
  });

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Breach & Defend Server Ready on http://localhost:3000');
  });
});
