import { useEffect, useRef, useState } from 'react';
import type { Card as CardType, Combo, Player } from '../../game/types';
import { canDiscard, getRunEndConstraints, RANK_ORDER } from '../../game/rules';
import { BUY_WINDOW_MS, type UseGameStateReturn } from '../../hooks/useGameState';
import { CardPile } from '../CardPile/CardPile';
import { GameOverScreen } from '../GameOverScreen/GameOverScreen';
import { LayDownModal } from '../LayDownModal/LayDownModal';
import { LaidDownHand } from '../LaidDownHand/LaidDownHand';
import { LevelsReference } from '../LevelsReference/LevelsReference';
import { OpponentArea } from '../OpponentArea/OpponentArea';
import { PlayerHand } from '../PlayerHand/PlayerHand';
import { RoundSummary } from '../RoundSummary/RoundSummary';
import styles from './GameBoard.module.css';

interface GameBoardProps {
  game: UseGameStateReturn;
  onPlayAgain: () => void;
}

type UIMode =
  | { type: 'review' }
  | { type: 'idle' }
  | { type: 'pendingDiscard'; card: CardType }
  | { type: 'layDownModal' }
  | { type: 'buildingOnHand'; selectedCard: CardType }
  | { type: 'wildPlacement'; selectedCard: CardType; targetPlayerIndex: number; targetComboIndex: number; combo: Combo };

export function GameBoard({ game, onPlayAgain }: GameBoardProps) {
  const { state, buyOffer, lastAIAction, isHumanTurn, humanPlayerIndex } = game;

  const [uiMode, setUIMode] = useState<UIMode>({ type: 'review' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [roundSummaryData, setRoundSummaryData] = useState<{ roundNumber: number; players: Player[] } | null>(null);
  const [showLevels, setShowLevels] = useState(false);
  const [prevRound, setPrevRound] = useState(state.roundNumber);
  // Track whether the human just laid down this turn so we can show "Build on Hand"
  const [laidDownThisTurn, setLaidDownThisTurn] = useState(false);
  // Persisted hand order — user may drag-reorder or sort; new cards are appended
  const [handOrder, setHandOrder] = useState<CardType[]>([]);

  // Buy timer display
  const [buySecondsLeft, setBuySecondsLeft] = useState(0);
  const buyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect round transition → show summary for the round that just ended, then review
  if (state.roundNumber !== prevRound && !showRoundSummary) {
    setRoundSummaryData({
      roundNumber: prevRound,
      players: state.players.map(p => ({
        ...p,
        level: p.laidDown ? p.level - 1 : p.level,
        laidDown: p.laidDown ? { combos: [] } : null,
      })),
    });
    setShowRoundSummary(true);
    setPrevRound(state.roundNumber);
    setUIMode({ type: 'review' });
    setLaidDownThisTurn(false);
  }

  // Keep handOrder in sync with the live hand:
  // cards removed (played/discarded) are dropped; newly drawn/bought cards are appended
  const humanHand = state.players[humanPlayerIndex]?.hand ?? [];
  const liveIds = new Set(humanHand.map(c => c.id));
  const knownIds = new Set(handOrder.map(c => c.id));
  const newCards = humanHand.filter(c => !knownIds.has(c.id));
  const filteredOrder = handOrder.filter(c => liveIds.has(c.id));
  if (newCards.length > 0 || filteredOrder.length !== handOrder.length) {
    setHandOrder([...filteredOrder, ...newCards]);
  }

  // Reset laidDownThisTurn when it's no longer the human's turn
  const prevIsHumanTurn = useRef(isHumanTurn);
  if (prevIsHumanTurn.current !== isHumanTurn) {
    prevIsHumanTurn.current = isHumanTurn;
    if (!isHumanTurn) setLaidDownThisTurn(false);
  }

  // ─── Buy timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (buyOffer) {
      setBuySecondsLeft(Math.ceil(BUY_WINDOW_MS / 1000));
      buyTimerRef.current = setInterval(() => {
        setBuySecondsLeft(prev => {
          if (prev <= 1) { clearInterval(buyTimerRef.current!); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (buyTimerRef.current) clearInterval(buyTimerRef.current);
      setBuySecondsLeft(0);
    }
    return () => { if (buyTimerRef.current) clearInterval(buyTimerRef.current); };
  }, [buyOffer?.offeredAt]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const human = state.players[humanPlayerIndex];
  if (!human) return null;

  const topDiscard = state.discardPile[0] ?? null;

  const isFirstPlayerOfRound =
    isHumanTurn &&
    state.turnPhase === 'draw' &&
    state.discardsThisRound === 0 &&
    state.currentPlayerIndex === (state.dealerIndex + 1) % state.players.length;

  // Whether the human is currently in the 'firstPeek' phase (deciding whether to keep the peeked card)
  const isFirstPeek = isHumanTurn && state.turnPhase === 'firstPeek';

  // Auto-skip review when human is first to play in a round — nothing to review yet
  if (uiMode.type === 'review' && isFirstPlayerOfRound) {
    setUIMode({ type: 'idle' });
  }

  const isReview = uiMode.type === 'review';

  // The engine uses 'action' for both the lay-down/build phase AND discard.
  // 'draw' = hasn't drawn yet; 'action' = has drawn, can lay down / build / discard.
  const canDraw = isHumanTurn && state.turnPhase === 'draw' && !isReview;
  const canAct  = isHumanTurn && state.turnPhase === 'action' && !isReview;

  const canHumanBuy = !!buyOffer && state.discardsThisRound >= 2 && !human.laidDown;
  const canCallRummy = !!state.rummyPendingDiscard && state.currentPlayerIndex !== humanPlayerIndex && !!human.laidDown;
  const opponents = state.players.filter((_, i) => i !== humanPlayerIndex);

  // ─── Hand sorting ──────────────────────────────────────────────────────────
  const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

  function sortByRank() {
    setHandOrder(prev => [...prev].sort((a, b) => {
      if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
      return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    }));
  }

  function sortBySuit() {
    setHandOrder(prev => [...prev].sort((a, b) => {
      if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
      const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      if (suitDiff !== 0) return suitDiff;
      return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    }));
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  function handleDiscard(card: CardType) {
    setSelectedIds(new Set());
    setUIMode({ type: 'idle' });
    setLaidDownThisTurn(false);
    game.discard(card);
  }

  function cancelDiscard() {
    setSelectedIds(new Set());
    setUIMode({ type: 'idle' });
  }

  function handleLayDownConfirm(combos: Combo[]) {
    game.layDown(combos);
    setLaidDownThisTurn(true);
    setUIMode({ type: 'idle' });
  }

  /** After placing a card, stay in build mode and auto-select the first remaining card. */
  function stayInBuildMode(playedCardId: string) {
    const remaining = (handOrder.length > 0 ? handOrder : human.hand).filter(c => c.id !== playedCardId);
    // Need at least 2 cards to keep building (must hold one back to discard)
    if (remaining.length > 1) {
      const next = remaining[0]!;
      setUIMode({ type: 'buildingOnHand', selectedCard: next });
      setSelectedIds(new Set([next.id]));
    } else {
      setUIMode({ type: 'idle' });
      setSelectedIds(new Set());
    }
  }

  function handleComboCardClick(playerIdx: number, comboIdx: number) {
    if (uiMode.type !== 'buildingOnHand') return;
    if (!human.laidDown) return;

    const card = uiMode.selectedCard;
    const targetPlayer = state.players[playerIdx];
    const combo = targetPlayer?.laidDown?.combos[comboIdx];

    // Wild card playing onto a run: may need to ask which end
    if (card.isWild && combo && combo.type === 'run') {
      const { canGoLow, canGoHigh } = getRunEndConstraints(combo);
      if (canGoLow && canGoHigh) {
        // Both ends are available — ask the player
        setUIMode({ type: 'wildPlacement', selectedCard: card, targetPlayerIndex: playerIdx, targetComboIndex: comboIdx, combo });
        return;
      }
      // Only one end valid — auto-place
      const end: 'low' | 'high' = canGoHigh ? 'high' : 'low';
      game.playOnHand(playerIdx, comboIdx, card, undefined, end);
      stayInBuildMode(card.id);
      return;
    }

    game.playOnHand(playerIdx, comboIdx, card);
    stayInBuildMode(card.id);
  }

  function handleWildPlacement(end: 'low' | 'high') {
    if (uiMode.type !== 'wildPlacement') return;
    const card = uiMode.selectedCard;
    game.playOnHand(uiMode.targetPlayerIndex, uiMode.targetComboIndex, card, undefined, end);
    stayInBuildMode(card.id);
  }

  function handleHandCardClick(card: CardType) {
    if (isReview || !canAct) return;

    // Clicking a card while in build mode changes which card is selected
    if (uiMode.type === 'buildingOnHand') {
      setUIMode({ type: 'buildingOnHand', selectedCard: card });
      setSelectedIds(new Set([card.id]));
      return;
    }

    // Tapping a card in idle: select it as pending discard (requires confirmation)
    if (uiMode.type === 'idle') {
      if (canDiscard(card)) {
        setSelectedIds(new Set([card.id]));
        setUIMode({ type: 'pendingDiscard', card });
      }
    }

    // Tapping a different card while one is already pending replaces the selection
    if (uiMode.type === 'pendingDiscard') {
      if (canDiscard(card)) {
        setSelectedIds(new Set([card.id]));
        setUIMode({ type: 'pendingDiscard', card });
      } else {
        cancelDiscard();
      }
    }
  }

  // ─── Game over ─────────────────────────────────────────────────────────────
  if (state.gamePhase === 'gameOver' && state.winner) {
    return (
      <GameOverScreen winner={state.winner} players={state.players} onNewGame={onPlayAgain} />
    );
  }

  // ─── Labels & action bar visibility ────────────────────────────────────────
  const currentName = state.players[state.currentPlayerIndex]?.name ?? '';
  let turnLabel = `${currentName}'s turn`;
  if (isHumanTurn) {
    if (isReview)                        turnLabel = 'Review your hand';
    else if (state.turnPhase === 'draw') turnLabel = 'Draw a card';
    else if (isFirstPeek)                turnLabel = 'Keep this card or discard & draw again';
    else if (laidDownThisTurn)           turnLabel = 'Nice! Now discard to end your turn';
    else if (!human.laidDown)            turnLabel = 'Lay down, build, or discard';
    else                                 turnLabel = 'Build on hands or discard';
  }

  // Show "Lay Down" only if: action phase, not yet laid down this game, not just done it this turn
  const showLayDown      = canAct && !human.laidDown && !laidDownThisTurn && uiMode.type === 'idle';
  // Show "Build on Hand" only if: already laid down from a PREVIOUS turn (not the same turn)
  // AND the player has more than 1 card — they must keep a card to discard.
  const canBuild         = canAct && !!human.laidDown && !laidDownThisTurn && human.hand.length > 1;
  const showBuild        = canBuild && uiMode.type === 'idle';
  // Also exit build mode automatically if the hand drops to 1 card mid-build
  const isBuildMode      = uiMode.type === 'buildingOnHand' && human.hand.length > 1;
  const isPendingDiscard = uiMode.type === 'pendingDiscard';
  const pendingDiscardCard = isPendingDiscard
    ? (uiMode as { type: 'pendingDiscard'; card: CardType }).card
    : null;
  const isWildPlacement = uiMode.type === 'wildPlacement';
  const selectedCard = (isBuildMode || isWildPlacement)
    ? (uiMode as { type: 'buildingOnHand'; selectedCard: CardType } | { type: 'wildPlacement'; selectedCard: CardType }).selectedCard
    : null;

  return (
    <div className={styles.root}>

      {/* ── Sidebar levels (desktop/iPad) ────────────────────── */}
      <aside className={styles.sidebar}>
        <LevelsReference
          currentLevel={human.level}
          players={state.players}
          humanPlayerIndex={humanPlayerIndex}
          onClose={() => {}}
          inline
        />
      </aside>

      <div className={styles.board}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div className={styles.topBarRight}>
          <button className={`${styles.levelsBtn} ${styles.levelsBtnMobile}`} onClick={() => setShowLevels(true)}>
            Levels ℹ
          </button>
          <button
            className={styles.newGameBtn}
            onClick={() => { if (window.confirm('Start a new game? Your current game will be lost.')) onPlayAgain(); }}
          >
            New Game
          </button>
        </div>
      </div>

      {/* ── Opponents row ────────────────────────────────────── */}
      <div className={styles.opponents}>
        {opponents.map((player) => {
          const realIdx = state.players.findIndex(p => p.id === player.id);
          return (
            <OpponentArea
              key={player.id}
              player={player}
              isCurrentPlayer={state.currentPlayerIndex === realIdx}
            />
          );
        })}
      </div>

      {/* ── Central piles ────────────────────────────────────── */}
      <div className={styles.centralZone}>
        <CardPile
          deckCount={state.deck.length}
          topDiscard={topDiscard}
          onDrawFromDeck={game.drawFromDeck}
          onDrawFromDiscard={game.drawFromDiscard}
          onFirstPlayerPeek={game.firstPlayerPeek}
          canDrawFromDeck={canDraw}
          canDrawFromDiscard={canDraw && state.discardsThisRound >= 2}
          showFirstPlayerOption={isFirstPlayerOfRound && !isReview}
        />

        {/* Buy bar */}
        {buyOffer && (
          <div className={styles.buyBar}>
            <div className={styles.buyInfo}>
              <span className={styles.buyLabel}>Buy offered</span>
              <span className={styles.buyCardName}>
                {buyOffer.card.rank === '2' ? 'Wild' : `${buyOffer.card.rank} of ${buyOffer.card.suit}`}
              </span>
            </div>
            {canHumanBuy ? (
              <>
                <button className={styles.buyBtn} onClick={game.humanBuy}>
                  Buy <span className={styles.buyTimer}>{buySecondsLeft}s</span>
                </button>
                <button className={styles.buyPassBtn} onClick={game.humanPass}>
                  Pass
                </button>
              </>
            ) : (
              <span className={styles.buyBlocked}>No buys yet</span>
            )}
          </div>
        )}
        {canCallRummy && (
          <div className={styles.buyBar}>
            <div className={styles.buyInfo}>
              <span className={styles.buyLabel}>Rummy chance</span>
              <span className={styles.buyCardName}>
                Call Rummy on {state.rummyPendingDiscard?.rank === '2' ? 'Wild' : `${state.rummyPendingDiscard?.rank} of ${state.rummyPendingDiscard?.suit}`}
              </span>
            </div>
            <button className={styles.buyBtn} onClick={game.callRummy}>
              Rummy
            </button>
          </div>
        )}
      </div>

      {/* ── Laid-down table ──────────────────────────────────── */}
      {state.players.some(p => p.laidDown) && (
        <div className={styles.tableZone}>
          <span className={styles.tableLabel}>Table</span>
          <div className={styles.allLaidDown}>
            {state.players.map((player, pi) => {
              if (!player.laidDown) return null;
              return (
                <div key={player.id} className={styles.playerLaidDown}>
                  <span className={styles.playerLaidDownName}>{player.name}</span>
                  <LaidDownHand
                    combos={player.laidDown.combos}
                    onCardClick={isBuildMode && human.laidDown ? (ci) => handleComboCardClick(pi, ci) : undefined}
                    highlightComboIndex={isBuildMode ? -1 : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────────── */}
      <div className={styles.actionBar}>
        {isReview && isHumanTurn && !isFirstPlayerOfRound && (
          <button className={styles.actionBtn} onClick={() => setUIMode({ type: 'idle' })}>
            Ready — Start Turn
          </button>
        )}
        {isFirstPeek && (
          <>
            <button className={styles.actionBtn} onClick={game.firstPlayerKeep}>
              Keep this card
            </button>
            <button
              className={`${styles.actionBtn} ${styles.cancelBtn}`}
              onClick={game.firstPlayerRedraw}
            >
              Discard &amp; draw again
            </button>
          </>
        )}
        {showLayDown && (
          <button className={styles.actionBtn} onClick={() => setUIMode({ type: 'layDownModal' })}>
            Lay Down Hand
          </button>
        )}
        {showBuild && (
          <button
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={() => {
              const first = human.hand[0];
              if (first) { setUIMode({ type: 'buildingOnHand', selectedCard: first }); setSelectedIds(new Set([first.id])); }
            }}
          >
            Build on Hand
          </button>
        )}
        {isBuildMode && selectedCard && (
          <>
            <span className={styles.actionHint}>Tap a combo above to place {selectedCard.isWild ? 'Wild' : selectedCard.rank}</span>
            <button
              className={styles.actionBtn}
              onClick={() => { setUIMode({ type: 'idle' }); setSelectedIds(new Set()); }}
            >
              Done
            </button>
          </>
        )}
        {isWildPlacement && selectedCard && (
          <>
            <span className={styles.actionHint}>
              Place Wild at which end of the run?
            </span>
            <button
              className={styles.actionBtn}
              onClick={() => handleWildPlacement('low')}
            >
              Low end ←
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => handleWildPlacement('high')}
            >
              → High end
            </button>
            <button
              className={`${styles.actionBtn} ${styles.cancelBtn}`}
              onClick={() => { setUIMode({ type: 'idle' }); setSelectedIds(new Set()); }}
            >
              Cancel
            </button>
          </>
        )}
        {isPendingDiscard && pendingDiscardCard && (
          <>
            <button
              className={styles.actionBtn}
              onClick={() => handleDiscard(pendingDiscardCard)}
            >
              Discard {pendingDiscardCard.rank} ✓
            </button>
            <button
              className={`${styles.actionBtn} ${styles.cancelBtn}`}
              onClick={cancelDiscard}
            >
              Cancel
            </button>
          </>
        )}
        {canAct && uiMode.type === 'idle' && (
          <span className={styles.actionHint}>Tap a card to discard (not wilds)</span>
        )}
      </div>

      {/* ── Human hand ───────────────────────────────────────── */}
      <div className={styles.handArea}>
        <div className={styles.handMeta}>
          <div className={styles.myLevel}>
            <span className={styles.myLevelNum}>{human.level}</span>
            <span className={styles.myLevelLabel}>
              {human.laidDown ? '✓ laid down' : `Level ${human.level}`}
            </span>
          </div>
          <div className={styles.turnInfo}>
            <span className={isHumanTurn ? styles.myTurn : styles.theirTurn}>{turnLabel}</span>
            {!isHumanTurn && lastAIAction && (
              <span className={styles.aiActionLabel}>{lastAIAction}</span>
            )}
          </div>
          <div className={styles.sortControls}>
            <button className={styles.sortBtn} onClick={sortByRank} title="Sort by rank">
              1→K
            </button>
            <button className={styles.sortBtn} onClick={sortBySuit} title="Sort by suit">
              ♠♥
            </button>
          </div>
        </div>
        <PlayerHand
          cards={handOrder.length > 0 ? handOrder : human.hand}
          selectedIds={selectedIds}
          onCardClick={handleHandCardClick}
          onReorder={setHandOrder}
          disabled={!isHumanTurn || isReview}
          draggable={true}
        />
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      {uiMode.type === 'layDownModal' && (
        <LayDownModal
          hand={handOrder.length > 0 ? handOrder : human.hand}
          level={human.level}
          onConfirm={handleLayDownConfirm}
          onCancel={() => setUIMode({ type: 'idle' })}
        />
      )}
      {showRoundSummary && state.gamePhase === 'playing' && roundSummaryData && (
        <RoundSummary
          players={roundSummaryData.players}
          roundNumber={roundSummaryData.roundNumber}
          onContinue={() => {
            setShowRoundSummary(false);
            setRoundSummaryData(null);
          }}
        />
      )}
      {showLevels && (
        <LevelsReference
          currentLevel={human.level}
          players={state.players}
          humanPlayerIndex={humanPlayerIndex}
          onClose={() => setShowLevels(false)}
        />
      )}
    </div>
    </div>
  );
}
