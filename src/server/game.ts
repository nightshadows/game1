import { MapGenerator } from './mapGenerator';
import { GameState, TerrainType, Tile, Position, Unit, PathNode, Player, Game, TurnResult } from './types';
import { CombatManager } from './combatManager';

export class GameManager {
    private games: Map<string, GameState>;
    private mapGenerator: MapGenerator;
    private combatManager: CombatManager;
    private readonly NEUTRAL_PLAYER: Player = {
        id: 'neutral',
        name: 'Neutral Forces',
        color: '#808080'
    };

    private terrainMovementCosts: Record<TerrainType, number> = {
        'PLAINS': 1,
        'MOUNTAINS': 2,
        'FOREST': 1,
        'WATER': Infinity
    };

    private readonly XP_PER_LEVEL = 100;

    constructor() {
        this.games = new Map();
        this.mapGenerator = new MapGenerator();
        this.combatManager = new CombatManager();
    }

    public createGame(): string {
        const gameId = Math.random().toString(36).substring(7);
        const initialState = this.createInitialState();
        this.games.set(gameId, initialState);
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
        const player1: Player = {
            id: 'player1',
            name: 'Player 1',
            color: '#ff0000'
        };

        const state: GameState = {
            players: [player1, this.NEUTRAL_PLAYER],  // Add neutral player
            currentPlayerId: player1.id,
            map: this.mapGenerator.generateMap(10, 10),
            currentTurn: 0
        };

        // Place units after state is created
        this.placeStartingUnits(state);
        this.placeNeutralUnits(state);

        return state;
    }

    private placeStartingUnits(state: GameState) {
        const playerId = state.players[0].id;

        // Find center of the map
        const centerRow = Math.floor(state.map.length / 2);
        const centerColumn = Math.floor(state.map[0].length / 2);

        // Make sure the center and adjacent tile are plains
        state.map[centerRow][centerColumn].type = 'PLAINS';
        state.map[centerRow][centerColumn + 1].type = 'PLAINS';

        // Place settler in center
        state.map[centerRow][centerColumn].unit = this.combatManager.createUnit(
            'SETTLER',
            playerId,
            { row: centerRow, column: centerColumn }
        );

        // Place warrior adjacent to settler
        state.map[centerRow][centerColumn + 1].unit = this.combatManager.createUnit(
            'WARRIOR',
            playerId,
            { row: centerRow, column: centerColumn + 1 }
        );
    }

    private placeNeutralUnits(state: GameState) {
        const numNeutralUnits = 4;
        const unitTypes = ['WARRIOR', 'ARCHER'];
        const map = state.map;
        const height = map.length;
        const width = map[0].length;
        const centerRow = Math.floor(height / 2);
        const centerColumn = Math.floor(width / 2);

        let unitsPlaced = 0;
        let attempts = 0;
        const maxAttempts = 100;

        while (unitsPlaced < numNeutralUnits && attempts < maxAttempts) {
            attempts++;

            const row = Math.floor(Math.random() * height);
            const column = Math.floor(Math.random() * width);

            const distanceFromCenter = Math.abs(row - centerRow) + Math.abs(column - centerColumn);
            if (distanceFromCenter < 3) continue;

            const tile = map[row][column];

            if (!tile.unit && tile.type !== 'WATER' && tile.type !== 'MOUNTAINS') {
                const unitType = unitTypes[Math.floor(Math.random() * unitTypes.length)];

                tile.unit = this.combatManager.createUnit(
                    unitType,
                    this.NEUTRAL_PLAYER.id,
                    { row, column }
                );

                unitsPlaced++;
                console.log(`Placed neutral ${unitType} at (${row}, ${column})`);
            }
        }
    }

    public placeUnit(gameId: string, playerId: string, position: Position, unitType: string): boolean {
        const game = this.games.get(gameId);
        if (!game) return false;

        const tile = game.map[position.row][position.column];

        if (tile.unit) {
            console.log('Tile already occupied');
            return false;
        }

        if (tile.type === 'WATER') {
            console.log('Cannot place unit on water');
            return false;
        }

        tile.unit = this.combatManager.createUnit(
            unitType,
            playerId,
            position
        );

        console.log('Unit placed successfully:', tile.unit);
        return true;
    }

    public moveUnit(gameId: string, playerId: string, unitId: string, newPosition: Position): boolean {
        const game = this.games.get(gameId);
        if (!game) return false;

        if (game.currentPlayerId !== playerId) {
            console.log('Not this player\'s turn');
            return false;
        }

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

        // Check if unit belongs to the player
        if (!unit || unit.ownerId !== playerId) {
            console.log('Unit does not belong to this player');
            return false;
        }

        // Calculate path and total cost
        const pathCost = this.calculatePathCost(game.map, unit.position, newPosition);
        if (pathCost === null || pathCost > unit.movementPoints) return false;

        // Move unit
        oldTile.unit = undefined;
        unit.position = newPosition;
        unit.movementPoints -= pathCost;
        game.map[newPosition.row][newPosition.column].unit = unit;

        if (unit.fortified) {
            unit.fortified = false;  // Remove fortification when moving
        }

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

    public endTurn(gameId: string): TurnResult {
        const game = this.games.get(gameId);
        if (!game) return { success: false, healedUnits: [] };

        // Heal fortified units
        let healedUnits: { unitType: string, healing: number }[] = [];

        for (const row of game.map) {
            for (const tile of row) {
                const unit = tile.unit;
                if (unit && unit.fortified && unit.ownerId === 'player1') {
                    const healAmount = 10;
                    const oldHealth = unit.currentHealth;
                    unit.currentHealth = Math.min(unit.maxHealth, unit.currentHealth + healAmount);
                    const actualHealing = unit.currentHealth - oldHealth;

                    if (actualHealing > 0) {
                        healedUnits.push({
                            unitType: unit.type,
                            healing: actualHealing
                        });
                    }
                }
            }
        }

        // Reset movement points for all units
        this.resetMovementPoints(game);

        game.currentTurn++;

        return {
            success: true,
            healedUnits
        };
    }

    private resetMovementPoints(game: GameState) {
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

    public attackUnit(gameId: string, playerId: string, attackerPos: Position, defenderPos: Position): any {
        const game = this.games.get(gameId);
        if (!game) return false;

        const attacker = game.map[attackerPos.row][attackerPos.column].unit;
        const defender = game.map[defenderPos.row][defenderPos.column].unit;

        if (!attacker || !defender) return false;
        if (attacker.ownerId !== playerId) return false;
        if (attacker.movementPoints <= 0) return false;

        // Check range
        const distance = this.calculateDistance(attackerPos, defenderPos);
        if (distance > attacker.range) return false;

        // Resolve combat
        const result = this.combatManager.resolveCombat(attacker, defender);

        // Handle unit death and movement
        if (result.defenderDied && attacker.range === 1) { // Only melee units move to the target position
            // Move attacker to defender's position
            attacker.position = { ...defenderPos };
            game.map[defenderPos.row][defenderPos.column].unit = attacker;
            game.map[attackerPos.row][attackerPos.column].unit = undefined;
        } else {
            // Handle normal unit removal
            if (result.attackerDied) {
                game.map[attackerPos.row][attackerPos.column].unit = undefined;
            }
            if (result.defenderDied) {
                game.map[defenderPos.row][defenderPos.column].unit = undefined;
            }
        }

        // Consume movement points
        attacker.movementPoints = 0;

        // Return enhanced combat result
        return {
            ...result,
            attackerType: attacker.type,
            defenderType: defender.type,
            attackerLevel: result.initialAttackerLevel,
            defenderLevel: result.initialDefenderLevel,
            attackerPlayer: attacker.ownerId === 'neutral' ? 'Neutral Forces' : 'Player 1',
            defenderPlayer: defender.ownerId === 'neutral' ? 'Neutral Forces' : 'Player 1'
        };
    }

    private findUnit(game: Game, unitId: string): Unit | undefined {
        for (const row of game.map) {
            for (const tile of row) {
                if (tile.unit?.id === unitId) {
                    return tile.unit;
                }
            }
        }
        return undefined;
    }

    public fortifyUnit(gameId: string, playerId: string, unitId: string): boolean {
        const game = this.games.get(gameId);
        if (!game) return false;

        const unit = this.findUnit(game, unitId);
        if (!unit ||
            unit.ownerId !== playerId ||
            unit.fortified) {
            return false;
        }

        this.combatManager.fortifyUnit(unit);
        return true;
    }

    public levelUpUnit(gameId: string, playerId: string, unitId: string): boolean {
        const game = this.games.get(gameId);
        if (!game) return false;

        const unit = this.findUnit(game, unitId);
        if (!unit ||
            unit.ownerId !== playerId ||
            unit.experience < this.XP_PER_LEVEL ||
            unit.movementPoints <= 0) {
            return false;
        }

        this.combatManager.levelUpUnit(unit);
        return true;
    }

    public dismissUnit(gameId: string, playerId: string, unitId: string): boolean {
        const game = this.games.get(gameId);
        if (!game) {
            console.log('Game not found:', gameId); // Debug log
            return false;
        }

        console.log('Attempting to dismiss unit:', { gameId, playerId, unitId }); // Debug log

        for (let row = 0; row < game.map.length; row++) {
            for (let col = 0; col < game.map[row].length; col++) {
                const tile = game.map[row][col];
                if (tile.unit?.id === unitId && tile.unit.ownerId === playerId) {
                    console.log('Found unit to dismiss at:', row, col); // Debug log
                    tile.unit = undefined;
                    return true;
                }
            }
        }

        console.log('Unit not found or not owned by player'); // Debug log
        return false;
    }
}