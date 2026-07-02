import type { Player } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './OpponentArea.module.css';

interface OpponentAreaProps {
  player: Player;
  isCurrentPlayer: boolean;
}

export function OpponentArea({ player, isCurrentPlayer }: OpponentAreaProps) {
  return (
    <div className={`${styles.area} ${isCurrentPlayer ? styles.active : ''}`}>
      <div className={styles.header}>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.level}>Lvl {player.level}</span>
        {isCurrentPlayer && <span className={styles.turnBadge}>thinking…</span>}
        {player.laidDown && <span className={styles.laidDownBadge}>✓</span>}
      </div>

      {/* Face-down hand stack — cap at 4 visible cards to stay within tile width */}
      <div className={styles.handRow}>
        <div className={styles.handStack}>
          {Array.from({ length: Math.min(player.hand.length, 4) }).map((_, i) => (
            <Card
              key={i}
              card={{ id: `back-${i}`, rank: '3', suit: 'spades', isWild: false }}
              faceDown
              small
            />
          ))}
        </div>
        <span className={styles.handCount}>{player.hand.length}</span>
      </div>
    </div>
  );
}
