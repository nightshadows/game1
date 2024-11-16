import { TerrainType, Tile, Position } from './types';

export class MapGenerator {
    private getRandomLandType(): TerrainType {
        const types: TerrainType[] = ['PLAINS', 'MOUNTAINS', 'FOREST'];
        const weights = [0.6, 0.2, 0.2]; // 60% plains, 20% mountains, 20% forest

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

    public generateMap(width: number, height: number): Tile[][] {
        // First, create a map with only land tiles
        const map: Tile[][] = [];
        for (let row = 0; row < height; row++) {
            map[row] = [];
            for (let column = 0; column < width; column++) {
                map[row][column] = {
                    type: this.getRandomLandType(), // Only land types initially
                    position: { row, column },
                    unit: undefined
                };
            }
        }

        // Then, add water bodies
        const numWaterBodies = Math.floor((width * height) * 0.15 / 5); // 15% of map as water, in groups of 5+
        for (let i = 0; i < numWaterBodies; i++) {
            this.createWaterBody(map);
        }

        return map;
    }

    private createWaterBody(map: Tile[][]): void {
        const height = map.length;
        const width = map[0].length;

        // Pick a random starting point
        let startRow = Math.floor(Math.random() * height);
        let startCol = Math.floor(Math.random() * width);

        // Make sure we don't start too close to the edge
        startRow = Math.min(Math.max(startRow, 1), height - 2);
        startCol = Math.min(Math.max(startCol, 1), width - 2);

        // Create a water body using flood fill
        const waterTiles: Position[] = [];
        const tilesToCheck: Position[] = [{ row: startRow, column: startCol }];
        const minSize = 5;
        const maxSize = 8;

        while (waterTiles.length < maxSize && tilesToCheck.length > 0) {
            const currentPos = tilesToCheck.shift()!;

            // Skip if already water
            if (map[currentPos.row][currentPos.column].type === 'WATER') {
                continue;
            }

            // Add current tile to water body
            waterTiles.push(currentPos);
            map[currentPos.row][currentPos.column].type = 'WATER';

            // If we haven't reached minimum size, add neighbors
            if (waterTiles.length < maxSize) {
                const neighbors = this.getHexNeighbors(currentPos.row, currentPos.column);

                // Filter valid neighbors and shuffle them
                const validNeighbors = neighbors
                    .filter(pos =>
                        pos.row >= 0 && pos.row < height &&
                        pos.column >= 0 && pos.column < width &&
                        map[pos.row][pos.column].type !== 'WATER'
                    )
                    .sort(() => Math.random() - 0.5);

                // Add valid neighbors to check
                tilesToCheck.push(...validNeighbors);
            }
        }

        // If we didn't create a large enough water body, try again
        if (waterTiles.length < minSize) {
            // Revert the changes
            waterTiles.forEach(pos => {
                map[pos.row][pos.column].type = this.getRandomLandType();
            });
            // Try again
            this.createWaterBody(map);
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
}