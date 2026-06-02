import React, { useState } from 'react';

export default function Lobby({ onCreate, onJoin, error, onClearError }) {
  const [tab, setTab] = useState('create');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [startingChips, setStartingChips] = useState(1000);
  const [bigBlind, setBigBlind] = useState(20);

  function handleCreate(e) {
    e.preventDefault();
    if (!playerName.trim()) return;
    onCreate({ playerName: playerName.trim(), startingChips: Number(startingChips), bigBlind: Number(bigBlind) });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!playerName.trim() || !joinCode.trim()) return;
    onJoin({ code: joinCode.trim().toUpperCase(), playerName: playerName.trim() });
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-card">
        <h1 className="logo">Poker Night</h1>
        <p className="logo-sub">Texas Hold'em with friends</p>

        <div className="tab-bar">
          <button className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>Create Game</button>
          <button className={`tab ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>Join Game</button>
        </div>

        {tab === 'create' && (
          <form onSubmit={handleCreate} className="form">
            <label className="form-label">Your Name
              <input className="form-input" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. Doyle" maxLength={20} required />
            </label>
            <div className="form-row">
              <label className="form-label">Starting Chips
                <input className="form-input" type="number" value={startingChips} onChange={e => setStartingChips(e.target.value)} min={100} max={100000} step={100} />
              </label>
              <label className="form-label">Big Blind
                <input className="form-input" type="number" value={bigBlind} onChange={e => setBigBlind(e.target.value)} min={2} max={startingChips / 10} step={2} />
              </label>
            </div>
            {error && <div className="error-msg" onClick={onClearError}>{error}</div>}
            <button type="submit" className="btn-primary">Create Room</button>
          </form>
        )}

        {tab === 'join' && (
          <form onSubmit={handleJoin} className="form">
            <label className="form-label">Your Name
              <input className="form-input" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. Phil" maxLength={20} required />
            </label>
            <label className="form-label">Room Code
              <input
                className="form-input code-input"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                required
              />
            </label>
            {error && <div className="error-msg" onClick={onClearError}>{error}</div>}
            <button type="submit" className="btn-primary">Join Room</button>
          </form>
        )}
      </div>
    </div>
  );
}
