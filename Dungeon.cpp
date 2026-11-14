#include "Dungeon.h"
#include <iostream>

using namespace std;

Dungeon::Dungeon()
    : start(nullptr), rng(time(nullptr)) {
    // start as null becuase no room generated yet
}

Dungeon::~Dungeon() {
    // delete all the rooms and their paths
    deleteRoom(start);
}

Room* Dungeon::createRoom(char type) {
    Room* newRoom = new Room{type, {}};
    return newRoom;
}

int Dungeon::randomInt(int min, int max) {
    uniform_int_distribution<int> dist(min, max);
    return dist(rng);
}

void Dungeon::generate(int maxPaths) {
    deleteRoom(start);
    start = createRoom('#');
    Room* current = start;

    // limits to only 3 hallways
    for (int i = 0; i < maxPaths; i++) {
        if (i == maxPaths - 1) {
            Room* finalRoom = createRoom('f');
            current->paths.push_back(finalRoom);
            break;
        }

        Room*enemy = createRoom('e');
        current->paths.push_back(enemy);
        current = enemy;

        int numPaths = randomInt(1, 3);
        int extraPaths = numPaths - 1;
        
        // generating side branches from "e" room
        for (int j = 0; j < extraPaths; j++) {
            int roomType = randomInt(0, 1);
            Room* newRoom = nullptr;
            if (roomType == 0) {
                newRoom = createRoom('b');
            } else {
                newRoom = createRoom('t');
            }
            current->paths.push_back(newRoom);
        }
    }
}

void Dungeon::printRoom(Room* room, int depth) {
    if (room == nullptr) {
        return;
    }
    for (int i = 0; i < depth; i++) {
        cout << "  ";
    }

    cout << room->type << endl;
    
    for (Room* child : room->paths) {
        printRoom(child, depth + 1);
    }
}

void Dungeon::print() {
    cout << "\nGenerated Dungeon:\n";
    cout << "--------------------------------\n";
    printRoom(start, 0);
}

void Dungeon::deleteRoom(Room* room) {
    if (room == nullptr) {
        return;
    }
    for (Room* child : room->paths) {
        deleteRoom(child);
    }
    delete room;
}