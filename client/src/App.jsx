import React, { useState, useEffect, useRef } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import Table from './components/Table';
import { handleCallback as spotifyCallback, addToQueue as spotifyAddToQueue, isAuthenticated as spotifyIsAuthenticated } from './spotify';

const SESSION_KEY = 'poker_session';

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | waiting-room | game
  const [myId, setMyId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [lobbyState, setLobbyState] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({ timerEnabled: false, timerSeconds: 30 });
  const [chatMessages, setChatMessages] = useState([]);
  const [slotsPool, setSlotsPool] = useState(0);
  const [jukeboxNowPlaying, setJukeboxNowPlaying] = useState(null);
  const [jukeboxQueue, setJukeboxQueue] = useState([]);
  const [jukeboxJamLink, setJukeboxJamLink] = useState('');
  const [jukeboxRequests, setJukeboxRequests] = useState([]);
  const rejoinAttemptRef = useRef(false);
  const isHostRef = useRef(false);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // Handle Spotify OAuth callback — exchange code for token, then resume normally
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      spotifyCallback(code).catch(console.error);
    }
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      try {
        const { code, playerId } = JSON.parse(raw);
        rejoinAttemptRef.current = true;
        socket.emit('room:rejoin', { code, playerId });
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    });

    socket.connect();

    socket.on('room:joined', ({ code, playerId, isHost: host }) => {
      rejoinAttemptRef.current = false;
      setMyId(playerId);
      setRoomCode(code);
      setIsHost(!!host);
      setScreen('waiting-room');
      setError(null);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }));
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
      setChatMessages([]);
      localStorage.removeItem(SESSION_KEY);
    });

    socket.on('error', (msg) => {
      setError(msg);
      if (rejoinAttemptRef.current) {
        rejoinAttemptRef.current = false;
        localStorage.removeItem(SESSION_KEY);
      }
    });

    socket.on('chat:message', ({ playerId, name, text }) => {
      setChatMessages(prev => [...prev, { playerId, name, text }]);
    });

    socket.on('slots:pool', ({ pool }) => setSlotsPool(pool));

    socket.on('jukebox:now-playing', (data) => setJukeboxNowPlaying(data));
    socket.on('jukebox:queue', (q) => setJukeboxQueue(q || []));
    socket.on('jukebox:jam-link', ({ url }) => setJukeboxJamLink(url));
    socket.on('jukebox:request', (req) => setJukeboxRequests(prev => [...prev, req]));

    // Always-on auto-queue: fires whether or not the Jukebox panel is open
    socket.on('jukebox:add-to-queue', ({ uri, name, artist }) => {
      if (!isHostRef.current || !spotifyIsAuthenticated()) return;
      spotifyAddToQueue(uri)
        .then(() => socket.emit('jukebox:queued', { name, artist }))
        .catch(console.error);
    });

    return () => socket.disconnect();
  }, []);

  function handleCreate({ playerName, startingChips, bigBlind }) {
    socket.emit('room:create', { playerName, startingChips, bigBlind });
  }

  function handleJoin({ code, playerName }) {
    socket.emit('room:join', { code, playerName });
  }

  function handleStartGame() {
    socket.emit('game:start');
  }

  function handleAction(type, amount) {
    socket.emit('player:action', { type, amount });
  }

  if (screen === 'game' && gameState) {
    return (
      <Table
        state={gameState}
        myId={myId}
        roomCode={roomCode}
        onAction={handleAction}
        isHost={isHost}
        settings={settings}
        onSettingsChange={setSettings}
        chatMessages={chatMessages}
        slotsPool={slotsPool}
        jukeboxNowPlaying={jukeboxNowPlaying}
        jukeboxQueue={jukeboxQueue}
        jukeboxJamLink={jukeboxJamLink}
        jukeboxRequests={jukeboxRequests}
      />
    );
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
            disabled={lobbyState.players.length < 1}
          >
            {lobbyState.players.length < 1 ? 'Waiting for players…' : 'Start Game'}
          </button>
        ) : (
          <p className="waiting-text">Waiting for host to start…</p>
        )}
      </div>
    </div>
  );
}
