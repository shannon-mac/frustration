import { useState, useRef, useEffect, useCallback } from 'react';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [overlap, setOverlap] = useState<number>(-14);

  // Pointer-drag state kept in a ref so move/up handlers are always current
  const dragState = useRef<{
    pointerId: number;
    fromIdx: number;
    hasMoved: boolean;
  } | null>(null);

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

  // Hit-test pointer coordinates against card wrapper elements to find slot index
  function slotAtPoint(x: number, y: number): number | null {
    const els = cardWrapperRefs.current;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  }

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    dragState.current.hasMoved = true;
    const over = slotAtPoint(e.clientX, e.clientY);
    setDragOverIdx(over !== dragState.current.fromIdx ? over : null);
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    const { fromIdx, hasMoved } = dragState.current;
    dragState.current = null;

    const toIdx = slotAtPoint(e.clientX, e.clientY);
    setDragIdx(null);
    setDragOverIdx(null);

    if (!hasMoved) {
      // Tap (no movement) — treat as a card click
      if (toIdx !== null) onCardClick(displayCards[toIdx]);
      return;
    }

    if (toIdx === null || toIdx === fromIdx) return;

    setLocalOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onReorder?.(next);
      return next;
    });
  }, [handlePointerMove, onReorder, onCardClick, displayCards]);

  function handlePointerDown(e: React.PointerEvent, idx: number) {
    if (!draggable) return;
    // Only primary button (left-click / first touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Capture so we keep receiving events even outside the element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragState.current = { pointerId: e.pointerId, fromIdx: idx, hasMoved: false };
    setDragIdx(idx);
    setDragOverIdx(null);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.hand}>
        {displayCards.map((card, idx) => (
          <div
            key={card.id}
            ref={el => { cardWrapperRefs.current[idx] = el; }}
            className={[
              styles.cardWrapper,
              dragIdx === idx ? styles.dragging : '',
              dragOverIdx === idx && dragIdx !== idx ? styles.dropTarget : '',
              draggable ? styles.draggable : '',
            ].filter(Boolean).join(' ')}
            style={{ '--card-overlap': `${overlap}px` } as React.CSSProperties}
            onPointerDown={e => handlePointerDown(e, idx)}
          >
            <Card
              card={card}
              selected={selectedIds.has(card.id)}
              dimmed={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
