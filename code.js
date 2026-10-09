import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js";


// --------------------------------------------------
// SETTINGS
// --------------------------------------------------

const SERVER_URL = "wss://server-6tox.onrender.com/ws";


// --------------------------------------------------
// VARIABLES
// --------------------------------------------------

let scene;
let camera;
let renderer;

let socket;

let player;
let username = "";
let myId = null;

const otherPlayers = {};
const colliders = [];

const keys = {};

let yaw = 0;
let pitch = 0;
const groundY = 3.5;
let verticalVelocity = 0;

let noclip = false;

const raycaster = new THREE.Raycaster();


// --------------------------------------------------
// PLAY BUTTON
// --------------------------------------------------

document.getElementById("play").addEventListener("click", startGame);


// --------------------------------------------------
// START GAME
// --------------------------------------------------

function startGame() {

    username = document.getElementById("username").value.trim();

    if (!username) {
        alert("Please enter a username.");
        return;
    }
    document.getElementById("menu").style.display = "none";
    document.getElementById("game").style.display = "block";

    createScene();

    connectToServer();
}


// --------------------------------------------------
// NAMEPLATE CREATOR
// --------------------------------------------------

function createNameplate(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 12);
    ctx.fill();

    ctx.font = "Bold 26px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 1, 1);
    sprite.name = "nameplate";
    return sprite;
}


// --------------------------------------------------
// THREE.JS SCENE
// --------------------------------------------------

function createScene() {

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);


    // Camera

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );


    // Renderer

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.shadowMap.enabled = false;

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    document
        .getElementById("game")
        .appendChild(renderer.domElement);


    // Lighting

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.5);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(50, 100, 50);
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-50, 50, -50);
    scene.add(fillLight);


    // Load Visual Map

    const loader = new GLTFLoader();

    loader.load(
        "map.gltf",

        function(gltf) {
            scene.add(gltf.scene);
            gltf.scene.traverse(object => {
                if (object.isMesh) {
                    object.castShadow = false;
                    object.receiveShadow = false;
                }
            });
        },

        undefined,

        function(error) {
            console.error("Could not load map:", error);
        }
    );


    // Load Collision Map

    loader.load(
        "map_collision.gltf",

        function(gltf) {
            gltf.scene.traverse(object => {
                if (object.isMesh) {
                    object.visible = false;
                    colliders.push(object);
                }
            });
            scene.add(gltf.scene);
        },

        undefined,

        function(error) {
            console.error("Could not load collision map:", error);
        }
    );


    // Player Model

    player = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.6, 8.5, 4, 8),
        new THREE.MeshStandardMaterial({
            color: 0x3366ff
        })
    );

    player.position.set(0, groundY, 0);
    scene.add(player);


    camera.position.set(0, groundY + 4.8, 6);


    // Mouse

    renderer.domElement.addEventListener(
        "click",
        () => {
            renderer.domElement.requestPointerLock();
        }
    );

    document.addEventListener("mousemove", mouseLook);


    // Keyboard Controls

    document.addEventListener("keydown", event => {
        keys[event.code] = true;

        if (event.code === "KeyZ" && username.toLowerCase() === "admin") {
            noclip = !noclip;
            verticalVelocity = 0;
            console.log("Noclip Mode:", noclip ? "ENABLED" : "DISABLED");
        }

        if (!noclip && event.code === "Space" && player && verticalVelocity === 0) {
            verticalVelocity = 0.35;
        }
    });

    document.addEventListener("keyup", event => {
        keys[event.code] = false;
    });

    window.addEventListener("resize", resize);

    animate();
}


// --------------------------------------------------
// MOUSE LOOK
// --------------------------------------------------

function mouseLook(event) {

    if (document.pointerLockElement !== renderer.domElement) {
        return;
    }

    yaw -= event.movementX * 0.002;
    pitch -= event.movementY * 0.002;

    const limit = Math.PI / 2 - 0.1;
    pitch = Math.max(-limit, Math.min(limit, pitch));
}


// --------------------------------------------------
// MULTIPLAYER
// --------------------------------------------------

function connectToServer() {

    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
        document.getElementById("status").textContent = "Connected";
        socket.send(JSON.stringify({
            type: "join",
            name: username
        }));
    };

    socket.onclose = () => {
        document.getElementById("status").textContent = "Disconnected";
    };

    socket.onerror = error => {
        console.error("WebSocket error:", error);
    };

    socket.onmessage = event => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
}


// --------------------------------------------------
// SERVER MESSAGES
// --------------------------------------------------

function handleServerMessage(data) {
    if (data.myId) {
        myId = data.myId;
    }

    if (data.type === "players") {
        updatePlayers(data);
    }
}


// --------------------------------------------------
// OTHER PLAYERS (Dynamically Updated Nameplates)
// --------------------------------------------------

function updatePlayers(serverMsg) {

    const players = serverMsg.players || {};
    const localId = serverMsg.myId || myId || players.myId;

    for (const id in players) {

        if (id === "myId" || id === localId) {
            continue;
        }

        const data = players[id];
        if (!data || typeof data !== "object") continue;

        const displayName = data.name || data.username || "Player";

        if (!otherPlayers[id]) {

            const mesh = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.8, 3.2, 4, 8),
                new THREE.MeshStandardMaterial({
                    color: 0xff3333
                })
            );

            const nameplate = createNameplate(displayName);
            nameplate.position.set(0, 3.2, 0);
            mesh.add(nameplate);

            mesh.userData.name = displayName;

            scene.add(mesh);
            otherPlayers[id] = mesh;

        } else {

            // Update existing player nameplate if name changed or was loaded after joining
            const mesh = otherPlayers[id];
            if (displayName !== "Player" && mesh.userData.name !== displayName) {
                const oldSprite = mesh.getObjectByName("nameplate");
                if (oldSprite) mesh.remove(oldSprite);

                const newSprite = createNameplate(displayName);
                newSprite.position.set(0, 3.2, 0);
                mesh.add(newSprite);

                mesh.userData.name = displayName;
            }
        }

        if (data.x !== undefined && data.y !== undefined && data.z !== undefined) {
            otherPlayers[id].position.set(data.x, data.y, data.z);
        }
    }
}


// --------------------------------------------------
// PLAYER MOVEMENT & NOCLIP
// --------------------------------------------------

function updateMovement() {

    if (!player) return;

    const speed = noclip ? 0.6 : 0.25;
    const direction = new THREE.Vector3();

    if (keys["KeyW"]) direction.z -= 1;
    if (keys["KeyS"]) direction.z += 1;
    if (keys["KeyA"]) direction.x -= 1;
    if (keys["KeyD"]) direction.x += 1;

    // NOCLIP MODE
    if (noclip) {

        if (keys["Space"]) player.position.y += speed;
        if (keys["ShiftLeft"] || keys["KeyE"]) player.position.y -= speed;

        if (direction.length() > 0) {
            direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            player.position.addScaledVector(direction, speed);
        }

        sendPosition();

        camera.position.copy(player.position);
        camera.position.y += 4.8;
        camera.rotation.order = "YXZ";
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
        return;
    }

    // NORMAL MODE
    const targetPos = player.position.clone();

    if (direction.length() > 0) {
        direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        targetPos.addScaledVector(direction, speed);
    }

    verticalVelocity -= 0.012;
    targetPos.y += verticalVelocity;

    if (colliders.length > 0) {

        // Horizontal Wall Collision
        const moveVector = new THREE.Vector3(
            targetPos.x - player.position.x,
            0,
            targetPos.z - player.position.z
        );

        if (moveVector.length() > 0) {
            const moveDir = moveVector.clone().normalize();
            const rayOrigin = new THREE.Vector3(
                player.position.x,
                player.position.y + 1.0,
                player.position.z
            );

            raycaster.set(rayOrigin, moveDir);
            const wallHits = raycaster.intersectObjects(colliders, true);

            const playerRadius = 1.6;
            if (wallHits.length > 0 && wallHits[0].distance < moveVector.length() + playerRadius) {
                targetPos.x = player.position.x;
                targetPos.z = player.position.z;
            }
        }

        // Vertical Floor Collision
        const rayOriginDown = new THREE.Vector3(targetPos.x, targetPos.y + 2.0, targetPos.z);
        raycaster.set(rayOriginDown, new THREE.Vector3(0, -1, 0));

        const floorHits = raycaster.intersectObjects(colliders, true);

        if (floorHits.length > 0) {
            const groundPointY = floorHits[0].point.y;
            const targetGroundY = groundPointY + groundY;

            if (targetPos.y <= targetGroundY) {
                targetPos.y = targetGroundY;
                verticalVelocity = 0;
            }
        }
    } else {
        if (targetPos.y < groundY) {
            targetPos.y = groundY;
            verticalVelocity = 0;
        }
    }

    player.position.copy(targetPos);

    sendPosition();

    camera.position.copy(player.position);
    camera.position.y += 4.8;

    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
}


// --------------------------------------------------
// SEND POSITION
// --------------------------------------------------

function sendPosition() {

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(
        JSON.stringify({
            type: "position",
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
        })
    );
}


// --------------------------------------------------
// RESIZE
// --------------------------------------------------

function resize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --------------------------------------------------
// GAME LOOP
// --------------------------------------------------

function animate() {

    requestAnimationFrame(animate);

    updateMovement();

    renderer.render(scene, camera);
}
