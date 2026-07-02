import { useEffect, useRef, useState } from 'react';
import type { Card as CardType, Combo } from '../../game/types';
import { canDiscard } from '../../game/rules';
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
  | { type: 'buildingOnHand'; selectedCard: CardType };

export function GameBoard({ game, onPlayAgain }: GameBoardProps) {
  const { state, buyOffer, isHumanTurn, humanPlayerIndex } = game;

  const [uiMode, setUIMode] = useState<UIMode>({ type: 'review' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [prevRound, setPrevRound] = useState(state.roundNumber);
  // Track whether the human just laid down this turn so we can show "Build on Hand"
  const [laidDownThisTurn, setLaidDownThisTurn] = useState(false);

  // Buy timer display
  const [buySecondsLeft, setBuySecondsLeft] = useState(0);
  const buyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect round transition → show summary then review
  if (state.roundNumber !== prevRound && !showRoundSummary) {
    setShowRoundSummary(true);
    setPrevRound(state.roundNumber);
    setUIMode({ type: 'review' });
    setLaidDownThisTurn(false);
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
  const isReview = uiMode.type === 'review';

  // The engine uses 'action' for both the lay-down/build phase AND discard.
  // 'draw' = hasn't drawn yet; 'action' = has drawn, can lay down / build / discard.
  const canDraw = isHumanTurn && state.turnPhase === 'draw' && !isReview;
  const canAct  = isHumanTurn && state.turnPhase === 'action' && !isReview;

  const isFirstPlayerOfRound =
    isHumanTurn &&
    state.turnPhase === 'draw' &&
    state.discardsThisRound === 0 &&
    state.currentPlayerIndex === (state.dealerIndex + 1) % state.players.length;

  const canHumanBuy = !!buyOffer && state.discardsThisRound >= 2;
  const opponents = state.players.filter((_, i) => i !== humanPlayerIndex);

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

  function handleComboCardClick(playerIdx: number, comboIdx: number) {
    if (uiMode.type !== 'buildingOnHand') return;
    if (!human.laidDown) return;
    game.playOnHand(playerIdx, comboIdx, uiMode.selectedCard);
    setSelectedIds(new Set());
    setUIMode({ type: 'idle' });
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
    else if (laidDownThisTurn)           turnLabel = 'Nice! Now discard to end your turn';
    else if (!human.laidDown)            turnLabel = 'Lay down, build, or discard';
    else                                 turnLabel = 'Build on hands or discard';
  }

  // Show "Lay Down" only if: action phase, not yet laid down this game, not just done it this turn
  const showLayDown      = canAct && !human.laidDown && !laidDownThisTurn && uiMode.type === 'idle';
  // Show "Build on Hand" only if: already laid down from a PREVIOUS turn (not the same turn)
  const showBuild        = canAct && !!human.laidDown && !laidDownThisTurn && uiMode.type === 'idle';
  const isBuildMode      = uiMode.type === 'buildingOnHand';
  const isPendingDiscard = uiMode.type === 'pendingDiscard';
  const pendingDiscardCard = isPendingDiscard
    ? (uiMode as { type: 'pendingDiscard'; card: CardType }).card
    : null;
  const selectedCard = isBuildMode
    ? (uiMode as { type: 'buildingOnHand'; selectedCard: CardType }).selectedCard
    : null;

  return (
    <div className={styles.board}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div className={styles.myLevel}>
          <span className={styles.myLevelNum}>{human.level}</span>
          <span className={styles.myLevelLabel}>
            {human.laidDown ? '✓ laid down' : `Level ${human.level}`}
          </span>
        </div>
        <div className={styles.turnStatus}>
          <span className={isHumanTurn ? styles.myTurn : styles.theirTurn}>{turnLabel}</span>
        </div>
        <button className={styles.levelsBtn} onClick={() => setShowLevels(true)}>
          Levels ℹ
        </button>
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
          onFirstPlayerRedraw={game.firstPlayerRedraw}
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
        {isReview && isHumanTurn && (
          <button className={styles.actionBtn} onClick={() => setUIMode({ type: 'idle' })}>
            Ready — Start Turn
          </button>
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
            <span className={styles.actionHint}>Tap a combo above to place {selectedCard.rank}</span>
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
          <span className={styles.handCount}>{human.hand.length} cards in hand</span>
          {canAct && !isReview && <span className={styles.turnHint}>Your turn</span>}
          {isReview && isHumanTurn && <span className={styles.reviewHint}>Review your hand before acting ↓</span>}
        </div>
        <PlayerHand
          cards={human.hand}
          selectedIds={selectedIds}
          onCardClick={handleHandCardClick}
          onReorder={(_cards) => {}}
          disabled={!isHumanTurn || isReview}
          draggable={true}
        />
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      {uiMode.type === 'layDownModal' && (
        <LayDownModal
          hand={human.hand}
          level={human.level}
          onConfirm={handleLayDownConfirm}
          onCancel={() => setUIMode({ type: 'idle' })}
        />
      )}
      {showRoundSummary && state.gamePhase === 'playing' && (
        <RoundSummary
          players={state.players}
          roundNumber={state.roundNumber}
          onContinue={() => setShowRoundSummary(false)}
        />
      )}
      {showLevels && (
        <LevelsReference currentLevel={human.level} onClose={() => setShowLevels(false)} />
      )}
    </div>
  );
}
