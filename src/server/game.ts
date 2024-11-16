interface GameState {
    players: Player[];
    map: Tile[][];
    currentTurn: number;
}

interface Player {
    id: string;
    name: string;
    resources: Resources;
    cities: City[];
    units: Unit[];
}

interface Tile {
    type: TerrainType;
    position: Position;
    resources?: ResourceType;
    occupiedBy?: string;
    unit?: Unit;
    movementCost?: number;
}

type TerrainType = 'PLAINS' | 'MOUNTAINS' | 'WATER' | 'FOREST';
type ResourceType = 'FOOD' | 'PRODUCTION' | 'GOLD';

interface Position {
    x: number;
    y: number;
}

interface Resources {
    food: number;
    production: number;
    gold: number;
}

interface City {
    id: string;
    name: string;
    position: Position;
    owner: string;
}

interface Unit {
    id: string;
    type: string;
    position: Position;
    owner: string;
    movementPoints: number;
    maxMovementPoints: number;
}

interface PathNode {
    position: Position;
    cost: number;
    previous?: Position;
}

export class GameManager {
    private games: Map<string, GameState>;
    private terrainMovementCosts: Record<TerrainType, number> = {
        'PLAINS': 1,
        'MOUNTAINS': 2,
        'FOREST': 1,
        'WATER': Infinity
    };

    constructor() {
        this.games = new Map();
    }

    createGame(): string {
        const gameId = Math.random().toString(36).substring(7);
        const initialState = this.createInitialState();
        this.games.set(gameId, initialState);

        // Place starting units
        this.placeStartingUnits(gameId);

        return gameId;
    }

    getGameState(gameId: string): GameState | undefined {
        const state = this.games.get(gameId);
        console.log('Getting game state:', {
            gameId,
            hasState: !!state,
            units: state?.map.flat().filter(tile => tile.unit).length
        });
        return state;
    }

    private createInitialState(): GameState {
        return {
            players: [],
            map: this.generateMap(10, 10),
            currentTurn: 0
        };
    }

    private placeStartingUnits(gameId: string) {
        const game = this.games.get(gameId);
        if (!game) return;

        // Find center of the map
        const centerY = Math.floor(game.map.length / 2);
        const centerX = Math.floor(game.map[0].length / 2);

        // Make sure the center and adjacent tile are plains (for better start)
        game.map[centerY][centerX].type = 'PLAINS';
        game.map[centerY][centerX + 1].type = 'PLAINS';

        // Place settler in center
        game.map[centerY][centerX].unit = {
            id: `SETTLER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'SETTLER',
            position: { x: centerX, y: centerY },
            owner: 'player1',
            movementPoints: 2,
            maxMovementPoints: 2
        };

        // Place warrior adjacent to settler
        game.map[centerY][centerX + 1].unit = {
            id: `WARRIOR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'WARRIOR',
            position: { x: centerX + 1, y: centerY },
            owner: 'player1',
            movementPoints: 2,
            maxMovementPoints: 2
        };
    }

    // When creating a new game, ensure all existing units are removed
    private generateMap(width: number, height: number): Tile[][] {
        const map: Tile[][] = [];
        for (let y = 0; y < height; y++) {
            map[y] = [];
            for (let x = 0; x < width; x++) {
                map[y][x] = {
                    type: this.getRandomTerrainType(),
                    position: { x, y },
                    unit: undefined  // Explicitly set unit to undefined
                };
            }
        }
        return map;
    }

    private getRandomTerrainType(): TerrainType {
        const types: TerrainType[] = ['PLAINS', 'MOUNTAINS', 'WATER', 'FOREST'];
        const weights = [0.5, 0.2, 0.15, 0.15]; // 50% plains, 20% mountains, 15% water, 15% forest

        const random = Math.random();
        let sum = 0;

        for (let i = 0; i < types.length; i++) {
            sum += weights[i];
            if (random < sum) {
                return types[i];
            }
        }

        return 'PLAINS';
    }

    placeUnit(gameId: string, position: Position, unitType: string): boolean {
        const game = this.games.get(gameId);
        if (!game) {
            console.log('Game not found:', gameId);
            return false;
        }

        const tile = game.map[position.y][position.x];

        if (tile.unit) {
            console.log('Tile already occupied');
            return false;
        }

        if (tile.type === 'WATER') {
            console.log('Cannot place unit on water');
            return false;
        }

        tile.unit = {
            id: `${unitType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: unitType,
            position: {...position},
            owner: 'player1',
            movementPoints: 2,
            maxMovementPoints: 2
        };

        console.log('Unit placed successfully:', tile.unit);
        return true;
    }

    moveUnit(gameId: string, unitId: string, newPosition: Position): boolean {
        const game = this.games.get(gameId);
        if (!game) return false;

        // Find unit
        let unit: Unit | undefined;
        let oldTile: Tile | undefined;

        for (const row of game.map) {
            for (const tile of row) {
                if (tile.unit?.id === unitId) {
                    unit = tile.unit;
                    oldTile = tile;
                    break;
                }
            }
        }

        if (!unit || !oldTile) return false;

        // Calculate path and total cost
        const pathCost = this.calculatePathCost(game.map, unit.position, newPosition);
        if (pathCost === null || pathCost > unit.movementPoints) return false;

        // Move unit
        oldTile.unit = undefined;
        unit.position = newPosition;
        unit.movementPoints -= pathCost;
        game.map[newPosition.y][newPosition.x].unit = unit;

        return true;
    }

    private calculatePathCost(map: Tile[][], start: Position, end: Position): number | null {
        const rows = map.length;
        const cols = map[0].length;

        // Initialize distances
        const distances = new Map<string, PathNode>();
        const unvisited = new Set<string>();

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const pos = `${x},${y}`;
                distances.set(pos, {
                    position: { x, y },
                    cost: Infinity
                });
                unvisited.add(pos);
            }
        }

        // Set start distance to 0
        const startKey = `${start.x},${start.y}`;
        distances.get(startKey)!.cost = 0;

        while (unvisited.size > 0) {
            // Find minimum distance
            let minDist = Infinity;
            let current = '';

            for (const pos of unvisited) {
                const node = distances.get(pos)!;
                if (node.cost < minDist) {
                    minDist = node.cost;
                    current = pos;
                }
            }

            if (current === '' || minDist === Infinity) break;

            // Remove current from unvisited
            unvisited.delete(current);

            // Check if we reached the end
            const [x, y] = current.split(',').map(Number);
            if (x === end.x && y === end.y) {
                return distances.get(current)!.cost;
            }

            // Check neighbors
            const neighbors = [
                { x: x - 1, y }, // left
                { x: x + 1, y }, // right
                { x, y: y - 1 }, // up
                { x, y: y + 1 }  // down
            ];

            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.x >= cols ||
                    neighbor.y < 0 || neighbor.y >= rows) continue;

                const tile = map[neighbor.y][neighbor.x];
                if (tile.type === 'WATER' || tile.unit) continue;

                const neighborKey = `${neighbor.x},${neighbor.y}`;
                if (!unvisited.has(neighborKey)) continue;

                const cost = distances.get(current)!.cost + this.terrainMovementCosts[tile.type];
                const neighborNode = distances.get(neighborKey)!;

                if (cost < neighborNode.cost) {
                    neighborNode.cost = cost;
                    neighborNode.previous = { x, y };
                }
            }
        }

        return null; // No path found
    }

    endTurn(gameId: string) {
        const game = this.games.get(gameId);
        if (!game) return;

        for (const row of game.map) {
            for (const tile of row) {
                if (tile.unit) {
                    tile.unit.movementPoints = tile.unit.maxMovementPoints;
                }
            }
        }
    }

    private calculateDistance(pos1: Position, pos2: Position): number {
        return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
    }

    getMovementCost(tile: Tile): number {
        return this.terrainMovementCosts[tile.type] || Infinity;
    }
}