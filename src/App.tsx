import { useState } from 'react';
import { GameBoard } from './components/GameBoard/GameBoard';
import { GameSetup } from './components/GameSetup/GameSetup';
import { useGameState } from './hooks/useGameState';

export default function App() {
  const game = useGameState();
  const [playerCount, setPlayerCount] = useState(3);

  function handleStart(n: number) {
    setPlayerCount(n);
    game.startGame(n);
  }

  if (game.state.gamePhase === 'setup') {
    return <GameSetup onStart={handleStart} />;
  }

  return <GameBoard game={game} onPlayAgain={() => game.startGame(playerCount)} />;
}
