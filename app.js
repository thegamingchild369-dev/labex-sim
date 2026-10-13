import { mountMenu } from "./screens/menu.js";
import { startGame } from "./game/game.js";

const screenRoot = document.getElementById("screen-root");

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
    await loadScreen("./screens/menu.html");
    mountMenu(screenRoot, async username => {
        try {
            await loadScreen("./screens/game.html");
            startGame(screenRoot, username);
        } catch (error) {
            showError(error);
        }
    });
}

openMenu().catch(showError);
