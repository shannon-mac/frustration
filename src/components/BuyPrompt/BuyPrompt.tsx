import { useEffect, useState } from 'react';
import type { BuyOffer } from '../../hooks/useGameState';
import { BUY_WINDOW_MS } from '../../hooks/useGameState';
import { Card } from '../Card/Card';
import styles from './BuyPrompt.module.css';

interface BuyPromptProps {
  prompt: BuyOffer;
  onBuy: () => void;
  onPass: () => void;
}

export function BuyPrompt({ prompt, onBuy, onPass }: BuyPromptProps) {
  const [remaining, setRemaining] = useState(BUY_WINDOW_MS);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, BUY_WINDOW_MS - elapsed);
      setRemaining(left);
      if (left === 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [prompt.offeredAt]);

  const pct = (remaining / BUY_WINDOW_MS) * 100;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Buy this card?</h2>
        <p className={styles.sub}>+1 card penalty from deck</p>

        <div className={styles.cardWrapper}>
          <Card card={prompt.card} />
        </div>

        <div className={styles.timerBar}>
          <div className={styles.timerFill} style={{ width: `${pct}%` }} />
          <span className={styles.timerLabel}>{seconds}s</span>
        </div>

        <div className={styles.buttons}>
          <button className={styles.btnBuy} onClick={onBuy}>
            ✓ BUY
          </button>
          <button className={styles.btnPass} onClick={onPass}>
            ✗ PASS
          </button>
        </div>
      </div>
    </div>
  );
}
