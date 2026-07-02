import type { Combo } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './LaidDownHand.module.css';

interface LaidDownHandProps {
  combos: Combo[];
  /** Called when a combo is clicked (for building on hand). Receives the combo index. */
  onCardClick?: (comboIndex: number) => void;
  highlightComboIndex?: number;
}

export function LaidDownHand({ combos, onCardClick, highlightComboIndex }: LaidDownHandProps) {
  return (
    <div className={styles.container}>
      {combos.map((combo, ci) => (
        <div
          key={ci}
          className={[
            styles.combo,
            combo.type === 'run' ? styles.run : styles.set,
            highlightComboIndex !== undefined ? styles.highlighted : '',
            onCardClick ? styles.clickable : '',
          ].filter(Boolean).join(' ')}
          onClick={onCardClick ? () => onCardClick(ci) : undefined}
          role={onCardClick ? 'button' : undefined}
        >
          <span className={styles.label}>{combo.type === 'run' ? 'Run' : 'Set'}</span>
          <div className={styles.cards}>
            {combo.cards.map((card) => (
              <Card key={card.id} card={card} small />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
