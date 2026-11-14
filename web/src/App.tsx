import { useState } from "react";
import { CharacterSelection } from "./components/CharacterSelection";
import { GameCanvas } from "./components/GameCanvas";
import type { AdventurerClass } from "./config/adventurerConfig";

type GameState = "characterSelection" | "playing" | "gameOver";

export function App() {
  const [gameState, setGameState] = useState<GameState>("characterSelection");
  const [adventurer, setAdventurer] = useState<AdventurerClass | null>(null);

  if (gameState === "characterSelection" || !adventurer) {
    return (
      <CharacterSelection
        onStart={(choice) => {
          setAdventurer(choice);
          setGameState("playing");
        }}
      />
    );
  }

  return (
    <>
      <GameCanvas adventurer={adventurer} onGameOver={() => setGameState("gameOver")} />
      {gameState === "gameOver" && (
        <div className="game-over">
          <h1>Game Over</h1>
          <button
            type="button"
            onClick={() => {
              setAdventurer(null);
              setGameState("characterSelection");
            }}
          >
            Choose Another Adventurer
          </button>
        </div>
      )}
    </>
  );
}
