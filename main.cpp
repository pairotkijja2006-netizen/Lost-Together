
#include "Dungeon.h"
#include <iostream>

using namespace std;

int main() {
    // Create a Dungeon object.
    //
    // This automatically calls
    // the Dungeon constructor.
    Dungeon dungeon;

    // Generate all the rooms and paths.
    dungeon.generate(6);

    // Display the resulting dungeon.
    dungeon.print();

    // End the program successfully.
    //
    // The Dungeon destructor will run
    // automatically and free the rooms.
    return 0;
}
