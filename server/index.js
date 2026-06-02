const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const PokerGame = require('./game/PokerGame');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve built client in production
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// rooms: Map<code, { game, hostSocketId, socketToPlayer: Map<socketId, playerId>, playerToSocket: Map<playerId, socketId> }>
const rooms = new Map();
const socketToRoom = new Map(); // socketId → roomCode

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function broadcast(room) {
  for (const [socketId, playerId] of room.socketToPlayer) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.emit('game:state', room.game.getStateFor(playerId));
  }
}

function broadcastLobby(room) {
  io.to(roomCode(room)).emit('lobby:state', room.game.getLobbyState());
}

function roomCode(room) {
  for (const [code, r] of rooms) if (r === room) return code;
  return null;
}

function scheduleNextHand(code) {
  setTimeout(() => {
    const room = rooms.get(code);
    if (!room) return;
    room.game.nextHand();
    if (room.game.phase === 'game-over') {
      io.to(code).emit('game:over', { message: 'Game over!' });
    } else {
      broadcast(room);
    }
  }, 6000);
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('room:create', ({ playerName, startingChips, bigBlind }) => {
    let code;
    do { code = generateCode(); } while (rooms.has(code));

    const game = new PokerGame({ startingChips: startingChips || 1000, bigBlind: bigBlind || 20 });
    const playerId = socket.id;
    game.addPlayer(playerId, playerName || 'Player 1');

    const room = {
      game,
      hostSocketId: socket.id,
      socketToPlayer: new Map([[socket.id, playerId]]),
      playerToSocket: new Map([[playerId, socket.id]]),
    };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    socket.emit('room:joined', { code, playerId });
    broadcastLobby(room);
  });

  socket.on('room:join', ({ code, playerName }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) { socket.emit('error', 'Room not found'); return; }
    if (room.game.gameStarted) { socket.emit('error', 'Game already in progress'); return; }

    const playerId = socket.id;
    const result = room.game.addPlayer(playerId, playerName || 'Player');
    if (result.error) { socket.emit('error', result.error); return; }

    room.socketToPlayer.set(socket.id, playerId);
    room.playerToSocket.set(playerId, socket.id);
    socketToRoom.set(socket.id, code.toUpperCase());
    socket.join(code.toUpperCase());

    socket.emit('room:joined', { code: code.toUpperCase(), playerId });
    broadcastLobby(room);
  });

  socket.on('game:start', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostSocketId !== socket.id) { socket.emit('error', 'Only the host can start'); return; }

    const result = room.game.startGame();
    if (result.error) { socket.emit('error', result.error); return; }

    broadcast(room);
  });

  socket.on('player:action', ({ type, amount }) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const playerId = room.socketToPlayer.get(socket.id);
    if (!playerId) return;

    let result;
    if (type === 'fold') result = room.game.fold(playerId);
    else if (type === 'check') result = room.game.check(playerId);
    else if (type === 'call') result = room.game.call(playerId);
    else if (type === 'raise') result = room.game.raise(playerId, amount);
    else return;

    if (result?.error) { socket.emit('error', result.error); return; }

    broadcast(room);

    if (room.game.phase === 'showdown') {
      scheduleNextHand(code);
    }
  });

  socket.on('disconnect', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    const playerId = room.socketToPlayer.get(socket.id);
    room.socketToPlayer.delete(socket.id);
    room.playerToSocket.delete(playerId);
    socketToRoom.delete(socket.id);

    if (room.game.gameStarted) {
      room.game.removePlayer(playerId);
      broadcast(room);
      if (room.game.phase === 'showdown') scheduleNextHand(code);
    } else {
      room.game.removePlayer(playerId);
      // Transfer host if needed
      if (room.hostSocketId === socket.id && room.socketToPlayer.size > 0) {
        room.hostSocketId = room.socketToPlayer.keys().next().value;
      }
      broadcastLobby(room);
    }

    if (room.socketToPlayer.size === 0) rooms.delete(code);
    console.log('disconnect', socket.id, 'room', code);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Poker server running on http://localhost:${PORT}`));
