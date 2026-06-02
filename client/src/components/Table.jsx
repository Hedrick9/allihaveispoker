import React from 'react';
import Card from './Card';
import PlayerSeat from './PlayerSeat';
import ActionBar from './ActionBar';

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
};

export default function Table({ state, myId, onAction }) {
  const { players, communityCards, pot, phase, lastAction, handResults } = state;

  // Reorder so "me" is at position 0, others go clockwise
  const myIndex = players.findIndex(p => p.id === myId);
  const ordered = myIndex >= 0
    ? [...players.slice(myIndex), ...players.slice(0, myIndex)]
    : players;

  const totalPot = pot;

  return (
    <div className="table-screen">
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
          {ordered.map((player, i) => (
            <div key={player.id} className="seat-wrapper" style={SEAT_POSITIONS[i] || SEAT_POSITIONS[SEAT_POSITIONS.length - 1]}>
              <PlayerSeat player={player} isBottom={i === 0} />
            </div>
          ))}
        </div>
      </div>

      {/* Action bar outside the table */}
      <ActionBar state={state} myId={myId} onAction={onAction} />
    </div>
  );
}
