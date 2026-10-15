import { mountMenu } from "./menu.js";
import { mountLobby } from "./lobby.js";
import { startGame } from "./game.js";
import { createMultiplayerConnection } from "./network.js";

const screenRoot = document.getElementById("screen-root");
let multiplayer;
let screenController;
let startingGame = false;
const adminSequence = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"
];
let adminSequenceIndex = 0;

document.addEventListener("keydown", event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
    }

    if (!event.code.startsWith("Arrow")) {
        return;
    }
    event.preventDefault();
    if (event.repeat) {
        return;
    }

    if (event.code === adminSequence[adminSequenceIndex]) {
        adminSequenceIndex += 1;
    } else {
        adminSequenceIndex = event.code === adminSequence[0] ? 1 : 0;
    }

    if (adminSequenceIndex === adminSequence.length) {
        adminSequenceIndex = 0;
        multiplayer?.becomeAdmin();
    }
});

async function loadScreen(path) {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) {
        throw new Error(`Could not load screen "${path}": ${response.status} ${response.statusText}`);
    }

    screenRoot.innerHTML = await response.text();
}

function showError(error) {
    console.error(error);
    screenRoot.replaceChildren();

    const message = document.createElement("pre");
    message.id = "screen-error";
    message.textContent = `Unable to load the game: ${error.message}`;
    screenRoot.appendChild(message);
}

async function openMenu() {
    await loadScreen("./menu.html");
    if (!multiplayer) {
        multiplayer = createMultiplayerConnection();
    }
    screenController = mountMenu(screenRoot, multiplayer, async (username, room) => {
        screenController.dispose();
        try {
            await loadScreen("./lobby.html");
            screenController = mountLobby(
                screenRoot,
                room,
                multiplayer,
                (startedRoom, role) => {
                    launchGame(username, { ...startedRoom, role });
                },
                async message => {
                    startingGame = false;
                    screenController.dispose();
                    await openMenu();
                    screenRoot.querySelector("#menu-error").textContent = message;
                }
            );
        } catch (error) {
            showError(error);
        }
    });
}

async function launchGame(username, room) {
    if (startingGame) {
        return;
    }

    startingGame = true;
    screenController?.dispose();
    try {
        await loadScreen("./game.html");
        startGame(screenRoot, username, room, multiplayer);
    } catch (error) {
        showError(error);
    }
}

openMenu().catch(showError);
