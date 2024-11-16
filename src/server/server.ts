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

    ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        console.log('Received message:', data);

        switch (data.type) {
            case 'NEW_GAME':
                currentGameId = gameManager.createGame();
                console.log('Created new game:', currentGameId);
                ws.send(JSON.stringify({
                    type: 'GAME_CREATED',
                    gameId: currentGameId,
                    state: gameManager.getGameState(currentGameId)
                }));
                break;

            case 'PLACE_UNIT':
                if (currentGameId) {
                    console.log('Attempting to place unit:', data.payload);
                    const success = gameManager.placeUnit(
                        currentGameId,
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
                    console.log('No active game for unit placement');
                }
                break;

            case 'MOVE_UNIT':
                if (currentGameId) {
                    const success = gameManager.moveUnit(
                        currentGameId,
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
                    gameManager.endTurn(currentGameId);
                    ws.send(JSON.stringify({
                        type: 'GAME_UPDATED',
                        state: gameManager.getGameState(currentGameId)
                    }));
                }
                break;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});