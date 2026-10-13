import { mountMenu } from "./menu.js";
import { startGame } from "./game.js";
import { createMultiplayerConnection } from "./network.js";

const screenRoot = document.getElementById("screen-root");
let multiplayer;
let menuController;
let startingGame = false;

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
