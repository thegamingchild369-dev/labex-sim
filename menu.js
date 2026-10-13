import { mountMenuBackground } from "./menu-background.js";

export function mountMenu(root, multiplayer, onJoined) {
    const form = root.querySelector("#menu-form");
    const usernameInput = root.querySelector("#username");
    const createButton = root.querySelector("#create-room");
    const refreshButton = root.querySelector("#refresh-rooms");
    const roomList = root.querySelector("#room-list");
    const statusElement = root.querySelector("#menu-status");
    const errorElement = root.querySelector("#menu-error");
    let connected = false;
    let joining = false;

    function showRooms(rooms) {
        roomList.replaceChildren();
        if (!rooms.length) {
            const emptyMessage = document.createElement("p");
            emptyMessage.id = "room-empty";
            emptyMessage.textContent = "No rooms yet. Create one to get started.";
            roomList.appendChild(emptyMessage);
            return;
        }

        for (const room of rooms) {
            const entry = document.createElement("div");
            entry.className = "room-entry";

            const info = document.createElement("div");
            info.className = "room-info";

            const name = document.createElement("div");
            name.className = "room-name";
            name.textContent = room.name;

            const count = document.createElement("div");
            count.className = "room-count";
            count.textContent = `${room.playerCount} ${room.playerCount === 1 ? "player" : "players"}`;

            const joinButton = document.createElement("button");
            joinButton.className = "menu-button";
            joinButton.type = "button";
            joinButton.textContent = "JOIN";
            joinButton.disabled = !connected || joining;
            joinButton.addEventListener("click", () => {
                beginJoin(room.id);
            });

            info.append(name, count);
            entry.append(info, joinButton);
            roomList.appendChild(entry);
        }
    }

    function updateControls() {
        createButton.disabled = !connected || joining;
        refreshButton.disabled = !connected;
        for (const button of roomList.querySelectorAll("button")) {
            button.disabled = !connected || joining;
        }
    }

    function beginJoin(roomId = null) {
        const username = usernameInput.value.trim();
        if (!username) {
            errorElement.textContent = "Please enter a username.";
            usernameInput.focus();
            return;
        }

        if (!connected || joining) {
            return;
        }

        errorElement.textContent = "";
        joining = true;
        updateControls();
        multiplayer.setHandlers({
            onRoomJoined: room => onJoined(username, room),
            onRoomError: message => {
                joining = false;
                errorElement.textContent = message;
                updateControls();
            }
        });

        if (roomId) {
            multiplayer.joinRoom(roomId, username);
        } else {
            multiplayer.createRoom(username);
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        beginJoin();
    });

    refreshButton.addEventListener("click", () => {
        multiplayer.requestRooms();
    });

    multiplayer.setHandlers({
        onStatus: status => {
            connected = status === "Connected";
            statusElement.textContent = status;
            if (!connected && joining) {
                joining = false;
                errorElement.textContent = "Connection lost while joining the room.";
            }
            updateControls();
        },
        onRooms: rooms => showRooms(Array.isArray(rooms) ? rooms : []),
        onError: message => {
            errorElement.textContent = message;
        }
    });

    const background = mountMenuBackground(root.querySelector("#menu-background"));
    updateControls();

    return {
        dispose() {
            background.dispose();
        }
    };
}
