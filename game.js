import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyWindowTransparency } from "./map-materials.js";
import { CameraStreams } from "./camera-streams.js";
import {
    animatePlayerAvatar,
    createPlayerAvatar,
    RemotePlayers,
    setPlayerCharacter
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
    const gameModeName = room.gameMode === "hide_and_seek" ? "Hide and Seek" : "Sandbox";
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

    loader.load(
        new URL("./character.glb", import.meta.url).href,
        gltf => {
            setPlayerCharacter(localAvatar, gltf.scene);
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
        onPlayers: (players, playerId) => {
            remotePlayers.update(players, playerId);
            cameraStreams.update(players, playerId, isAdmin);
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
        const speed = noclip ? 36 : (keys.ShiftLeft || keys.ShiftRight ? 24 : 15);
        const direction = new THREE.Vector3();

        if (keys.KeyW) direction.z -= 1;
        if (keys.KeyS) direction.z += 1;
        if (keys.KeyA) direction.x -= 1;
        if (keys.KeyD) direction.x += 1;

        if (noclip) {
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
