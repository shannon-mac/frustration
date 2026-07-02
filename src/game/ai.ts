import { getHandSizeLimit } from './deck';
import { LEVELS, RANK_ORDER, canAddToCombo, isValidRun, isValidSet } from './rules';
import type { LevelDefinition } from './rules';
import type { Card, Combo, GameAction, GameState } from './types';

// ─── Utility ──────────────────────────────────────────────────────────────────

function naturalCards(cards: Card[]): Card[] {
  return cards.filter(c => !c.isWild);
}

function wildCards(cards: Card[]): Card[] {
  return cards.filter(c => c.isWild);
}

// ─── Find best level combo from a hand ───────────────────────────────────────

/**
 * Try all permutations of choosing cards for each required combo slot.
 * This is a greedy approach — good enough for a family card game AI.
 */
export function findBestLevelCombo(
  hand: Card[],
  level: number,
): Combo[] | null {
  const def = LEVELS[level - 1];
  if (!def) return null;

  const wilds = wildCards(hand);
  const naturals = naturalCards(hand);

  // Try to build sets first, then runs
  const result = tryBuildCombos(naturals, wilds, def);
  return result;
}

function tryBuildCombos(
  naturals: Card[],
  wilds: Card[],
  def: LevelDefinition,
): Combo[] | null {
  const combos: Combo[] = [];
  let remainingNaturals = [...naturals];
  let remainingWilds = [...wilds];

  // Build sets
  for (const minSize of def.sets) {
    const result = buildSet(remainingNaturals, remainingWilds, minSize);
    if (!result) return null;
    combos.push(result.combo);
    remainingNaturals = remainingNaturals.filter(
      c => !result.usedNaturals.some(u => u.id === c.id),
    );
    remainingWilds = remainingWilds.filter(
      c => !result.usedWilds.some(u => u.id === c.id),
    );
  }

  // Build runs
  for (const minSize of def.runs) {
    const result = buildRun(remainingNaturals, remainingWilds, minSize);
    if (!result) return null;
    combos.push(result.combo);
    remainingNaturals = remainingNaturals.filter(
      c => !result.usedNaturals.some(u => u.id === c.id),
    );
    remainingWilds = remainingWilds.filter(
      c => !result.usedWilds.some(u => u.id === c.id),
    );
  }

  return combos;
}

function buildSet(
  naturals: Card[],
  wilds: Card[],
  minSize: number,
): { combo: Combo; usedNaturals: Card[]; usedWilds: Card[] } | null {
  // Group by rank, pick the largest group
  const byRank: Record<string, Card[]> = {};
  for (const c of naturals) {
    if (!byRank[c.rank]) byRank[c.rank] = [];
    byRank[c.rank].push(c);
  }

  // Try ranks in descending group size
  const ranks = Object.keys(byRank).sort(
    (a, b) => byRank[b].length - byRank[a].length,
  );

  for (const rank of ranks) {
    const group = byRank[rank];
    const needed = Math.max(0, minSize - group.length);
    if (needed > wilds.length) continue; // not enough wilds

    const usedNaturals = group;
    const usedWilds = wilds.slice(0, needed);
    const cards = [...usedNaturals, ...usedWilds];

    if (isValidSet(cards, minSize)) {
      return {
        combo: { type: 'set', cards },
        usedNaturals,
        usedWilds,
      };
    }
  }

  return null;
}

function buildRun(
  naturals: Card[],
  wilds: Card[],
  minSize: number,
): { combo: Combo; usedNaturals: Card[]; usedWilds: Card[] } | null {
  // Group by suit
  const bySuit: Record<string, Card[]> = {};
  for (const c of naturals) {
    if (!bySuit[c.suit]) bySuit[c.suit] = [];
    bySuit[c.suit].push(c);
  }

  // Try each suit, find the best consecutive window
  for (const suit of Object.keys(bySuit)) {
    const suitCards = [...bySuit[suit]].sort(
      (a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank],
    );

    // Deduplicate ranks (keep one per rank for run purposes)
    const deduped: Card[] = [];
    const seen = new Set<number>();
    for (const c of suitCards) {
      const val = RANK_ORDER[c.rank];
      if (!seen.has(val)) { seen.add(val); deduped.push(c); }
    }

    // Try every possible window of cards that could form a run with wilds
    const maxWilds = wilds.length;
    const result = findBestRunWindow(deduped, wilds.slice(0, maxWilds), minSize);
    if (result) return result;
  }

  return null;
}

function findBestRunWindow(
  sortedSuitCards: Card[],
  availableWilds: Card[],
  minSize: number,
): { combo: Combo; usedNaturals: Card[]; usedWilds: Card[] } | null {
  // Try all subsets of the sorted suit cards, find the longest consecutive run
  // that can be completed with available wilds
  let best: { combo: Combo; usedNaturals: Card[]; usedWilds: Card[] } | null = null;

  for (let start = 0; start < sortedSuitCards.length; start++) {
    for (let end = start; end < sortedSuitCards.length; end++) {
      const subset = sortedSuitCards.slice(start, end + 1);
      const minVal = RANK_ORDER[subset[0].rank];
      const maxVal = RANK_ORDER[subset[subset.length - 1].rank];
      const span = maxVal - minVal + 1;
      const gaps = span - subset.length;
      const totalLen = span; // naturals + wilds needed

      if (gaps > availableWilds.length) continue;
      if (totalLen < minSize) continue;

      const usedWilds = availableWilds.slice(0, gaps);
      const cards = [...subset, ...usedWilds];

      if (isValidRun(cards, minSize)) {
        if (!best || cards.length > best.combo.cards.length) {
          best = {
            combo: { type: 'run', cards },
            usedNaturals: subset,
            usedWilds,
          };
        }
      }
    }
  }

  return best;
}

// ─── Should AI buy? ───────────────────────────────────────────────────────────

export function shouldBuy(
  state: GameState,
  playerIndex: number,
  discardedCard: Card,
): boolean {
  const player = state.players[playerIndex];

  // Respect hand size limit
  const limit = getHandSizeLimit(player.level);
  if (player.hand.length + 2 > limit) return false;

  // Can't buy first 2 discards
  if (state.discardsThisRound < 2) return false;

  // If already laid down, only buy if the card can be played on a hand
  if (player.laidDown !== null) {
    return canPlayOnAnyHand(state, playerIndex, discardedCard);
  }

  // Check if this card helps towards the current level combo
  const def = LEVELS[player.level - 1];
  const hypotheticalHand = [...player.hand, discardedCard];

  // Try to build the level combo with this card included
  const withCard = findBestLevelCombo(hypotheticalHand, player.level);
  const withoutCard = findBestLevelCombo(player.hand, player.level);

  // If it completes the combo, definitely buy
  if (withCard && !withoutCard) return true;

  // Score how much progress the card adds
  const scoreWith = scoreHandProgress(hypotheticalHand, def);
  const scoreWithout = scoreHandProgress(player.hand, def);

  return scoreWith > scoreWithout + 1; // only buy if significantly better
}

function canPlayOnAnyHand(
  state: GameState,
  _playerIndex: number,
  card: Card,
): boolean {
  for (const player of state.players) {
    if (!player.laidDown) continue;
    for (const combo of player.laidDown.combos) {
      if (canAddToCombo(combo, card)) return true;
    }
  }
  return false;
}

/**
 * Rough score for how close `hand` is to completing the level requirements.
 * Higher = more cards that fit into level combos.
 */
function scoreHandProgress(hand: Card[], def: LevelDefinition): number {
  let score = 0;

  // For each set requirement, count matching rank groups
  for (const minSize of def.sets) {
    const byRank: Record<string, number> = {};
    for (const c of hand) {
      if (!c.isWild) byRank[c.rank] = (byRank[c.rank] ?? 0) + 1;
    }
    const best = Math.max(0, ...Object.values(byRank));
    score += Math.min(best, minSize);
  }

  // For each run requirement, count longest suit run
  for (const minSize of def.runs) {
    const bySuit: Record<string, Card[]> = {};
    for (const c of hand) {
      if (!c.isWild) {
        if (!bySuit[c.suit]) bySuit[c.suit] = [];
        bySuit[c.suit].push(c);
      }
    }
    let best = 0;
    for (const cards of Object.values(bySuit)) {
      const sorted = cards.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
      let run = 1, maxRun = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (RANK_ORDER[sorted[i].rank] === RANK_ORDER[sorted[i - 1].rank] + 1) {
          run++;
          maxRun = Math.max(maxRun, run);
        } else {
          run = 1;
        }
      }
      best = Math.max(best, maxRun);
    }
    score += Math.min(best, minSize);
  }

  return score;
}

// ─── Choose what to build on others' hands ───────────────────────────────────

export function chooseBuildPlays(
  state: GameState,
  playerIndex: number,
): Array<{ card: Card; targetPlayerIndex: number; targetComboIndex: number }> {
  const player = state.players[playerIndex];
  if (!player.laidDown) return [];

  const plays: Array<{ card: Card; targetPlayerIndex: number; targetComboIndex: number }> = [];

  for (const card of player.hand) {
    if (card.isWild) continue; // save wilds — don't burn them on other hands unless nothing else
    for (let pi = 0; pi < state.players.length; pi++) {
      const target = state.players[pi];
      if (!target.laidDown) continue;
      for (let ci = 0; ci < target.laidDown.combos.length; ci++) {
        if (canAddToCombo(target.laidDown.combos[ci], card)) {
          plays.push({ card, targetPlayerIndex: pi, targetComboIndex: ci });
          break; // one play per card
        }
      }
      if (plays.some(p => p.card.id === card.id)) break;
    }
  }

  return plays;
}

// ─── Choose what to discard ───────────────────────────────────────────────────

export function chooseDiscard(
  hand: Card[],
  level: number,
  hasLaidDown: boolean,
): Card | null {
  // Never discard a wild
  const discardable = hand.filter(c => !c.isWild);
  if (discardable.length === 0) return null;

  if (hasLaidDown) {
    // Just discard the highest-rank card with fewest duplicates (random tiebreak)
    return discardable.sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank])[0];
  }

  const def = LEVELS[level - 1];

  // Score each card by how much it contributes to the level
  const scores = discardable.map(card => {
    const withoutCard = hand.filter(c => c.id !== card.id);
    return { card, progress: scoreHandProgress(withoutCard, def) };
  });

  // Discard the card whose removal hurts the least (or helps most)
  scores.sort((a, b) => b.progress - a.progress);
  return scores[0].card;
}

// ─── Main AI turn orchestrator ────────────────────────────────────────────────

/**
 * Computes the full sequence of actions an AI player should take on their turn.
 * Returns an ordered list of GameActions to dispatch.
 */
export function computeAITurn(state: GameState, playerIndex: number): GameAction[] {
  const actions: GameAction[] = [];
  const player = state.players[playerIndex];

  // 1. Draw phase — always draw from deck (AI doesn't use discard draw for simplicity)
  //    Exception: draw from discard if the top card significantly helps
  const topDiscard = state.discardPile[0];
  if (topDiscard && !topDiscard.isWild) {
    const hypothetical = [...player.hand, topDiscard];
    const canCompleteWithDiscard = !!findBestLevelCombo(hypothetical, player.level);
    const canCompleteWithoutDiscard = !!findBestLevelCombo(player.hand, player.level);

    if (canCompleteWithDiscard && !canCompleteWithoutDiscard) {
      actions.push({ type: 'DRAW_FROM_DISCARD' });
    } else {
      actions.push({ type: 'DRAW_FROM_DECK' });
    }
  } else {
    actions.push({ type: 'DRAW_FROM_DECK' });
  }

  // We need to simulate what the hand will look like after the draw
  // Use the current hand + anticipated draw card for downstream logic
  const simulatedHand = [...player.hand]; // draw will be added by engine

  // 2. Lay down phase — if not already laid down, try to lay down level combo
  if (player.laidDown === null) {
    const combo = findBestLevelCombo(simulatedHand, player.level);
    if (combo) {
      actions.push({
        type: 'LAY_DOWN',
        playerIndex,
        combos: combo,
      });
    }
  }

  // 3. Build on hands — play cards onto other players' laid-down combos
  //    (This is computed at dispatch time since hand state changes after draw)
  // We add a sentinel action that the hook will resolve after draw
  // For now, choose plays based on current hand (hook will re-evaluate after draw)
  if (player.laidDown !== null) {
    const plays = chooseBuildPlays(state, playerIndex);
    for (const play of plays) {
      actions.push({
        type: 'PLAY_ON_HAND',
        targetPlayerIndex: play.targetPlayerIndex,
        targetComboIndex: play.targetComboIndex,
        card: play.card,
      });
    }
  }

  // 4. Discard phase
  const discardCard = chooseDiscard(simulatedHand, player.level, player.laidDown !== null);
  if (discardCard) {
    actions.push({ type: 'DISCARD', card: discardCard });
  }

  return actions;
}

// ─── AI buy decision (called between turns) ───────────────────────────────────

/**
 * Returns a BUY action if the AI player wants to buy the just-discarded card,
 * or null if they pass.
 */
export function computeAIBuyDecision(
  state: GameState,
  playerIndex: number,
  discardedCard: Card,
): GameAction | null {
  if (shouldBuy(state, playerIndex, discardedCard)) {
    return { type: 'BUY', buyerIndex: playerIndex };
  }
  return null;
}
