import { createDeck, dealHands, getHandSizeLimit, shuffle } from './deck';
import {
  canAddToCombo,
  canDiscard,
  replaceWildInCombo,
  validateLayDownCardCount,
  validateLevelCombo,
} from './rules';
import type { Card, Combo, GameAction, GameState, Player } from './types';
import { canBuildOnHand } from './ai';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYER_NAMES = [
  'Brenda', 'Shannon', 'Ann', 'Leo', 'Bill',
  'Bob', 'Clare', 'Helen', 'Brian', 'Kathleen', 'Eunice',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function removeCardFromHand(hand: Card[], cardId: string): Card[] {
  const idx = hand.findIndex(c => c.id === cardId);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function pickRandomNames(count: number): string[] {
  const pool = [...PLAYER_NAMES];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * Reshuffle the discard pile (minus the top card) into a new deck when the
 * draw deck runs out.
 */
function reshuffleDiscard(state: GameState): GameState {
  if (state.discardPile.length <= 1) {
    // Nothing to reshuffle — very edge case, just return as-is
    return state;
  }
  const [topDiscard, ...rest] = state.discardPile;
  const newDeck = shuffle(rest);
  return { ...state, deck: newDeck, discardPile: [topDiscard] };
}

/** Ensure the deck has at least one card, reshuffling discard if needed. */
function ensureDeck(state: GameState): GameState {
  if (state.deck.length === 0) return reshuffleDiscard(state);
  return state;
}

/** Advance turn to the next player. */
function nextPlayer(state: GameState): GameState {
  const next = (state.currentPlayerIndex + 1) % state.players.length;
  return { ...state, currentPlayerIndex: next, turnPhase: 'draw' };
}

/** Check if any player has won (completed level 10 and gone out). */
function checkGameOver(state: GameState): GameState {
  const winner = state.players.find(p => p.level > 10 && p.hand.length === 0) ?? null;
  if (winner) {
    return { ...state, gamePhase: 'gameOver', winner };
  }
  return state;
}

/** Handle end of round: advance levels for players who laid down, reset hands. */
function endRound(state: GameState): GameState {
  // First check if the game is actually over
  const afterGameCheck = checkGameOver(state);
  if (afterGameCheck.gamePhase === 'gameOver') return afterGameCheck;

  const newDealerIndex = (state.dealerIndex + 1) % state.players.length;
  const firstPlayerIndex = (newDealerIndex + 1) % state.players.length;

  const freshDeck = shuffle(createDeck());
  const { hands, remainingDeck } = dealHands(freshDeck, state.players.length);

  const updatedPlayers: Player[] = state.players.map((p, i) => ({
    ...p,
    // Advance level only if they laid down their combo this round
    level: p.laidDown !== null ? p.level + 1 : p.level,
    hand: hands[i],
    laidDown: null,
    rummyCalled: false,
  }));

  return {
    ...state,
    players: updatedPlayers,
    deck: remainingDeck,
    discardPile: [],
    dealerIndex: newDealerIndex,
    currentPlayerIndex: firstPlayerIndex,
    gamePhase: 'playing',
    turnPhase: 'draw',
    roundNumber: state.roundNumber + 1,
    discardsThisRound: 0,
  };
}

/**
 * If every player has successfully laid down their level combo this round,
 * end the round immediately — no one needs to go out.
 */
function checkAllLaidDown(state: GameState): GameState {
  if (state.players.length === 0) return state;
  const allDone = state.players.every(p => p.laidDown !== null);
  if (allDone) {
    return endRound({ ...state, gamePhase: 'roundEnd' });
  }
  return state;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

function handleStartGame(state: GameState, playerCount: number, humanIndex: number): GameState {
  // playerCount 0 or 1 means "reset to setup"
  if (playerCount < 2) {
    return { ...initialGameState };
  }

  const aiCount = playerCount - 1;
  const aiNames = pickRandomNames(aiCount);

  // Build names: insert 'You' at humanIndex
  const names: string[] = [];
  let aiIdx = 0;
  for (let i = 0; i < playerCount; i++) {
    names.push(i === humanIndex ? 'You' : aiNames[aiIdx++]);
  }

  const freshDeck = shuffle(createDeck());
  const { hands, remainingDeck } = dealHands(freshDeck, playerCount);

  const players: Player[] = names.map((name, i) => ({
    id: `player-${i}`,
    name,
    isHuman: i === humanIndex,
    level: 1,
    hand: hands[i],
    laidDown: null,
    rummyCalled: false,
  }));

  // Dealer is chosen randomly; first player is the next one after the dealer
  const dealerIndex = Math.floor(Math.random() * playerCount);
  const firstPlayerIndex = (dealerIndex + 1) % playerCount;

  return {
    ...state,
    players,
    deck: remainingDeck,
    discardPile: [],
    currentPlayerIndex: firstPlayerIndex,
    dealerIndex,
    gamePhase: 'playing',
    turnPhase: 'draw',
    roundNumber: 1,
    discardsThisRound: 0,
    winner: null,
  };
}

function handleDrawFromDeck(state: GameState): GameState {
  let s = ensureDeck(state);
  if (s.deck.length === 0) return s; // still empty after reshuffle — nothing to draw

  const [card, ...remainingDeck] = s.deck;
  const players = s.players.map((p, i) =>
    i === s.currentPlayerIndex ? { ...p, hand: [...p.hand, card] } : p,
  );
  return { ...s, deck: remainingDeck, players, turnPhase: 'action', rummyPendingDiscard: null, rummyBlock: null };
}

function handleDrawFromDiscard(state: GameState): GameState {
  if (state.discardPile.length === 0) return state;
  const [card, ...remainingDiscard] = state.discardPile;
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: [...p.hand, card] } : p,
  );
  return { ...state, discardPile: remainingDiscard, players, turnPhase: 'action', rummyPendingDiscard: null, rummyBlock: null };
}

/**
 * First-player special rule step 1: draw the top deck card into hand so the
 * player can see it. Enters the 'firstPeek' phase — the player must then either
 * keep the card (DRAW_FROM_DECK transitions to 'action') or discard it and draw
 * the next one (FIRST_PLAYER_DISCARD_AND_REDRAW).
 */
function handleFirstPlayerPeek(state: GameState): GameState {
  if (state.turnPhase !== 'draw') return state;
  let s = ensureDeck(state);
  if (s.deck.length === 0) return s;

  const [card, ...remainingDeck] = s.deck;
  const players = s.players.map((p, i) =>
    i === s.currentPlayerIndex ? { ...p, hand: [...p.hand, card] } : p,
  );
  return { ...s, deck: remainingDeck, players, turnPhase: 'firstPeek', rummyPendingDiscard: null, rummyBlock: null };
}

/**
 * First-player special rule step 2a (optional): the player keeps the peeked
 * card. Simply transitions from 'firstPeek' to 'action'.
 */
function handleFirstPlayerKeep(state: GameState): GameState {
  if (state.turnPhase !== 'firstPeek') return state;
  return { ...state, turnPhase: 'action' };
}

/**
 * First-player special rule step 2b (optional): the player chose to discard the
 * peeked card and draw the next one instead. Only valid from 'firstPeek' phase.
 * The peeked card is identified as the last card added to the player's hand
 * (guaranteed to be the peek card since no other action can happen between
 * FIRST_PLAYER_PEEK and FIRST_PLAYER_DISCARD_AND_REDRAW).
 */
function handleFirstPlayerDiscardAndRedraw(state: GameState): GameState {
  if (state.turnPhase !== 'firstPeek') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.hand.length === 0) return state;

  // The peeked card is the last card in the player's hand
  const peekedCard = currentPlayer.hand[currentPlayer.hand.length - 1];
  const handWithoutPeeked = currentPlayer.hand.slice(0, -1);

  const newDiscardPile = [peekedCard, ...state.discardPile];
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: handWithoutPeeked } : p,
  );

  // Increment discardsThisRound — this counts as a discard (no buying on this discard)
  let s: GameState = { ...state, players, discardPile: newDiscardPile, discardsThisRound: state.discardsThisRound + 1 };

  // Now draw the next card
  s = ensureDeck(s);
  if (s.deck.length === 0) return { ...s, turnPhase: 'action' };

  const [nextCard, ...remainingDeck] = s.deck;
  const playersAfterDraw = s.players.map((p, i) =>
    i === s.currentPlayerIndex ? { ...p, hand: [...p.hand, nextCard] } : p,
  );
  return { ...s, deck: remainingDeck, players: playersAfterDraw, turnPhase: 'action', rummyPendingDiscard: null, rummyBlock: null };
}

function handleBuy(state: GameState, buyerIndex: number): GameState {
  // Guard: cannot buy first 2 discards of a round
  if (state.discardsThisRound < 2) return state;
  if (state.discardPile.length === 0) return state;

  const buyer = state.players[buyerIndex];
  const limit = getHandSizeLimit(buyer.level);
  // Buying adds 2 cards net — check hand + 2 won't exceed limit
  if (buyer.hand.length + 2 > limit) return state;

  const [boughtCard, ...remainingDiscard] = state.discardPile;

  let s = ensureDeck({ ...state, discardPile: remainingDiscard });
  if (s.deck.length === 0) return s;

  const [penaltyCard, ...remainingDeck] = s.deck;

  const players = s.players.map((p, i) => {
    if (i === buyerIndex) {
      return { ...p, hand: [...p.hand, boughtCard, penaltyCard] };
    }
    return p;
  });

  // Current player now draws the next card from the (now updated) deck
  s = ensureDeck({ ...s, deck: remainingDeck, players });

  return { ...s, rummyPendingDiscard: null, rummyBlock: null };
}

function handleLayDown(state: GameState, playerIndex: number, combos: Combo[]): GameState {
  const player = state.players[playerIndex];
  if (player.laidDown !== null) return state; // already laid down

  if (!validateLevelCombo(player.level, combos)) return state;
  if (!validateLayDownCardCount(player.hand, player.level, combos)) return state;

  // Remove all combo cards from the player's hand
  const comboCardIds = new Set(combos.flatMap(c => c.cards.map(card => card.id)));
  const newHand = player.hand.filter(c => !comboCardIds.has(c.id));

  const players = state.players.map((p, i) =>
    i === playerIndex
      ? { ...p, hand: newHand, laidDown: { combos } }
      : p,
  );

  const afterLayDown = { ...state, players };
  // If every player has now laid down, end the round immediately
  return checkAllLaidDown(afterLayDown);
}

function handlePlayOnHand(
  state: GameState,
  targetPlayerIndex: number,
  targetComboIndex: number,
  card: Card,
  wildToReplace?: Card,
): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  // Must have laid down own combo first
  if (currentPlayer.laidDown === null) return state;

  const targetPlayer = state.players[targetPlayerIndex];
  if (!targetPlayer.laidDown) return state;

  const targetCombo = targetPlayer.laidDown.combos[targetComboIndex];
  if (!targetCombo) return state;

  let newCombo: Combo;
  let displacedWild: Card | undefined;

  if (wildToReplace) {
    // Wild replacement: player places a natural card where a wild was sitting.
    // The displaced wild is returned to the player's hand and MUST be re-placed
    // in a new eligible spot before the turn can end.
    const result = replaceWildInCombo(targetCombo, card, wildToReplace);
    if (!result) return state;
    newCombo = result.newCombo;
    displacedWild = result.displacedWild;
  } else {
    // Normal play: adding a card (including a wild) onto a combo.
    if (!canAddToCombo(targetCombo, card)) return state;
    newCombo = { ...targetCombo, cards: [...targetCombo.cards, card] };
  }

  // Remove the played card from current player's hand
  const newCurrentHand = removeCardFromHand(currentPlayer.hand, card.id);

  // If the player plays a wild card while a displaced-wild is pending, that
  // wild IS the displaced 2 being re-placed — clear the pending obligation.
  const clearsPending = state.displacedWildPending && card.isWild;

  const players = state.players.map((p, i) => {
    const isCurrentPlayer = i === state.currentPlayerIndex;
    const isTargetPlayer  = i === targetPlayerIndex;

    if (!isCurrentPlayer && !isTargetPlayer) return p;

    // Build the updated hand (only changes for the current player)
    const updatedHand = isCurrentPlayer
      ? (displacedWild ? [...newCurrentHand, displacedWild] : newCurrentHand)
      : p.hand;

    // Build the updated laidDown (only changes for the target player)
    const updatedLaidDown = isTargetPlayer
      ? {
          combos: targetPlayer.laidDown!.combos.map((c, ci) =>
            ci === targetComboIndex ? newCombo : c,
          ),
        }
      : p.laidDown;

    return { ...p, hand: updatedHand, laidDown: updatedLaidDown };
  });

  // Displacing a wild sets the pending flag; playing the displaced wild clears it.
  const newDisplacedWildPending = displacedWild
    ? true
    : clearsPending
      ? false
      : state.displacedWildPending;

  return { ...state, players, displacedWildPending: newDisplacedWildPending };
}

function handleDiscard(state: GameState, card: Card): GameState {
  if (!canDiscard(card)) return state; // 2s cannot be discarded
  // A displaced wild must be placed before the player can end their turn
  if (state.displacedWildPending) return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  const newHand = removeCardFromHand(currentPlayer.hand, card.id);

  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
  );

  const newDiscardPile = [card, ...state.discardPile];
  const newDiscardsThisRound = state.discardsThisRound + 1;

  // Stay on the current player in 'discard' phase so the buy window can run
  // before the turn advances.  ADVANCE_TURN finishes the transition.
  const blockedPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const canBlockImmediateBuild = !!state.players[blockedPlayerIndex]?.laidDown && canBuildOnHand(state, card, state.currentPlayerIndex);

  return {
    ...state,
    players,
    discardPile: newDiscardPile,
    discardsThisRound: newDiscardsThisRound,
    turnPhase: 'discard',
    rummyPendingDiscard: canBlockImmediateBuild ? card : null,
    rummyBlock: null,
  };
}

/**
 * Called by the hook after the buy window resolves.
 * Checks if the player who just discarded has gone out, then advances the turn.
 */
function handleAdvanceTurn(state: GameState): GameState {
  if (state.turnPhase !== 'discard') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.hand.length === 0) {
    // The discarding player went out — end the round
    return endRound({ ...state, gamePhase: 'roundEnd' });
  }

  return nextPlayer({ ...state, rummyPendingDiscard: null, rummyBlock: null });
}

function handleCallRummy(state: GameState): GameState {
  const pending = state.rummyPendingDiscard;
  if (!pending) return state;
  if (state.turnPhase !== 'discard') return state;

  const callerIndex = state.players.findIndex(player => player.isHuman);
  const blockedPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (callerIndex === -1 || callerIndex !== blockedPlayerIndex) return state;

  const players = state.players.map((player, index) =>
    index === callerIndex ? { ...player, rummyCalled: true } : player,
  );

  return {
    ...state,
    players,
    rummyBlock: {
      discardedCardId: pending.id,
      blockedPlayerIndex,
    },
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return handleStartGame(state, action.playerNames.length, action.humanIndex);

    case 'DRAW_FROM_DECK':
      return handleDrawFromDeck(state);

    case 'DRAW_FROM_DISCARD':
      return handleDrawFromDiscard(state);

    case 'FIRST_PLAYER_PEEK':
      return handleFirstPlayerPeek(state);

    case 'FIRST_PLAYER_KEEP':
      return handleFirstPlayerKeep(state);

    case 'FIRST_PLAYER_DISCARD_AND_REDRAW':
      return handleFirstPlayerDiscardAndRedraw(state);

    case 'BUY':
      return handleBuy(state, action.buyerIndex);

    case 'LAY_DOWN':
      return handleLayDown(state, action.playerIndex, action.combos);

    case 'PLAY_ON_HAND':
      return handlePlayOnHand(
        state,
        action.targetPlayerIndex,
        action.targetComboIndex,
        action.card,
        action.wildToReplace,
      );

    case 'DISCARD':
      return handleDiscard(state, action.card);

    case 'ADVANCE_TURN':
      return handleAdvanceTurn(state);

    case 'CALL_RUMMY':
      return handleCallRummy(state);

    case 'NEXT_ROUND':
      return endRound(state);

    default:
      return state;
  }
}

// ─── Initial state ────────────────────────────────────────────────────────────

export const initialGameState: GameState = {
  players: [],
  deck: [],
  discardPile: [],
  currentPlayerIndex: 0,
  dealerIndex: 0,
  gamePhase: 'setup',
  turnPhase: 'draw',
  roundNumber: 0,
  discardsThisRound: 0,
  winner: null,
  displacedWildPending: false,
  rummyPendingDiscard: null,
  rummyBlock: null,
};
