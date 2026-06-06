const { createDeck, shuffle } = require('./deck');
const { evaluateHand, findWinners } = require('./evaluator');

const TABLE_PROPS = [
  '/images/cigar.png',
  '/images/cigar-smoked.png',
  '/images/used-cigarette.png',
  '/images/colt45.png',
  '/images/ColtSaa45.png',
  '/images/marlboro.png',
  '/images/marlboro_used.png',
  '/images/olenglish800.png',
  '/images/blow.png',
  '/images/crack-pipe.png',
  '/images/old-fashioned.png',
  '/images/heinz-beans.png',
  '/images/ranch-beans.png',
  '/images/Belle.png',
];

class PokerGame {
  constructor({ startingChips = 1000, bigBlind = 20 } = {}) {
    this.config = {
      startingChips,
      bigBlind,
      smallBlind: Math.max(1, Math.floor(bigBlind / 2)),
    };
    this.players = [];
    this.phase = 'waiting';
    this.communityCards = [];
    this.deck = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = bigBlind;
    this.dealerIdx = -1;
    this.currentPlayerIdx = -1;
    this.roundBets = {};        // playerId → chips bet this round
    this.roundContributions = {}; // playerId → total chips in this hand
    this.actionQueue = [];
    this.lastAction = null;
    this.handResults = null;
    this.gameStarted = false;
  }

  // ─── Player management ───────────────────────────────────────────────────

  addPlayer(id, name) {
    if (this.players.find(p => p.id === id)) return { error: 'Already in game' };
    if (this.players.length >= 8) return { error: 'Table is full (max 8)' };

    const usedProps = new Set(this.players.map(p => p.prop));
    const available = TABLE_PROPS.filter(p => !usedProps.has(p));
    const pool = available.length > 0 ? available : TABLE_PROPS;
    const prop = pool[Math.floor(Math.random() * pool.length)];

    this.players.push({
      id, name,
      chips: this.config.startingChips,
      holeCards: [],
      folded: false,
      allIn: false,
      isDealer: false,
      isSB: false,
      isBB: false,
      eliminated: false,
      disconnected: false,
      pendingNextHand: this.gameStarted,
      prop,
    });
    return { success: true };
  }

  removePlayer(id) {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx === -1) return;
    // Remove cleanly if pre-game or still pending (never played a hand)
    if (!this.gameStarted || this.players[idx].pendingNextHand) {
      this.players.splice(idx, 1);
      return;
    }
    // Mid-game: fold and mark disconnected — chips stay visible until next hand
    const p = this.players[idx];
    const wasCurrentPlayer = this.currentPlayerIdx === idx;
    if (!p.folded) {
      p.folded = true;
      this.lastAction = { playerId: id, playerName: p.name, action: 'fold' };
      this.actionQueue = this.actionQueue.filter(i => i !== idx);
      if (wasCurrentPlayer) this.currentPlayerIdx = this.actionQueue[0] ?? -1;
    }
    p.disconnected = true;
    if (wasCurrentPlayer) {
      this._afterAction();
    } else {
      // Non-current player left — check if only one player remains
      const notFolded = this._notFolded();
      if (notFolded.length === 1) this._handWon(this.players[notFolded[0]].id);
    }
  }

  startGame() {
    if (this.players.length < 1) return { error: 'Need at least 1 player' };
    this.gameStarted = true;
    const inGame = this._inGame();
    this.dealerIdx = inGame[Math.floor(Math.random() * inGame.length)];
    this._startHand();
    return { success: true };
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  fold(playerId) {
    const err = this._validateAction(playerId);
    if (err) return { error: err };
    const p = this.players[this.currentPlayerIdx];
    p.folded = true;
    this.lastAction = { playerId, playerName: p.name, action: 'fold' };
    this.actionQueue.shift();
    return this._afterAction();
  }

  check(playerId) {
    const err = this._validateAction(playerId);
    if (err) return { error: err };
    const p = this.players[this.currentPlayerIdx];
    const myBet = this.roundBets[p.id] || 0;
    if (this.currentBet > myBet) return { error: 'Cannot check — must call or raise' };
    this.lastAction = { playerId, playerName: p.name, action: 'check' };
    this.actionQueue.shift();
    return this._afterAction();
  }

  call(playerId) {
    const err = this._validateAction(playerId);
    if (err) return { error: err };
    const p = this.players[this.currentPlayerIdx];
    const myBet = this.roundBets[p.id] || 0;
    const toCall = Math.min(this.currentBet - myBet, p.chips);
    p.chips -= toCall;
    this.roundBets[p.id] = myBet + toCall;
    this.roundContributions[p.id] = (this.roundContributions[p.id] || 0) + toCall;
    this.pot += toCall;
    if (p.chips === 0) p.allIn = true;
    this.lastAction = { playerId, playerName: p.name, action: 'call', amount: toCall };
    this.actionQueue.shift();
    return this._afterAction();
  }

  raise(playerId, raiseTo) {
    const err = this._validateAction(playerId);
    if (err) return { error: err };
    const p = this.players[this.currentPlayerIdx];
    const myBet = this.roundBets[p.id] || 0;
    const minRaiseTo = this.currentBet + this.minRaise;
    const maxCanBet = p.chips + myBet;
    const goingAllIn = raiseTo >= maxCanBet;

    if (!goingAllIn && raiseTo < minRaiseTo) {
      return { error: `Minimum raise to ${minRaiseTo}` };
    }

    const actualRaiseTo = Math.min(raiseTo, maxCanBet);
    const toAdd = actualRaiseTo - myBet;
    p.chips -= toAdd;
    this.roundBets[p.id] = actualRaiseTo;
    this.roundContributions[p.id] = (this.roundContributions[p.id] || 0) + toAdd;
    this.pot += toAdd;
    const raiseSize = actualRaiseTo - this.currentBet;
    if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
    this.currentBet = actualRaiseTo;
    if (p.chips === 0) p.allIn = true;
    this.lastAction = { playerId, playerName: p.name, action: 'raise', amount: actualRaiseTo };

    // Everyone else (not all-in, not folded) needs to respond
    const active = this._notFolded();
    const currentPos = active.indexOf(this.currentPlayerIdx);
    this.actionQueue = [];
    for (let i = 1; i < active.length; i++) {
      const idx = active[(currentPos + i) % active.length];
      if (!this.players[idx].allIn) this.actionQueue.push(idx);
    }
    this.currentPlayerIdx = this.actionQueue[0] ?? -1;
    return this._afterAction();
  }

  nextHand() {
    // Activate anyone who joined mid-hand
    this.players.forEach(p => { p.pendingNextHand = false; });

    const inGame = this._inGame();
    if (inGame.length < 2) {
      // Not enough players — clear the table and wait
      this.phase = 'waiting-for-players';
      this.communityCards = [];
      this.pot = 0;
      this.currentBet = 0;
      this.lastAction = null;
      this.handResults = null;
      return;
    }
    const pos = Math.max(0, inGame.indexOf(this.dealerIdx));
    this.dealerIdx = inGame[(pos + 1) % inGame.length];
    this._startHand();
  }

  // ─── State serialization ─────────────────────────────────────────────────

  getStateFor(playerId) {
    return {
      phase: this.phase,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      communityCards: this.communityCards,
      currentPlayerId: this.currentPlayerIdx >= 0 ? this.players[this.currentPlayerIdx]?.id : null,
      lastAction: this.lastAction,
      handResults: this.handResults,
      config: this.config,
      players: this.players
        .filter(p => !p.eliminated)
        .map(p => {
          const revealCards = p.id === playerId || (this.phase === 'showdown' && !p.folded);
          return {
            id: p.id,
            name: p.name,
            chips: p.chips,
            currentRoundBet: this.roundBets[p.id] || 0,
            totalContributed: this.roundContributions[p.id] || 0,
            folded: p.folded,
            allIn: p.allIn,
            isDealer: p.isDealer,
            isSB: p.isSB,
            isBB: p.isBB,
            isCurrentPlayer: this.currentPlayerIdx >= 0 && this.players[this.currentPlayerIdx]?.id === p.id,
            isYou: p.id === playerId,
            holeCards: revealCards ? p.holeCards : p.holeCards.map(() => null),
            cardCount: p.holeCards.length,
            pendingNextHand: p.pendingNextHand || false,
            disconnected: p.disconnected || false,
            prop: p.prop,
          };
        }),
    };
  }

  getLobbyState() {
    return {
      phase: this.phase,
      gameStarted: this.gameStarted,
      config: this.config,
      players: this.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _startHand() {
    this.phase = 'preflop';
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    this.lastAction = null;
    this.handResults = null;
    this.roundBets = {};
    this.roundContributions = {};

    // Reset ALL non-eliminated players for new hand (including last-hand folders)
    const inGame = this._inGame();
    if (inGame.length < 2) { this.phase = 'waiting-for-players'; return; }

    inGame.forEach(i => {
      const p = this.players[i];
      p.holeCards = [];
      p.folded = false;
      p.allIn = false;
      p.isDealer = false;
      p.isSB = false;
      p.isBB = false;
    });

    const n = inGame.length;
    let dealerPos = inGame.indexOf(this.dealerIdx);
    if (dealerPos === -1) dealerPos = 0; // Fallback if dealer was eliminated

    let sbPos, bbPos, utgPos;
    if (n === 2) {
      sbPos = dealerPos;
      bbPos = (dealerPos + 1) % n;
      utgPos = sbPos; // HU: dealer/SB acts first preflop
    } else {
      sbPos = (dealerPos + 1) % n;
      bbPos = (dealerPos + 2) % n;
      utgPos = (dealerPos + 3) % n;
    }

    const sbIdx = inGame[sbPos];
    const bbIdx = inGame[bbPos];
    const utgIdx = inGame[utgPos];

    this.players[this.dealerIdx].isDealer = true;
    this.players[sbIdx].isSB = true;
    this.players[bbIdx].isBB = true;

    // Deal 2 hole cards each
    this.deck = shuffle(createDeck());
    for (let round = 0; round < 2; round++) {
      for (const idx of inGame) this.players[idx].holeCards.push(this.deck.pop());
    }

    // Post blinds
    this._postBlind(sbIdx, this.config.smallBlind);
    this._postBlind(bbIdx, this.config.bigBlind);
    this.currentBet = this.config.bigBlind;
    this.minRaise = this.config.bigBlind;

    this._buildQueue(utgIdx, inGame);
  }

  _postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    this.roundBets[p.id] = actual;
    this.roundContributions[p.id] = actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
  }

  _buildQueue(startIdx, playerIndices) {
    const startPos = playerIndices.indexOf(startIdx);
    this.actionQueue = [];
    for (let i = 0; i < playerIndices.length; i++) {
      const pos = (startPos + i) % playerIndices.length;
      const idx = playerIndices[pos];
      if (!this.players[idx].allIn) this.actionQueue.push(idx);
    }
    this.currentPlayerIdx = this.actionQueue[0] ?? -1;
  }

  _validateAction(playerId) {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return 'No action needed right now';
    if (this.currentPlayerIdx < 0) return 'No active player';
    if (this.players[this.currentPlayerIdx]?.id !== playerId) return 'Not your turn';
    return null;
  }

  _afterAction() {
    this.currentPlayerIdx = this.actionQueue[0] ?? -1;

    const notFolded = this._notFolded();
    if (notFolded.length === 1) {
      this._handWon(this.players[notFolded[0]].id);
      return { success: true };
    }

    if (this.actionQueue.length === 0) this._advancePhase();
    return { success: true };
  }

  _advancePhase() {
    this.roundBets = {};
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;

    if (this.phase === 'preflop') {
      this.phase = 'flop';
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (this.phase === 'flop') {
      this.phase = 'turn';
      this.communityCards.push(this.deck.pop());
    } else if (this.phase === 'turn') {
      this.phase = 'river';
      this.communityCards.push(this.deck.pop());
    } else if (this.phase === 'river') {
      this._showdown();
      return;
    }

    const notFolded = this._notFolded();
    if (notFolded.length <= 1) {
      if (notFolded.length === 1) this._handWon(this.players[notFolded[0]].id);
      else this._showdown();
      return;
    }

    // Post-flop: start from first active player left of dealer
    const n = this.players.length;
    let startIdx = notFolded[0];
    for (let i = 1; i <= n; i++) {
      const idx = (this.dealerIdx + i) % n;
      if (notFolded.includes(idx)) { startIdx = idx; break; }
    }

    this._buildQueue(startIdx, notFolded);

    // All-in situation: no one can bet, auto-advance
    if (this.actionQueue.length === 0) this._advancePhase();
  }

  _handWon(winnerId) {
    const winner = this.players.find(p => p.id === winnerId);
    winner.chips += this.pot;
    this.handResults = [{ playerId: winnerId, name: winner.name, chipsWon: this.pot, handName: null }];
    this.phase = 'showdown';
    this.actionQueue = [];
    this.currentPlayerIdx = -1;
    this._eliminateBusted();
  }

  _showdown() {
    this.phase = 'showdown';
    this.actionQueue = [];
    this.currentPlayerIdx = -1;

    const pots = this._calcPots();
    const remaining = this.players.filter(p => !p.eliminated && !p.folded);
    this.handResults = [];

    for (const pot of pots) {
      if (pot.amount <= 0) continue;
      const eligible = remaining.filter(p => pot.eligible.includes(p.id));
      if (eligible.length === 0) continue;

      if (eligible.length === 1) {
        eligible[0].chips += pot.amount;
        this.handResults.push({ playerId: eligible[0].id, name: eligible[0].name, chipsWon: pot.amount, handName: null });
        continue;
      }

      const winnerIds = findWinners(
        eligible.map(p => ({ playerId: p.id, holeCards: p.holeCards })),
        this.communityCards
      );
      const split = Math.floor(pot.amount / winnerIds.length);
      let remainder = pot.amount - split * winnerIds.length;

      winnerIds.forEach(wId => {
        const w = this.players.find(p => p.id === wId);
        const bonus = remainder-- > 0 ? 1 : 0;
        w.chips += split + bonus;
        const solved = evaluateHand(w.holeCards, this.communityCards);
        this.handResults.push({ playerId: wId, name: w.name, chipsWon: split + bonus, handName: solved.descr });
      });
    }

    this._eliminateBusted();
  }

  _calcPots() {
    const contribs = this.players
      .filter(p => !p.eliminated)
      .map(p => ({ playerId: p.id, amount: this.roundContributions[p.id] || 0, folded: p.folded }))
      .filter(c => c.amount > 0);

    if (contribs.length === 0) {
      const eligible = this.players.filter(p => !p.folded && !p.eliminated).map(p => p.id);
      return [{ amount: this.pot, eligible }];
    }

    const uniqueLevels = [...new Set(contribs.map(c => c.amount))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;

    for (const level of uniqueLevels) {
      const increment = level - prev;
      const inPot = contribs.filter(c => c.amount >= level);
      const potAmount = increment * inPot.length;
      const eligible = inPot.filter(c => !c.folded).map(c => c.playerId);
      if (potAmount > 0) pots.push({ amount: potAmount, eligible });
      prev = level;
    }

    return pots;
  }

  _eliminateBusted() {
    this.players.forEach(p => { if (!p.eliminated && p.chips === 0) p.eliminated = true; });
  }

  // Players not eliminated (for hand setup and dealer rotation)
  _inGame() {
    return this.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.eliminated && p.chips > 0 && !p.pendingNextHand && !p.disconnected)
      .map(({ i }) => i);
  }

  // Players not folded and not eliminated (for during-hand logic)
  _notFolded() {
    return this.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.eliminated && !p.folded && !p.pendingNextHand)
      .map(({ i }) => i);
  }
}

module.exports = PokerGame;
