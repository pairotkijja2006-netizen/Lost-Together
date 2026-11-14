#include "DungeonView.h"

#include <SFML/Graphics.hpp>

#include <algorithm>
#include <fstream>
#include <sstream>
#include <unordered_map>
#include <vector>

namespace {

struct AssetInfo {
    std::string file;
    int width = 0;
    int height = 0;
};

std::string readFile(const std::string& path) {
    std::ifstream input(path);
    if (!input) {
        return {};
    }
    std::ostringstream buffer;
    buffer << input.rdbuf();
    return buffer.str();
}

std::string jsonString(const std::string& object, const std::string& key) {
    const std::string pattern = "\"" + key + "\"";
    const size_t keyPos = object.find(pattern);
    if (keyPos == std::string::npos) {
        return {};
    }
    const size_t colon = object.find(':', keyPos + pattern.size());
    const size_t first = object.find('"', colon + 1);
    const size_t second = object.find('"', first + 1);
    if (colon == std::string::npos || first == std::string::npos || second == std::string::npos) {
        return {};
    }
    return object.substr(first + 1, second - first - 1);
}

std::string sizeName(char type) {
    if (type == '#') {
        return "start";
    }
    if (type == 'e') {
        return "large";
    }
    if (type == 'f') {
        return "small";
    }
    return "medium";
}

std::string openingName(int doors) {
    std::string name;
    if (doors & North) name += 'N';
    if (doors & East) name += 'E';
    if (doors & South) name += 'S';
    if (doors & West) name += 'W';
    if (name.empty()) {
        return "none";
    }
    return name;
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

}  // namespace

bool DungeonView::show(Room* start, const std::vector<Corridor>& corridors, std::string& error) {
    const std::string manifestPath = "assets/rooms/manifest.json";
    const std::string json = readFile(manifestPath);
    if (json.empty()) {
        error = "Could not read " + manifestPath;
        return false;
    }

    std::unordered_map<std::string, AssetInfo> catalog;
    size_t cursor = 0;
    while (true) {
        const size_t objectStart = json.find('{', cursor);
        if (objectStart == std::string::npos) {
            break;
        }
        const size_t objectEnd = json.find('}', objectStart);
        if (objectEnd == std::string::npos) {
            break;
        }
        const std::string object = json.substr(objectStart, objectEnd - objectStart + 1);
        cursor = objectEnd + 1;

        const std::string file = jsonString(object, "file");
        const std::string size = jsonString(object, "size");
        const std::string openings = jsonString(object, "openings");
        if (file.empty() || size.empty() || openings.empty()) {
            continue;
        }
        catalog[size + "_" + openings] = AssetInfo{"assets/rooms/" + file, 0, 0};
    }

    if (catalog.empty()) {
        error = "Room manifest did not list any files.";
        return false;
    }

    std::vector<Room*> rooms;
    visit(start, rooms);

    std::vector<sf::Texture> textures;
    textures.reserve(rooms.size());
    for (Room* room : rooms) {
        const std::string key = sizeName(room->type) + "_" + openingName(room->doors);
        const auto found = catalog.find(key);
        if (found == catalog.end()) {
            error = "No room image for " + key;
            return false;
        }
        sf::Texture texture;
        if (!texture.loadFromFile(found->second.file)) {
            error = "Could not load " + found->second.file;
            return false;
        }
        texture.setSmooth(false);
        const sf::Vector2u size = texture.getSize();
        if (static_cast<int>(size.x) != room->width || static_cast<int>(size.y) != room->height) {
            error = found->second.file + " does not match the room size.";
            return false;
        }
        textures.push_back(std::move(texture));
    }

    std::vector<sf::Sprite> sprites;
    sprites.reserve(textures.size());
    for (size_t i = 0; i < rooms.size(); i++) {
        sf::Sprite sprite(textures[i]);
        sprite.setPosition(sf::Vector2f(static_cast<float>(rooms[i]->x), static_cast<float>(rooms[i]->y)));
        sprites.push_back(sprite);
    }

    float minX = static_cast<float>(rooms[0]->x);
    float minY = static_cast<float>(rooms[0]->y);
    float maxX = minX + rooms[0]->width;
    float maxY = minY + rooms[0]->height;
    auto include = [&](float x, float y, float w, float h) {
        minX = std::min(minX, x);
        minY = std::min(minY, y);
        maxX = std::max(maxX, x + w);
        maxY = std::max(maxY, y + h);
    };
    for (Room* room : rooms) {
        include(static_cast<float>(room->x), static_cast<float>(room->y),
                static_cast<float>(room->width), static_cast<float>(room->height));
    }
    for (const Corridor& corridor : corridors) {
        include(static_cast<float>(corridor.x), static_cast<float>(corridor.y),
                static_cast<float>(corridor.width), static_cast<float>(corridor.height));
    }

    constexpr float pad = 64.f;
    float viewW = (maxX - minX) + pad * 2.f;
    float viewH = (maxY - minY) + pad * 2.f;
    constexpr float windowW = 1280.f;
    constexpr float windowH = 720.f;
    if (viewW / viewH > windowW / windowH) {
        viewH = viewW * (windowH / windowW);
    } else {
        viewW = viewH * (windowW / windowH);
    }

    sf::RenderWindow window(sf::VideoMode(sf::Vector2u(1280, 720)), "Lost Together");
    window.setVerticalSyncEnabled(true);
    sf::View view;
    view.setCenter(sf::Vector2f((minX + maxX) * 0.5f, (minY + maxY) * 0.5f));
    view.setSize(sf::Vector2f(viewW, viewH));
    window.setView(view);

    // Floor tone sampled from the room art. The pack has no separate corridor image.
    const sf::Color floor(126, 163, 171);
    constexpr float tuck = 16.f;

    while (window.isOpen()) {
        while (const std::optional event = window.pollEvent()) {
            if (event->is<sf::Event::Closed>()) {
                window.close();
            } else if (const auto* key = event->getIf<sf::Event::KeyPressed>()) {
                if (key->code == sf::Keyboard::Key::Escape) {
                    window.close();
                }
            }
        }

        window.clear(sf::Color(18, 22, 28));
        for (const Corridor& corridor : corridors) {
            float x = static_cast<float>(corridor.x);
            float y = static_cast<float>(corridor.y);
            float w = static_cast<float>(corridor.width);
            float h = static_cast<float>(corridor.height);
            if (corridor.direction == East || corridor.direction == West) {
                x -= tuck;
                w += tuck * 2.f;
            } else {
                y -= tuck;
                h += tuck * 2.f;
            }
            sf::RectangleShape shape(sf::Vector2f(w, h));
            shape.setPosition(sf::Vector2f(x, y));
            shape.setFillColor(floor);
            window.draw(shape);
        }
        for (const sf::Sprite& sprite : sprites) {
            window.draw(sprite);
        }
        window.display();
    }
    return true;
}
