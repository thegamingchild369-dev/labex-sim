import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyWindowTransparency } from "./map-materials.js";
import { CameraStreams } from "./camera-streams.js";
import {
    animatePlayerAvatar,
    createPlayerAvatar,
    RemotePlayers,
    setPlayerCharacter,
    setPlayerRole
} from "./remote-players.js";

const groundY = 0;
const cameraHeightOffset = 0.5;

export function startGame(root, username, room, multiplayer) {
    const canvasRoot = root.querySelector("#game-canvas");
    const statusElement = root.querySelector("#connection-status");
    const adminChat = root.querySelector("#admin-chat");
    const adminChatForm = root.querySelector("#admin-chat-form");
    const adminChatInput = root.querySelector("#admin-chat-input");
    const adminChatMessages = root.querySelector("#admin-chat-messages");
    const adminCameraToggle = root.querySelector("#admin-camera-toggle");
    const adminCameraStatus = root.querySelector("#admin-camera-status");
    const hideSeekTimer = root.querySelector("#hide-seek-timer");
    const staminaLabel = root.querySelector("#stamina-label");
    const staminaBar = root.querySelector("#stamina-bar");
    const staminaFill = root.querySelector("#stamina-fill");
    const hostEndGameButton = root.querySelector("#host-end-game");
    const gameResult = root.querySelector("#game-result");
    const gameResultReasonElement = root.querySelector("#game-result-reason");
    const gameModeName = room.gameMode === "hide_and_seek" ? "Hide and Seek" : "Sandbox";
    const isHideAndSeek = room.gameMode === "hide_and_seek";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = false;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasRoot.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.5));

    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(50, 100, 50);
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-50, 50, -50);
    scene.add(fillLight);

    const colliders = [];
    const loader = new GLTFLoader();
    const mapUrl = new URL("./map.gltf", import.meta.url);
    mapUrl.searchParams.set("upload", Date.now().toString());
    loader.load(
        mapUrl.href,
        gltf => {
            const windowCount = applyWindowTransparency(gltf.scene);
            if (windowCount === 0) {
                console.warn("Map loaded, but no Window meshes were found.");
            } else {
                console.info(`Applied 50% transparency to ${windowCount} Window meshes.`);
            }
            scene.add(gltf.scene);
            gltf.scene.traverse(object => {
                if (object.isMesh) {
                    object.castShadow = false;
                    object.receiveShadow = false;
                }
            });
        },
        undefined,
        error => console.error("Could not load map:", error)
    );

    loader.load(
        new URL("./map_collision.gltf", import.meta.url).href,
        gltf => {
            gltf.scene.traverse(object => {
                if (object.isMesh) {
                    object.visible = false;
                    colliders.push(object);
                }
            });
            scene.add(gltf.scene);
        },
        undefined,
        error => console.error("Could not load collision map:", error)
    );

    const player = new THREE.Object3D();
    player.position.set(0, groundY, 0);
    let cameraMode = 0;
    let yaw = 0;
    let pitch = 0;
    let verticalVelocity = 0;
    let noclip = false;
    const keys = {};
    let currentEmoting = false;
    let currentVibrating = false;
    const raycaster = new THREE.Raycaster();
    const clock = new THREE.Clock();
    const remotePlayers = new RemotePlayers(scene, username);
    const localAvatar = createPlayerAvatar(player.position);
    const cameraStreams = new CameraStreams(multiplayer, remotePlayers, localAvatar);
    localAvatar.visible = false;
    scene.add(localAvatar);
    let isAdmin = false;
    let localCameraStream = null;
    let hideSeekRole = room.role || null;
    let hideSeekPhase = room.phase || null;
    let phaseEndsAt = room.phaseEndsAt || null;
    let gameEnded = room.ended === true;
    let gameResultReason = room.endReason || "";
    let roundNumber = room.roundNumber || 0;
    let nextRoundAt = room.nextRoundAt || null;
    let stamina = hideSeekRole === "seeker" ? 15 : 10;
    let staminaCapacity = stamina;

    function getStaminaCapacity() {
        return hideSeekRole === "seeker" ? 15 : 10;
    }

    function updateStaminaBar() {
        staminaBar.setAttribute("aria-valuemax", String(staminaCapacity));
        staminaBar.setAttribute("aria-valuenow", stamina.toFixed(1));
        staminaLabel.textContent = `Stamina ${stamina.toFixed(1)}s`;
        staminaFill.style.width = `${(stamina / staminaCapacity) * 100}%`;
        staminaFill.style.backgroundColor = stamina <= staminaCapacity * 0.2
            ? "#f07862"
            : "#75df80";
    }

    function formatTime(milliseconds) {
        const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function updateGameState(nextRoom, role = null) {
        if (!nextRoom) {
            return;
        }

        const previousRoundNumber = roundNumber;
        room = { ...room, ...nextRoom };
        roundNumber = room.roundNumber || 0;
        nextRoundAt = room.nextRoundAt || null;
        if (role === "seeker" || role === "hider") {
            hideSeekRole = role;
        } else if (room.role === "seeker" || room.role === "hider") {
            hideSeekRole = room.role;
        }
        hideSeekPhase = room.phase || hideSeekPhase;
        phaseEndsAt = room.phaseEndsAt || null;
        gameEnded = room.ended === true;
        gameResultReason = room.endReason || "";
        staminaCapacity = getStaminaCapacity();
        stamina = Math.min(stamina, staminaCapacity);
        setPlayerRole(localAvatar, hideSeekRole);
        hostEndGameButton.hidden = multiplayer.getPlayerId() !== room.hostId ||
            room.ended === true;
        gameResult.hidden = room.ended !== true;
        if (room.ended === true) {
            gameResultReason = room.endReason || "The game has ended.";
            gameResult.querySelector("#game-result-title").textContent =
                nextRoundAt ? "Round over" : "Game over";
            gameResultReasonElement.textContent = gameResultReason;
        } else if (roundNumber > previousRoundNumber) {
            player.position.set(0, groundY, 0);
            yaw = 0;
            pitch = 0;
            verticalVelocity = 0;
            stamina = staminaCapacity;
            for (const key of Object.keys(keys)) {
                keys[key] = false;
            }
            updateEmoteState();
        }
        updateHideSeekTimer();
        updateStaminaBar();
    }

    function updateHideSeekTimer() {
        if (!isHideAndSeek) {
            hideSeekTimer.hidden = true;
            return;
        }

        hideSeekTimer.hidden = false;
        if (gameEnded) {
            hideSeekTimer.textContent = nextRoundAt
                ? `Next round: ${formatTime(nextRoundAt - Date.now())}`
                : "Game over";
        } else if (hideSeekPhase === "hiding") {
            hideSeekTimer.textContent =
                `Hiders hiding: ${formatTime((phaseEndsAt || Date.now()) - Date.now())}`;
        } else if (hideSeekPhase === "seeking") {
            hideSeekTimer.textContent =
                `Time remaining: ${formatTime((phaseEndsAt || Date.now()) - Date.now())}`;
        } else {
            hideSeekTimer.textContent = "Hide and Seek";
        }
    }

    hostEndGameButton.addEventListener("click", () => {
        multiplayer.endGame();
    });

    if (isHideAndSeek) {
        window.setInterval(updateHideSeekTimer, 250);
    }
    updateGameState(room);

    loader.load(
        new URL("./character.glb", import.meta.url).href,
        gltf => {
            setPlayerCharacter(localAvatar, gltf.scene);
            setPlayerRole(localAvatar, hideSeekRole);
            remotePlayers.setCharacterTemplate(gltf.scene);
        },
        undefined,
        error => {
            if (error.target?.status === 404) {
                console.info("Optional character.glb was not found; using the default bean.");
            } else {
                console.error("Could not load character.glb:", error);
            }
        }
    );

    function updateEmoteState() {
        const emoting = Boolean(keys.KeyF);
        const vibrating = emoting && Boolean(keys.ShiftLeft || keys.ShiftRight);
        if (emoting === currentEmoting && vibrating === currentVibrating) {
            return;
        }

        currentEmoting = emoting;
        currentVibrating = vibrating;
        multiplayer.setEmoting(emoting, vibrating);
        localAvatar.userData.emoting = emoting;
        localAvatar.userData.vibrating = vibrating;
    }

    function appendAdminChatMessage(message) {
        const entry = document.createElement("div");
        const author = typeof message.author === "string" ? message.author : "Admin";
        entry.textContent = `${author}: ${message.text}`;
        adminChatMessages.appendChild(entry);
        while (adminChatMessages.childElementCount > 100) {
            adminChatMessages.firstElementChild.remove();
        }
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }

    adminChatForm.addEventListener("submit", event => {
        event.preventDefault();
        const text = adminChatInput.value.trim();
        if (!text) {
            return;
        }
        multiplayer.sendAdminChat(text);
        adminChatInput.value = "";
    });

    adminCameraToggle.addEventListener("click", async () => {
        if (localCameraStream) {
            localCameraStream.getTracks().forEach(track => track.stop());
            localCameraStream = null;
            cameraStreams.setLocalStream(null);
            adminCameraToggle.textContent = "Turn camera on";
            adminCameraStatus.textContent = "Camera off.";
            return;
        }

        adminCameraToggle.disabled = true;
        adminCameraStatus.textContent = "Requesting camera access...";
        try {
            if (!navigator.mediaDevices?.getUserMedia ||
                typeof RTCPeerConnection !== "function") {
                throw new Error("Live camera sharing is unavailable in this browser or page context.");
            }
            localCameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
            cameraStreams.setLocalStream(localCameraStream);
            adminCameraToggle.textContent = "Turn camera off";
            adminCameraStatus.textContent = "Camera on. Your live face is visible to players in this room.";
        } catch (error) {
            localCameraStream?.getTracks().forEach(track => track.stop());
            localCameraStream = null;
            cameraStreams.setLocalStream(null);
            console.error("Could not start the admin camera:", error);
            adminCameraStatus.textContent = error.message || "Could not start the camera.";
        } finally {
            adminCameraToggle.disabled = false;
        }
    });

    multiplayer.setHandlers({
        onRoomState: nextRoom => {
            const currentRole = nextRoom?.roles?.[multiplayer.getPlayerId()] || null;
            updateGameState(nextRoom, currentRole);
        },
        onPlayers: (players, playerId) => {
            remotePlayers.update(players, playerId);
            cameraStreams.update(players, playerId, isAdmin);
            if (players[playerId]?.role) {
                setPlayerRole(localAvatar, players[playerId].role);
                hideSeekRole = players[playerId].role;
            }
        },
        onGameState: (nextRoom, role) => {
            updateGameState(nextRoom, role);
        },
        onIdentity: (assignedUsername, adminEnabled) => {
            username = assignedUsername;
            isAdmin = adminEnabled === true;
            adminChat.hidden = !isAdmin;
            adminCameraToggle.hidden = !isAdmin;
        },
        onCameraSignal: message => {
            cameraStreams.handleSignal(message).catch(error => {
                console.error("Could not process an admin camera connection:", error);
            });
        },
        onError: message => {
            adminCameraStatus.textContent = message;
        },
        onAdminChat: appendAdminChatMessage,
        onStatus: status => {
            statusElement.textContent = `${status} - ${room.name} - ${gameModeName}`;
        }
    });
    statusElement.textContent = `Connected - ${room.name} - ${gameModeName}`;

    camera.position.set(0, groundY + 4.8 + cameraHeightOffset, 6);

    renderer.domElement.addEventListener("click", () => {
        renderer.domElement.requestPointerLock();
    });

    function mouseLook(event) {
        if (document.pointerLockElement !== renderer.domElement) {
            return;
        }

        yaw -= event.movementX * 0.002;
        pitch -= event.movementY * 0.002;

        const limit = Math.PI / 2 - 0.1;
        pitch = Math.max(-limit, Math.min(limit, pitch));
    }

    function updateCamera() {
        localAvatar.position.copy(player.position);
        localAvatar.rotation.y = yaw;
        localAvatar.visible = cameraMode !== 0;

        if (cameraMode === 0) {
            camera.position.copy(player.position);
            camera.position.y += 4.8 + cameraHeightOffset;
            camera.rotation.order = "YXZ";
            camera.rotation.y = yaw;
            camera.rotation.x = pitch;
            return;
        }

        const target = player.position.clone();
        target.y += 2.7;
        const elevation = Math.max(-0.45, Math.min(0.85, pitch + 0.24));
        const horizontalDistance = 7;
        const side = cameraMode === 2 ? -1 : 1;
        const offset = new THREE.Vector3(
            0,
            0,
            horizontalDistance * side
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        offset.y = horizontalDistance * Math.tan(elevation) + cameraHeightOffset;
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
    }

    function sendPosition() {
        multiplayer.sendPosition(player.position, yaw);
    }

    function updateMovement(deltaTime) {
        if (gameEnded ||
            (isHideAndSeek && hideSeekPhase === "hiding" && hideSeekRole === "seeker")) {
            updateCamera();
            return;
        }

        const direction = new THREE.Vector3();

        if (keys.KeyW) direction.z -= 1;
        if (keys.KeyS) direction.z += 1;
        if (keys.KeyA) direction.x -= 1;
        if (keys.KeyD) direction.x += 1;

        if (noclip) {
            const speed = 36;
            if (keys.Space) player.position.y += speed * deltaTime;
            if (keys.ShiftLeft || keys.ShiftRight || keys.KeyE) {
                player.position.y -= speed * deltaTime;
            }

            if (direction.length() > 0) {
                direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
                player.position.addScaledVector(direction, speed * deltaTime);
            }

            updateCamera();
            sendPosition();
            return;
        }

        staminaCapacity = getStaminaCapacity();
        stamina = Math.min(stamina, staminaCapacity);
        const sprintRequested = Boolean(keys.ShiftLeft || keys.ShiftRight) &&
            direction.lengthSq() > 0;
        const sprinting = sprintRequested && stamina > 0;
        if (sprinting) {
            stamina = Math.max(0, stamina - deltaTime);
        } else if (!sprintRequested) {
            stamina = Math.min(staminaCapacity, stamina + deltaTime);
        }
        updateStaminaBar();
        const speed = sprinting ? 24 : 15;

        const targetPosition = player.position.clone();
        if (direction.length() > 0) {
            direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            targetPosition.addScaledVector(direction, speed * deltaTime);
        }

        verticalVelocity -= 43.2 * deltaTime;
        targetPosition.y += verticalVelocity * deltaTime;

        if (colliders.length > 0) {
            const moveVector = new THREE.Vector3(
                targetPosition.x - player.position.x,
                0,
                targetPosition.z - player.position.z
            );

            if (moveVector.length() > 0) {
                const moveDirection = moveVector.clone().normalize();
                const rayOrigin = new THREE.Vector3(
                    player.position.x,
                    player.position.y + 1.0,
                    player.position.z
                );
                raycaster.set(rayOrigin, moveDirection);
                const wallHits = raycaster.intersectObjects(colliders, true);

                if (wallHits.length > 0 && wallHits[0].distance < moveVector.length() + 1.6) {
                    targetPosition.x = player.position.x;
                    targetPosition.z = player.position.z;
                }
            }

            const rayOriginDown = new THREE.Vector3(
                targetPosition.x,
                targetPosition.y + 2.0,
                targetPosition.z
            );
            raycaster.set(rayOriginDown, new THREE.Vector3(0, -1, 0));
            const floorHits = raycaster.intersectObjects(colliders, true);

            if (floorHits.length > 0) {
                const targetGroundY = floorHits[0].point.y;
                if (targetPosition.y <= targetGroundY) {
                    targetPosition.y = targetGroundY;
                    verticalVelocity = 0;
                }
            }
        } else if (targetPosition.y < groundY) {
            targetPosition.y = groundY;
            verticalVelocity = 0;
        }

        player.position.copy(targetPosition);
        updateCamera();
        sendPosition();
    }

    function onKeyDown(event) {
        if (event.target === adminChatInput) {
            if (event.code === "Escape") {
                adminChatInput.blur();
            }
            return;
        }

        if (event.code === "Enter" && !adminChat.hidden && !event.repeat) {
            event.preventDefault();
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            adminChatInput.focus();
            return;
        }

        keys[event.code] = true;
        if (event.code === "KeyF" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
            updateEmoteState();
        }

        if (event.code === "KeyP" && !event.repeat) {
            cameraMode = (cameraMode + 1) % 3;
            updateCamera();
        }

        if (event.code === "KeyZ" && isAdmin) {
            noclip = !noclip;
            verticalVelocity = 0;
            console.log("Noclip Mode:", noclip ? "ENABLED" : "DISABLED");
        }

        if (!noclip && event.code === "Space" && verticalVelocity === 0) {
            verticalVelocity = 21;
        }
    }

    function onKeyUp(event) {
        keys[event.code] = false;
        if (event.code === "KeyF" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
            updateEmoteState();
        }
    }

    function onBlur() {
        for (const key of Object.keys(keys)) {
            keys[key] = false;
        }
        updateEmoteState();
    }

    function resize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        updateMovement(Math.min(clock.getDelta(), 0.05));
        animatePlayerAvatar(localAvatar, clock.elapsedTime);
        remotePlayers.animate(clock.elapsedTime);
        renderer.render(scene, camera);
    }

    document.addEventListener("mousemove", mouseLook);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", resize);
    animate();
}
