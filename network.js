const SERVER_URL = "wss://server-6tox.onrender.com/ws";

export function createMultiplayerConnection() {
    const socket = new WebSocket(SERVER_URL);
    let playerId = null;
    const handlers = {};

    function send(data) {
        if (socket.readyState !== WebSocket.OPEN) {
            handlers.onError?.("Not connected to the multiplayer server.");
            return;
        }
        socket.send(JSON.stringify(data));
    }

    socket.onopen = () => {
        handlers.onStatus?.("Connected");
        send({ type: "list_rooms" });
    };

    socket.onclose = () => {
        handlers.onStatus?.("Disconnected");
    };

    socket.onerror = error => {
        console.error("WebSocket error:", error);
        handlers.onError?.("Could not connect to the multiplayer server.");
    };

    socket.onmessage = event => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.error("Invalid message from multiplayer server:", error);
            handlers.onError?.("Received an invalid message from the multiplayer server.");
            return;
        }

        if (data.type === "welcome" && typeof data.id === "string") {
            playerId = data.id;
            if (typeof data.username === "string") {
                handlers.onIdentity?.(data.username);
            }
        } else if (data.myId) {
            playerId = data.myId;
        }

        if (data.type === "rooms") {
            handlers.onRooms?.(data.rooms);
        } else if (data.type === "room_joined") {
            handlers.onRoomJoined?.(data.room);
        } else if (data.type === "room_error") {
            handlers.onRoomError?.(data.message || "Could not join that room.");
        } else if (data.type === "identity" && typeof data.username === "string") {
            handlers.onIdentity?.(data.username);
        } else if (data.type === "players") {
            handlers.onPlayers?.(data.players || {}, playerId);
        }
    };

    return {
        setHandlers(nextHandlers) {
            Object.assign(handlers, nextHandlers);
        },
        requestRooms() {
            send({ type: "list_rooms" });
        },
        createRoom() {
            send({ type: "create_room" });
        },
        joinRoom(roomId) {
            send({ type: "join_room", roomId });
        },
        becomeAdmin() {
            send({ type: "become_admin" });
        },
        sendPosition(position, yaw) {
            if (socket.readyState !== WebSocket.OPEN) {
                return;
            }

            socket.send(JSON.stringify({
                type: "position",
                x: position.x,
                y: position.y,
                z: position.z,
                yaw
            }));
        }
    };
}
