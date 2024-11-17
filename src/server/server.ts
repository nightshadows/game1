import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { GameManager } from './game';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const gameManager = new GameManager();

// Serve static files during development
app.use(express.static('dist'));

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentGameId: string | null = null;
    let playerId: string | null = null;

    ws.on('message', (message: string) => {
        const data = JSON.parse(message);
        console.log('Received message:', data); // Debug log

        switch (data.type) {
            case 'NEW_GAME':
                currentGameId = gameManager.createGame();
                playerId = 'player1';
                console.log('Created new game:', currentGameId);
                ws.send(JSON.stringify({
                    type: 'GAME_CREATED',
                    gameId: currentGameId,
                    playerId: playerId,
                    state: gameManager.getGameState(currentGameId)
                }));
                break;

            case 'PLACE_UNIT':
                if (currentGameId && playerId) {
                    console.log('Attempting to place unit:', data.payload);
                    const success = gameManager.placeUnit(
                        currentGameId,
                        playerId,
                        data.payload.position,
                        data.payload.unitType
                    );
                    console.log('Unit placement success:', success);
                    if (success) {
                        const newState = gameManager.getGameState(currentGameId);
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: newState
                        }));
                    }
                } else {
                    console.log('No active game or player for unit placement');
                }
                break;

            case 'MOVE_UNIT':
                if (currentGameId && playerId) {
                    const success = gameManager.moveUnit(
                        currentGameId,
                        playerId,
                        data.payload.unitId,
                        data.payload.position
                    );
                    if (success) {
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: gameManager.getGameState(currentGameId)
                        }));
                    }
                }
                break;

            case 'END_TURN':
                if (currentGameId) {
                    const turnResult = gameManager.endTurn(currentGameId);
                    if (turnResult.success) {
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: gameManager.getGameState(currentGameId),
                            healedUnits: turnResult.healedUnits
                        }));
                    }
                }
                break;

            case 'ATTACK':
                if (currentGameId && playerId) {
                    const attackSuccess = gameManager.attackUnit(
                        currentGameId,
                        playerId,
                        data.attackerPos,
                        data.defenderPos
                    );

                    if (attackSuccess && currentGameId) {
                        const newState = gameManager.getGameState(currentGameId);
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: newState,
                            combatResult: attackSuccess
                        }));
                    }
                }
                break;

            case 'DISMISS_UNIT':
                if (currentGameId && playerId) {
                    console.log('Processing dismiss unit request:', {
                        gameId: currentGameId,
                        playerId,
                        unitId: data.payload.unitId
                    }); // Debug log

                    const success = gameManager.dismissUnit(
                        currentGameId,
                        playerId,
                        data.payload.unitId
                    );

                    console.log('Dismiss result:', success); // Debug log

                    if (success) {
                        const newState = gameManager.getGameState(currentGameId);
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: newState
                        }));
                    }
                } else {
                    console.log('Missing gameId or playerId for dismiss action'); // Debug log
                }
                break;

            case 'LEVEL_UP_UNIT':
                if (currentGameId && playerId) {
                    const success = gameManager.levelUpUnit(
                        currentGameId,
                        playerId,
                        data.payload.unitId
                    );
                    if (success) {
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: gameManager.getGameState(currentGameId)
                        }));
                    }
                }
                break;

            case 'FORTIFY_UNIT':
                if (currentGameId && playerId) {
                    const success = gameManager.fortifyUnit(
                        currentGameId,
                        playerId,
                        data.payload.unitId
                    );
                    if (success) {
                        ws.send(JSON.stringify({
                            type: 'GAME_UPDATED',
                            state: gameManager.getGameState(currentGameId),
                            fortified: { unitId: data.payload.unitId }
                        }));
                    }
                }
                break;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});