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
    private playerId: string | null = null;
    private readonly XP_PER_LEVEL = 100;
    private infoPanel: HTMLElement;
    private lastClickedUnit: any = null;

    constructor() {
        this.map = document.getElementById('map')!;
        this.ws = new WebSocket(`ws://${window.location.hostname}:3000`);
        this.initializeWebSocket();
        this.initializeControls();
        this.initializeUnitControls();
        this.infoPanel = document.getElementById('unit-info-panel')!;
        this.showEmptyInfoPanel();

        (window as any).game.confirmDismissUnit = this.confirmDismissUnit.bind(this);
        (window as any).game.dismissUnit = this.dismissUnit.bind(this);
        (window as any).game.levelUpUnit = this.levelUpUnit.bind(this);
        (window as any).game.fortifyUnit = this.fortifyUnit.bind(this);
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
                this.playerId = data.playerId;
                this.lastClickedUnit = null;
                this.selectedUnitId = null;
                this.showEmptyInfoPanel();
                this.clearCombatLog();
                this.renderMap();
                this.centerMapOnStartingUnits();
                break;
            case 'GAME_UPDATED':
                const previousState = this.gameState;
                this.gameState = data.state;

                // If this update was from a fortify action, add the log message
                if (data.fortified) {
                    const unit = this.findUnit(data.fortified.unitId);
                    if (unit) {
                        this.addCombatLog(`
                            <span class="log-status">
                                🛡️ ${this.getUnitSymbol(unit.type)} ${unit.type} is now fortified (+5 defense)
                            </span>
                        `);
                    }
                }

                // Clear selection if the selected unit was dismissed
                if (this.selectedUnitId) {
                    const unit = this.findUnit(this.selectedUnitId);
                    if (!unit) {
                        this.clearUnitSelection();
                        this.showEmptyInfoPanel();
                    }
                }

                // Check for combat results
                if (data.combatResult) {
                    const {
                        attackerDamage, defenderDamage,
                        attackerDied, defenderDied,
                        attackerXP, defenderXP,
                        attackerType, defenderType,
                        attackerPlayer, defenderPlayer
                    } = data.combatResult;

                    // Combat message
                    let logMessage = `
                        <span class="log-damage">⚔️ ${attackerType} (${attackerPlayer}) attacks ${defenderType} (${defenderPlayer})!</span><br>
                        <span class="log-damage">➡️ Deals ${attackerDamage} damage</span>`;

                    if (defenderDamage > 0) {
                        logMessage += `<br><span class="log-damage">↩️ Counter attack: ${defenderDamage} damage</span>`;
                    }

                    if (attackerDied || defenderDied) {
                        const deadUnit = attackerDied ? attackerType : defenderType;
                        const deadPlayer = attackerDied ? attackerPlayer : defenderPlayer;
                        logMessage += `<br><span class="log-death">💀 ${deadUnit} (${deadPlayer}) was defeated!</span>`;
                    }

                    if (attackerXP > 0) {
                        logMessage += `<br><span class="log-experience">⭐ ${attackerType} gained ${attackerXP} XP</span>`;
                    }
                    if (defenderXP > 0) {
                        logMessage += `<br><span class="log-experience">⭐ ${defenderType} gained ${defenderXP} XP</span>`;
                    }

                    this.addCombatLog(logMessage);
                }

                // Update info panel based on selected unit first
                if (this.selectedUnitId) {
                    const selectedUnit = this.findUnit(this.selectedUnitId);
                    if (selectedUnit) {
                        this.updateInfoPanel(selectedUnit);
                    }
                }
                // If no selected unit but we have a last clicked unit, show that instead
                else if (this.lastClickedUnit) {
                    const clickedUnit = this.findUnit(this.lastClickedUnit.id);
                    if (clickedUnit) {
                        this.lastClickedUnit = clickedUnit;
                        this.updateInfoPanel(clickedUnit);
                    } else {
                        this.lastClickedUnit = null;
                        this.showEmptyInfoPanel();
                    }
                }

                // Rest of update handling
                if (this.selectedUnitId) {
                    const unit = this.findUnit(this.selectedUnitId);
                    if (unit) {
                        this.calculatePossibleMoves(unit);
                    } else {
                        this.clearUnitSelection();
                        this.showEmptyInfoPanel();
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
        if (tile.unit) {
            // Always show info for clicked unit
            this.lastClickedUnit = tile.unit;
            this.updateInfoPanel(tile.unit);

            // If we have a selected unit and clicked on an enemy/neutral unit, initiate combat
            if (this.selectedUnitId) {
                const selectedUnit = this.findUnit(this.selectedUnitId);
                if (selectedUnit &&
                    tile.unit.ownerId !== this.playerId &&
                    selectedUnit.ownerId === this.playerId) {

                    // Check if target is within range
                    const distance = this.calculateDistance(selectedUnit.position, tile.position);
                    if (distance <= selectedUnit.range) {
                        this.ws.send(JSON.stringify({
                            type: 'ATTACK',
                            attackerPos: selectedUnit.position,
                            defenderPos: tile.position
                        }));
                        return;
                    }
                }
            }
        } else {
            this.lastClickedUnit = null;
            this.showEmptyInfoPanel();
        }

        if (tile.unit && tile.unit.ownerId !== this.playerId) {
            console.log('Cannot control neutral/enemy units');
            return;
        }

        if (this.selectedUnit && !tile.unit && tile.type !== 'WATER') {
            console.log('Placing new unit:', this.selectedUnit);
            this.placeUnit(tile.position.row, tile.position.column, this.selectedUnit);
            return;
        }

        if (tile.unit && tile.unit.ownerId === this.playerId) {
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

    private getHealthBarColor(currentHealth: number, maxHealth: number): string {
        const healthPercent = (currentHealth / maxHealth) * 100;
        if (healthPercent > 66) return '#2ecc71'; // Green
        if (healthPercent > 33) return '#f1c40f'; // Yellow
        return '#e74c3c'; // Red
    }

    private createUnitElement(unit: any): HTMLElement {
        const unitElement = document.createElement('div');
        unitElement.className = `unit unit-${unit.type}`;

        if (unit.ownerId === this.playerId) {
            unitElement.classList.add('unit-owned');
        } else if (unit.ownerId === 'neutral') {
            unitElement.classList.add('unit-neutral');
        }

        // Just show the unit symbol
        const symbolElement = document.createElement('span');
        symbolElement.textContent = this.getUnitSymbol(unit.type);
        unitElement.appendChild(symbolElement);

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

    private showEmptyInfoPanel() {
        this.infoPanel.className = 'empty';
        this.infoPanel.innerHTML = `
            <div style="text-align: center;">
                No unit selected
            </div>
        `;
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

    private updateInfoPanel(unit: any) {
        this.infoPanel.className = '';
        this.infoPanel.innerHTML = `
            <div class="unit-info-content">
                <div class="unit-info-main">
                    <div style="font-size: 16px; margin-bottom: 5px;">
                        ${this.getUnitSymbol(unit.type)} ${unit.type}
                        <span style="color: #aaa;">Level ${unit.level}</span>
                    </div>
                    <div class="health-bar">
                        <div class="health-bar-fill"
                             style="width: ${(unit.currentHealth / unit.maxHealth) * 100}%;
                                    background: ${this.getHealthBarColor(unit.currentHealth, unit.maxHealth)};">
                        </div>
                    </div>
                    <div style="color: ${this.getHealthBarColor(unit.currentHealth, unit.maxHealth)}">
                        HP: ${unit.currentHealth}/${unit.maxHealth}
                    </div>
                    <div>Attack: ${unit.attackStrength} (Range: ${unit.range})</div>
                    <div>XP: ${unit.experience}/${this.XP_PER_LEVEL}</div>
                    <div>Movement: ${unit.movementPoints}/${unit.maxMovementPoints}</div>
                </div>
                ${unit.fortified ? '<div class="unit-status">🛡️ Fortified</div>' : ''}
            </div>

            ${unit.ownerId === this.playerId ? `
                <div class="unit-actions">
                    <button
                        class="action-button fortify"
                        ${unit.movementPoints <= 0 || unit.fortified ? 'disabled' : ''}
                        onclick="window.game.fortifyUnit('${unit.id}')">
                        🛡️ Fortify
                    </button>
                    ${unit.experience >= this.XP_PER_LEVEL ? `
                        <button
                            class="action-button level-up"
                            ${unit.movementPoints <= 0 ? 'disabled' : ''}
                            onclick="window.game.levelUpUnit('${unit.id}')">
                            ⭐ Level Up
                        </button>
                    ` : ''}
                    <button
                        class="action-button dismiss"
                        onclick="window.game.confirmDismissUnit('${unit.id}')">
                        ❌ Dismiss
                    </button>
                </div>
            ` : ''}
        `;
    }

    private addCombatLog(message: string) {
        const logWindow = document.getElementById('combat-log');
        if (!logWindow) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = message;
        logWindow.appendChild(entry);

        // Keep only the last 50 messages
        while (logWindow.children.length > 50) {
            logWindow.removeChild(logWindow.firstChild!);
        }

        // Scroll to the bottom to show new message
        logWindow.scrollTop = logWindow.scrollHeight;
    }

    private clearCombatLog() {
        const logWindow = document.getElementById('combat-log');
        if (logWindow) {
            logWindow.innerHTML = '';
        }
    }

    private fortifyUnit(unitId: string) {
        const unit = this.findUnit(unitId);
        if (!unit || unit.movementPoints <= 0) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'FORTIFY_UNIT',
            payload: { unitId }
        }));

        // We'll move the combat log message to handleServerMessage
        // because we want to show it only after successful fortification
    }

    private levelUpUnit(unitId: string) {
        // Find the unit before the level up to get its type
        const unit = this.findUnit(unitId);
        if (!unit) return;

        this.ws.send(JSON.stringify({
            type: 'LEVEL_UP_UNIT',
            payload: { unitId }
        }));

        // Add level up message to combat log
        this.addCombatLog(`
            <span class="log-level-up">
                🌟 ${this.getUnitSymbol(unit.type)} ${unit.type} reached level ${unit.level + 1}!<br>
                💪 Attack increased by 10<br>
                ❤️ Unit healed
            </span>
        `);
    }

    private confirmDismissUnit(unitId: string) {
        if (confirm('Are you sure you want to dismiss this unit?')) {
            console.log('Sending dismiss request for unit:', unitId); // Debug log
            this.dismissUnit(unitId);
        }
    }

    private dismissUnit(unitId: string) {
        this.ws.send(JSON.stringify({
            type: 'DISMISS_UNIT',
            payload: { unitId }
        }));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});

(window as any).game = new Game();