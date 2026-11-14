import { useEffect, useRef } from "react";
import type { AdventurerClass } from "../config/adventurerConfig";
import { Game } from "../game/Game";

interface GameCanvasProps {
  adventurer: AdventurerClass;
  onGameOver: () => void;
}

export function GameCanvas({ adventurer, onGameOver }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const game = new Game(canvas, adventurer, () => onGameOverRef.current());
    void game.start();
    return () => game.stop();
  }, [adventurer]);

  return <canvas ref={canvasRef} />;
}
