import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

const DISPLAY = {
  cherry:  '🍒',
  lemon:   '🍋',
  doll:    '🪆',
  star:    '⭐',
  diamond: '💎',
  seven:   '7',
};

const ALL_SYMS = Object.values(DISPLAY);

export default function SlotMachine({ onClose, pool, smallBlind, myChips }) {
  const [reels, setReels]         = useState(['🍒', '🍋', '🪆']);
  const [spinning, setSpinning]   = useState(false);
  const [result, setResult]       = useState(null);
  const [displayPool, setDisplayPool] = useState(pool);
  const resultRef   = useRef(null);
  const intervalRef = useRef(null);
  const stopped     = useRef([false, false, false]);
  const spinningRef = useRef(false); // sync flag — avoids stale closure in setTimeout
  const poolRef     = useRef(pool);  // always holds latest server pool value

  // Keep poolRef current; only update displayed pool while not spinning
  useEffect(() => {
    poolRef.current = pool;
    if (!spinningRef.current) setDisplayPool(pool);
  }, [pool]);

  useEffect(() => {
    function onResult(data) { resultRef.current = data; }
    function onErr(msg)     { setResult({ outcome: 'error', msg }); setSpinning(false); }
    socket.on('slots:result', onResult);
    socket.on('slots:error',  onErr);
    return () => {
      socket.off('slots:result', onResult);
      socket.off('slots:error',  onErr);
    };
  }, []);

  function spin() {
    if (spinning || myChips < smallBlind) return;
    spinningRef.current = true;
    setSpinning(true);
    setResult(null);
    resultRef.current = null;
    stopped.current = [false, false, false];
    socket.emit('slots:spin');

    // Single interval drives all three reels
    intervalRef.current = setInterval(() => {
      setReels(prev => prev.map((s, i) =>
        stopped.current[i] ? s : ALL_SYMS[Math.floor(Math.random() * ALL_SYMS.length)]
      ));
    }, 80);

    // Stop each reel left → middle → right
    [1400, 2000, 2600].forEach((delay, i) => {
      setTimeout(() => {
        stopped.current[i] = true;
        // Snap reel to its final symbol if result arrived
        const res = resultRef.current;
        if (res) {
          setReels(prev => {
            const next = [...prev];
            next[i] = DISPLAY[res.symbols[i]];
            return next;
          });
        }
        if (i === 2) {
          setTimeout(() => {
            clearInterval(intervalRef.current);
            const final = resultRef.current;
            if (final) {
              setReels(final.symbols.map(s => DISPLAY[s]));
              setResult(final);
            }
            // Reveal the true pool value at the same moment as the result
            setDisplayPool(poolRef.current);
            spinningRef.current = false;
            setSpinning(false);
          }, 350);
        }
      }, delay);
    });
  }

  const canSpin = !spinning && myChips >= smallBlind;

  return (
    <div className="slot-machine">
      <button className="modal-close slot-close" onClick={onClose}>✕</button>

        <div className="slot-title">★ SLOTS ★</div>

        <div className="slot-jackpot-box">
          <div className="slot-jackpot-label">◆ JACKPOT ◆</div>
          <div className="slot-jackpot-amount">{displayPool.toLocaleString()}</div>
          <div className="slot-jackpot-unit">chips</div>
        </div>

        <div className="slot-reels-frame">
          <div className="slot-reels-inner">
            {reels.map((sym, i) => (
              <div key={i} className={`slot-reel ${spinning && !stopped.current[i] ? 'slot-reel-spin' : ''}`}>
                {sym}
              </div>
            ))}
          </div>
        </div>

        <div className={`slot-result-row ${result ? result.outcome : ''}`}>
          {!result && !spinning && <span className="slot-idle">· · · · ·</span>}
          {spinning && <span className="slot-idle">SPINNING...</span>}
          {result?.outcome === 'jackpot' && `★ JACKPOT! +${result.payout.toLocaleString()} ★`}
          {result?.outcome === 'partial' && `WIN  +${result.payout.toLocaleString()}`}
          {result?.outcome === 'loss'    && 'NO LUCK...'}
          {result?.outcome === 'error'   && result.msg}
        </div>

        <button className="slot-spin-btn" onClick={spin} disabled={!canSpin}>
          {spinning ? 'SPINNING...' : canSpin ? `SPIN  [ ${smallBlind} chips ]` : 'NOT ENOUGH CHIPS'}
        </button>

        <div className="slot-paytable">
          <div className="slot-pay-title">— PAY TABLE —</div>
          <div className="slot-pay-row"><span>7  7  7</span>  <span className="hi">JACKPOT</span></div>
          <div className="slot-pay-row"><span>💎 💎 💎</span> <span>20× BET</span></div>
          <div className="slot-pay-row"><span>⭐ ⭐ ⭐</span>  <span>10× BET</span></div>
          <div className="slot-pay-row"><span>🪆 🪆 🪆</span> <span>5× BET</span></div>
          <div className="slot-pay-row"><span>🍋 🍋 🍋</span> <span>3× BET</span></div>
          <div className="slot-pay-row"><span>🍒 🍒 🍒</span> <span>2× BET</span></div>
          <div className="slot-pay-row"><span>7  7  ?</span>  <span>4× BET</span></div>
          <div className="slot-pay-row"><span>💎 💎 ?</span>  <span>2× BET</span></div>
          <div className="slot-pay-row"><span>Any pair</span> <span>1× BET</span></div>
        </div>
    </div>
  );
}
