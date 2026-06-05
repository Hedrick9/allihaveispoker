import React, { useState } from 'react';

const R = '♥';  // just aliases for readability below
const D = '♦';
const C = '♣';
const S = '♠';

const HANDS = [
  {
    name: 'High Card',
    desc: 'No matching cards — highest card plays',
    cards: [['A',S], ['J',R], ['8',D], ['5',C], ['2',S]],
  },
  {
    name: 'One Pair',
    desc: 'Two cards of the same rank',
    cards: [['Q',R], ['Q',D], ['9',S], ['6',C], ['2',R]],
  },
  {
    name: 'Two Pair',
    desc: 'Two different pairs',
    cards: [['K',S], ['K',D], ['7',R], ['7',C], ['A',S]],
  },
  {
    name: 'Three of a Kind',
    desc: 'Three cards of the same rank',
    cards: [['J',S], ['J',R], ['J',D], ['8',C], ['3',S]],
  },
  {
    name: 'Straight',
    desc: 'Five consecutive cards, any suit',
    cards: [['7',S], ['8',R], ['9',D], ['10',C], ['J',S]],
  },
  {
    name: 'Flush',
    desc: 'Any five cards of the same suit',
    cards: [['2',R], ['5',R], ['8',R], ['J',R], ['A',R]],
  },
  {
    name: 'Full House',
    desc: 'Three of a kind + a pair',
    cards: [['9',S], ['9',R], ['9',D], ['K',C], ['K',S]],
  },
  {
    name: 'Four of a Kind',
    desc: 'Four cards of the same rank',
    cards: [['A',S], ['A',R], ['A',D], ['A',C], ['8',S]],
  },
  {
    name: 'Straight Flush',
    desc: 'Five consecutive cards, same suit',
    cards: [['5',S], ['6',S], ['7',S], ['8',S], ['9',S]],
  },
  {
    name: 'Royal Flush',
    desc: 'A K Q J 10 of the same suit',
    cards: [['10',S], ['J',S], ['Q',S], ['K',S], ['A',S]],
  },
];

const RED_SUITS = new Set(['♥', '♦']);

function MiniCard({ rank, suit }) {
  return (
    <span className={`mini-card ${RED_SUITS.has(suit) ? 'mini-card-red' : 'mini-card-black'}`}>
      {rank}{suit}
    </span>
  );
}

export default function HelpOverlay() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="help-wrapper"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="overlay-btn" onClick={() => setOpen(o => !o)}>?</button>
      {open && (
        <div className="help-panel">
          <div className="help-title">
            Hand Rankings <span className="help-sub">worst → best</span>
          </div>
          {HANDS.map((h, i) => (
            <div key={h.name} className="help-hand">
              <span className="help-rank">{i + 1}</span>
              <div className="help-hand-body">
                <div className="help-hand-name">{h.name}</div>
                <div className="mini-cards">
                  {h.cards.map(([rank, suit], ci) => (
                    <MiniCard key={ci} rank={rank} suit={suit} />
                  ))}
                </div>
                <div className="help-hand-desc">{h.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
