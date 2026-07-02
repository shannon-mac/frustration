import { useState, useRef, useCallback } from 'react';
import type { Card as CardType, Combo, ComboType } from '../../game/types';
import { LEVELS, getLevelComboTypes, minCardsForLevel, validateLayDownCardCount, validateLevelCombo } from '../../game/rules';
import { Card } from '../Card/Card';
import styles from './LayDownModal.module.css';

interface LayDownModalProps {
  hand: CardType[];
  level: number;
  onConfirm: (combos: Combo[]) => void;
  onCancel: () => void;
}

// ─── Touch drag state ───────────────────────────────────────────────────────
interface TouchDrag {
  cardId: string;
  source: 'hand' | number;
  ghostEl: HTMLDivElement;
  offsetX: number;
  offsetY: number;
}

export function LayDownModal({ hand, level, onConfirm, onCancel }: LayDownModalProps) {
  const def = LEVELS[level - 1];
  const comboTypes = getLevelComboTypes(level);

  // Each slot holds an array of card IDs assigned to it
  const [slots, setSlots] = useState<string[][]>(() => comboTypes.map(() => []));
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<'hand' | number>('hand'); // 'hand' or slot index
  const [activeTouchSlot, setActiveTouchSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for slot DOM nodes so touch can do elementFromPoint lookups
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const handAreaRef = useRef<HTMLDivElement>(null);
  const touchDragRef = useRef<TouchDrag | null>(null);

  // Cards not yet assigned to any slot
  const assignedIds = new Set(slots.flat());
  const availableCards = hand.filter(c => !assignedIds.has(c.id));

  const cardById = (id: string) => hand.find(c => c.id === id)!;

  function buildCombos(): Combo[] {
    return slots.map((ids, i) => ({
      type: comboTypes[i],
      cards: ids.map(cardById),
    }));
  }

  // ─── HTML5 Drag handlers (desktop) ─────────────────────────────────────────

  function onCardDragStart(e: React.DragEvent, cardId: string, source: 'hand' | number) {
    setDragCardId(cardId);
    setDragSource(source);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onSlotDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDropToSlot(e: React.DragEvent, slotIdx: number) {
    e.preventDefault();
    if (!dragCardId) return;

    setSlots(prev => {
      const next = prev.map(s => [...s]);
      // Remove from source
      if (dragSource === 'hand') {
        // just add to slot
      } else {
        const srcIdx = dragSource as number;
        next[srcIdx] = next[srcIdx].filter(id => id !== dragCardId);
      }
      // Add to target slot (avoid duplicates)
      if (!next[slotIdx].includes(dragCardId)) {
        next[slotIdx] = [...next[slotIdx], dragCardId];
      }
      return next;
    });

    setDragCardId(null);
    setError(null);
  }

  function onDropToHand(e: React.DragEvent) {
    e.preventDefault();
    if (!dragCardId) return;
    if (typeof dragSource === 'number') {
      const srcIdx = dragSource as number;
      setSlots(prev => {
        const next = prev.map(s => [...s]);
        next[srcIdx] = next[srcIdx].filter(id => id !== dragCardId);
        return next;
      });
    }
    setDragCardId(null);
  }

  // ─── Touch drag handlers (mobile) ──────────────────────────────────────────

  function getSlotUnderPoint(x: number, y: number): number | 'hand' | null {
    // Check each slot
    for (let i = 0; i < slotRefs.current.length; i++) {
      const el = slotRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    // Check hand area
    if (handAreaRef.current) {
      const r = handAreaRef.current.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'hand';
    }
    return null;
  }

  const onCardTouchStart = useCallback((
    e: React.TouchEvent,
    cardId: string,
    source: 'hand' | number,
    cardEl: HTMLElement,
  ) => {
    // Only initiate drag after a tiny move threshold — handled in touchmove
    const touch = e.touches[0];
    const rect = cardEl.getBoundingClientRect();

    // Create a floating ghost clone
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.85;
      transform: scale(1.1);
      transition: none;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
    `;
    // Copy visual from the card element
    ghost.innerHTML = cardEl.outerHTML;
    // Strip any pointer-events from the clone's children
    ghost.querySelectorAll('*').forEach((el: Element) => {
      (el as HTMLElement).style.pointerEvents = 'none';
    });
    document.body.appendChild(ghost);

    touchDragRef.current = {
      cardId,
      source,
      ghostEl: ghost,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
    };
  }, []);

  const onCardTouchMove = useCallback((e: React.TouchEvent) => {
    const drag = touchDragRef.current;
    if (!drag) return;
    e.preventDefault(); // prevent page scroll while dragging

    const touch = e.touches[0];
    const x = touch.clientX - drag.offsetX;
    const y = touch.clientY - drag.offsetY;
    drag.ghostEl.style.left = `${x}px`;
    drag.ghostEl.style.top = `${y}px`;

    // Highlight target slot
    const target = getSlotUnderPoint(touch.clientX, touch.clientY);
    setActiveTouchSlot(typeof target === 'number' ? target : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCardTouchEnd = useCallback((e: React.TouchEvent) => {
    const drag = touchDragRef.current;
    if (!drag) return;

    // Clean up ghost
    drag.ghostEl.remove();
    touchDragRef.current = null;
    setActiveTouchSlot(null);

    const touch = e.changedTouches[0];
    const target = getSlotUnderPoint(touch.clientX, touch.clientY);

    if (typeof target === 'number') {
      // Drop into slot
      setSlots(prev => {
        const next = prev.map(s => [...s]);
        if (drag.source !== 'hand') {
          next[drag.source as number] = next[drag.source as number].filter(id => id !== drag.cardId);
        }
        if (!next[target].includes(drag.cardId)) {
          next[target] = [...next[target], drag.cardId];
        }
        return next;
      });
      setError(null);
    } else if (target === 'hand' && drag.source !== 'hand') {
      // Return to hand
      setSlots(prev => {
        const next = prev.map(s => [...s]);
        next[drag.source as number] = next[drag.source as number].filter(id => id !== drag.cardId);
        return next;
      });
    }
    // If target is null (dropped outside) do nothing — card stays where it was
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Click-to-assign (tap fallback) ────────────────────────────────────────

  const [pendingCard, setPendingCard] = useState<string | null>(null);

  function onHandCardClick(cardId: string) {
    if (pendingCard === cardId) {
      setPendingCard(null);
    } else {
      setPendingCard(cardId);
    }
  }

  function onSlotClick(slotIdx: number) {
    if (!pendingCard) return;
    setSlots(prev => {
      const next = prev.map(s => [...s]);
      if (!next[slotIdx].includes(pendingCard)) {
        next[slotIdx] = [...next[slotIdx], pendingCard];
      }
      return next;
    });
    setPendingCard(null);
    setError(null);
  }

  function removeFromSlot(slotIdx: number, cardId: string) {
    setSlots(prev => {
      const next = prev.map(s => [...s]);
      next[slotIdx] = next[slotIdx].filter(id => id !== cardId);
      return next;
    });
  }

  // ─── Confirm ───────────────────────────────────────────────────────────────

  function handleConfirm() {
    const combos = buildCombos();
    if (!validateLevelCombo(level, combos)) {
      setError('Invalid combo — check card groups and try again.');
      return;
    }
    if (!validateLayDownCardCount(hand, level, combos)) {
      const min = minCardsForLevel(level);
      const submitted = combos.reduce((s, c) => s + c.cards.length, 0);
      setError(
        `You can only lay down the ${min} required cards. ` +
        `You have ${submitted} selected — remove ${submitted - min} extra card${submitted - min !== 1 ? 's' : ''}, ` +
        `unless you are going out or have exactly one card left to discard.`
      );
      return;
    }
    onConfirm(combos);
  }

  // ─── Level description ──────────────────────────────────────────────────────

  function slotLabel(type: ComboType, idx: number): string {
    const sameType = comboTypes.filter(t => t === type);
    const position = comboTypes.slice(0, idx + 1).filter(t => t === type).length;
    const minSize = type === 'set' ? def.sets[position - 1] : def.runs[position - 1];
    const current = slots[idx].length;
    const qualifier = type === 'run' ? ` (same suit)` : ` (same rank)`;
    const countPart = current > 0 ? ` — ${current}/${minSize}` : ` — need ${minSize}`;
    return `${type.charAt(0).toUpperCase() + type.slice(1)}${sameType.length > 1 ? ` ${position}` : ''}${qualifier}${countPart}`;
  }

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Lay Down — Level {level}</h2>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {/* Combo slots */}
        <div className={styles.slots}>
          {slots.map((slotCards, i) => (
            <div
              key={i}
              ref={el => { slotRefs.current[i] = el; }}
              className={[
                styles.slot,
                comboTypes[i] === 'run' ? styles.runSlot : styles.setSlot,
                activeTouchSlot === i ? styles.touchDropTarget : '',
              ].filter(Boolean).join(' ')}
              onDragOver={onSlotDragOver}
              onDrop={e => onDropToSlot(e, i)}
              onClick={() => onSlotClick(i)}
            >
              <span className={styles.slotLabel}>{slotLabel(comboTypes[i], i)}</span>
              <div className={styles.slotCards}>
                {slotCards.length === 0 && (
                  <span className={styles.slotHint}>
                    {pendingCard ? 'Tap to place here' : 'Drag or tap a card'}
                  </span>
                )}
                {slotCards.map(id => {
                  const c = cardById(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={e => onCardDragStart(e, id, i)}
                      onTouchStart={e => onCardTouchStart(e, id, i, e.currentTarget)}
                      onTouchMove={onCardTouchMove}
                      onTouchEnd={onCardTouchEnd}
                      className={styles.slotCard}
                    >
                      <Card card={c} small onClick={() => removeFromSlot(i, id)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Hand area */}
        <div
          ref={handAreaRef}
          className={styles.handArea}
          onDragOver={onSlotDragOver}
          onDrop={onDropToHand}
        >
          <span className={styles.handLabel}>Your hand</span>
          <div className={styles.handCards}>
            {availableCards.map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={e => onCardDragStart(e, card.id, 'hand')}
                onTouchStart={e => onCardTouchStart(e, card.id, 'hand', e.currentTarget)}
                onTouchMove={onCardTouchMove}
                onTouchEnd={onCardTouchEnd}
                className={pendingCard === card.id ? styles.pending : ''}
              >
                <Card
                  card={card}
                  selected={pendingCard === card.id}
                  onClick={() => onHandCardClick(card.id)}
                />
              </div>
            ))}
            {availableCards.length === 0 && (
              <span className={styles.allAssigned}>All cards assigned ✓</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            Lay Down ✓
          </button>
        </div>
      </div>
    </div>
  );
}
