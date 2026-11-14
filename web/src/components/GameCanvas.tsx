import { useEffect, useRef } from "react";
import { Game } from "../game/Game";

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const game = new Game(canvas);
    void game.start();
    return () => game.stop();
  }, []);

  return <canvas ref={canvasRef} />;
}
