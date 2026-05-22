import json
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
import os

app = FastAPI()

# Locate the static files directory
script_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(script_dir, "static")

# Create the static files directory if it doesn't exist
os.makedirs(static_dir, exist_ok=True)

# Connection Manager for Lobby Rooms
class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        # player_index -> WebSocket connection
        self.players: Dict[int, WebSocket] = {}

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    async def connect(self, websocket: WebSocket, room_id: str, player_index: int):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id)
        room = self.rooms[room_id]
        
        # Save connection (allow joining if slot is empty)
        room.players[player_index] = websocket

        # If both Player 1 (Host) and Player 2 (Client) are connected, notify both of readiness
        if len(room.players) == 2:
            await self.send_to_player(room_id, 0, {"type": "PLAYER_JOINED"})
            await self.send_to_player(room_id, 1, {"type": "PLAYER_JOINED"})

    def disconnect(self, room_id: str, player_index: int):
        if room_id in self.rooms:
            room = self.rooms[room_id]
            if player_index in room.players:
                del room.players[player_index]
            if not room.players:
                del self.rooms[room_id]

    async def send_to_player(self, room_id: str, player_index: int, message: dict):
        if room_id in self.rooms:
            room = self.rooms[room_id]
            if player_index in room.players:
                try:
                    await room.players[player_index].send_json(message)
                except Exception:
                    pass

    async def broadcast_to_other(self, room_id: str, sender_index: int, message: dict):
        other_index = 1 - sender_index
        await self.send_to_player(room_id, other_index, message)

manager = ConnectionManager()

@app.websocket("/ws/room/{room_id}/{player_index}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_index: str):
    idx = int(player_index)
    await manager.connect(websocket, room_id, idx)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            # Broker the message to the other player in this room
            await manager.broadcast_to_other(room_id, idx, message)
    except WebSocketDisconnect:
        manager.disconnect(room_id, idx)
        await manager.send_to_player(room_id, 1 - idx, {"type": "PEER_DISCONNECTED"})
    except Exception:
        manager.disconnect(room_id, idx)
        await manager.send_to_player(room_id, 1 - idx, {"type": "PEER_DISCONNECTED"})

# Mount the static files directory
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def read_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Tank Battle Game Frontend is loading...</h1><p>Please wait while index.html is generated.</p>")


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

