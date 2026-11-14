import { useState } from "react";
import { adventurerConfig, type AdventurerClass } from "../config/adventurerConfig";

interface CharacterSelectionProps {
  onStart: (adventurer: AdventurerClass) => void;
}

const choices: AdventurerClass[] = ["knight", "wizard"];

export function CharacterSelection({ onStart }: CharacterSelectionProps) {
  const [selected, setSelected] = useState<AdventurerClass | null>(null);

  return (
    <main className="select-screen">
      <h1>Choose Your Adventurer</h1>
      <div className="select-cards">
        {choices.map((choice) => {
          const stats = adventurerConfig[choice];
          const active = selected === choice;
          return (
            <button
              key={choice}
              type="button"
              className={active ? "adventurer-card selected" : "adventurer-card"}
              onClick={() => setSelected(choice)}
            >
              <img src={stats.preview} alt="" />
              <h2>{stats.label}</h2>
              <p>{stats.description}</p>
              <p className="adventurer-meta">Attack type: {stats.attackType}</p>
              <p className="adventurer-meta">Attack cooldown: {stats.cooldown} seconds</p>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="start-adventure"
        disabled={selected === null}
        onClick={() => {
          if (selected) {
            onStart(selected);
          }
        }}
      >
        Start Adventure
      </button>
    </main>
  );
}
