import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { computeAIBuyDecision, computeAITurn } from '../game/ai';
import { gameReducer, initialGameState } from '../game/engine';
import type { Card, Combo, GameState } from '../game/types';

// ─── Delays ───────────────────────────────────────────────────────────────────

const AI_TURN_DELAY_MS = 900;
const AI_ACTION_DELAY_MS = 600;
export const BUY_WINDOW_MS = 10_000;

// ─── Buy state ────────────────────────────────────────────────────────────────

export interface BuyOffer {
  card: Card;
  offeredAt: number;          // Date.now() when offer became active
  discardingPlayerIndex: number;
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseGameStateReturn {
  state: GameState;
  buyOffer: BuyOffer | null;   // non-null when human can buy
  /** Human-readable description of the last action taken by the current AI player. */
  lastAIAction: string | null;
  /** Diagnostic log lines for the on-screen debug overlay. */
  debugLines: string[];

  // Setup
  startGame: (playerCount: number) => void;
  nextRound: () => void;

  // Human turn actions
  drawFromDeck: () => void;
  drawFromDiscard: () => void;
  firstPlayerPeek: () => void;
  firstPlayerKeep: () => void;
  firstPlayerRedraw: () => void;
  layDown: (combos: Combo[]) => void;
  playOnHand: (targetPlayerIndex: number, targetComboIndex: number, card: Card, wildToReplace?: Card, wildPlacementEnd?: 'low' | 'high') => void;
  discard: (card: Card) => void;

  // Buy / rummy decision
  humanBuy: () => void;
  humanPass: () => void;
  callRummy: () => void;

  // Derived helpers
  isHumanTurn: boolean;
  humanPlayerIndex: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'frustration_game_state';

/**
 * Verify that no card ID appears more than once across the entire game state
 * (hands, laid-down combos, deck, and discard pile).
 * Returns true if the state is clean, false if duplicates are found.
 */
function isStateDeckIntact(state: typeof initialGameState): boolean {
  const seen = new Set<string>();
  const allCards = [
    ...state.deck,
    ...state.discardPile,
    ...state.players.flatMap(p => [
      ...p.hand,
      ...(p.laidDown?.combos.flatMap(c => c.cards) ?? []),
    ]),
  ];
  for (const card of allCards) {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
  }
  return true;
}

function loadState(): typeof initialGameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialGameState;
    const parsed = JSON.parse(raw);
    // Discard saved state if it contains duplicate card IDs (corrupted)
    if (!isStateDeckIntact(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return initialGameState;
    }
    // If the page was closed/reloaded mid-AI-turn, the async turn runner is gone.
    // The useEffect only re-triggers runAITurn when turnPhase === 'draw', so reset
    // any in-progress AI turn back to the draw phase so it restarts cleanly.
    if (
      parsed.gamePhase === 'playing' &&
      parsed.turnPhase !== 'draw' &&
      !parsed.players[parsed.currentPlayerIndex]?.isHuman
    ) {
      return {
        ...parsed,
        turnPhase: 'draw',
        displacedWildPending: false,
        rummyPendingDiscard: null,
      };
    }
    return parsed;
  } catch {
    return initialGameState;
  }
}

function saveState(state: typeof initialGameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

export function useGameState(): UseGameStateReturn {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadState);
  const [buyOffer, setBuyOffer] = useState<BuyOffer | null>(null);
  const [lastAIAction, setLastAIAction] = useState<string | null>(null);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const addLog = useCallback((line: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setDebugLines(prev => [...prev.slice(-49), `${ts} ${line}`]);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Use a generation counter so stale async loops abort when a new round/turn starts
  const genRef = useRef(0);
  const buyResolveRef = useRef<((bought: boolean) => void) | null>(null);

  // ─── Derived values ────────────────────────────────────────────────────────

  const humanPlayerIndex = state.players.findIndex(p => p.isHuman);
  const isHumanTurn =
    state.gamePhase === 'playing' &&
    state.currentPlayerIndex === humanPlayerIndex;

  // ─── Buy helpers ──────────────────────────────────────────────────────────

  const clearBuyOffer = useCallback(() => {
    setBuyOffer(null);
    if (buyResolveRef.current) {
      buyResolveRef.current(false);
      buyResolveRef.current = null;
    }
  }, []);

  /** Offer the discard card to one player. Returns true if they bought. */
  const offerBuyToPlayer = useCallback(async (
    playerIndex: number,
    card: Card,
    discardingPlayerIndex: number,
    gen: number,
  ): Promise<boolean> => {
    const s = stateRef.current;
    // Note: buy eligibility (discardsThisRound) already checked by runBuyWindow before calling here
    const player = s.players[playerIndex];
    if (!player) return false;

    if (player.isHuman) {
      // Don't offer the buy if the human has already laid down
      if (player.laidDown !== null) return false;
      return new Promise<boolean>(resolve => {
        setBuyOffer({ card, offeredAt: Date.now(), discardingPlayerIndex });
        buyResolveRef.current = (bought: boolean) => {
          setBuyOffer(null);
          buyResolveRef.current = null;
          resolve(bought);
        };
        setTimeout(() => {
          if (genRef.current === gen && buyResolveRef.current) {
            buyResolveRef.current(false);
          }
        }, BUY_WINDOW_MS);
      });
    } else {
      await sleep(300); // small pause so AI "thinks"
      if (genRef.current !== gen) return false;
      const action = computeAIBuyDecision(stateRef.current, playerIndex, card);
      if (action) {
        dispatch(action);
        return true;
      }
      return false;
    }
  }, []);

  /**
   * After a discard, go round ALL other players (in turn order) offering the buy.
   * postDiscardCount is the value of discardsThisRound AFTER the discard was applied.
   * Stops after the first buyer — only one player can buy per discard.
   */
  const runBuyWindow = useCallback(async (
    discardedCard: Card,
    discardingPlayerIndex: number,
    gen: number,
    postDiscardCount: number,
  ) => {
    // No buying on the first 2 discards of the round
    if (postDiscardCount < 2) return;
    const s = stateRef.current;
    const playerCount = s.players.length;
    // The next player in turn order can just pick up the discard on their own turn —
    // skip offering them the buy.
    const nextPlayerIndex = (discardingPlayerIndex + 1) % playerCount;
    for (let offset = 1; offset < playerCount; offset++) {
      if (genRef.current !== gen) { addLog(`⚠ BUY gen stale discardedBy=${discardingPlayerIndex} off=${offset} gen=${gen} cur=${genRef.current}`); return; }
      const idx = (discardingPlayerIndex + offset) % playerCount;
      // Human is next to play — they can draw it naturally, so don't offer a buy
      if (idx === nextPlayerIndex && s.players[idx]?.isHuman) continue;
      const bought = await offerBuyToPlayer(idx, discardedCard, discardingPlayerIndex, gen);
      if (bought) { addLog(`BUY p${idx} bought from p${discardingPlayerIndex}`); break; }
    }
  }, [offerBuyToPlayer, addLog]);

  // ─── Human buy ─────────────────────────────────────────────────────────────

  const humanBuy = useCallback(() => {
    if (!buyResolveRef.current) return;
    const s = stateRef.current;
    const humanIdx = s.players.findIndex(p => p.isHuman);
    dispatch({ type: 'BUY', buyerIndex: humanIdx });
    buyResolveRef.current(true);
  }, []);

  // ─── AI turn runner ────────────────────────────────────────────────────────

  const runAITurn = useCallback(async (playerIndex: number, gen: number) => {
    await sleep(AI_TURN_DELAY_MS);

    if (genRef.current !== gen) { addLog(`⚠ p${playerIndex} gen${gen} stale(${genRef.current}) after sleep STUCK`); return; }
    const s = stateRef.current;
    if (s.gamePhase !== 'playing') { addLog(`⚠ p${playerIndex} phase=${s.gamePhase} STUCK`); return; }
    if (s.currentPlayerIndex !== playerIndex) { addLog(`⚠ p${playerIndex} curPlayer=${s.currentPlayerIndex} STUCK`); return; }

    const actions = computeAITurn(s, playerIndex);
    addLog(`p${playerIndex} gen=${gen} [${actions.map(a=>a.type).join(',')}]`);

    for (const action of actions) {
      if (genRef.current !== gen) { addLog(`⚠ p${playerIndex} gen stale on ${action.type} STUCK`); return; }
      const current = stateRef.current;
      if (current.gamePhase !== 'playing') return;
      if (current.currentPlayerIndex !== playerIndex) { addLog(`⚠ p${playerIndex} player→${current.currentPlayerIndex} mid-loop STUCK`); return; }

      // Update the visible AI action label
      const playerName = stateRef.current.players[playerIndex]?.name ?? 'AI';
      if (action.type === 'DRAW_FROM_DECK') {
        setLastAIAction(`${playerName} draws from deck`);
      } else if (action.type === 'DRAW_FROM_DISCARD') {
        setLastAIAction(`${playerName} draws from discard`);
      } else if (action.type === 'LAY_DOWN') {
        setLastAIAction(`${playerName} lays down hand`);
      } else if (action.type === 'PLAY_ON_HAND') {
        const cardName = action.card.isWild ? 'Wild' : `${action.card.rank}`;
        setLastAIAction(`${playerName} plays ${cardName} on table`);
      } else if (action.type === 'DISCARD') {
        const cardName = action.card.isWild ? 'Wild' : `${action.card.rank} of ${action.card.suit}`;
        setLastAIAction(`${playerName} discards ${cardName}`);
      }

      if (action.type === 'DISCARD') {
        // Capture discardsThisRound BEFORE dispatch, then +1 = post-discard count
        const postDiscardCount = stateRef.current.discardsThisRound + 1;
        dispatch(action);
        await sleep(AI_ACTION_DELAY_MS);
        // turnPhase is now 'discard'; currentPlayerIndex hasn't changed,
        // so the useEffect will NOT bump gen here. Safe to run the buy window.
        await runBuyWindow(action.card, playerIndex, gen, postDiscardCount);
        if (genRef.current !== gen) { addLog(`⚠ p${playerIndex} gen stale after buyWin STUCK`); return; }
        addLog(`p${playerIndex} ADVANCE_TURN`);
        dispatch({ type: 'ADVANCE_TURN' });
        return;
      }

      dispatch(action);
      await sleep(AI_ACTION_DELAY_MS);
    }

    // No DISCARD was in the planned actions list. Two sub-cases:
    //
    // 1. The player drew from the deck and their pre-draw hand was empty (or all
    //    cards were played onto combos), so the planner had nothing to pick for
    //    the discard. The draw has now happened — pick the discard from the live
    //    hand (which contains exactly the drawn card).
    //
    // 2. The player genuinely has no cards left (went out by playing everything).
    //    Advance the turn and let handleAdvanceTurn end the round.
    if (genRef.current !== gen) return;
    const finalState = stateRef.current;
    if (finalState.gamePhase !== 'playing' || finalState.currentPlayerIndex !== playerIndex) return;

    const liveHand = finalState.players[playerIndex]?.hand ?? [];
    const fallbackDiscard = liveHand.find(c => !c.isWild) ?? null;

    if (fallbackDiscard) {
      addLog(`p${playerIndex} fallback DISCARD ${fallbackDiscard.rank}${fallbackDiscard.suit[0]}`);
      const postDiscardCount = finalState.discardsThisRound + 1;
      dispatch({ type: 'DISCARD', card: fallbackDiscard });
      await sleep(AI_ACTION_DELAY_MS);
      if (genRef.current !== gen) return;
      await runBuyWindow(fallbackDiscard, playerIndex, gen, postDiscardCount);
      if (genRef.current !== gen) return;
      dispatch({ type: 'ADVANCE_TURN' });
    } else {
      // Hand is empty — went out.
      dispatch({ type: 'ADVANCE_TURN' });
    }
  }, [runBuyWindow, addLog]);

  // ─── Watch for AI turns ────────────────────────────────────────────────────

  useEffect(() => {
    if (state.gamePhase !== 'playing') return;
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.isHuman) {
      // It's the human's turn — clear the AI action label
      setLastAIAction(null);
      return;
    }
    if (state.turnPhase !== 'draw') return;

    // Bump generation so any stale loop aborts
    genRef.current += 1;
    const gen = genRef.current;

    addLog(`effect p${state.currentPlayerIndex}(${state.players[state.currentPlayerIndex]?.name}) gen=${gen}`);

    // Clear any lingering buy offer
    clearBuyOffer();

    runAITurn(state.currentPlayerIndex, gen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayerIndex, state.gamePhase, state.turnPhase]);

  // ─── Human actions ─────────────────────────────────────────────────────────

  const startGame = useCallback((playerCount: number) => {
    genRef.current += 1; // abort any in-flight AI loop
    clearBuyOffer();
    if (playerCount < 2) {
      dispatch({ type: 'START_GAME', playerNames: [], humanIndex: 0 });
      return;
    }
    const names = Array.from({ length: playerCount }, (_, i) => `player-${i}`);
    dispatch({ type: 'START_GAME', playerNames: names, humanIndex: 0 });
  }, [clearBuyOffer]);

  const drawFromDeck = useCallback(() => {
    dispatch({ type: 'DRAW_FROM_DECK' });
  }, []);

  const drawFromDiscard = useCallback(() => {
    dispatch({ type: 'DRAW_FROM_DISCARD' });
  }, []);

  const firstPlayerPeek = useCallback(() => {
    dispatch({ type: 'FIRST_PLAYER_PEEK' });
  }, []);

  const firstPlayerKeep = useCallback(() => {
    dispatch({ type: 'FIRST_PLAYER_KEEP' });
  }, []);

  const firstPlayerRedraw = useCallback(() => {
    dispatch({ type: 'FIRST_PLAYER_DISCARD_AND_REDRAW' });
  }, []);

  const layDown = useCallback((combos: Combo[]) => {
    const humanIdx = stateRef.current.players.findIndex(p => p.isHuman);
    dispatch({ type: 'LAY_DOWN', playerIndex: humanIdx, combos });
  }, []);

  const playOnHand = useCallback((
    targetPlayerIndex: number,
    targetComboIndex: number,
    card: Card,
    wildToReplace?: Card,
    wildPlacementEnd?: 'low' | 'high',
  ) => {
    dispatch({ type: 'PLAY_ON_HAND', targetPlayerIndex, targetComboIndex, card, wildToReplace, wildPlacementEnd });
  }, []);

  const discard = useCallback(async (card: Card) => {
    const humanIdx = stateRef.current.players.findIndex(p => p.isHuman);
    // Capture discardsThisRound before dispatch, then +1 = post-discard count
    const postDiscardCount = stateRef.current.discardsThisRound + 1;
    dispatch({ type: 'DISCARD', card });
    // turnPhase is now 'discard'; currentPlayerIndex hasn't changed, so the
    // useEffect will NOT bump gen. Capture gen after dispatch — still stable.
    const gen = genRef.current;
    await runBuyWindow(card, humanIdx, gen, postDiscardCount);
    dispatch({ type: 'ADVANCE_TURN' });
  }, [runBuyWindow]);

  const nextRound = useCallback(() => {
    dispatch({ type: 'NEXT_ROUND' });
  }, []);

  return {
    state,
    buyOffer,
    lastAIAction,
    debugLines,
    startGame,
    nextRound,
    drawFromDeck,
    drawFromDiscard,
    firstPlayerPeek,
    firstPlayerKeep,
    firstPlayerRedraw,
    layDown,
    playOnHand,
    discard,
    humanBuy,
    humanPass: clearBuyOffer,
    callRummy: () => dispatch({ type: 'CALL_RUMMY' }),
    isHumanTurn,
    humanPlayerIndex,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
