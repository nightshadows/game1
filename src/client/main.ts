interface Position {
    row: number;
    column: number;
}

class Game {
    private ws: WebSocket;
    private map: HTMLElement;
    private gameState: any;
    private tileSize = 40; // pixels per tile
    private selectedUnit: string | null = null;
    private selectedUnitId: string | null = null;
    private possibleMoves: Position[] = [];

    constructor() {
        this.map = document.getElementById('map')!;
        this.ws = new WebSocket(`ws://${window.location.hostname}:3000`);
        this.initializeWebSocket();
        this.initializeControls();
        this.initializeUnitControls();
    }

    private initializeWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to server');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
    }

    private handleServerMessage(data: any) {
        console.log('Received from server:', data);

        switch (data.type) {
            case 'GAME_CREATED':
                this.gameState = data.state;
                this.renderMap();
                this.centerMapOnStartingUnits();
                break;
            case 'GAME_UPDATED':
                this.gameState = data.state;
                if (this.selectedUnitId) {
                    const unit = this.findUnit(this.selectedUnitId);
                    if (unit) {
                        this.calculatePossibleMoves(unit);
                    } else {
                        this.clearUnitSelection();
                    }
                }
                if (this.selectedUnit) {
                    this.unselectUnitButton();
                }
                this.renderMap();
                break;
        }
    }

    private findUnit(unitId: string): any {
        for (const row of this.gameState.map) {
            for (const tile of row) {
                if (tile.unit?.id === unitId) {
                    console.log('Found unit:', tile.unit);
                    return tile.unit;
                }
            }
        }
        return null;
    }

    private clearUnitSelection() {
        this.selectedUnitId = null;
        this.possibleMoves = [];
    }

    private renderMap() {
        if (!this.gameState?.map) return;

        this.map.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'hex-grid';

        for (let y = 0; y < this.gameState.map.length; y++) {
            const row = document.createElement('div');
            row.className = 'hex-row';

            for (let x = 0; x < this.gameState.map[y].length; x++) {
                const tile = this.gameState.map[y][x];
                const tileElement = this.createTileElement(tile);
                row.appendChild(tileElement);
            }

            container.appendChild(row);
        }

        this.map.appendChild(container);
    }

    private createTileElement(tile: any): HTMLElement {
        const tileElement = document.createElement('div');
        tileElement.className = 'tile';
        tileElement.classList.add(`tile-${tile.type.toLowerCase()}`);

        // Add coords label
        const coordsLabel = document.createElement('div');
        coordsLabel.className = 'coords-label';
        coordsLabel.textContent = `(${tile.position.row},${tile.position.column})`;
        tileElement.appendChild(coordsLabel);

        // Add possible move indicator (red dot)
        if (this.isPossibleMove(tile.position)) {
            tileElement.classList.add('possible-move');
        }

        // Add unit if present
        if (tile.unit) {
            const unitElement = this.createUnitElement(tile.unit);
            if (tile.unit.id === this.selectedUnitId) {
                unitElement.classList.add('selected-unit');
            }

            const movementInfo = document.createElement('div');
            movementInfo.className = 'movement-points';
            movementInfo.textContent = `${tile.unit.movementPoints}/${tile.unit.maxMovementPoints}`;

            tileElement.appendChild(unitElement);
            tileElement.appendChild(movementInfo);
        }

        tileElement.addEventListener('click', () => {
            this.handleTileClick(tile);
        });

        return tileElement;
    }

    private handleTileClick(tile: { position: Position, unit?: any, type: string }) {
        if (this.selectedUnit && !tile.unit && tile.type !== 'WATER') {
            console.log('Placing new unit:', this.selectedUnit);
            this.placeUnit(tile.position.row, tile.position.column, this.selectedUnit);
            return;
        }

        if (tile.unit) {
            console.log('Selected unit:', tile.unit);
            this.selectedUnitId = tile.unit.id;
            this.calculatePossibleMoves(tile.unit);
            this.renderMap();
        } else if (this.selectedUnitId && this.isPossibleMove(tile.position)) {
            console.log('Moving unit to:', tile.position);
            this.moveUnit(this.selectedUnitId, tile.position);
        } else {
            this.selectedUnitId = null;
            this.possibleMoves = [];
            this.renderMap();
        }
    }

    private selectUnitForMovement(unit: any) {
        if (this.selectedUnitId !== unit.id) {
            this.clearUnitSelection();
        }

        if (unit.movementPoints > 0) {
            this.selectedUnitId = unit.id;
            this.calculatePossibleMoves(unit);
            this.renderMap();
        } else {
            this.clearUnitSelection();
            this.renderMap();
        }
    }

    private calculatePossibleMoves(unit: any) {
        const startRow = unit.position.row;
        const startCol = unit.position.column;

        this.possibleMoves = [];
        const visited = new Map<string, number>();
        const key = (row: number, col: number) => `${row},${col}`;

        const queue: [number, number, number][] = [[startRow, startCol, unit.movementPoints]];
        visited.set(key(startRow, startCol), 0);

        while (queue.length > 0) {
            const [row, col, points] = queue.shift()!;
            const neighbors = this.getHexNeighbors(row, col);

            for (const neighbor of neighbors) {
                if (!this.isValidPosition(neighbor.row, neighbor.column)) {
                    continue;
                }

                const tile = this.gameState.map[neighbor.row][neighbor.column];
                if (tile.type === 'WATER' || tile.unit) {
                    continue;
                }

                const cost = this.getTerrainCost(tile.type);
                const newKey = key(neighbor.row, neighbor.column);
                const currentCost = visited.get(key(row, col))!;
                const totalCost = currentCost + cost;

                if ((!visited.has(newKey) || visited.get(newKey)! > totalCost) &&
                    totalCost <= unit.movementPoints) {

                    visited.set(newKey, totalCost);
                    queue.push([neighbor.row, neighbor.column, unit.movementPoints - totalCost]);

                    if (!(neighbor.row === startRow && neighbor.column === startCol)) {
                        this.possibleMoves.push({ row: neighbor.row, column: neighbor.column });
                    }
                }
            }
        }
    }

    private getTerrainCost(terrainType: string): number {
        switch (terrainType.toUpperCase()) {
            case 'PLAINS':
            case 'FOREST':
                return 1;
            case 'MOUNTAINS':
                return 2;
            case 'WATER':
                return Infinity;
            default:
                return 1;
        }
    }

    private getHexNeighbors(row: number, col: number): Position[] {
        const isOddRow = row % 2 === 1;

        if (isOddRow) {
            return [
                { row: row-1, column: col },     // top left
                { row: row-1, column: col+1 },   // top right
                { row: row, column: col+1 },     // right
                { row: row, column: col-1 },     // left
                { row: row+1, column: col },     // bottom left
                { row: row+1, column: col+1 }    // bottom right
            ];
        } else {
            return [
                { row: row-1, column: col-1 },   // top left
                { row: row-1, column: col },     // top right
                { row: row, column: col+1 },     // right
                { row: row, column: col-1 },     // left
                { row: row+1, column: col-1 },   // bottom left
                { row: row+1, column: col }      // bottom right
            ];
        }
    }

    private moveUnit(unitId: string, newPosition: Position) {
        this.ws.send(JSON.stringify({
            type: 'MOVE_UNIT',
            payload: {
                unitId,
                position: {
                    row: newPosition.row,
                    column: newPosition.column
                }
            }
        }));
    }

    private placeUnit(row: number, column: number, unitType: string) {
        this.ws.send(JSON.stringify({
            type: 'PLACE_UNIT',
            payload: {
                position: { row, column },
                unitType
            }
        }));
    }

    private initializeControls() {
        document.getElementById('newGame')?.addEventListener('click', () => {
            this.startNewGame();
        });

        document.getElementById('endTurn')?.addEventListener('click', () => {
            this.endTurn();
        });
    }

    private startNewGame() {
        this.selectedUnit = null;
        this.selectedUnitId = null;
        this.possibleMoves = [];

        document.querySelectorAll('.unit-button').forEach(button => {
            button.classList.remove('selected');
        });

        this.ws.send(JSON.stringify({ type: 'NEW_GAME' }));
    }

    private endTurn() {
        this.ws.send(JSON.stringify({ type: 'END_TURN' }));
    }

    private initializeUnitControls() {
        const unitButtons = document.querySelectorAll('.unit-button');
        unitButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const unit = target.dataset.unit;

                // Toggle unit selection
                if (this.selectedUnit === unit) {
                    this.selectedUnit = null;
                    target.classList.remove('selected');
                } else {
                    unitButtons.forEach(b => b.classList.remove('selected'));
                    this.selectedUnit = unit || null;
                    target.classList.add('selected');
                }
            });
        });
    }

    private unselectUnitButton() {
        this.selectedUnit = null;
        document.querySelectorAll('.unit-button').forEach(button => {
            button.classList.remove('selected');
        });
    }

    private centerMapOnStartingUnits() {
        for (const row of this.gameState.map) {
            for (const tile of row) {
                if (tile.unit?.type === 'SETTLER') {
                    console.log('Starting position:', tile.position);
                    break;
                }
            }
        }
    }

    private isPossibleMove(position: Position): boolean {
        return this.possibleMoves.some(move =>
            move.row === position.row && move.column === position.column
        );
    }

    private isValidPosition(row: number, col: number): boolean {
        return row >= 0 && row < this.gameState.map.length &&
               col >= 0 && col < this.gameState.map[0].length;
    }

    private highlightTile(tile: any) {
        // First, remove highlight from all tiles
        const tiles = document.querySelectorAll('.tile');
        tiles.forEach(tile => {
            tile.classList.remove('tile-highlighted');
            tile.classList.remove('tile-possible-move');
        });

        // If we have a selected unit, highlight possible moves
        if (this.selectedUnitId) {
            this.possibleMoves.forEach(move => {
                const tileElement = this.getTileElement(move.row, move.column);
                if (tileElement) {
                    tileElement.classList.add('tile-possible-move');
                }
            });
        }

        // Highlight the selected tile if it has a position
        if (tile && tile.position) {
            const tileElement = this.getTileElement(tile.position.row, tile.position.column);
            if (tileElement) {
                tileElement.classList.add('tile-highlighted');
            }
        }
    }

    private getTileElement(row: number, col: number): HTMLElement | null {
        const coordsLabel = `(${row},${col})`;  // Changed to match new format
        const tiles = document.querySelectorAll('.tile');
        for (const tile of tiles) {
            const label = tile.querySelector('.coords-label');
            if (label && label.textContent === coordsLabel) {
                return tile as HTMLElement;
            }
        }
        return null;
    }

    private createUnitElement(unit: any): HTMLElement {
        const unitElement = document.createElement('div');
        unitElement.className = `unit unit-${unit.type}`;
        unitElement.textContent = this.getUnitSymbol(unit.type);
        return unitElement;
    }

    private getUnitSymbol(unitType: string): string {
        switch (unitType) {
            case 'WARRIOR': return '🗡️';
            case 'SETTLER': return '👨‍🌾';
            case 'ARCHER': return '🏹';
            default: return '❓';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});