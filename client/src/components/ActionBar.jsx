import React, { useState, useEffect, useRef } from 'react';

export default function ActionBar({ state, myId, onAction, timerEnabled, timerSeconds }) {
  const { currentPlayerId, currentBet, minRaise, phase } = state;
  const me = state.players.find(p => p.id === myId);
  const [raiseAmount, setRaiseAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const isMyTurn = currentPlayerId === myId;

  useEffect(() => {
    if (!timerEnabled || !isMyTurn || phase === 'showdown' || phase === 'waiting') {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(timerSeconds);
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          onActionRef.current('fold');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isMyTurn, timerEnabled, timerSeconds, phase]);

  if (!me || phase === 'showdown' || phase === 'waiting' || phase === 'waiting-for-players') return null;
  if (me.pendingNextHand) {
    return (
      <div className="action-bar">
        <span className="action-waiting">Sitting out — you'll be dealt in next hand…</span>
      </div>
    );
  }
  if (currentPlayerId !== myId) {
    return (
      <div className="action-bar">
        <span className="action-waiting">Waiting for {state.players.find(p => p.id === currentPlayerId)?.name}…</span>
      </div>
    );
  }

  const myBet = me.currentRoundBet;
  const toCall = Math.max(0, currentBet - myBet);
  const canCheck = toCall === 0;
  const minRaiseTo = currentBet + minRaise;
  const maxRaise = me.chips + myBet;
  const canRaise = me.chips > toCall;

  const raiseVal = Number(raiseAmount) || minRaiseTo;

  function doRaise() {
    const amt = Math.min(Math.max(raiseVal, minRaiseTo), maxRaise);
    onAction('raise', amt);
    setRaiseAmount('');
  }

  return (
    <div className="action-bar">
      {timeLeft !== null && (
        <div className={`timer-countdown ${timeLeft <= 5 ? 'urgent' : ''}`}>{timeLeft}s</div>
      )}
      <button className="btn-action btn-fold" onClick={() => onAction('fold')}>Fold</button>

      {canCheck ? (
        <button className="btn-action btn-check" onClick={() => onAction('check')}>Check</button>
      ) : (
        <button className="btn-action btn-call" onClick={() => onAction('call')}>
          Call {toCall >= me.chips ? '(All-in)' : toCall.toLocaleString()}
        </button>
      )}

      {canRaise && (
        <div className="raise-group">
          <button className="btn-action btn-raise" onClick={doRaise}>
            {raiseVal >= maxRaise ? 'All-in' : 'Raise to'}
          </button>
          <input
            className="raise-input"
            type="number"
            value={raiseAmount}
            onChange={e => setRaiseAmount(e.target.value)}
            min={minRaiseTo}
            max={maxRaise}
            step={state.config.bigBlind}
            placeholder={minRaiseTo}
          />
          <div className="raise-shortcuts">
            {[0.33, 0.5, 0.75, 1].map(f => {
              const pot = state.pot;
              const v = Math.min(Math.round((myBet + pot * f) / state.config.bigBlind) * state.config.bigBlind, maxRaise);
              const label = f === 1 ? 'Pot' : `${Math.round(f * 100)}%`;
              return (
                <button key={f} className="raise-shortcut" onClick={() => setRaiseAmount(String(Math.max(v, minRaiseTo)))}>
                  {label}
                </button>
              );
            })}
            <button className="raise-shortcut" onClick={() => setRaiseAmount(String(maxRaise))}>All-in</button>
          </div>
        </div>
      )}
    </div>
  );
}
