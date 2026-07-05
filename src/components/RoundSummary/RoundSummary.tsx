import type { Player } from '../../game/types';
import styles from './RoundSummary.module.css';

interface RoundSummaryProps {
  players: Player[];
  roundNumber: number;
  onContinue: () => void;
}

export function RoundSummary({ players, roundNumber, onContinue }: RoundSummaryProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Round {roundNumber} over</h2>

        <div className={styles.list}>
          {players.map(p => (
            <div key={p.id} className={`${styles.row} ${p.laidDown ? styles.advanced : styles.stayed}`}>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.status}>
                {p.laidDown ? `Moves on to Level ${p.level + 1}` : `stays on Level ${p.level}`}
              </span>
            </div>
          ))}
        </div>

        <button className={styles.btn} onClick={onContinue}>
          Next Round
        </button>
      </div>
    </div>
  );
}
