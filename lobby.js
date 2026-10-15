export function mountLobby(root, initialRoom, multiplayer, onGameStarted, onKicked) {
    const roomName = root.querySelector("#lobby-room-name");
    const playerList = root.querySelector("#lobby-player-list");
    const modeSelect = root.querySelector("#lobby-game-mode");
    const modePanel = root.querySelector("#lobby-mode-panel");
    const modeLabel = modePanel.querySelector("label");
    const modeDisplay = root.querySelector("#lobby-mode-display");
    const startButton = root.querySelector("#lobby-start");
    const hostStatus = root.querySelector("#lobby-host-status");
    const errorElement = root.querySelector("#lobby-error");
    let room = initialRoom;
    let disposed = false;

    function updateRoom(nextRoom) {
        if (!nextRoom || typeof nextRoom !== "object") {
            return;
        }

        room = nextRoom;
        roomName.textContent = room.name || "Room";
        const gameMode = room.gameMode === "hide_and_seek" ? "hide_and_seek" : "sandbox";
        modeSelect.value = gameMode;
        const isHost = multiplayer.getPlayerId() === room.hostId;
        modeLabel.hidden = !isHost;
        modeSelect.hidden = !isHost;
        modeDisplay.hidden = isHost;
        modeDisplay.textContent = gameMode === "hide_and_seek" ? "Hide and Seek" : "Sandbox";
        startButton.hidden = !isHost;
        hostStatus.textContent = isHost
            ? "You are the host. Choose a mode and start when everyone is ready."
            : "Waiting for the host to choose a mode and start the game.";
        startButton.disabled = room.started === true;
        modeSelect.disabled = !isHost || room.started === true;

        playerList.replaceChildren();
        const players = Object.entries(room.players || {});
        if (players.length === 0) {
            const empty = document.createElement("li");
            empty.textContent = "Waiting for players...";
            playerList.appendChild(empty);
            return;
        }

        for (const [playerId, player] of players) {
            const item = document.createElement("li");
            const name = document.createElement("span");
            name.textContent = player.name || "Player";
            if (playerId === room.hostId) {
                const badge = document.createElement("strong");
                badge.className = "lobby-host-badge";
                badge.textContent = "HOST";
                name.append(" ", badge);
            }
            item.appendChild(name);

            if (isHost && playerId !== room.hostId) {
                const kickButton = document.createElement("button");
                kickButton.type = "button";
                kickButton.className = "lobby-kick-button";
                kickButton.textContent = "Kick";
                kickButton.setAttribute("aria-label", `Kick ${player.name || "player"}`);
                kickButton.addEventListener("click", () => {
                    multiplayer.kickPlayer(playerId);
                });
                item.appendChild(kickButton);
            }
            playerList.appendChild(item);
        }
    }

    modeSelect.addEventListener("change", () => {
        multiplayer.setGameMode(modeSelect.value);
    });
    startButton.addEventListener("click", () => {
        errorElement.textContent = "";
        multiplayer.startGame();
    });

    multiplayer.setHandlers({
        onRoomState: updateRoom,
        onGameStarted: startedRoom => {
            if (!disposed) {
                onGameStarted(startedRoom);
            }
        },
        onRoomKicked: message => {
            if (!disposed) {
                onKicked(message);
            }
        },
        onRoomError: message => {
            errorElement.textContent = message;
        }
    });

    updateRoom(room);
    multiplayer.requestRoomState();

    return {
        dispose() {
            disposed = true;
            multiplayer.setHandlers({
                onRoomState: null,
                onGameStarted: null,
                onRoomKicked: null,
                onRoomError: null
            });
        }
    };
}
