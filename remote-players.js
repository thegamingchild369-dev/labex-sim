import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

function createFallbackCharacter() {
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
    return body;
}

function createCharacterBody(template) {
    let body;
    if (!template) {
        body = createFallbackCharacter();
    } else {
        body = cloneSkeleton(template);
        body.traverse(object => {
            if (!object.isMesh) {
                return;
            }
            object.geometry = object.geometry.clone();
            object.material = Array.isArray(object.material)
                ? object.material.map(material => material.clone())
                : object.material.clone();
        });

        const bounds = new THREE.Box3().setFromObject(body);
        const size = bounds.getSize(new THREE.Vector3());
        if (!Number.isFinite(size.y) || size.y <= 0.001) {
            console.warn("character.glb has no measurable height; using the default bean.");
            disposeModel(body);
            body = createFallbackCharacter();
        } else {
            const scale = 4.1 / size.y;
            const center = bounds.getCenter(new THREE.Vector3());
            body.scale.multiplyScalar(scale);
            body.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        }
    }

    body.userData.basePosition = body.position.clone();
    body.userData.baseRotation = body.rotation.clone();
    return body;
}

export function createPlayerAvatar(position, characterTemplate = null) {
    const model = new THREE.Group();
    const body = createCharacterBody(characterTemplate);
    model.add(body);
    model.position.set(position.x, position.y, position.z);
    model.userData.emoteBody = body;
    model.userData.emoting = false;
    model.userData.vibrating = false;
    return model;
}

export function setPlayerCharacter(model, template) {
    const previousBody = model.userData.emoteBody;
    if (previousBody) {
        model.remove(previousBody);
        disposeModel(previousBody);
    }

    const body = createCharacterBody(template);
    model.add(body);
    model.userData.emoteBody = body;
}

export function animatePlayerAvatar(model, time) {
    const body = model.userData.emoteBody;
    if (!body) {
        return;
    }

    if (!model.userData.emoting) {
        body.position.copy(body.userData.basePosition);
        body.rotation.copy(body.userData.baseRotation);
        return;
    }

    const vibrating = model.userData.vibrating;
    const basePosition = body.userData.basePosition;
    const baseRotation = body.userData.baseRotation;
    body.position.x = basePosition.x + (vibrating ? Math.sin(time * 250) * 0.1 : 0);
    body.position.y = basePosition.y + (vibrating ? 0.18 : 0.25) +
        Math.abs(Math.sin(time * (vibrating ? 125 : 9))) * (vibrating ? 0.25 : 0.35);
    body.position.z = basePosition.z;
    body.rotation.copy(baseRotation);
    body.rotation.y += vibrating ? Math.sin(time * 220) * 0.16 : 0;
    body.rotation.z += Math.sin(time * (vibrating ? 95 : 7)) * (vibrating ? 0.45 : 0.3);
}

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

function createRemotePlayer(name, position, characterTemplate) {
    const model = createPlayerAvatar(position, characterTemplate);
    const nameplate = createNameplate(name);
    nameplate.position.y = 4.5;
    model.add(nameplate);
    return model;
}

function disposeModel(model) {
    model.traverse(object => {
        if (!object.isMesh && !object.isSprite) {
            return;
        }

        object.geometry?.dispose();
        if (object.isSprite) {
            object.material.map?.dispose();
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            material.dispose();
        }
    });
}

export class RemotePlayers {
    constructor(scene, username, characterTemplate = null) {
        this.scene = scene;
        this.username = username;
        this.characterTemplate = characterTemplate;
        this.models = new Map();
    }

    setCharacterTemplate(template) {
        this.characterTemplate = template;
        for (const model of this.models.values()) {
            setPlayerCharacter(model, template);
        }
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
                model = createRemotePlayer(displayName, { x, y, z }, this.characterTemplate);
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
            model.userData.vibrating = data.vibrating === true;

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
            animatePlayerAvatar(model, time);
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
