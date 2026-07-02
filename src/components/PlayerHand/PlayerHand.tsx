import { useState, useRef } from 'react';
import type { Card as CardType } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './PlayerHand.module.css';

interface PlayerHandProps {
  cards: CardType[];
  selectedIds: Set<string>;
  onCardClick: (card: CardType) => void;
  onReorder?: (newCards: CardType[]) => void;
  disabled?: boolean;
  draggable?: boolean;
}

export function PlayerHand({ cards, selectedIds, onCardClick, onReorder, disabled, draggable }: PlayerHandProps) {
  const [localOrder, setLocalOrder] = useState<CardType[]>(cards);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const isDraggingRef = useRef(false);

  // Sync local order when cards prop changes (new round deal etc.)
  // Only reset if the card IDs have actually changed
  const prevCardIds = useRef<string>(cards.map(c => c.id).join(','));
  const currentCardIds = cards.map(c => c.id).join(',');
  if (prevCardIds.current !== currentCardIds) {
    prevCardIds.current = currentCardIds;
    setLocalOrder(cards);
  }

  const displayCards = localOrder.filter(c => cards.some(h => h.id === c.id));

  function onDragStart(e: React.DragEvent, idx: number) {
    isDraggingRef.current = true;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...displayCards];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setLocalOrder(next);
    onReorder?.(next);
    setDragIdx(null);
    setDragOverIdx(null);
    isDraggingRef.current = false;
  }

  function onDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
    isDraggingRef.current = false;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.hand}>
        {displayCards.map((card, idx) => (
          <div
            key={card.id}
            className={[
              styles.cardWrapper,
              dragIdx === idx ? styles.dragging : '',
              dragOverIdx === idx && dragIdx !== idx ? styles.dropTarget : '',
            ].filter(Boolean).join(' ')}
            draggable={draggable && !disabled}
            onDragStart={e => onDragStart(e, idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={e => onDrop(e, idx)}
            onDragEnd={onDragEnd}
          >
            <Card
              card={card}
              selected={selectedIds.has(card.id)}
              onClick={disabled ? undefined : () => onCardClick(card)}
              dimmed={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
