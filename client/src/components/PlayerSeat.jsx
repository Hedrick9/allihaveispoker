import React from 'react';
import Card from './Card';

export default function PlayerSeat({ player, isBottom }) {
  const {
    name, chips, totalContributed, folded, allIn,
    isDealer, isSB, isBB, isCurrentPlayer, isYou, holeCards, cardCount,
    pendingNextHand, disconnected,
  } = player;

  const badges = [];
  if (isDealer) badges.push({ label: 'D', cls: 'badge-dealer' });
  if (isSB) badges.push({ label: 'SB', cls: 'badge-blind' });
  if (isBB) badges.push({ label: 'BB', cls: 'badge-blind' });

  return (
    <div className={`seat ${isCurrentPlayer ? 'seat-active' : ''} ${folded ? 'seat-folded' : ''} ${isYou ? 'seat-you' : ''} ${isBottom ? 'seat-bottom' : ''} ${pendingNextHand ? 'seat-pending' : ''} ${disconnected ? 'seat-disconnected' : ''}`}>
      <div className="seat-cards">
        {cardCount > 0
          ? holeCards.map((card, i) => (
              <Card key={i} card={card} faceDown={!card} small={!isBottom} />
            ))
          : null}
      </div>

      <div className="seat-info">
        <div className="seat-name">
          {name}
          {isYou ? <span className="you-label"> (you)</span> : null}
          {allIn ? <span className="allin-label"> ALL-IN</span> : null}
        </div>
        {pendingNextHand
          ? <div className="seat-pending-label">Next hand</div>
          : disconnected
          ? <div className="seat-pending-label">Offline · {chips.toLocaleString()}</div>
          : <div className="seat-chips">{chips.toLocaleString()}</div>
        }
        {!pendingNextHand && totalContributed > 0 && (
          <div className="seat-bet">In: {totalContributed.toLocaleString()}</div>
        )}
        {badges.map(b => (
          <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}
