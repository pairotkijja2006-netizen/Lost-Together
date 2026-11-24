# ⚔️ Lost Together

**Two hearts. One adventure. No distance too far.**

A cooperative dungeon adventure game designed to bring couples closer together through shared challenges, strategic combat, puzzle-solving, and exploration. Built using C++, Lost Together combines seed-based procedural dungeon generation, tree-based data structures, and real-time gameplay systems to create a unique adventure with every playthrough.

The project is currently in active development, with the long-term goal of delivering a meaningful two-player cooperative experience that connects people regardless of geographical distance.

![C++](https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=cplusplus&logoColor=white)
![SFML](https://img.shields.io/badge/SFML-8CC445?style=for-the-badge&logo=sfml&logoColor=white)
![Makefile](https://img.shields.io/badge/Makefile-427819?style=for-the-badge&logo=gnu&logoColor=white)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)
![Status](https://img.shields.io/badge/Status-In_Development-F59E0B?style=for-the-badge)

---

## 🔗 Project Links

- **GitHub:** [Lost Together](https://github.com/pairotkijja2006-netizen/Lost-Together)
- **Playable Release:** Coming soon

> Lost Together is currently an early-stage game prototype. Gameplay mechanics, collision systems, visual assets, and cooperative features are still being developed and refined.

---

## 💡 Inspiration

Being physically apart from someone you care about can make finding meaningful ways to spend time together challenging. While messaging and video calls help people stay connected, I believe that shared experiences can bring people closer together in a different and meaningful way.

Video games have the unique ability to bring people into the same world, regardless of where they are physically located. They allow players to create memories, overcome challenges, and celebrate accomplishments together.

I wanted to create a game specifically designed for couples, particularly those in long-distance relationships, where communication, trust, and teamwork are essential to progression.

This inspired me to develop Lost Together, a cooperative dungeon adventure where two players must navigate unpredictable environments, overcome obstacles, defeat enemies, and eventually find their way out together.

Beyond creating an entertaining game, my goal is to create an experience that gives couples another way to spend quality time together and strengthen their connection through shared adventures.

---

## 🚀 Key Features

### Procedural Dungeon Generation

Developed a custom dungeon generation system that produces randomized dungeon structures using tree-based data structures and seeded random number generation.

Each dungeon consists of a primary progression path with randomly generated side branches, encouraging exploration and providing variation between playthroughs.

The generation system supports:

- Randomized dungeon layouts
- Multiple room types
- Branching exploration paths
- Connected hallways and doorways
- Starting and final rooms
- Reproducible dungeon seeds
- Spatial layout validation

### Seed-Based World Generation

Implemented a seed-based generation system that allows dungeon layouts to be reproduced using the same numerical seed.

Players will eventually be able to share dungeon seeds, revisit previous adventures, and explore different environments together.

### Dynamic Room and Corridor Placement

Developed a spatial layout system that transforms the generated room tree into a two-dimensional dungeon environment.

The system evaluates room placement, available directions, doorway alignment, and potential spatial overlaps before accepting a generated layout.

### Combat and Character Progression

Currently developing real-time combat and character progression systems designed to provide players with different approaches to overcoming dungeon challenges.

Mechanics being developed and refined include:

- Melee combat and sword attacks
- Dash and movement abilities
- Projectile-based attacks
- Lightning-based abilities
- Enemy encounters
- Upgrade cards
- Ability progression
- Attack cooldowns and damage balancing

The long-term goal is to allow players to develop complementary abilities that encourage strategic cooperation.

### Retro-Inspired Game Environment

Designing a top-down dungeon environment featuring retro-inspired pixel art, tile-based rooms, connected corridors, and character animations.

The visual direction aims to combine nostalgic game aesthetics with responsive and engaging gameplay.

### Cooperative Gameplay — Planned

The completed game will be designed around two-player cooperation.

Planned cooperative mechanics include:

- Two-player dungeon exploration
- Cooperative puzzles and challenges
- Complementary character abilities
- Shared combat encounters
- Cooperative boss battles
- Online multiplayer support
- Story-driven progression

Rather than simply allowing two players to explore independently, the goal is to make cooperation an essential part of completing the adventure.

---

## ⚙️ System Architecture

The C++ dungeon generation system is organized into separate modules responsible for logical generation, spatial layout, and graphical presentation.

| Module | Responsibility |
|---|---|
| `Dungeon.cpp` | Room generation, tree construction, randomization, and memory management |
| `Dungeon.h` | Dungeon and room data structure definitions |
| `DungeonLayout.cpp` | Spatial placement, corridor generation, backtracking, and layout validation |
| `DungeonLayout.h` | Spatial layout interfaces and supporting structures |
| `DungeonView.cpp` | Graphical dungeon visualization |
| `DungeonView.h` | Rendering interfaces |
| `main.cpp` | Application initialization, seed configuration, and execution |
| `Makefile` | Compilation and SFML dependency linking |
| `assets/` | Game assets and visual resources |
| `web/` | Web-related project files |

Separating dungeon generation from spatial placement and rendering allows individual systems to be developed, tested, and refined independently.

---

## 🧠 Technical Implementation

### Tree-Based Dungeon Generation

Designed a rooted, multi-branch tree to represent the logical structure of each dungeon.

- **Nodes:** Individual dungeon rooms.
- **Edges:** Connections between rooms.
- **Root:** Starting room.
- **Branches:** Optional exploration paths.
- **Final room:** Main progression destination.

The generator constructs a primary path from the starting room to the final room while introducing randomized side branches along the way.

This approach maintains a connected dungeon structure while allowing exploration opportunities and variation between generated worlds.

### Seeded Pseudorandom Number Generation

Implemented deterministic procedural generation using the C++ standard library's `std::mt19937` Mersenne Twister pseudorandom number generator.

The generation system accepts a user-specified numerical seed. If no seed is provided, the program uses the current system time to initialize the generator.

Random values influence:

- The number of branching paths
- Side-room types
- Room placement directions
- Overall dungeon variation

Using the same seed allows the same dungeon to be regenerated under equivalent execution conditions, making layouts easier to reproduce, test, and debug.

### Recursive Backtracking Algorithm

Implemented recursive backtracking to determine valid spatial positions for rooms and corridors.

The placement algorithm:

1. Evaluates possible directions for connecting a child room.
2. Calculates the proposed room and corridor coordinates.
3. Checks for intersections with existing geometry.
4. Attempts to place subsequent rooms recursively.
5. Reverses unsuccessful placements and explores alternative configurations.

This approach helps resolve spatial conflicts without immediately discarding the entire dungeon structure.

### Spatial Validation and Collision Detection

Implemented rectangular overlap detection to validate generated dungeon geometry.

The layout validation system checks for:

- Room-to-room intersections
- Room-to-corridor intersections
- Corridor-to-corridor intersections
- Invalid room positions
- Incorrect doorway alignment
- Missing room connections
- Missing final-room progression

Gameplay collision detection is currently being refined to improve interactions between characters, enemies, walls, projectiles, and attack hitboxes.

### Memory Management and Recursive Traversal

Used dynamically allocated room structures and pointer-based relationships to represent dungeon connectivity.

Implemented recursive traversal and deallocation to release generated room structures when regenerating or destroying a dungeon.

This project provides an opportunity to apply fundamental C++ concepts, including pointers, object-oriented programming, dynamic memory allocation, recursion, and data structure management.

### Graphical Rendering

Integrated the Simple and Fast Multimedia Library (SFML) to visualize generated dungeon environments.

The rendering module is separated from the generation and placement modules, allowing graphical presentation to evolve independently of the underlying dungeon algorithms.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| Programming Language | C++17 |
| Graphics Library | SFML |
| Build System | Make, Makefile |
| Compiler | g++ |
| Data Structures | Trees, Vectors, Pointers |
| Algorithms | Recursive Backtracking, Tree Traversal |
| Procedural Generation | Seed-Based Generation, Mersenne Twister |
| Spatial Processing | Rectangular Overlap Detection, Layout Validation |
| Game Design | Dungeon Exploration, Combat, Character Progression |
| Visual Design | Pixel Art, Tile-Based Environments |
| Version Control | Git, GitHub |

---

## ⚠️ Technical Challenges

- Designing a procedural generation algorithm that maintains dungeon connectivity.
- Converting abstract tree structures into valid two-dimensional environments.
- Preventing intersections between generated rooms and corridors.
- Implementing recursive backtracking to resolve unsuccessful placements.
- Maintaining correct doorway and hallway alignment.
- Managing dynamically allocated room structures.
- Reproducing and debugging procedurally generated environments.
- Aligning attack hitboxes with visual attack animations.
- Improving collision accuracy between characters and environmental objects.
- Balancing combat abilities, damage, cooldowns, and progression.
- Designing cooperative mechanics that encourage meaningful teamwork.
- Building a scalable architecture that supports future levels, enemies, and gameplay systems.

---

## 🏅 Accomplishments So Far

- Developed a custom procedural dungeon generation system using C++.
- Represented dungeon connectivity using tree-based data structures.
- Implemented reproducible seed-based world generation.
- Developed recursive backtracking for spatial room placement.
- Implemented room and corridor overlap detection.
- Developed dungeon layout validation and doorway alignment checks.
- Implemented recursive traversal and dynamic memory cleanup.
- Integrated SFML for graphical dungeon visualization.
- Established the foundation for combat and character progression.
- Organized the dungeon generation system into separate functional modules.

---

## 📚 What I Learned

Through developing Lost Together, I am gaining practical experience in:

- Object-oriented programming with C++
- Tree-based data structures
- Pointer manipulation and dynamic memory management
- Recursive algorithms
- Backtracking and constraint-based problem-solving
- Procedural content generation
- Deterministic pseudorandom number generation
- Spatial reasoning and geometric calculations
- Collision detection
- Game mechanics and combat system design
- Software architecture and modular development
- Graphical rendering
- Gameplay debugging and optimization
- Iterative software development
- Cooperative game design

This project allows me to apply concepts learned in computer science courses to a larger, interactive software engineering project.

---

## 🔮 Development Roadmap

### Phase 1 — Core Dungeon Systems

- [x] Tree-based dungeon generation
- [x] Seed-based randomization
- [x] Randomized room branching
- [x] Room and corridor placement
- [x] Recursive backtracking
- [x] Spatial layout validation
- [x] Graphical dungeon visualization

### Phase 2 — Combat and Gameplay Refinement

- [ ] Expand the character skill and ability system
- [ ] Introduce additional attack and movement abilities
- [ ] Improve combat responsiveness
- [ ] Refine attack hitboxes and collision detection
- [ ] Improve enemy movement and combat behavior
- [ ] Balance damage, cooldowns, and upgrades
- [ ] Expand character progression and upgrade cards
- [ ] Resolve existing gameplay and visual bugs
- [ ] Improve animation and sound effects
- [ ] Optimize gameplay performance

### Phase 3 — World Expansion and Boss Battles

- [ ] Introduce new dungeon levels and environments
- [ ] Develop distinct enemy types
- [ ] Implement unique boss encounters
- [ ] Design multi-stage boss battles
- [ ] Introduce environmental hazards
- [ ] Expand room types and exploration opportunities
- [ ] Introduce progressively challenging dungeon stages

### Phase 4 — Cooperative Multiplayer

- [ ] Implement two-player gameplay
- [ ] Develop online multiplayer functionality
- [ ] Synchronize player movement and game states
- [ ] Introduce cooperative combat mechanics
- [ ] Develop complementary character abilities
- [ ] Design puzzles requiring communication and teamwork
- [ ] Implement cooperative boss encounters
- [ ] Develop multiplayer lobby and connection systems

### Phase 5 — Story and Narrative Development

- [ ] Develop an original storyline centered around two protagonists
- [ ] Create character backgrounds and personalities
- [ ] Introduce meaningful dialogue and story events
- [ ] Connect dungeon progression with narrative development
- [ ] Design environments that contribute to storytelling
- [ ] Explore themes of connection, trust, distance, and perseverance
- [ ] Create a meaningful conclusion to the shared adventure

### Phase 6 — Polishing and Release

- [ ] Improve graphical assets and user interfaces
- [ ] Conduct multiplayer playtesting
- [ ] Gather feedback from couples and other players
- [ ] Resolve remaining gameplay bugs
- [ ] Improve performance and stability
- [ ] Publish a publicly accessible playable release

---

## 👤 Developer

**Mio Pairotkijja**

Personal software engineering and game development project.

Currently in active development.

---

## 🧪 Getting Started

### Prerequisites

The current native C++ dungeon prototype requires:

- C++17-compatible compiler
- SFML
- Make
- Git
- Homebrew for the existing macOS build configuration

### Installation

Clone the repository:

```bash
git clone https://github.com/pairotkijja2006-netizen/Lost-Together.git
```

Navigate into the project directory:

```bash
cd Lost-Together
```

Install SFML on macOS:

```bash
brew install sfml
```

Compile the project:

```bash
make
```

Run the dungeon prototype:

```bash
./dungeon
```

### Generate a Dungeon Using a Specific Seed

```bash
./dungeon 12345
```

Providing the same seed allows the dungeon layout to be reproduced under equivalent execution conditions.

### Run Without a Graphical Window

```bash
./dungeon 12345 --no-window
```

This mode is useful for testing dungeon generation and layout validation without launching the graphical interface.

### Clean Build Files

```bash
make clean
```

> The current Makefile is configured for macOS using Homebrew. Other operating systems may require adjustments to compiler settings and SFML library paths.

---

## 🌎 My Vision

Lost Together represents my belief that video games can be more than entertainment. They can create meaningful experiences, strengthen relationships, and bring people closer together despite physical distance.

I want to build a game where couples do not simply play alongside one another but actively depend on each other, celebrate their accomplishments together, and create memories through shared challenges.

Through combining procedural generation, challenging combat, cooperative puzzles, and emotional storytelling, I hope to create an adventure that feels different every time while remaining meaningful to the people experiencing it.

Lost Together is also a personal journey in software engineering, allowing me to continuously challenge myself through algorithm design, systems programming, game development, and creative problem-solving.

Ultimately, I want to create a game that reminds players that even when the world around them feels unfamiliar, they do not have to find their way alone.

**Getting lost is part of the adventure. Finding your way together is what matters. ❤️**
