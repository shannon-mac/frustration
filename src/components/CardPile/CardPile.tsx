import type { Card as CardType } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './CardPile.module.css';

interface CardPileProps {
  deckCount: number;
  topDiscard: CardType | null;
  onDrawFromDeck: () => void;
  onDrawFromDiscard: () => void;
  onFirstPlayerRedraw?: () => void;
  canDrawFromDeck: boolean;
  canDrawFromDiscard: boolean;
  showFirstPlayerOption?: boolean;
}

export function CardPile({
  deckCount,
  topDiscard,
  onDrawFromDeck,
  onDrawFromDiscard,
  onFirstPlayerRedraw,
  canDrawFromDeck,
  canDrawFromDiscard,
  showFirstPlayerOption,
}: CardPileProps) {
  return (
    <div className={styles.piles}>
      {/* Draw deck */}
      <div className={styles.pileWrapper}>
        <div
          className={`${styles.pile} ${canDrawFromDeck ? styles.clickable : ''}`}
          onClick={canDrawFromDeck ? onDrawFromDeck : undefined}
          role={canDrawFromDeck ? 'button' : undefined}
          tabIndex={canDrawFromDeck ? 0 : undefined}
          onKeyDown={canDrawFromDeck ? (e) => e.key === 'Enter' && onDrawFromDeck() : undefined}
        >
          <Card
            card={{ id: 'deck', rank: '3', suit: 'spades', isWild: false }}
            faceDown
          />
          <span className={styles.badge}>{deckCount}</span>
        </div>
        <span className={styles.label}>Deck</span>
        {showFirstPlayerOption && onFirstPlayerRedraw && (
          <button className={styles.redrawBtn} onClick={onFirstPlayerRedraw}>
            Peek & Redraw
          </button>
        )}
      </div>

      {/* Discard pile */}
      <div className={styles.pileWrapper}>
        <div
          className={`${styles.pile} ${canDrawFromDiscard && topDiscard ? styles.clickable : ''}`}
          onClick={canDrawFromDiscard && topDiscard ? onDrawFromDiscard : undefined}
          role={canDrawFromDiscard && topDiscard ? 'button' : undefined}
          tabIndex={canDrawFromDiscard && topDiscard ? 0 : undefined}
          onKeyDown={canDrawFromDiscard && topDiscard ? (e) => e.key === 'Enter' && onDrawFromDiscard() : undefined}
        >
          {topDiscard ? (
            <Card card={topDiscard} />
          ) : (
            <div className={styles.emptyPile}>
              <span>Empty</span>
            </div>
          )}
        </div>
        <span className={styles.label}>Discard</span>
      </div>
    </div>
  );
}
