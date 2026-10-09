import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js";


// --------------------------------------------------
// SETTINGS
// --------------------------------------------------

const SERVER_URL = "https://server-6tox.onrender.com";


// --------------------------------------------------
// VARIABLES
// --------------------------------------------------

let scene;
let camera;
let renderer;

let socket;

let player;

const otherPlayers = {};

const keys = {};

let yaw = 0;
let pitch = 0;

let locked = false;


// --------------------------------------------------
// PLAY BUTTON
// --------------------------------------------------

document.getElementById("play").addEventListener("click", startGame);


// --------------------------------------------------
// START GAME
// --------------------------------------------------

function startGame() {

    document.getElementById("menu").style.display = "none";
    document.getElementById("game").style.display = "block";

    createScene();

    connectToServer();
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

    const ambient = new THREE.AmbientLight(
        0xffffff,
        1
    );

    scene.add(ambient);


    const sun = new THREE.DirectionalLight(
        0xffffff,
        2
    );

    sun.position.set(
        50,
        100,
        50
    );

    scene.add(sun);


    // Load Roblox map

    const loader = new GLTFLoader();

    loader.load(
        "map.gltf",

        function(gltf) {

            scene.add(gltf.scene);

            console.log("Map loaded");

        },

        undefined,

        function(error) {

            console.error(
                "Could not load map:",
                error
            );

        }
    );


    // Player

    player = new THREE.Mesh(

        new THREE.CapsuleGeometry(
            0.4,
            1.2,
            4,
            8
        ),

        new THREE.MeshStandardMaterial({
            color: 0x3366ff
        })

    );

    player.position.set(
        0,
        1,
        0
    );

    scene.add(player);


    camera.position.set(
        0,
        1.7,
        3
    );


    // Mouse

    renderer.domElement.addEventListener(
        "click",
        () => {

            renderer.domElement.requestPointerLock();

        }
    );


    document.addEventListener(
        "mousemove",
        mouseLook
    );


    // Keyboard

    document.addEventListener(
        "keydown",
        event => {
            keys[event.code] = true;
        }
    );


    document.addEventListener(
        "keyup",
        event => {
            keys[event.code] = false;
        }
    );


    window.addEventListener(
        "resize",
        resize
    );


    animate();
}


// --------------------------------------------------
// MOUSE LOOK
// --------------------------------------------------

function mouseLook(event) {

    if (
        document.pointerLockElement !== renderer.domElement
    ) {
        return;
    }

    yaw -= event.movementX * 0.002;

    pitch -= event.movementY * 0.002;


    const limit = Math.PI / 2 - 0.1;

    pitch = Math.max(
        -limit,
        Math.min(limit, pitch)
    );
}


// --------------------------------------------------
// MULTIPLAYER
// --------------------------------------------------

function connectToServer() {

    socket = new WebSocket(SERVER_URL);


    socket.onopen = () => {

        document.getElementById("status")
            .textContent = "Connected";

        console.log("Connected to server");

    };


    socket.onclose = () => {

        document.getElementById("status")
            .textContent = "Disconnected";

    };


    socket.onerror = error => {

        console.error(
            "WebSocket error:",
            error
        );

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

    if (data.type === "players") {

        updatePlayers(data.players);

    }

}


// --------------------------------------------------
// OTHER PLAYERS
// --------------------------------------------------

function updatePlayers(players) {

    for (const id in players) {

        if (id === players.myId) {
            continue;
        }


        if (!otherPlayers[id]) {

            const mesh = new THREE.Mesh(

                new THREE.CapsuleGeometry(
                    0.4,
                    1.2,
                    4,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color: 0xff3333
                })

            );

            scene.add(mesh);

            otherPlayers[id] = mesh;
        }


        const data = players[id];

        otherPlayers[id].position.set(
            data.x,
            data.y,
            data.z
        );
    }
}


// --------------------------------------------------
// PLAYER MOVEMENT
// --------------------------------------------------

function updateMovement() {

    if (!player) {
        return;
    }


    const speed = 0.1;


    const direction = new THREE.Vector3();


    if (keys["KeyW"]) {
        direction.z -= 1;
    }

    if (keys["KeyS"]) {
        direction.z += 1;
    }

    if (keys["KeyA"]) {
        direction.x -= 1;
    }

    if (keys["KeyD"]) {
        direction.x += 1;
    }


    if (direction.length() > 0) {

        direction.normalize();


        direction.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            yaw
        );


        player.position.addScaledVector(
            direction,
            speed
        );


        sendPosition();
    }


    camera.position.copy(
        player.position
    );

    camera.position.y += 0.7;


    camera.rotation.order = "YXZ";

    camera.rotation.y = yaw;

    camera.rotation.x = pitch;
}


// --------------------------------------------------
// SEND POSITION
// --------------------------------------------------

function sendPosition() {

    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
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

    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}


// --------------------------------------------------
// GAME LOOP
// --------------------------------------------------

function animate() {

    requestAnimationFrame(animate);

    updateMovement();

    renderer.render(
        scene,
        camera
    );
}
