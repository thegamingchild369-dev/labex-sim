import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyWindowTransparency } from "./map-materials.js";
import { RemotePlayers } from "./remote-players.js";

const groundY = 3.5;

export function startGame(root, username, room, multiplayer) {
    const canvasRoot = root.querySelector("#game-canvas");
    const statusElement = root.querySelector("#connection-status");
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
    let yaw = 0;
    let pitch = 0;
    let verticalVelocity = 0;
    let noclip = false;
    const keys = {};
    const raycaster = new THREE.Raycaster();
    const clock = new THREE.Clock();
    const remotePlayers = new RemotePlayers(scene, username);
    multiplayer.setHandlers({
        onPlayers: (players, playerId) => remotePlayers.update(players, playerId),
        onIdentity: assignedUsername => {
            username = assignedUsername;
        },
        onStatus: status => {
            statusElement.textContent = `${status} - ${room.name}`;
        }
    });
    statusElement.textContent = `Connected - ${room.name}`;

    camera.position.set(0, groundY + 4.8, 6);

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
        camera.position.copy(player.position);
        camera.position.y += 4.8;
        camera.rotation.order = "YXZ";
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
    }

    function sendPosition() {
        multiplayer.sendPosition(player.position, yaw);
    }

    function updateMovement(deltaTime) {
        const speed = noclip ? 36 : 15;
        const direction = new THREE.Vector3();

        if (keys.KeyW) direction.z -= 1;
        if (keys.KeyS) direction.z += 1;
        if (keys.KeyA) direction.x -= 1;
        if (keys.KeyD) direction.x += 1;

        if (noclip) {
            if (keys.Space) player.position.y += speed * deltaTime;
            if (keys.ShiftLeft || keys.KeyE) player.position.y -= speed * deltaTime;

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
                const targetGroundY = floorHits[0].point.y + groundY;
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
        keys[event.code] = true;

        if (event.code === "KeyZ" && username.toLowerCase() === "admin") {
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
    }

    function resize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        updateMovement(Math.min(clock.getDelta(), 0.05));
        renderer.render(scene, camera);
    }

    document.addEventListener("mousemove", mouseLook);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", resize);
    animate();
}
