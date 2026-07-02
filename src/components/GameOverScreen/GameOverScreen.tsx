import type { Player } from '../../game/types';
import styles from './GameOverScreen.module.css';

interface GameOverScreenProps {
  winner: Player;
  players: Player[];
  onNewGame: () => void;
}

export function GameOverScreen({ winner, players, onNewGame }: GameOverScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.trophy}>🏆</div>
        <h1 className={styles.title}>
          {winner.isHuman ? 'You won!' : `${winner.name} wins!`}
        </h1>
        <p className={styles.sub}>
          {winner.isHuman
            ? 'Congratulations — you completed all 10 levels!'
            : `${winner.name} completed all 10 levels first.`}
        </p>

        <div className={styles.levelSummary}>
          <h3 className={styles.summaryTitle}>Final Levels</h3>
          {[...players].sort((a, b) => b.level - a.level).map(p => (
            <div key={p.id} className={`${styles.playerRow} ${p.id === winner.id ? styles.winner : ''}`}>
              <span className={styles.playerName}>{p.name}</span>
              <div className={styles.levelBar}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`${styles.levelPip} ${i < p.level - 1 ? styles.done : ''}`}
                  />
                ))}
              </div>
              <span className={styles.levelNum}>Lvl {Math.min(p.level, 10)}</span>
            </div>
          ))}
        </div>

        <button className={styles.btn} onClick={onNewGame}>
          New Game
        </button>
      </div>
    </div>
  );
}
