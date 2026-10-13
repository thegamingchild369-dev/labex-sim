import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyWindowTransparency } from "./map-materials.js";

export function mountMenuBackground(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7899ad);

    const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x454b55, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(40, 80, 25);
    scene.add(sun);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({ color: 0x65745b, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    const orbit = {
        x: 0,
        y: 2,
        z: 0,
        radius: 35,
        height: 14
    };

    const loader = new GLTFLoader();
    loader.load(
        new URL("./map.gltf", import.meta.url).href,
        gltf => {
            applyWindowTransparency(gltf.scene);
            scene.add(gltf.scene);
            const bounds = new THREE.Box3().setFromObject(gltf.scene);
            if (!bounds.isEmpty()) {
                const center = bounds.getCenter(new THREE.Vector3());
                const size = bounds.getSize(new THREE.Vector3());
                orbit.x = center.x;
                orbit.y = center.y;
                orbit.z = center.z;
                orbit.radius = Math.max(20, Math.max(size.x, size.z) * 0.75);
                orbit.height = Math.max(10, size.y * 0.45);
            }
        },
        undefined,
        error => console.error("Could not load menu background map:", error)
    );

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let disposed = false;

    function resize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        if (disposed) {
            return;
        }

        animationFrame = requestAnimationFrame(animate);
        const angle = clock.getElapsedTime() * (Math.PI * 2 / 90);
        camera.position.set(
            orbit.x + Math.cos(angle) * orbit.radius,
            orbit.y + orbit.height,
            orbit.z + Math.sin(angle) * orbit.radius
        );
        camera.lookAt(orbit.x, orbit.y, orbit.z);
        renderer.render(scene, camera);
    }

    window.addEventListener("resize", resize);
    animate();

    return {
        dispose() {
            disposed = true;
            cancelAnimationFrame(animationFrame);
            window.removeEventListener("resize", resize);
            renderer.dispose();
            renderer.domElement.remove();
        }
    };
}
