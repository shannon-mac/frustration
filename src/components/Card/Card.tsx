import type { Card as CardType } from '../../game/types';
import styles from './Card.module.css';

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  dimmed?: boolean;
  small?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

export function Card({ card, faceDown, selected, onClick, draggable, onDragStart, dimmed, small }: CardProps) {
  if (faceDown) {
    return (
      <div className={`${styles.card} ${styles.faceDown} ${small ? styles.small : ''}`} />
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOL[card.suit];

  return (
    <div
      className={[
        styles.card,
        isRed ? styles.red : styles.black,
        card.isWild ? styles.wild : '',
        selected ? styles.selected : '',
        dimmed ? styles.dimmed : '',
        small ? styles.small : '',
        onClick ? styles.clickable : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <span className={styles.cornerTop}>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.suit}>{symbol}</span>
      </span>
      <span className={styles.centerSuit}>{symbol}</span>
      <span className={styles.cornerBottom}>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.suit}>{symbol}</span>
      </span>
      {card.isWild && <span className={styles.wildBadge}>W</span>}
    </div>
  );
}
