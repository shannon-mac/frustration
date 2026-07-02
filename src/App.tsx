import { GameBoard } from './components/GameBoard/GameBoard';
import { GameSetup } from './components/GameSetup/GameSetup';
import { useGameState } from './hooks/useGameState';

export default function App() {
  const game = useGameState();

  function handleStart(n: number) {
    game.startGame(n);
  }

  if (game.state.gamePhase === 'setup') {
    return <GameSetup onStart={handleStart} />;
  }

  return <GameBoard game={game} onPlayAgain={() => game.startGame(0)} />;
}
