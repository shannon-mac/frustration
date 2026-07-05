import { getHandSizeLimit } from './deck';
import { LEVELS, RANK_ORDER, canAddToCombo, isValidRun, isValidSet, replaceWildInCombo } from './rules';
import type { LevelDefinition } from './rules';
import type { Card, Combo, GameAction, GameState, Player } from './types';

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

export function canBuildOnHand(
  state: GameState,
  card: Card,
  playerIndex?: number,
): boolean {
  for (let index = 0; index < state.players.length; index++) {
    if (playerIndex !== undefined && index === playerIndex) continue;
    const player = state.players[index];
    if (!player.laidDown) continue;
    for (const combo of player.laidDown.combos) {
      if (canAddToCombo(combo, card)) return true;
    }
  }
  return false;
}

function countBuildableCards(hand: Card[], state: GameState, playerIndex: number): number {
  return hand.filter(card => canBuildOnHand(state, card, playerIndex)).length;
}

function countPotentialBuildCards(hand: Card[], state: GameState, playerIndex: number): number {
  return hand.filter(card => canBuildOnHand(state, card, playerIndex) || improvesLevelHand(hand, card, state.players[playerIndex])).length;
}

function improvesLevelHand(hand: Card[], card: Card, player: Player): boolean {
  if (player.laidDown) return false;
  const withCard = [...hand, card];
  const currentCombo = findBestLevelCombo(hand, player.level);
  const nextCombo = findBestLevelCombo(withCard, player.level);
  if (nextCombo && !currentCombo) return true;
  const def = LEVELS[player.level - 1];
  return scoreHandProgress(withCard, def) > scoreHandProgress(hand, def);
}

export function shouldBuy(
  state: GameState,
  playerIndex: number,
  discardedCard: Card,
): boolean {
  const player = state.players[playerIndex];

  if (player.laidDown !== null) {
    return false;
  }

  const limit = getHandSizeLimit(player.level);
  if (player.hand.length + 2 > limit) return false;
  if (state.discardsThisRound < 2) return false;

  const hypotheticalHand = [...player.hand, discardedCard];
  const withCard = findBestLevelCombo(hypotheticalHand, player.level);
  const withoutCard = findBestLevelCombo(player.hand, player.level);

  if (withCard && hypotheticalHand.length - withCard.reduce((sum, combo) => sum + combo.cards.length, 0) <= 1) {
    return true;
  }

  if (withCard && !withoutCard) return true;

  const def = LEVELS[player.level - 1];
  const scoreWith = scoreHandProgress(hypotheticalHand, def);
  const scoreWithout = scoreHandProgress(player.hand, def);
  if (scoreWith > scoreWithout + 1) return true;

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
): Array<{ card: Card; targetPlayerIndex: number; targetComboIndex: number; wildToReplace?: Card }> {
  const player = state.players[playerIndex];
  if (!player.laidDown) return [];

  const plays: Array<{ card: Card; targetPlayerIndex: number; targetComboIndex: number; wildToReplace?: Card }> = [];

  for (const card of player.hand) {
    if (card.isWild) continue; // save wilds for wild-displacement destinations
    for (let pi = 0; pi < state.players.length; pi++) {
      const target = state.players[pi];
      if (!target.laidDown) continue;
      for (let ci = 0; ci < target.laidDown.combos.length; ci++) {
        const combo = target.laidDown.combos[ci];
        const isBlockedBuild =
          state.rummyBlock?.blockedPlayerIndex === playerIndex &&
          state.rummyBlock.discardedCardId === card.id;
        if (isBlockedBuild) break;
        // Direct add (no wild displacement)
        if (canAddToCombo(combo, card)) {
          plays.push({ card, targetPlayerIndex: pi, targetComboIndex: ci });
          break; // one play per card
        }
        // Wild displacement: try replacing each wild in this run/set
        if (combo.type === 'run') {
          const wilds = combo.cards.filter(c => c.isWild);
          for (const wild of wilds) {
            const result = replaceWildInCombo(combo, card, wild);
            if (!result) continue;
            // The displaced wild must have somewhere to go — find a valid destination
            const wildCard = result.displacedWild;
            const hasDestination = state.players.some(tp => {
              if (!tp.laidDown) return false;
              return tp.laidDown.combos.some(tc => canAddToCombo(tc, wildCard));
            });
            if (hasDestination) {
              plays.push({ card, targetPlayerIndex: pi, targetComboIndex: ci, wildToReplace: wild });
              break;
            }
          }
        }
        if (plays.some(p => p.card.id === card.id)) break;
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
  state?: GameState,
  playerIndex?: number,
): Card | null {
  const discardable = hand.filter(c => !c.isWild);
  if (discardable.length === 0) return null;

  if (hasLaidDown && state !== undefined && playerIndex !== undefined) {
    const nextPlayerIndex = (playerIndex + 1) % state.players.length;
    const scored = discardable.map(card => {
      const remainingHand = hand.filter(c => c.id !== card.id);
      // Prefer cards that keep our own buildable options high
      const buildableLeft = countBuildableCards(remainingHand, state, playerIndex);
      // Penalise cards that the next player can immediately build onto laid-down hands
      const givesNextPlayerBuild = canBuildOnHand(state, card, nextPlayerIndex) ? 1 : 0;
      return {
        card,
        buildableLeft,
        givesNextPlayerBuild,
        rankValue: RANK_ORDER[card.rank],
      };
    });

    // Sort: most buildable left first; break ties by not giving next player a free build;
    // then discard highest-rank card as a last tiebreak.
    scored.sort((a, b) =>
      b.buildableLeft - a.buildableLeft ||
      a.givesNextPlayerBuild - b.givesNextPlayerBuild ||
      b.rankValue - a.rankValue,
    );
    return scored[0].card;
  }

  const def = LEVELS[level - 1];
  const scores = discardable.map(card => {
    const withoutCard = hand.filter(c => c.id !== card.id);
    // How much does keeping this card help our own level progress?
    const progress = scoreHandProgress(withoutCard, def);
    // How many of our remaining cards can still be built onto laid-down hands?
    const buildPotential = state !== undefined && playerIndex !== undefined
      ? countPotentialBuildCards(withoutCard, state, playerIndex)
      : 0;
    // Does discarding this card hand an opponent a free build?
    // Score by proximity in turn order — the next player picks up the discard
    // directly so they are the most dangerous recipient.
    let givesOpponentBuild = 0;
    if (state !== undefined && playerIndex !== undefined) {
      const playerCount = state.players.length;
      for (let offset = 1; offset < playerCount; offset++) {
        const idx = (playerIndex + offset) % playerCount;
        const opponent = state.players[idx];
        if (!opponent.laidDown) continue;
        if (opponent.laidDown.combos.some(combo => canAddToCombo(combo, card))) {
          // Next player (offset 1) is most dangerous; further players less so
          givesOpponentBuild = playerCount - offset; // higher = closer = worse
          break;
        }
      }
    }
    return {
      card,
      progress,
      buildPotential,
      givesOpponentBuild,
      rankValue: RANK_ORDER[card.rank],
    };
  });

  // Primary: keep progress high; secondary: avoid handing opponents a build;
  // tertiary: keep build potential for self; last: discard high-rank cards.
  scores.sort((a, b) =>
    b.progress - a.progress ||
    a.givesOpponentBuild - b.givesOpponentBuild ||
    a.buildPotential - b.buildPotential ||
    b.rankValue - a.rankValue,
  );
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

  const topDiscard = state.discardPile[0];
  const topDiscardBlockedForBuild =
    !!topDiscard &&
    state.rummyBlock?.blockedPlayerIndex === playerIndex &&
    state.rummyBlock.discardedCardId === topDiscard.id;

  // Cannot draw from the discard pile during the first 2 discards of the round
  const canDrawFromDiscard = state.discardsThisRound >= 2;

  const shouldTakeDiscard = canDrawFromDiscard && !!topDiscard && !topDiscard.isWild && (
    (player.laidDown === null && improvesLevelHand(player.hand, topDiscard, player)) ||
    (player.laidDown !== null && canBuildOnHand(state, topDiscard, playerIndex) && !topDiscardBlockedForBuild)
  );

  actions.push({ type: shouldTakeDiscard ? 'DRAW_FROM_DISCARD' : 'DRAW_FROM_DECK' });

  const simulatedHand = topDiscard && shouldTakeDiscard ? [...player.hand, topDiscard] : [...player.hand];

  let willLayDown = false;
  let handAfterLayDown = simulatedHand;
  if (player.laidDown === null) {
    const combo = findBestLevelCombo(simulatedHand, player.level);
    if (combo) {
      actions.push({ type: 'LAY_DOWN', playerIndex, combos: combo });
      willLayDown = true;
      const comboCardIds = new Set(combo.flatMap(c => c.cards.map(card => card.id)));
      handAfterLayDown = simulatedHand.filter(c => !comboCardIds.has(c.id));
    }
  }

  if (player.laidDown !== null) {
    const simulatedState = {
      ...state,
      players: state.players.map((entry, index) =>
        index === playerIndex ? { ...entry, hand: simulatedHand } : entry,
      ),
    };
    const plays = chooseBuildPlays(simulatedState, playerIndex);

    // Always keep at least one non-wild card back so the AI can discard to end
    // its turn (wilds cannot be discarded).  Trim plays from the end until the
    // remaining hand contains a discardable card.
    const keptPlays = [...plays];
    while (keptPlays.length > 0) {
      const playedIds = new Set(keptPlays.map(p => p.card.id));
      const remaining = handAfterLayDown.filter(c => !playedIds.has(c.id));
      if (remaining.some(c => !c.isWild)) break; // still has something to discard
      keptPlays.pop();
    }

    for (const play of keptPlays) {
      actions.push({
        type: 'PLAY_ON_HAND',
        targetPlayerIndex: play.targetPlayerIndex,
        targetComboIndex: play.targetComboIndex,
        card: play.card,
        wildToReplace: play.wildToReplace,
      });
    }
    // Subtract played cards so the discard selection doesn't pick an already-played card
    const playedIds = new Set(keptPlays.map(p => p.card.id));
    handAfterLayDown = handAfterLayDown.filter(c => !playedIds.has(c.id));
  }

  const discardCard = chooseDiscard(
    handAfterLayDown,
    player.level,
    player.laidDown !== null || willLayDown,
    state,
    playerIndex,
  );
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
