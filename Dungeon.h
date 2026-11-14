#ifndef DUNGEON_H
#define DUNGEON_H

#include <iostream>
#include <vector>
#include <string>
#include <random>
#include <ctime>
#include <cstdlib>

struct Room {
    char type;
    std::vector<Room*> paths;
};

// develop the dungeon as a tree structure
class Dungeon {
    private:
        // pointer at starting room
        // reach all other rooms from start
        Room* start;
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
        // constructor
        Dungeon();
        // destructor
        ~Dungeon();

        // prevent accidental pointer copying
        Dungeon(const Dungeon&) = delete;
        Dungeon& operator=(const Dungeon&) = delete;

        // generate the dungeon
        void generate(int maxPaths);
        // print the dungeon
        void print();
};

#endif