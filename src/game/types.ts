// ─── Primitives ───────────────────────────────────────────────────────────────

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/** Ranks ordered low → high. '2' is wild and cannot be discarded. Ace is high. */
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
  isWild: boolean;
}

// ─── Combos ───────────────────────────────────────────────────────────────────

export type ComboType = 'set' | 'run';

/** A validated group of cards forming a set or run. */
export interface Combo {
  type: ComboType;
  cards: Card[];
}

/** The combos a player has laid down on the table. */
export interface LaidDownHand {
  combos: Combo[];
}

// ─── Players ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  /** Current level (1–10). Player advances when they lay down and go out. */
  level: number;
  hand: Card[];
  laidDown: LaidDownHand | null;
  rummyCalled: boolean;
}

export interface RummyBlock {
  discardedCardId: string;
  blockedPlayerIndex: number;
}

// ─── Phase Enums ──────────────────────────────────────────────────────────────

export type GamePhase = 'setup' | 'playing' | 'roundEnd' | 'gameOver';

export type TurnPhase = 'draw' | 'firstPeek' | 'action' | 'discard';

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  dealerIndex: number;
  gamePhase: GamePhase;
  turnPhase: TurnPhase;
  roundNumber: number;
  /**
   * Counts how many cards have been discarded in the current round.
   * Buying is not allowed on the first 2 discards of each round.
   */
  discardsThisRound: number;
  winner: Player | null;
  /**
   * True while the current player has displaced a wild card from a run/set and
   * must place it in a new eligible spot before they can discard.
   * The displaced wild is already sitting in the player's hand; it cannot be
   * held over to the next turn — the discard action is blocked until cleared.
   */
  displacedWildPending: boolean;
  rummyPendingDiscard: Card | null;
  rummyBlock: RummyBlock | null;
}

// ─── Game Actions ─────────────────────────────────────────────────────────────

/** Draw the top card from the deck. */
interface DrawFromDeckAction {
  type: 'DRAW_FROM_DECK';
}

/** Take the top card from the discard pile as a normal draw. */
interface DrawFromDiscardAction {
  type: 'DRAW_FROM_DISCARD';
}

/**
 * Special first-player rule: the first player of the round peeks at the top
 * deck card by drawing it into their hand. They can then keep it (transition
 * straight to 'action') or discard it and draw the next card instead.
 */
interface FirstPlayerPeekAction {
  type: 'FIRST_PLAYER_PEEK';
}

/**
 * Used after FIRST_PLAYER_PEEK: the player keeps the peeked card and proceeds
 * to the action phase without drawing again.
 */
interface FirstPlayerKeepAction {
  type: 'FIRST_PLAYER_KEEP';
}

/**
 * Used after FIRST_PLAYER_PEEK: the player discards the peeked card and draws
 * the next card from the deck.
 */
interface FirstPlayerDiscardAndRedrawAction {
  type: 'FIRST_PLAYER_DISCARD_AND_REDRAW';
}

/** A non-active player buys the just-discarded card (+ top of deck penalty). */
interface BuyAction {
  type: 'BUY';
  buyerIndex: number;
}

/** The active player lays down their required level combo. */
interface LayDownAction {
  type: 'LAY_DOWN';
  playerIndex: number;
  combos: Combo[];
}

/**
 * The active player (who has already laid down) adds a card from their hand
 * onto any player's existing laid-down combo. Optionally replaces a wild.
 */
interface PlayOnHandAction {
  type: 'PLAY_ON_HAND';
  targetPlayerIndex: number;
  targetComboIndex: number;
  card: Card;
  /** The wild card being replaced (if this play displaces a wild). */
  wildToReplace?: Card;
}

/** The active player discards a card to end their turn. */
interface DiscardAction {
  type: 'DISCARD';
  card: Card;
}

/** Initialise a new game with the given player names. */
interface StartGameAction {
  type: 'START_GAME';
  playerNames: string[];
  humanIndex: number;
}

/** Transition from roundEnd → playing for the next round. */
interface NextRoundAction {
  type: 'NEXT_ROUND';
}

/**
 * Advance from the current player to the next after the buy window closes.
 * Dispatched by the hook after runBuyWindow resolves, not by the engine directly.
 */
interface AdvanceTurnAction {
  type: 'ADVANCE_TURN';
}

interface CallRummyAction {
  type: 'CALL_RUMMY';
}

export type GameAction =
  | DrawFromDeckAction
  | DrawFromDiscardAction
  | FirstPlayerPeekAction
  | FirstPlayerKeepAction
  | FirstPlayerDiscardAndRedrawAction
  | BuyAction
  | LayDownAction
  | PlayOnHandAction
  | DiscardAction
  | StartGameAction
  | NextRoundAction
  | AdvanceTurnAction
  | CallRummyAction;
