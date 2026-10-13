export function applyWindowTransparency(root) {
    root.traverse(object => {
        if (!object.isMesh) {
            return;
        }

        let isWindow = false;
        for (let parent = object; parent; parent = parent.parent) {
            if (parent.name === "Window") {
                isWindow = true;
                break;
            }
        }

        if (!isWindow) {
            return;
        }

        const materials = Array.isArray(object.material)
            ? object.material.map(material => material.clone())
            : object.material.clone();
        for (const material of Array.isArray(materials) ? materials : [materials]) {
            material.transparent = true;
            material.opacity = 0.5;
            material.needsUpdate = true;
        }
        object.material = materials;
    });
}
