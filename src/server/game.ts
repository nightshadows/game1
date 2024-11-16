import { MapGenerator } from './mapGenerator';
import { GameState, TerrainType, Tile, Position, Unit, PathNode } from './types';

export class GameManager {
    private games: Map<string, GameState>;
    private mapGenerator: MapGenerator;
    private terrainMovementCosts: Record<TerrainType, number> = {
        'PLAINS': 1,
        'MOUNTAINS': 2,
        'FOREST': 1,
        'WATER': Infinity
    };

    constructor() {
        this.games = new Map();
        this.mapGenerator = new MapGenerator();
    }

    public createGame(): string {
        const gameId = Math.random().toString(36).substring(7);
        const initialState = this.createInitialState();
        this.games.set(gameId, initialState);

        // Place starting units
        this.placeStartingUnits(gameId);

        return gameId;
    }

    public getGameState(gameId: string): GameState | undefined {
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
            map: this.mapGenerator.generateMap(10, 10),
            currentTurn: 0
        };
    }

    private placeStartingUnits(gameId: string) {
        const game = this.games.get(gameId);
        if (!game) return;

        // Find center of the map
        const centerRow = Math.floor(game.map.length / 2);
        const centerColumn = Math.floor(game.map[0].length / 2);

        // Make sure the center and adjacent tile are plains (for better start)
        game.map[centerRow][centerColumn].type = 'PLAINS';
        game.map[centerRow][centerColumn + 1].type = 'PLAINS';

        // Place settler in center
        game.map[centerRow][centerColumn].unit = {
            id: `SETTLER-${Date.now()}`,
            type: 'SETTLER',
            position: { row: centerRow, column: centerColumn },
            owner: 'player1',
            movementPoints: 2,
            maxMovementPoints: 2
        };

        // Place warrior adjacent to settler
        game.map[centerRow][centerColumn + 1].unit = {
            id: `WARRIOR-${Date.now()}`,
            type: 'WARRIOR',
            position: { row: centerRow, column: centerColumn + 1 },
            owner: 'player1',
            movementPoints: 2,
            maxMovementPoints: 2
        };

        console.log('Placed starting units:', game.map[centerRow][centerColumn].unit, game.map[centerRow][centerColumn + 1].unit);
    }

    public placeUnit(gameId: string, position: Position, unitType: string): boolean {
        const game = this.games.get(gameId);
        if (!game) {
            console.log('Game not found:', gameId);
            return false;
        }

        const tile = game.map[position.row][position.column];

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

    public moveUnit(gameId: string, unitId: string, newPosition: Position): boolean {
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
        game.map[newPosition.row][newPosition.column].unit = unit;

        return true;
    }

    private calculatePathCost(map: Tile[][], start: Position, end: Position): number | null {
        const rows = map.length;
        const cols = map[0].length;

        // Initialize distances
        const distances = new Map<string, PathNode>();
        const unvisited = new Set<string>();

        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < cols; column++) {
                const pos = `${row},${column}`;
                distances.set(pos, {
                    position: { row, column },
                    cost: Infinity
                });
                unvisited.add(pos);
            }
        }

        // Set start distance to 0
        const startKey = `${start.row},${start.column}`;
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
            const [row, column] = current.split(',').map(Number);
            if (row === end.row && column === end.column) {
                return distances.get(current)!.cost;
            }

            // Check hex neighbors instead of square neighbors
            const isOddRow = row % 2 === 1;
            const neighbors = isOddRow ? [
                { row: row-1, column: column },         // top left
                { row: row-1, column: column+1 },       // top right
                { row: row, column: column+1 },         // right
                { row: row, column: column-1 },         // left
                { row: row+1, column: column },         // bottom left
                { row: row+1, column: column+1 }         // bottom right
            ] : [
                { row: row-1, column: column-1 },       // top left
                { row: row-1, column: column },         // top right
                { row: row, column: column+1 },         // right
                { row: row, column: column-1 },         // left
                { row: row+1, column: column-1 },         // bottom left
                { row: row+1, column: column }             // bottom right
            ];

            for (const neighbor of neighbors) {
                if (neighbor.row < 0 || neighbor.row >= rows ||
                    neighbor.column < 0 || neighbor.column >= cols) continue;

                const tile = map[neighbor.row][neighbor.column];
                if (tile.type === 'WATER' || tile.unit) continue;

                const neighborKey = `${neighbor.row},${neighbor.column}`;
                if (!unvisited.has(neighborKey)) continue;

                const cost = distances.get(current)!.cost + this.terrainMovementCosts[tile.type];
                const neighborNode = distances.get(neighborKey)!;

                if (cost < neighborNode.cost) {
                    neighborNode.cost = cost;
                    neighborNode.previous = { row, column };
                }
            }
        }

        return null; // No path found
    }

    public endTurn(gameId: string): void {
        const game = this.games.get(gameId);
        if (!game) return;

        // Reset movement points for all units
        for (const row of game.map) {
            for (const tile of row) {
                if (tile.unit) {
                    tile.unit.movementPoints = tile.unit.maxMovementPoints;
                }
            }
        }
    }

    private calculateDistance(pos1: Position, pos2: Position): number {
        // Convert axial coordinates to cube coordinates
        const x1 = pos1.column - (pos1.row - (pos1.row & 1)) / 2;
        const z1 = pos1.row;
        const y1 = -x1 - z1;

        const x2 = pos2.column - (pos2.row - (pos2.row & 1)) / 2;
        const z2 = pos2.row;
        const y2 = -x2 - z2;

        // Return the hex distance
        return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
    }

    public getMovementCost(tile: Tile): number {
        return this.terrainMovementCosts[tile.type] || Infinity;
    }
}