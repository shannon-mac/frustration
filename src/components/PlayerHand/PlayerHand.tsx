import { useState, useRef, useEffect } from 'react';
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

// Card width in px (must match Card.module.css)
const CARD_WIDTH = 62;
// Minimum visible width per card so at least a sliver is always showing
const MIN_VISIBLE = 20;

export function PlayerHand({ cards, selectedIds, onCardClick, onReorder, disabled, draggable }: PlayerHandProps) {
  const [localOrder, setLocalOrder] = useState<CardType[]>(cards);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [overlap, setOverlap] = useState<number>(-14);

  // Sync local order when cards prop changes (new round deal etc.)
  // Only reset if the card IDs have actually changed
  const prevCardIds = useRef<string>(cards.map(c => c.id).join(','));
  const currentCardIds = cards.map(c => c.id).join(',');
  if (prevCardIds.current !== currentCardIds) {
    prevCardIds.current = currentCardIds;
    setLocalOrder(cards);
  }

  const displayCards = localOrder.filter(c => cards.some(h => h.id === c.id));

  // Compute overlap so all cards fit in the wrapper on narrow screens
  useEffect(() => {
    function compute() {
      if (!wrapperRef.current) return;
      const count = displayCards.length;
      if (count <= 1) { setOverlap(-14); return; }
      const available = wrapperRef.current.offsetWidth - 32; // 32 = 2×16px padding
      // Total width needed with default overlap (-14px means 48px visible per card)
      const defaultVisible = CARD_WIDTH + 14; // 48px per non-last card + full last
      const defaultTotal = defaultVisible * (count - 1) + CARD_WIDTH;
      if (defaultTotal <= available) { setOverlap(-14); return; }
      // Solve: visiblePerCard * (count-1) + CARD_WIDTH <= available
      const visiblePerCard = Math.max(MIN_VISIBLE, Math.floor((available - CARD_WIDTH) / (count - 1)));
      setOverlap(visiblePerCard - CARD_WIDTH); // negative margin-right
    }
    compute();
    const ro = new ResizeObserver(compute);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCards.length]);

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
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.hand}>
        {displayCards.map((card, idx) => (
          <div
            key={card.id}
            className={[
              styles.cardWrapper,
              dragIdx === idx ? styles.dragging : '',
              dragOverIdx === idx && dragIdx !== idx ? styles.dropTarget : '',
            ].filter(Boolean).join(' ')}
            style={{ '--card-overlap': `${overlap}px` } as React.CSSProperties}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={e => onDrop(e, idx)}
          >
            <Card
              card={card}
              selected={selectedIds.has(card.id)}
              onClick={disabled ? undefined : () => onCardClick(card)}
              dimmed={disabled}
              draggable={draggable && !disabled}
              onDragStart={e => onDragStart(e, idx)}
              onDragEnd={onDragEnd}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
