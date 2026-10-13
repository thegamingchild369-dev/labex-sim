function isWindowPart(object) {
    for (let part = object; part; part = part.parent) {
        const names = [part.name, part.userData?.name, part.userData?.Name];
        if (names.some(name => typeof name === "string" && name.toLowerCase().includes("window"))) {
            return true;
        }
    }

    return false;
}

export function applyWindowTransparency(root) {
    let transparentMeshCount = 0;

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
        object.renderOrder = 1;
        transparentMeshCount += 1;
    });

    return transparentMeshCount;
}
