import type { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const DECK_COPIES = 3;
const DEAL_COUNT = 11;

/**
 * Creates 3 standard 52-card decks combined = 156 cards.
 * Each card has a unique id: e.g. "hearts-A-0", "hearts-A-1", "hearts-A-2".
 * Cards with rank '2' have isWild: true; all others have isWild: false.
 */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < DECK_COPIES; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${suit}-${rank}-${copy}`,
          rank,
          suit,
          isWild: rank === '2',
        });
      }
    }
  }
  return cards;
}

/**
 * Fisher-Yates shuffle. Returns a NEW shuffled array; does not mutate input.
 */
export function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deals 11 cards to each player round-robin from the front of the deck.
 * Returns the dealt hands and the remaining deck.
 * Does not mutate the input deck.
 */
export function dealHands(
  deck: Card[],
  playerCount: number,
): { hands: Card[][]; remainingDeck: Card[] } {
  const workingDeck = [...deck];
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);

  for (let card = 0; card < DEAL_COUNT; card++) {
    for (let player = 0; player < playerCount; player++) {
      const drawn = workingDeck.shift();
      if (drawn === undefined) throw new Error('Deck ran out of cards during deal');
      hands[player].push(drawn);
    }
  }

  return { hands, remainingDeck: workingDeck };
}

/**
 * Returns the maximum hand size allowed for buying at a given level.
 * Levels 1–8 → 17 cards. Levels 9–10 → 19 cards.
 */
export function getHandSizeLimit(level: number): number {
  return level <= 8 ? 17 : 19;
}
