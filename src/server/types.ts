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

export interface Unit {
    id: string;
    type: string;
    position: Position;
    owner: string;
    movementPoints: number;
    maxMovementPoints: number;
}

export interface GameState {
    players: string[];
    map: Tile[][];
    currentTurn: number;
}

export interface PathNode {
    position: Position;
    cost: number;
    previous?: Position;
}