const { Hand } = require('pokersolver');

function toStr({ rank, suit }) {
  return rank + suit;
}

function evaluateHand(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards].map(toStr);
  return Hand.solve(all);
}

function findWinners(playerHands, communityCards) {
  const solved = playerHands.map(({ playerId, holeCards }) => ({
    playerId,
    hand: evaluateHand(holeCards, communityCards),
  }));
  const winners = Hand.winners(solved.map(s => s.hand));
  return solved.filter(s => winners.includes(s.hand)).map(s => s.playerId);
}

module.exports = { evaluateHand, findWinners };
