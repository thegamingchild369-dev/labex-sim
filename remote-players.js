import * as THREE from "three";

function createNameplateTexture(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;

    const context = canvas.getContext("2d");
    context.fillStyle = "rgba(0, 0, 0, 0.6)";
    context.beginPath();
    context.roundRect(10, 10, 236, 44, 12);
    context.fill();

    context.font = "Bold 26px sans-serif";
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createNameplate(text) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createNameplateTexture(text),
        transparent: true,
        depthTest: false,
        depthWrite: false
    }));
    sprite.scale.set(4, 1, 1);
    sprite.name = "nameplate";
    sprite.userData.text = text;
    sprite.renderOrder = 1;
    return sprite;
}

function createRemotePlayer(name, position) {
    const model = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(1.2);
    const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.7, 2, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4f83cc })
    );
    capsule.position.y = 1.7;
    body.add(capsule);

    const face = new THREE.Group();
    face.position.y = 1.7;
    const eyeGeometry = new THREE.SphereGeometry(0.12, 12, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilGeometry = new THREE.SphereGeometry(0.06, 12, 8);
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x202020 });

    for (const x of [-0.22, 0.22]) {
        const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        eye.position.set(x, 0.15, -0.64);
        face.add(eye);

        const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        pupil.position.set(x, 0.15, -0.75);
        face.add(pupil);
    }

    const mouth = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x202020 })
    );
    mouth.scale.set(1.5, 0.35, 0.5);
    mouth.position.set(0, -0.16, -0.68);
    face.add(mouth);
    body.add(face);
    model.add(body);

    const nameplate = createNameplate(name);
    nameplate.position.y = 4.5;
    model.add(nameplate);
    model.position.set(position.x, position.y, position.z);
    model.userData.emoteBody = body;
    model.userData.emoting = false;
    return model;
}

function disposeModel(model) {
    model.traverse(object => {
        if (!object.isMesh && !object.isSprite) {
            return;
        }

        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            material.map?.dispose();
            material.dispose();
        }
    });
}

export class RemotePlayers {
    constructor(scene, username) {
        this.scene = scene;
        this.username = username;
        this.models = new Map();
    }

    update(players, localPlayerId) {
        const playerList = players && typeof players === "object" ? players : {};

        for (const [id, data] of Object.entries(playerList)) {
            if (!data || typeof data !== "object") {
                continue;
            }

            const playerName = data.name || data.username;
            const isLocalPlayer = localPlayerId !== null
                ? String(id) === String(localPlayerId)
                : typeof playerName === "string" &&
                  playerName.trim().toLowerCase() === this.username.toLowerCase();

            if (isLocalPlayer) {
                this.remove(id);
                continue;
            }

            const x = Number(data.x);
            const y = Number(data.y);
            const z = Number(data.z);
            if (![x, y, z].every(Number.isFinite)) {
                continue;
            }

            const displayName = typeof playerName === "string" && playerName.trim()
                ? playerName.trim()
                : "Player";

            let model = this.models.get(id);
            if (!model) {
                model = createRemotePlayer(displayName, { x, y, z });
                this.models.set(id, model);
                this.scene.add(model);
            }

            const nameplate = model.getObjectByName("nameplate");
            if (nameplate && nameplate.userData.text !== displayName) {
                nameplate.material.map.dispose();
                nameplate.material.map = createNameplateTexture(displayName);
                nameplate.userData.text = displayName;
            }

            const previousX = model.position.x;
            const previousZ = model.position.z;
            model.position.set(x, y, z);
            model.userData.emoting = data.emoting === true;

            if (Number.isFinite(data.yaw)) {
                model.rotation.y = data.yaw;
            } else {
                const deltaX = x - previousX;
                const deltaZ = z - previousZ;
                if (deltaX * deltaX + deltaZ * deltaZ > 0.0001) {
                    model.rotation.y = Math.atan2(-deltaX, -deltaZ);
                }
            }
        }

        for (const id of this.models.keys()) {
            if (!Object.hasOwn(playerList, id)) {
                this.remove(id);
            }
        }
    }

    animate(time) {
        for (const model of this.models.values()) {
            const body = model.userData.emoteBody;
            if (!body) {
                continue;
            }

            if (model.userData.emoting) {
                body.position.y = 0.25 + Math.abs(Math.sin(time * 9)) * 0.35;
                body.rotation.z = Math.sin(time * 7) * 0.3;
            } else {
                body.position.y = 0;
                body.rotation.z = 0;
            }
        }
    }

    remove(id) {
        const model = this.models.get(id);
        if (!model) {
            return;
        }

        this.scene.remove(model);
        disposeModel(model);
        this.models.delete(id);
    }
}
