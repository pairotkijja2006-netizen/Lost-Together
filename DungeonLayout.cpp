#include "DungeonLayout.h"

#include <algorithm>
#include <array>

namespace {

struct Rect {
    int x;
    int y;
    int w;
    int h;
};

bool overlaps(Rect a, Rect b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

void sizeFor(char type, int& width, int& height) {
    switch (type) {
        case '#':
            width = 288;
            height = 320;
            break;
        case 'f':
            width = 416;
            height = 384;
            break;
        case 'e':
            width = 672;
            height = 640;
            break;
        default:
            width = 544;
            height = 512;
            break;
    }
}

int opposite(int direction) {
    switch (direction) {
        case North: return South;
        case South: return North;
        case East: return West;
        case West: return East;
        default: return 0;
    }
}

void collectPlaced(Room* room, std::vector<Room*>& out) {
    if (room == nullptr || !room->placed) {
        return;
    }
    out.push_back(room);
    for (Room* child : room->paths) {
        collectPlaced(child, out);
    }
}

void visit(Room* room, std::vector<Room*>& out) {
    if (room == nullptr) {
        return;
    }
    out.push_back(room);
    for (Room* child : room->paths) {
        visit(child, out);
    }
}

int doorCount(int doors) {
    int count = 0;
    for (int bit : {North, East, South, West}) {
        if (doors & bit) {
            count++;
        }
    }
    return count;
}

bool centerAligned(const Room* parent, const Room* child, int direction) {
    if (direction == East || direction == West) {
        return parent->y + parent->height / 2 == child->y + child->height / 2;
    }
    return parent->x + parent->width / 2 == child->x + child->width / 2;
}

bool separated(const Room* parent, const Room* child, int direction) {
    if (direction == East) {
        return child->x == parent->x + parent->width + DungeonLayout::kCorridorGap;
    }
    if (direction == West) {
        return parent->x == child->x + child->width + DungeonLayout::kCorridorGap;
    }
    if (direction == South) {
        return child->y == parent->y + parent->height + DungeonLayout::kCorridorGap;
    }
    if (direction == North) {
        return parent->y == child->y + child->height + DungeonLayout::kCorridorGap;
    }
    return false;
}

}  // namespace

const std::vector<Corridor>& DungeonLayout::corridors() const {
    return corridors_;
}

void DungeonLayout::clear(Room* room) {
    if (room == nullptr) {
        return;
    }
    room->x = 0;
    room->y = 0;
    room->width = 0;
    room->height = 0;
    room->doors = 0;
    room->placed = false;
    for (Room* child : room->paths) {
        clear(child);
    }
}

bool DungeonLayout::fits(int x, int y, int width, int height, const Corridor& corridor) const {
    Rect roomRect{x, y, width, height};
    Rect corridorRect{corridor.x, corridor.y, corridor.width, corridor.height};

    std::vector<Room*> placed;
    collectPlaced(root_, placed);
    for (Room* other : placed) {
        Rect otherRect{other->x, other->y, other->width, other->height};
        if (overlaps(roomRect, otherRect) || overlaps(corridorRect, otherRect)) {
            return false;
        }
    }
    for (const Corridor& existing : corridors_) {
        Rect existingRect{existing.x, existing.y, existing.width, existing.height};
        if (overlaps(roomRect, existingRect) || overlaps(corridorRect, existingRect)) {
            return false;
        }
    }
    return true;
}

bool DungeonLayout::placeChildAt(Room* room, size_t index, const std::array<int, 4>& directions, std::mt19937& rng) {
    if (index == room->paths.size()) {
        return true;
    }

    Room* child = room->paths[index];
    int childWidth = 0;
    int childHeight = 0;
    sizeFor(child->type, childWidth, childHeight);

    for (int direction : directions) {
        if (room->doors & direction) {
            continue;
        }

        constexpr int tile = 32;
        const int parentMidX = (room->width / tile) / 2;
        const int parentMidY = (room->height / tile) / 2;
        const int childMidX = (childWidth / tile) / 2;
        const int childMidY = (childHeight / tile) / 2;
        int x = 0;
        int y = 0;
        Corridor corridor;
        corridor.direction = static_cast<Direction>(direction);

        if (direction == East) {
            x = room->x + room->width + kCorridorGap;
            y = room->y + (parentMidY - childMidY) * tile;
            corridor.x = room->x + room->width;
            corridor.y = room->y + (parentMidY - 1) * tile;
            corridor.width = kCorridorGap;
            corridor.height = kDoorWidth;
        } else if (direction == West) {
            x = room->x - kCorridorGap - childWidth;
            y = room->y + (parentMidY - childMidY) * tile;
            corridor.x = x + childWidth;
            corridor.y = room->y + (parentMidY - 1) * tile;
            corridor.width = kCorridorGap;
            corridor.height = kDoorWidth;
        } else if (direction == South) {
            x = room->x + (parentMidX - childMidX) * tile;
            y = room->y + room->height + kCorridorGap;
            corridor.x = room->x + (parentMidX - 1) * tile;
            corridor.y = room->y + room->height;
            corridor.width = kVerticalDoorWidth;
            corridor.height = kCorridorGap;
        } else {
            x = room->x + (parentMidX - childMidX) * tile;
            y = room->y - kCorridorGap - childHeight;
            corridor.x = room->x + (parentMidX - 1) * tile;
            corridor.y = y + childHeight;
            corridor.width = kVerticalDoorWidth;
            corridor.height = kCorridorGap;
        }

        if (!fits(x, y, childWidth, childHeight, corridor)) {
            continue;
        }

        child->x = x;
        child->y = y;
        child->width = childWidth;
        child->height = childHeight;
        child->doors = opposite(direction);
        child->placed = true;
        room->doors |= direction;
        const size_t corridorMark = corridors_.size();
        corridors_.push_back(corridor);

        if (placeChildren(child, rng) && placeChildAt(room, index + 1, directions, rng)) {
            return true;
        }

        corridors_.resize(corridorMark);
        room->doors &= ~direction;
        clear(child);
    }
    return false;
}

bool DungeonLayout::placeChildren(Room* room, std::mt19937& rng) {
    std::array<int, 4> directions = {North, East, South, West};
    std::shuffle(directions.begin(), directions.end(), rng);
    return placeChildAt(room, 0, directions, rng);
}

bool DungeonLayout::build(Room* start, std::mt19937& rng, std::string& error) {
    if (start == nullptr) {
        error = "Dungeon has no starting room.";
        return false;
    }

    root_ = start;
    constexpr int kAttempts = 40;
    for (int attempt = 0; attempt < kAttempts; attempt++) {
        clear(start);
        corridors_.clear();

        int width = 0;
        int height = 0;
        sizeFor(start->type, width, height);
        start->width = width;
        start->height = height;
        start->placed = true;

        if (!placeChildren(start, rng)) {
            continue;
        }
        if (validateDungeon(start, corridors_, error)) {
            return true;
        }
    }

    error = "Could not place the dungeon without overlapping rooms or corridors.";
    return false;
}

bool validateDungeon(Room* start, const std::vector<Corridor>& corridors, std::string& error) {
    if (start == nullptr || !start->placed) {
        error = "Starting room is missing a position.";
        return false;
    }

    std::vector<Room*> rooms;
    visit(start, rooms);

    bool foundFinal = false;
    int edges = 0;
    for (Room* room : rooms) {
        if (!room->placed || room->width <= 0 || room->height <= 0) {
            error = "A room is missing a valid position.";
            return false;
        }
        if (room->type == 'f') {
            foundFinal = true;
        }
        edges += static_cast<int>(room->paths.size());

        const int parentDoors = (room == start) ? 0 : 1;
        if (doorCount(room->doors) != static_cast<int>(room->paths.size()) + parentDoors) {
            error = "A room's doorways do not match its connections.";
            return false;
        }

        for (Room* child : room->paths) {
            int matches = 0;
            for (int direction : {North, East, South, West}) {
                if ((room->doors & direction) &&
                    (child->doors & opposite(direction)) &&
                    centerAligned(room, child, direction) &&
                    separated(room, child, direction)) {
                    matches++;
                }
            }
            if (matches != 1) {
                error = "A connection does not line up with a pair of doorways.";
                return false;
            }
        }
    }

    if (!foundFinal) {
        error = "The final room is not reachable from the start.";
        return false;
    }
    if (static_cast<int>(corridors.size()) != edges) {
        error = "The number of corridors does not match the room tree.";
        return false;
    }

    for (size_t i = 0; i < rooms.size(); i++) {
        Rect a{rooms[i]->x, rooms[i]->y, rooms[i]->width, rooms[i]->height};
        for (size_t j = i + 1; j < rooms.size(); j++) {
            Rect b{rooms[j]->x, rooms[j]->y, rooms[j]->width, rooms[j]->height};
            if (overlaps(a, b)) {
                error = "Two rooms overlap.";
                return false;
            }
        }
        for (const Corridor& corridor : corridors) {
            Rect c{corridor.x, corridor.y, corridor.width, corridor.height};
            if (overlaps(a, c)) {
                error = "A corridor overlaps a room.";
                return false;
            }
        }
    }

    for (size_t i = 0; i < corridors.size(); i++) {
        Rect a{corridors[i].x, corridors[i].y, corridors[i].width, corridors[i].height};
        for (size_t j = i + 1; j < corridors.size(); j++) {
            Rect b{corridors[j].x, corridors[j].y, corridors[j].width, corridors[j].height};
            if (overlaps(a, b)) {
                error = "Two corridors overlap.";
                return false;
            }
        }
    }

    return true;
}
