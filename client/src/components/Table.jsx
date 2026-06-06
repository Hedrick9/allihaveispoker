import React, { useState } from 'react';
import Card from './Card';
import PlayerSeat from './PlayerSeat';
import ActionBar from './ActionBar';
import HelpOverlay from './HelpOverlay';
import SettingsModal from './SettingsModal';
import Chat from './Chat';
import SlotMachine from './SlotMachine';
import Jukebox from './Jukebox';

// Deterministic float 0–1 from a string seed
function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return (h >>> 0) / 0xFFFFFFFF;
}

function propStyle(id) {
  return {
    rotation: Math.round((strHash(id + 'rot') - 0.5) * 50),
    dx: Math.round((strHash(id + 'dx') - 0.5) * 14),
    dy: Math.round((strHash(id + 'dy') - 0.5) * 8),
  };
}

// Seat positions around the oval table (CSS style objects)
// Ordered: bottom-center (you), then clockwise
const SEAT_POSITIONS = [
  { bottom: '-80px', left: '50%', transform: 'translateX(-50%)' },
  { bottom: '-40px', right: '-20px' },
  { top: '40%', right: '-120px', transform: 'translateY(-50%)' },
  { top: '-70px', right: '10%' },
  { top: '-80px', left: '50%', transform: 'translateX(-50%)' },
  { top: '-70px', left: '10%' },
  { top: '40%', left: '-120px', transform: 'translateY(-50%)' },
  { bottom: '-40px', left: '-20px' },
];

const PHASE_LABEL = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  'waiting-for-players': 'Waiting for Players',
};

export default function Table({ state, myId, roomCode, onAction, isHost, settings, onSettingsChange, chatMessages, slotsPool, jukeboxNowPlaying, jukeboxQueue, jukeboxJamLink, jukeboxRequests }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [jukeboxOpen, setJukeboxOpen] = useState(false);
  const me = state.players.find(p => p.id === myId);
  const { players, communityCards, pot, phase, lastAction, handResults } = state;

  // Reorder so "me" is at position 0, others go clockwise
  const myIndex = players.findIndex(p => p.id === myId);
  const ordered = myIndex >= 0
    ? [...players.slice(myIndex), ...players.slice(0, myIndex)]
    : players;

  const totalPot = pot;

  return (
    <div className="table-screen">
      <HelpOverlay />
      <button className="overlay-btn settings-btn-fixed" onClick={() => setSettingsOpen(true)}>⚙</button>
      <button className="overlay-btn slot-btn-fixed" onClick={() => setSlotOpen(true)}>🎰</button>
      <button className="overlay-btn jukebox-btn-fixed" onClick={() => setJukeboxOpen(true)}>🎵</button>
      <Chat messages={chatMessages} myId={myId} />
      {jukeboxOpen && (
        <Jukebox
          onClose={() => setJukeboxOpen(false)}
          isHost={isHost}
          myName={me?.name ?? ''}
          nowPlaying={jukeboxNowPlaying}
          nextUp={jukeboxQueue}
          jamLink={jukeboxJamLink}
          requests={jukeboxRequests}
        />
      )}
      {slotOpen && (
        <SlotMachine
          onClose={() => setSlotOpen(false)}
          pool={slotsPool}
          smallBlind={state.config.smallBlind}
          myChips={me?.chips ?? 0}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setSettingsOpen(false)}
          isHost={isHost}
          gameConfig={state.config}
        />
      )}

      {roomCode && (
        <div className="room-code-badge">
          <span className="room-code-badge-label">ROOM</span>
          <span className="room-code-badge-value">{roomCode}</span>
        </div>
      )}
      <div className="table-wrapper">
        <div className="table-felt">

          {/* Phase badge */}
          <div className="phase-badge">{PHASE_LABEL[phase] || phase}</div>

          {/* Pot */}
          <div className="pot-display">
            <span className="pot-label">POT</span>
            <span className="pot-amount">{totalPot.toLocaleString()}</span>
          </div>

          {/* Community cards */}
          <div className="community-cards">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} card={communityCards[i] || null} faceDown={i >= communityCards.length} />
            ))}
          </div>

          {/* Last action notification */}
          {lastAction && (
            <div className="last-action">
              {lastAction.playerName} {lastAction.action === 'raise' ? `raised to ${lastAction.amount?.toLocaleString()}` : lastAction.action}
            </div>
          )}

          {/* Showdown results */}
          {phase === 'showdown' && handResults && (
            <div className="showdown-results">
              {handResults.map((r, i) => (
                <div key={i} className="showdown-winner">
                  {r.name} wins {r.chipsWon.toLocaleString()}
                  {r.handName ? ` · ${r.handName}` : ''}
                </div>
              ))}
              <div className="showdown-next">Next hand starting…</div>
            </div>
          )}

          {/* Player seats */}
          {ordered.map((player, i) => {
            const { rotation, dx, dy } = propStyle(player.id);
            return (
              <div key={player.id} className="seat-wrapper" style={SEAT_POSITIONS[i] || SEAT_POSITIONS[SEAT_POSITIONS.length - 1]}>
                <PlayerSeat player={player} isBottom={i === 0} />
                {player.prop && (
                  <img
                    src={player.prop}
                    alt=""
                    className="player-prop"
                    style={{ transform: `rotate(${rotation}deg) translate(${dx}px, ${dy}px)` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action bar outside the table */}
      <ActionBar
        state={state}
        myId={myId}
        onAction={onAction}
        timerEnabled={settings.timerEnabled}
        timerSeconds={settings.timerSeconds}
      />
    </div>
  );
}
