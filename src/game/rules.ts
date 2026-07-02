import type { Card, Combo, ComboType, Rank } from './types';

// ─── Rank ordering ────────────────────────────────────────────────────────────

export const RANK_ORDER: Record<Rank, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  '2': 0, // wild — value not used in sequence logic
};

// ─── Level definitions ────────────────────────────────────────────────────────

export interface LevelDefinition {
  sets: number[];  // minimum sizes of required sets
  runs: number[];  // minimum sizes of required runs
}

/** 10 levels, index 0 = level 1 */
export const LEVELS: LevelDefinition[] = [
  { sets: [3, 3],          runs: []     }, // 1: 2 sets of 3
  { sets: [3],             runs: [4]    }, // 2: 1 set of 3 + run of 4
  { sets: [],              runs: [4, 4] }, // 3: 2 runs of 4
  { sets: [3, 3, 3],       runs: []     }, // 4: 3 sets of 3
  { sets: [3],             runs: [7]    }, // 5: 1 set of 3 + run of 7
  { sets: [3, 3],          runs: [5]    }, // 6: 2 sets of 3 + run of 5
  { sets: [],              runs: [4, 4, 4] }, // 7: 3 runs of 4
  { sets: [3],             runs: [10]   }, // 8: 1 set of 3 + run of 10
  { sets: [3, 3, 3],       runs: [5]    }, // 9: 3 sets of 3 + run of 5
  { sets: [],              runs: [5, 5, 5] }, // 10: 3 runs of 5
];

// ─── Set validation ───────────────────────────────────────────────────────────

/**
 * A valid set has:
 * - at least `minSize` cards (default 3)
 * - all non-wild cards share the same rank
 * - at most 1 wild card
 */
export function isValidSet(cards: Card[], minSize = 3): boolean {
  if (cards.length < minSize) return false;

  const wilds = cards.filter(c => c.isWild);
  if (wilds.length > 1) return false;

  const naturals = cards.filter(c => !c.isWild);
  if (naturals.length === 0) return false; // all-wild set is not valid

  const rank = naturals[0].rank;
  return naturals.every(c => c.rank === rank);
}

// ─── Run validation ───────────────────────────────────────────────────────────

/**
 * A valid run has:
 * - at least `minSize` cards (default 4)
 * - all non-wild cards share the same suit
 * - ranks form a consecutive sequence (wilds fill gaps)
 * - max 1 wild if < 5 natural cards; max 2 wilds if 5+ natural cards
 * - Ace is high (14); runs cannot wrap around
 */
export function isValidRun(cards: Card[], minSize = 4): boolean {
  if (cards.length < minSize) return false;

  const wilds = cards.filter(c => c.isWild);
  const naturals = cards.filter(c => !c.isWild);

  if (naturals.length === 0) return false;

  // Wild limit
  const maxWilds = naturals.length >= 5 ? 2 : 1;
  if (wilds.length > maxWilds) return false;

  // All naturals must share a suit
  const suit = naturals[0].suit;
  if (!naturals.every(c => c.suit === suit)) return false;

  // Sort naturals by rank value
  const sorted = [...naturals].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);

  // Check for duplicate natural ranks
  for (let i = 1; i < sorted.length; i++) {
    if (RANK_ORDER[sorted[i].rank] === RANK_ORDER[sorted[i - 1].rank]) return false;
  }

  // The total span of the run = cards.length
  // The naturals must fit within a window of `cards.length` consecutive ranks
  // with at most `wilds.length` gaps
  const minRank = RANK_ORDER[sorted[0].rank];
  const maxRank = RANK_ORDER[sorted[sorted.length - 1].rank];
  const span = maxRank - minRank + 1; // span of the natural cards only

  // Naturals must fit within the total run window (wilds extend or fill gaps)
  if (span > cards.length) return false;

  // Interior gaps must not exceed available wilds
  // (wilds beyond interior gaps extend the run at the ends)
  const gaps = span - naturals.length;
  if (gaps > wilds.length) return false;

  return true;
}

// ─── Level combo validation ───────────────────────────────────────────────────

/**
 * Validates that the submitted combos satisfy the requirements for the given level (1-based).
 * Each combo must independently pass its validation.
 */
export function validateLevelCombo(level: number, combos: Combo[]): boolean {
  const def = LEVELS[level - 1];
  if (!def) return false;

  const submittedSets = combos.filter(c => c.type === 'set');
  const submittedRuns = combos.filter(c => c.type === 'run');

  if (submittedSets.length !== def.sets.length) return false;
  if (submittedRuns.length !== def.runs.length) return false;

  // Validate each set against its minimum size requirement
  for (let i = 0; i < def.sets.length; i++) {
    if (!isValidSet(submittedSets[i].cards, def.sets[i])) return false;
  }

  // Validate each run against its minimum size requirement
  for (let i = 0; i < def.runs.length; i++) {
    if (!isValidRun(submittedRuns[i].cards, def.runs[i])) return false;
  }

  return true;
}

/**
 * Returns the minimum total number of cards required by a level (1-based).
 * This is the sum of all minimum set and run sizes.
 */
export function minCardsForLevel(level: number): number {
  const def = LEVELS[level - 1];
  if (!def) return 0;
  return def.sets.reduce((s, n) => s + n, 0) + def.runs.reduce((s, n) => s + n, 0);
}

/**
 * Enforces the "exact lay-down" rule:
 * When laying down, you may only include the minimum required cards per level,
 * UNLESS:
 *   - All cards from the hand are being played (going out immediately), OR
 *   - Exactly one card remains after laying down AND it is not a wild
 *     (so the player still has a card to discard).
 *
 * @param hand   The player's full hand at the time of laying down.
 * @param level  The player's current level (1-based).
 * @param combos The combos being submitted.
 */
export function validateLayDownCardCount(hand: Card[], level: number, combos: Combo[]): boolean {
  const totalSubmitted = combos.reduce((s, c) => s + c.cards.length, 0);
  const minRequired = minCardsForLevel(level);

  // Exactly the minimum — always fine
  if (totalSubmitted === minRequired) return true;

  // More than minimum — only allowed under going-out exceptions
  const remaining = hand.length - totalSubmitted;

  // Going out: hand will be empty after laying down
  if (remaining === 0) return true;

  // One discard card left: single non-wild card remains
  if (remaining === 1) {
    const submittedIds = new Set(combos.flatMap(c => c.cards.map(card => card.id)));
    const leftover = hand.filter(c => !submittedIds.has(c.id));
    if (leftover.length === 1 && !leftover[0].isWild) return true;
  }

  return false;
}

// ─── Building on laid-down hands ──────────────────────────────────────────────

/**
 * Returns true if `card` can be legally added to the end of `run`.
 * The card must match the run's suit (unless it's a wild) and extend one end.
 */
export function canAddToRun(run: Combo, card: Card): boolean {
  const naturals = run.cards.filter(c => !c.isWild);
  if (naturals.length === 0) return card.isWild;

  const suit = naturals[0].suit;
  if (!card.isWild && card.suit !== suit) return false;

  // Build a trial combo and validate
  const trial: Combo = { type: 'run', cards: [...run.cards, card] };
  return isValidRun(trial.cards, 1); // min 1 — we just need the sequence to stay valid
}

/**
 * Returns true if `card` can be legally added to a set.
 */
export function canAddToSet(set: Combo, card: Card): boolean {
  const trial: Combo = { type: 'set', cards: [...set.cards, card] };
  return isValidSet(trial.cards, 1);
}

/**
 * Returns true if `card` can be added to the given combo.
 */
export function canAddToCombo(combo: Combo, card: Card): boolean {
  if (combo.type === 'run') return canAddToRun(combo, card);
  return canAddToSet(combo, card);
}

// ─── Wild replacement ─────────────────────────────────────────────────────────

/**
 * Replaces `wildCard` in `combo` with `naturalCard`.
 * Returns the updated combo and the displaced wild, or null if invalid.
 */
export function replaceWildInCombo(
  combo: Combo,
  naturalCard: Card,
  wildCard: Card,
): { newCombo: Combo; displacedWild: Card } | null {
  const wildIndex = combo.cards.findIndex(c => c.id === wildCard.id);
  if (wildIndex === -1) return null;
  if (naturalCard.isWild) return null;

  const newCards = [...combo.cards];
  newCards[wildIndex] = naturalCard;

  const newCombo: Combo = { type: combo.type, cards: newCards };

  // Validate the new combo still holds
  const valid =
    combo.type === 'run'
      ? isValidRun(newCards, 1)
      : isValidSet(newCards, 1);

  if (!valid) return null;

  return { newCombo, displacedWild: wildCard };
}

// ─── Discard rule ─────────────────────────────────────────────────────────────

/** 2s (wilds) cannot be discarded. */
export function canDiscard(card: Card): boolean {
  return !card.isWild;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Returns the LevelDefinition for a 1-based level number. */
export function getLevelDef(level: number): LevelDefinition {
  return LEVELS[level - 1];
}

/** Returns the ComboType expected for a given combo slot in a level. */
export function getLevelComboTypes(level: number): ComboType[] {
  const def = getLevelDef(level);
  return [
    ...def.sets.map((): ComboType => 'set'),
    ...def.runs.map((): ComboType => 'run'),
  ];
}
