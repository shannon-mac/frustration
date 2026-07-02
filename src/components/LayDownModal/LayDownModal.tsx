import { useState } from 'react';
import type { Card as CardType, Combo, ComboType } from '../../game/types';
import { LEVELS, getLevelComboTypes, validateLevelCombo } from '../../game/rules';
import { Card } from '../Card/Card';
import styles from './LayDownModal.module.css';

interface LayDownModalProps {
  hand: CardType[];
  level: number;
  onConfirm: (combos: Combo[]) => void;
  onCancel: () => void;
}

export function LayDownModal({ hand, level, onConfirm, onCancel }: LayDownModalProps) {
  const def = LEVELS[level - 1];
  const comboTypes = getLevelComboTypes(level);

  // Each slot holds an array of card IDs assigned to it
  const [slots, setSlots] = useState<string[][]>(() => comboTypes.map(() => []));
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<'hand' | number>('hand'); // 'hand' or slot index
  const [error, setError] = useState<string | null>(null);

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

  // ─── Drag handlers ─────────────────────────────────────────────────────────

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

  // ─── Click-to-assign (mobile fallback) ─────────────────────────────────────

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
    onConfirm(combos);
  }

  // ─── Level description ──────────────────────────────────────────────────────

  function slotLabel(type: ComboType, idx: number): string {
    const sameType = comboTypes.filter(t => t === type);
    const position = comboTypes.slice(0, idx + 1).filter(t => t === type).length;
    const size = type === 'set' ? def.sets[position - 1] : def.runs[position - 1];
    const qualifier = type === 'run' ? ` (same suit, min ${size})` : ` (same rank, min ${size})`;
    return `${type.charAt(0).toUpperCase() + type.slice(1)}${sameType.length > 1 ? ` ${position}` : ''}${qualifier}`;
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
              className={`${styles.slot} ${comboTypes[i] === 'run' ? styles.runSlot : styles.setSlot}`}
              onDragOver={onSlotDragOver}
              onDrop={e => onDropToSlot(e, i)}
              onClick={() => onSlotClick(i)}
            >
              <span className={styles.slotLabel}>{slotLabel(comboTypes[i], i)}</span>
              <div className={styles.slotCards}>
                {slotCards.length === 0 && (
                  <span className={styles.slotHint}>
                    {pendingCard ? 'Tap to place here' : 'Drag cards here'}
                  </span>
                )}
                {slotCards.map(id => {
                  const c = cardById(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={e => onCardDragStart(e, id, i)}
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
