function isWindowPart(object) {
    for (let part = object; part; part = part.parent) {
        if (part.name?.trim().toLowerCase() === "window") {
            return true;
        }
    }

    return false;
}

export function applyWindowTransparency(root) {
    root.traverse(object => {
        if (!object.isMesh || !isWindowPart(object)) {
            return;
        }

        const materials = Array.isArray(object.material)
            ? object.material.map(material => material.clone())
            : object.material.clone();

        for (const material of Array.isArray(materials) ? materials : [materials]) {
            material.transparent = true;
            material.opacity = 0.5;
            material.depthWrite = false;
            material.needsUpdate = true;
        }

        object.material = materials;
    });
}
