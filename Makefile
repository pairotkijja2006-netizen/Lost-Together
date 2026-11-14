SFML_PREFIX := $(shell brew --prefix sfml)

CXX := g++
CXXFLAGS := -std=c++17 -Wall -Wextra -I$(SFML_PREFIX)/include
LDFLAGS := -L$(SFML_PREFIX)/lib -lsfml-graphics -lsfml-window -lsfml-system -Wl,-rpath,$(SFML_PREFIX)/lib

SRCS := main.cpp Dungeon.cpp DungeonLayout.cpp DungeonView.cpp

dungeon: $(SRCS)
	$(CXX) $(CXXFLAGS) $(SRCS) -o dungeon $(LDFLAGS)

clean:
	rm -f dungeon
