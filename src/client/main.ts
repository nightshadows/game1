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
        if (!this.gameState?.map) return null;

        for (const row of this.gameState.map) {
            for (const tile of row) {
                if (tile.unit?.id === unitId) {
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

        this.map.innerHTML = ''; // Clear existing map
        const mapContainer = document.createElement('div');
        mapContainer.style.display = 'grid';
        mapContainer.style.gridTemplateColumns = `repeat(${this.gameState.map[0].length}, ${this.tileSize}px)`;
        mapContainer.style.gap = '1px';

        for (let y = 0; y < this.gameState.map.length; y++) {
            for (let x = 0; x < this.gameState.map[y].length; x++) {
                const tile = this.gameState.map[y][x];
                const tileElement = this.createTileElement(tile);
                mapContainer.appendChild(tileElement);
            }
        }

        this.map.appendChild(mapContainer);
    }

    private createTileElement(tile: any): HTMLElement {
        const tileElement = document.createElement('div');
        tileElement.className = 'tile';
        tileElement.dataset.x = tile.position.x.toString();
        tileElement.dataset.y = tile.position.y.toString();

        // Set tile appearance based on type
        tileElement.classList.add(`tile-${tile.type.toLowerCase()}`);

        // Debug log for unit
        console.log('Tile data:', tile);

        // Add unit if present
        if (tile.unit) {
            console.log('Adding unit to tile:', tile.unit);
            const unitElement = document.createElement('div');
            unitElement.className = `unit unit-${tile.unit.type}`;

            if (tile.unit.id === this.selectedUnitId) {
                unitElement.classList.add('selected-unit');
            }

            const movementInfo = document.createElement('div');
            movementInfo.className = 'movement-points';
            movementInfo.textContent = `${tile.unit.movementPoints}/${tile.unit.maxMovementPoints}`;

            tileElement.appendChild(unitElement);
            tileElement.appendChild(movementInfo);
        }

        // Add tooltip
        const tooltipText = `${tile.type}${tile.unit ? ` - ${tile.unit.type}` : ''} (${tile.position.x}, ${tile.position.y})`;
        tileElement.title = tooltipText;

        tileElement.addEventListener('click', () => {
            console.log('Tile clicked:', tile);
            this.handleTileClick(tile);
        });

        // Update movement cost indicator to show path cost
        if (this.isPossibleMove(tile.position)) {
            tileElement.classList.add('possible-move');
            const move = this.possibleMoves.find(m =>
                m.x === tile.position.x && m.y === tile.position.y
            );
            const costIndicator = document.createElement('div');
            costIndicator.className = 'movement-cost';
            costIndicator.textContent = move?.cost.toString() || '';
            tileElement.appendChild(costIndicator);
        }

        return tileElement;
    }

    private handleTileClick(tile: any) {
        if (this.selectedUnit) {
            this.placeUnit(tile.position.x, tile.position.y, this.selectedUnit);
        } else if (tile.unit) {
            this.selectUnitForMovement(tile.unit);
        } else if (this.selectedUnitId && this.isPossibleMove(tile.position)) {
            this.moveUnit(this.selectedUnitId, tile.position);
        }

        this.highlightTile(tile.position);
    }

    private selectUnitForMovement(unit: any) {
        if (this.selectedUnitId !== unit.id) {
            this.clearUnitSelection();
        }

        if (unit.movementPoints > 0) {
            this.selectedUnitId = unit.id;
            this.calculatePossibleMoves(unit);
        } else {
            this.clearUnitSelection();
        }

        this.renderMap();
    }

    private calculatePossibleMoves(unit: any) {
        this.possibleMoves = [];
        const remainingPoints = unit.movementPoints;

        // Get all tiles within maximum range
        for (let y = 0; y < this.gameState.map.length; y++) {
            for (let x = 0; x < this.gameState.map[0].length; x++) {
                const pathCost = this.calculatePathCost(unit.position, { x, y });
                if (pathCost !== null && pathCost <= remainingPoints) {
                    this.possibleMoves.push({
                        x,
                        y,
                        cost: pathCost
                    });
                }
            }
        }
    }

    private calculatePathCost(start: Position, end: Position): number | null {
        const rows = this.gameState.map.length;
        const cols = this.gameState.map[0].length;

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

                const tile = this.gameState.map[neighbor.y][neighbor.x];
                if (tile.type === 'WATER' || tile.unit) continue;

                const neighborKey = `${neighbor.x},${neighbor.y}`;
                if (!unvisited.has(neighborKey)) continue;

                const cost = distances.get(current)!.cost + this.getTerrainCost(tile.type);
                const neighborNode = distances.get(neighborKey)!;

                if (cost < neighborNode.cost) {
                    neighborNode.cost = cost;
                    neighborNode.previous = { x, y };
                }
            }
        }

        return null; // No path found
    }

    private getTerrainCost(terrainType: string): number {
        const costs: Record<string, number> = {
            'PLAINS': 1,
            'MOUNTAINS': 2,
            'FOREST': 1,
            'WATER': Infinity
        };
        return costs[terrainType] || Infinity;
    }

    private isPossibleMove(position: Position): boolean {
        return this.possibleMoves.some(pos => pos.x === position.x && pos.y === position.y);
    }

    private moveUnit(unitId: string, newPosition: Position) {
        this.ws.send(JSON.stringify({
            type: 'MOVE_UNIT',
            payload: {
                unitId,
                position: newPosition
            }
        }));
    }

    private placeUnit(x: number, y: number, unitType: string) {
        this.ws.send(JSON.stringify({
            type: 'PLACE_UNIT',
            payload: {
                position: { x, y },
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
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});