import { useState } from 'react';
import styles from './GameSetup.module.css';

interface GameSetupProps {
  onStart: (playerCount: number) => void;
}

export function GameSetup({ onStart }: GameSetupProps) {
  const [count, setCount] = useState(3);

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.logo}>
          <span className={styles.logoSuit}>♠</span>
          <h1 className={styles.title}>Frustration</h1>
          <span className={styles.logoSuit}>♥</span>
        </div>
        <p className={styles.subtitle}>The family card game</p>
        <div className={styles.divider} />

        <div className={styles.section}>
          <label className={styles.sectionLabel}>Number of computer opponents</label>
          <div className={styles.countPicker}>
            {[2, 3, 4, 5].map(n => (
              <button
                key={n}
                className={`${styles.countBtn} ${count === n ? styles.active : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{count + 1} players total</p>
        </div>

        <button className={styles.startBtn} onClick={() => onStart(count + 1)}>
          Deal Cards
        </button>

        <div className={styles.suits}>
          <span>♣</span><span>♦</span><span>♥</span><span>♠</span>
        </div>
      </div>
    </div>
  );
}
