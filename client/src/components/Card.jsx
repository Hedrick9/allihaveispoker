import React from 'react';

const SUIT_SYMBOL = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLOR = { h: 'red', d: 'red', c: 'black', s: 'black' };

export default function Card({ card, faceDown = false, small = false }) {
  if (faceDown || !card) {
    return <div className={`card card-back ${small ? 'card-sm' : ''}`} />;
  }

  const { rank, suit } = card;
  const displayRank = rank === 'T' ? '10' : rank;
  const color = SUIT_COLOR[suit];
  const symbol = SUIT_SYMBOL[suit];

  return (
    <div className={`card card-face ${color === 'red' ? 'card-red' : 'card-black'} ${small ? 'card-sm' : ''}`}>
      <div className="card-corner card-corner-tl">
        <div className="card-rank">{displayRank}</div>
        <div className="card-suit-small">{symbol}</div>
      </div>
      <div className="card-center-suit">{symbol}</div>
      <div className="card-corner card-corner-br">
        <div className="card-rank">{displayRank}</div>
        <div className="card-suit-small">{symbol}</div>
      </div>
    </div>
  );
}
