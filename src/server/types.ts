export type TerrainType = 'PLAINS' | 'MOUNTAINS' | 'WATER' | 'FOREST';
export type ResourceType = 'FOOD' | 'PRODUCTION' | 'GOLD';

export interface Position {
    row: number;
    column: number;
}

export interface Tile {
    type: TerrainType;
    position: Position;
    resources?: ResourceType;
    occupiedBy?: string;
    unit?: Unit;
    movementCost?: number;
}

export interface Player {
    id: string;
    name: string;
    color: string;
}

export interface GameState {
    players: Player[];
    currentPlayerId: string;
    map: Tile[][];
    currentTurn: number;
}

export interface PathNode {
    position: Position;
    cost: number;
    previous?: Position;
}

export interface Unit {
    id: string;
    type: string;
    position: Position;
    ownerId: string;
    movementPoints: number;
    maxMovementPoints: number;
    maxHealth: number;
    currentHealth: number;
    attackStrength: number;
    range: number;
    level: number;
    experience: number;
    fortified?: boolean;
}

export interface UnitConfig {
    type: string;
    maxHealth: number;
    attackStrength: number;
    range: number;
    movementPoints: number;
}

export interface CombatResult {
    attackerDamage: number;
    defenderDamage: number;
    attackerDied: boolean;
    defenderDied: boolean;
    attackerXP: number;
    defenderXP: number;
    attackerLevelUp: { levelGained: boolean; newLevel?: number } | null;
    defenderLevelUp: { levelGained: boolean; newLevel?: number } | null;
    initialAttackerLevel: number;
    initialDefenderLevel: number;
}

export interface Game {
    map: Tile[][];
    currentPlayerId: string;
}

export interface TurnResult {
    success: boolean;
    healedUnits: {
        unitType: string;
        healing: number;
    }[];
}