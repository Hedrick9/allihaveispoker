const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { randomUUID } = require('crypto');
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
    if (sock) {
      sock.emit('game:state', room.game.getStateFor(playerId));
      sock.emit('slots:pool', { pool: room.slots.pool });
    }
  }
}

// ── Slot machine helpers ──────────────────────────────────────────────────────
//
// Virtual reel: each symbol occupies a number of stops on a 22-stop strip.
// Probability of landing = stops/22 per reel; three-of-a-kind = (stops/22)³.
//   cherry  7/22  → three-of-a-kind ~1 in 11
//   lemon   5/22  → ~1 in 29
//   doll    4/22  → ~1 in 84
//   star    3/22  → ~1 in 300
//   diamond 2/22  → ~1 in 1,330
//   seven   1/22  → ~1 in 10,648  (jackpot)

const SLOT_REEL = [
  ...Array(7).fill('cherry'),
  ...Array(5).fill('lemon'),
  ...Array(4).fill('doll'),
  ...Array(3).fill('star'),
  ...Array(2).fill('diamond'),
  ...Array(1).fill('seven'),
]; // 22 stops

function slotPick() {
  return SLOT_REEL[Math.floor(Math.random() * SLOT_REEL.length)];
}

function slotSpin() {
  const s = [slotPick(), slotPick(), slotPick()];
  let outcome;
  if (s[0] === s[1] && s[1] === s[2])                      outcome = 'jackpot';
  else if (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) outcome = 'partial';
  else                                                        outcome = 'loss';
  return { outcome, symbols: s };
}

function slotPayout(symbols, cost, pool) {
  const [s0, s1, s2] = symbols;

  if (s0 === s1 && s1 === s2) {
    // Three of a kind — tiered by rarity
    if (s0 === 'seven')   return pool; // full jackpot
    const mult = { diamond: 20, star: 10, doll: 5, lemon: 3, cherry: 2 };
    return Math.min((mult[s0] ?? 1) * cost, pool);
  }

  // Pair — find the matching symbol
  const pair = s0 === s1 ? s0 : s1 === s2 ? s1 : s0;
  if (pair === 'seven')   return Math.min(4 * cost, pool);
  if (pair === 'diamond') return Math.min(2 * cost, pool);
  return Math.min(cost, pool); // any other pair: break even
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
    const playerId = randomUUID();
    game.addPlayer(playerId, playerName || 'Player 1');

    const room = {
      game,
      hostSocketId: socket.id,
      socketToPlayer: new Map([[socket.id, playerId]]),
      playerToSocket: new Map([[playerId, socket.id]]),
      slots: { pool: 0 },
    };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    socket.emit('room:joined', { code, playerId, isHost: true });
    broadcastLobby(room);
  });

  socket.on('room:join', ({ code, playerName }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) { socket.emit('error', 'Room not found'); return; }

    const playerId = randomUUID();
    const result = room.game.addPlayer(playerId, playerName || 'Player');
    if (result.error) { socket.emit('error', result.error); return; }

    room.socketToPlayer.set(socket.id, playerId);
    room.playerToSocket.set(playerId, socket.id);
    socketToRoom.set(socket.id, code.toUpperCase());
    socket.join(code.toUpperCase());

    socket.emit('room:joined', { code: code.toUpperCase(), playerId, isHost: false });
    if (room.game.gameStarted) {
      broadcast(room);
      if (room.game.phase === 'waiting-for-players') {
        scheduleNextHand(code);
      }
    } else {
      broadcastLobby(room);
    }
  });

  socket.on('room:rejoin', ({ code, playerId }) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room) { socket.emit('error', 'Room no longer exists'); return; }

    // Don't require disconnected flag — rejoin can race ahead of the disconnect event
    const player = room.game.players.find(p => p.id === playerId && !p.eliminated);
    if (!player) { socket.emit('error', 'Session not found'); return; }

    // Clean up the old socket before it fires its own disconnect event
    const oldSocketId = room.playerToSocket.get(playerId);
    if (oldSocketId && oldSocketId !== socket.id) {
      room.socketToPlayer.delete(oldSocketId);
      socketToRoom.delete(oldSocketId); // disconnect handler checks this — will no-op
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect(true);
    }

    room.socketToPlayer.set(socket.id, playerId);
    room.playerToSocket.set(playerId, socket.id);
    socketToRoom.set(socket.id, String(code).toUpperCase());
    socket.join(String(code).toUpperCase());

    const wasHost = room.hostSocketId === oldSocketId;
    if (wasHost) room.hostSocketId = socket.id;

    player.disconnected = false;

    socket.emit('room:joined', { code: String(code).toUpperCase(), playerId, isHost: wasHost });
    broadcast(room);
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

  socket.on('slots:spin', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room || !room.game.gameStarted) return;

    const playerId = room.socketToPlayer.get(socket.id);
    const player = room.game.players.find(p => p.id === playerId && !p.eliminated && !p.disconnected);
    if (!player) return;

    const cost = room.game.config.smallBlind;
    if (player.chips < cost) { socket.emit('slots:error', 'Not enough chips to spin'); return; }

    player.chips -= cost;
    room.slots.pool += cost;

    const { outcome, symbols } = slotSpin();

    const payout = (outcome !== 'loss') ? slotPayout(symbols, cost, room.slots.pool) : 0;
    if (payout > 0) {
      player.chips += payout;
      room.slots.pool -= payout;
    }

    socket.emit('slots:result', { symbols, outcome, payout });
    broadcast(room);
  });

  socket.on('chat:message', (text) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const playerId = room.socketToPlayer.get(socket.id);
    const player = room.game.players.find(p => p.id === playerId);
    if (!player) return;
    const safe = String(text).trim().slice(0, 200);
    if (!safe) return;
    io.to(code).emit('chat:message', { playerId, name: player.name, text: safe });
  });

  socket.on('room:config-update', ({ bigBlind }) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    const bb = Math.round(Number(bigBlind));
    if (isNaN(bb) || bb < 2) return;
    room.game.config.bigBlind = bb;
    room.game.config.smallBlind = Math.max(1, Math.floor(bb / 2));
    broadcast(room);
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
      else if (room.game.phase === 'waiting-for-players') { /* nothing to schedule */ }
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
