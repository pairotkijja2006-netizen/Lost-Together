#ifndef DUNGEON_H
#define DUNGEON_H

#include <iostream>
#include <vector>
#include <string>
#include <random>
#include <ctime>
#include <cstdlib>

struct Room {
    char type = '#';
    std::vector<Room*> paths;
    int x = 0;
    int y = 0;
    int width = 0;
    int height = 0;
    // Bits in NESW order: North=1, East=2, South=4, West=8.
    int doors = 0;
    bool placed = false;
};

// develop the dungeon as a tree structure
class Dungeon {
    private:
        // pointer at starting room
        // reach all other rooms from start
        Room* start;
        unsigned seed_;
        std::mt19937 rng;

        // create a room with a given type
        Room* createRoom(char type);
        // generate a random integer between min and max
        int randomInt(int min, int max);
        // print the room and all its paths
        void printRoom(Room* room, int depth);
        // delete the room and all its paths
        void deleteRoom(Room* room);

    public:
        // seed 0 uses the current time
        explicit Dungeon(unsigned seed = 0);
        // destructor
        ~Dungeon();

        unsigned seed() const;
        Room* root() const;
        std::mt19937& random();

        // prevent accidental pointer copying
        Dungeon(const Dungeon&) = delete;
        Dungeon& operator=(const Dungeon&) = delete;

        // generate the dungeon
        void generate(int maxPaths);
        // print the dungeon
        void print();
};

#endif