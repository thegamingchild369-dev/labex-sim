import { mountMenu } from "./menu.js";
import { startGame } from "./game.js";
import { createMultiplayerConnection } from "./network.js";

const screenRoot = document.getElementById("screen-root");
let multiplayer;
let menuController;
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
    multiplayer = createMultiplayerConnection();
    menuController = mountMenu(screenRoot, multiplayer, async (username, room) => {
        if (startingGame) {
            return;
        }

        startingGame = true;
        menuController.dispose();
        try {
            await loadScreen("./game.html");
            startGame(screenRoot, username, room, multiplayer);
        } catch (error) {
            showError(error);
        }
    });
}

openMenu().catch(showError);
