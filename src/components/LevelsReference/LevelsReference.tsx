import type { Player } from '../../game/types';
import { LEVELS } from '../../game/rules';
import styles from './LevelsReference.module.css';

interface LevelsReferenceProps {
  currentLevel: number;
  players: Player[];
  humanPlayerIndex: number;
  onClose: () => void;
  /** When true, renders as an inline sidebar panel instead of a modal overlay */
  inline?: boolean;
}

const LEVEL_NAMES: string[] = [
  '2 sets of 3',
  '1 set of 3 + run of 4',
  '2 runs of 4',
  '3 sets of 3',
  '1 set of 3 + run of 7',
  '2 sets of 3 + run of 5',
  '3 runs of 4',
  '1 set of 3 + run of 10',
  '3 sets of 3 + run of 5',
  '3 runs of 5',
];

export function LevelsReference({ currentLevel, players, humanPlayerIndex, onClose, inline }: LevelsReferenceProps) {
  const inner = (
    <div className={inline ? styles.sidebarPanel : styles.panel} onClick={inline ? undefined : e => e.stopPropagation()}>
      <div className={styles.header}>
        <h2 className={styles.title}>Levels</h2>
        {!inline && <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>}
      </div>

      <p className={styles.rules}>
        <strong>Rules:</strong> Runs must be same suit · Sets same rank · Max 1 wild per set ·
        Max 1 wild per run (2 wilds if run has 5+ natural cards) · 2s are wild and cannot be discarded ·
        Ace is high · Hand limit: 17 cards (levels 1–8), 19 cards (levels 9–10)
      </p>

      <div className={styles.list}>
        {LEVELS.map((def, i) => {
          const levelNum = i + 1;
          const isCurrent = levelNum === currentLevel;
          const isDone = levelNum < currentLevel;
          const playersHere = players.filter(p => p.level === levelNum);
          return (
            <div
              key={i}
              className={[
                styles.row,
                isCurrent ? styles.current : '',
                isDone ? styles.done : '',
              ].filter(Boolean).join(' ')}
            >
              <div className={styles.levelNum}>
                {isDone ? '✓' : levelNum}
              </div>
              <div className={styles.levelBody}>
                <span className={styles.levelDesc}>{LEVEL_NAMES[i]}</span>
                <div className={styles.pills}>
                  {def.sets.map((n, si) => (
                    <span key={`s${si}`} className={`${styles.pill} ${styles.setPill}`}>
                      Set of {n}
                    </span>
                  ))}
                  {def.runs.map((n, ri) => (
                    <span key={`r${ri}`} className={`${styles.pill} ${styles.runPill}`}>
                      Run of {n}
                    </span>
                  ))}
                </div>
                {playersHere.length > 0 && (
                  <div className={styles.playerAvatars}>
                    {playersHere.map(p => {
                      const isHuman = players.indexOf(p) === humanPlayerIndex;
                      return (
                        <span
                          key={p.id}
                          className={`${styles.avatar} ${isHuman ? styles.avatarHuman : styles.avatarAI}`}
                          title={p.name}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (inline) return inner;

  return (
    <div className={styles.overlay} onClick={onClose}>
      {inner}
    </div>
  );
}
