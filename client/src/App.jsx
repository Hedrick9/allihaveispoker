import React, { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import Table from './components/Table';

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | waiting-room | game
  const [myId, setMyId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [lobbyState, setLobbyState] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    socket.connect();

    socket.on('room:joined', ({ code, playerId }) => {
      setMyId(playerId);
      setRoomCode(code);
      setScreen('waiting-room');
      setError(null);
    });

    socket.on('lobby:state', (state) => {
      setLobbyState(state);
      if (state.gameStarted) setScreen('game');
    });

    socket.on('game:state', (state) => {
      setGameState(state);
      if (state.phase !== 'waiting') setScreen('game');
    });

    socket.on('game:over', ({ message }) => {
      alert(message);
      setScreen('lobby');
      setGameState(null);
      setLobbyState(null);
      setRoomCode(null);
      setMyId(null);
    });

    socket.on('error', (msg) => {
      setError(msg);
    });

    return () => socket.disconnect();
  }, []);

  function handleCreate({ playerName, startingChips, bigBlind }) {
    setIsHost(true);
    socket.emit('room:create', { playerName, startingChips, bigBlind });
  }

  function handleJoin({ code, playerName }) {
    setIsHost(false);
    socket.emit('room:join', { code, playerName });
  }

  function handleStartGame() {
    socket.emit('game:start');
  }

  function handleAction(type, amount) {
    socket.emit('player:action', { type, amount });
  }

  if (screen === 'game' && gameState) {
    return <Table state={gameState} myId={myId} onAction={handleAction} />;
  }

  if (screen === 'waiting-room' && lobbyState) {
    return (
      <WaitingRoom
        roomCode={roomCode}
        lobbyState={lobbyState}
        isHost={isHost}
        myId={myId}
        onStart={handleStartGame}
        error={error}
        onClearError={() => setError(null)}
      />
    );
  }

  return (
    <Lobby onCreate={handleCreate} onJoin={handleJoin} error={error} onClearError={() => setError(null)} />
  );
}

function WaitingRoom({ roomCode, lobbyState, isHost, myId, onStart, error, onClearError }) {
  return (
    <div className="lobby-screen">
      <div className="lobby-card">
        <h1 className="logo">Poker Night</h1>
        <div className="room-code-display">
          <span className="room-code-label">Room Code</span>
          <span className="room-code-value">{roomCode}</span>
          <span className="room-code-hint">Share this with your friends</span>
        </div>

        <div className="player-list">
          <h3>Players ({lobbyState.players.length})</h3>
          {lobbyState.players.map((p, i) => (
            <div key={p.id} className={`player-list-item ${p.id === myId ? 'is-you' : ''}`}>
              <span className="player-list-dot" />
              {p.name} {p.id === myId ? '(you)' : ''}
              {i === 0 ? <span className="host-badge">host</span> : null}
            </div>
          ))}
        </div>

        <div className="config-summary">
          <span>Starting chips: <strong>{lobbyState.config.startingChips}</strong></span>
          <span>Blinds: <strong>{lobbyState.config.smallBlind}/{lobbyState.config.bigBlind}</strong></span>
        </div>

        {error && <div className="error-msg" onClick={onClearError}>{error}</div>}

        {isHost ? (
          <button
            className="btn-primary"
            onClick={onStart}
            disabled={lobbyState.players.length < 2}
          >
            {lobbyState.players.length < 2 ? 'Waiting for players…' : 'Start Game'}
          </button>
        ) : (
          <p className="waiting-text">Waiting for host to start…</p>
        )}
      </div>
    </div>
  );
}
