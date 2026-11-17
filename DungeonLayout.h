#ifndef DUNGEON_LAYOUT_H
#define DUNGEON_LAYOUT_H

#include "Dungeon.h"

#include <array>
#include <random>
#include <string>
#include <vector>

enum Direction {
    North = 1,
    East = 2,
    South = 4,
    West = 8
};

struct Corridor {
    int x = 0;
    int y = 0;
    int width = 0;
    int height = 0;
    Direction direction = East;
};

// Assigns world positions and doorway directions to an existing room tree.
class DungeonLayout {
public:
    static constexpr int kDoorWidth = 96;
    static constexpr int kVerticalDoorWidth = 96;
    static constexpr int kCorridorGap = 384;

    bool build(Room* start, std::mt19937& rng, std::string& error);

    const std::vector<Corridor>& corridors() const;

private:
    std::vector<Corridor> corridors_;
    Room* root_ = nullptr;

    void clear(Room* room);
    bool placeChildren(Room* room, std::mt19937& rng);
    bool placeChildAt(Room* room, size_t index, const std::array<int, 4>& directions, std::mt19937& rng);
    bool fits(int x, int y, int width, int height, const Corridor& corridor) const;
};

bool validateDungeon(Room* start, const std::vector<Corridor>& corridors, std::string& error);

#endif
