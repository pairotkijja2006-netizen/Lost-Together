#ifndef DUNGEON_VIEW_H
#define DUNGEON_VIEW_H

#include "DungeonLayout.h"

#include <string>

class DungeonView {
public:
    bool show(Room* start, const std::vector<Corridor>& corridors, std::string& error);
};

#endif
