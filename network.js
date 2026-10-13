const SERVER_URL = "wss://server-6tox.onrender.com/ws";

export function connectToServer(username, { onPlayers, onStatus }) {
    const socket = new WebSocket(SERVER_URL);
    let playerId = null;

    socket.onopen = () => {
        onStatus("Connected");
        socket.send(JSON.stringify({
            type: "join",
            name: username
        }));
    };

    socket.onclose = () => {
        onStatus("Disconnected");
    };

    socket.onerror = error => {
        console.error("WebSocket error:", error);
    };

    socket.onmessage = event => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.error("Invalid message from multiplayer server:", error);
            return;
        }

        if (data.type === "welcome" && typeof data.id === "string") {
            playerId = data.id;
        } else if (data.myId) {
            playerId = data.myId;
        }

        if (data.type === "players") {
            onPlayers(data.players || data, playerId);
        }
    };

    return {
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
