export function mountMenu(root, onStart) {
    const form = root.querySelector("#menu-form");
    const usernameInput = root.querySelector("#username");

    form.addEventListener("submit", event => {
        event.preventDefault();

        const username = usernameInput.value.trim();
        if (!username) {
            alert("Please enter a username.");
            usernameInput.focus();
            return;
        }

        onStart(username);
    });
}
