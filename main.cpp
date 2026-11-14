#include "Dungeon.h"
#include "DungeonLayout.h"
#include "DungeonView.h"

#include <iostream>
#include <string>

int main(int argc, char** argv) {
    unsigned seed = 0;
    bool openWindow = true;
    for (int i = 1; i < argc; i++) {
        const std::string arg = argv[i];
        if (arg == "--no-window") {
            openWindow = false;
        } else {
            seed = static_cast<unsigned>(std::stoul(arg));
        }
    }

    Dungeon dungeon(seed);
    // Three steps: enemy, enemy, final. Side rooms stay on the enemy rooms.
    dungeon.generate(3);
    dungeon.print();

    DungeonLayout layout;
    std::string error;
    if (!layout.build(dungeon.root(), dungeon.random(), error)) {
        std::cerr << error << "\n";
        return 1;
    }

    std::cout << "Seed: " << dungeon.seed() << "\n";
    std::cout << "Rooms placed. Corridors: " << layout.corridors().size() << "\n";

    if (!openWindow) {
        return 0;
    }

    DungeonView view;
    if (!view.show(dungeon.root(), layout.corridors(), error)) {
        std::cerr << error << "\n";
        return 1;
    }
    return 0;
}
