// The pinned Three.js module is bundled locally and loaded only in homepage 3D mode.
import * as THREE from "../vendor/three.module.js";

const palette = [0x173144, 0x102738, 0x1b3a4a, 0x112b3c, 0x254655];

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeBox(geometry, material, parent, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addCar(parent, color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.56, roughness: 0.28, emissive: color, emissiveIntensity: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x7be8e2, metalness: 0.45, roughness: 0.18, emissive: 0x0d777a, emissiveIntensity: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x050d14, roughness: 0.9 });
  makeBox(new THREE.BoxGeometry(1, 1, 1), paint, car, [0, 0.17, 0], [0.58, 0.25, 1.04]);
  makeBox(new THREE.BoxGeometry(1, 1, 1), glass, car, [0, 0.34, -0.06], [0.43, 0.2, 0.47]);
  for (const x of [-0.3, 0.3]) for (const z of [-0.34, 0.34]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 8), rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.1, z);
    car.add(wheel);
  }
  parent.add(car);
  return car;
}

function createCity(scene) {
  const random = seeded(40719);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = palette.map((color) => new THREE.MeshStandardMaterial({
    color, metalness: 0.54, roughness: 0.4,
    emissive: new THREE.Color(color).multiplyScalar(0.12), emissiveIntensity: 0.85,
  }));
  const counts = materials.map(() => 96);
  const buildings = materials.map((material, index) => new THREE.InstancedMesh(geometry, material, counts[index]));
  const windows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x57d8d0, emissive: 0x24a9a8, emissiveIntensity: 1.8, roughness: 0.32 }),
    1100,
  );
  const warmWindows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.1, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xf2ac68, emissive: 0xd07531, emissiveIntensity: 1.25, roughness: 0.4 }),
    420,
  );
  const dummy = new THREE.Object3D();
  let windowCount = 0;
  let warmCount = 0;
  let buildingCounts = materials.map(() => 0);

  for (let ix = -5; ix < 5; ix++) for (let iz = -5; iz < 5; iz++) {
    const centerX = ix * 5.6 + 2.8;
    const centerZ = iz * 5.6 + 2.8;
    if (random() < 0.15) continue;
    const groups = random() > 0.74 ? 2 : 1;
    for (let b = 0; b < groups; b++) {
      const materialIndex = Math.floor(random() * materials.length);
      const width = 1.25 + random() * 1.35;
      const depth = 1.3 + random() * 1.45;
      const height = 1.4 + Math.pow(random(), 0.78) * 7.2;
      const x = centerX + (random() - 0.5) * (groups === 2 ? 2.1 : 1.0);
      const z = centerZ + (random() - 0.5) * (groups === 2 ? 2.1 : 1.0);
      const index = buildingCounts[materialIndex]++;
      dummy.position.set(x, height / 2, z);
      dummy.scale.set(width, height, depth);
      dummy.rotation.y = (random() - 0.5) * 0.18;
      dummy.updateMatrix();
      buildings[materialIndex].setMatrixAt(index, dummy.matrix);

      for (let floor = 0.8; floor < height - 0.25; floor += 0.9) {
        for (let col = -1; col <= 1; col++) {
          if (random() < 0.43 || windowCount >= 1098) continue;
          dummy.position.set(x + col * width * 0.24, floor, z + depth / 2 + 0.025);
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          if (random() > 0.78 && warmCount < 418) warmWindows.setMatrixAt(warmCount++, dummy.matrix);
          else windows.setMatrixAt(windowCount++, dummy.matrix);
        }
      }
    }
  }
  buildings.forEach((mesh, index) => {
    mesh.count = buildingCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  });
  windows.count = windowCount;
  warmWindows.count = warmCount;
  windows.instanceMatrix.needsUpdate = true;
  warmWindows.instanceMatrix.needsUpdate = true;
  scene.add(windows, warmWindows);
  return { geometry, materials, buildings, windows, warmWindows };
}

function addRoads(scene) {
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1f2c, metalness: 0.3, roughness: 0.82, emissive: 0x061c28, emissiveIntensity: 0.9 });
  const laneMaterial = new THREE.MeshBasicMaterial({ color: 0x1a5563, transparent: true, opacity: 0.33 });
  const verticalRoad = new THREE.PlaneGeometry(1.48, 66);
  const horizontalRoad = new THREE.PlaneGeometry(66, 1.48);
  const dashGeometry = new THREE.BufferGeometry();
  const dashes = [];
  for (let street = -5; street <= 5; street++) {
    const c = street * 5.6;
    dashes.push(-33, 0.025, c, 33, 0.025, c, c, 0.025, -33, c, 0.025, 33);
  }
  dashGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dashes, 3));
  for (let i = -5; i <= 5; i++) {
    const zRoad = new THREE.Mesh(verticalRoad, roadMaterial);
    zRoad.rotation.x = -Math.PI / 2;
    zRoad.position.set(i * 5.6, -0.012, 0);
    scene.add(zRoad);
    const xRoad = new THREE.Mesh(horizontalRoad, roadMaterial);
    xRoad.rotation.x = -Math.PI / 2;
    xRoad.position.set(0, -0.011, i * 5.6);
    scene.add(xRoad);
  }
  scene.add(new THREE.LineSegments(dashGeometry, laneMaterial));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x08131e, metalness: 0.16, roughness: 0.98 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.07;
  scene.add(ground);
  return { roadMaterial, laneMaterial, verticalRoad, horizontalRoad, dashGeometry, ground };
}

function addRoute(scene) {
  const toVec = ([x, z]) => new THREE.Vector3(x, 0.075, z);
  const main = [
    [-28, 18], [-22.4, 18], [-16.8, 18], [-16.8, 12.4], [-11.2, 12.4],
    [-11.2, 6.8], [-5.6, 6.8], [0, 6.8], [0, 1.2], [5.6, 1.2], [11.2, 1.2], [11.2, -4.4], [16.8, -4.4],
  ].map(toVec);
  const curve = new THREE.CatmullRomCurve3(main, false, "centripetal");
  const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, 0.19, 8, false), new THREE.MeshBasicMaterial({ color: 0x20bdc5, transparent: true, opacity: 0.18, depthWrite: false }));
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, 0.052, 8, false), new THREE.MeshBasicMaterial({ color: 0x65f2de, transparent: true, opacity: 0.94, depthWrite: false }));
  scene.add(halo, line);
  const approaches = [
    [[-28, 23.6], [-22.4, 23.6], [-22.4, 18]],
    [[-28, 6.8], [-22.4, 6.8], [-16.8, 6.8], [-11.2, 6.8]],
    [[-5.6, 23.6], [-5.6, 18], [-5.6, 12.4], [-11.2, 12.4]],
  ];
  const branchMeshes = [];
  for (const points of approaches) {
    const branchCurve = new THREE.CatmullRomCurve3(points.map(toVec), false, "centripetal");
    const glow = new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 56, 0.1, 6, false), new THREE.MeshBasicMaterial({ color: 0x2db6be, transparent: true, opacity: 0.16, depthWrite: false }));
    const branch = new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 56, 0.026, 6, false), new THREE.MeshBasicMaterial({ color: 0x48c8c8, transparent: true, opacity: 0.53, depthWrite: false }));
    scene.add(glow, branch);
    branchMeshes.push(glow, branch);
  }
  const stops = [[-22.4, 18], [-11.2, 12.4], [-5.6, 6.8], [16.8, -4.4]];
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x72f4e2 });
  const markerGeometry = new THREE.SphereGeometry(0.19, 16, 12);
  const haloGeometry = new THREE.TorusGeometry(0.47, 0.025, 6, 28);
  for (const [index, [x, z]] of stops.entries()) {
    const marker = new THREE.Mesh(markerGeometry, index === stops.length - 1 ? new THREE.MeshBasicMaterial({ color: 0xffbd7c }) : markerMat);
    marker.position.set(x, 0.17, z);
    scene.add(marker);
    const ring = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({ color: index === stops.length - 1 ? 0xffbd7c : 0x42d7d0, transparent: true, opacity: 0.44 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.12, z);
    scene.add(ring);
  }
  const office = new THREE.Group();
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x205064, metalness: 0.54, roughness: 0.27, emissive: 0x0b4453, emissiveIntensity: 1.05 });
  makeBox(new THREE.BoxGeometry(1, 1, 1), towerMaterial, office, [16.8, 4.8, -4.4], [2.35, 9.6, 2.35]);
  makeBox(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x102d3a, metalness: 0.45, emissive: 0x155766, emissiveIntensity: 1 }), office, [16.8, 9.7, -4.4], [1.72, 0.24, 1.72]);
  scene.add(office);
  const pulse = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.035, 8, 72), new THREE.MeshBasicMaterial({ color: 0x48e0cf, transparent: true, opacity: 0.65 }));
  pulse.rotation.x = Math.PI / 2;
  pulse.position.set(16.8, 0.06, -4.4);
  scene.add(pulse);
  return { curve, halo, line, branchMeshes, pulse, markerGeometry, haloGeometry, markerMat, office };
}

export function mountMobilityScene(canvas, context) {
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.setClearColor(0x07111e, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07111e, 0.015);
  scene.add(new THREE.HemisphereLight(0x8bdde0, 0x07111e, 2.05));
  const keyLight = new THREE.DirectionalLight(0x7bcad3, 1.8);
  keyLight.position.set(-12, 26, 18);
  scene.add(keyLight);
  const destinationLight = new THREE.PointLight(0x42cfc7, 23, 22, 2);
  destinationLight.position.set(16.8, 4.2, -4.4);
  scene.add(destinationLight);

  const roadParts = addRoads(scene);
  const cityParts = createCity(scene);
  const routeParts = addRoute(scene);
  const cars = [0x48e3d3, 0xd48c52, 0x4f9bb5].map((color, index) => ({ mesh: addCar(scene, color), offset: index * 0.32 }));

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 180);
  const pointer = { x: 0, y: 0 };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let disposed = false;
  let width = 1;
  let height = 1;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 700 ? 52 : 45;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  const onPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  canvas.parentElement.addEventListener("pointermove", onPointer, { passive: true });
  const render = (time = 0) => {
    if (disposed) return;
    const seconds = time * 0.001;
    camera.position.set(pointer.x * 1.15, 25.4 + pointer.y * 0.55, 35.5 + Math.abs(pointer.x) * 0.5);
    camera.lookAt(pointer.x * 0.55, 1.1, pointer.y * 0.35);
    if (!reducedMotion.matches) {
      cars.forEach(({ mesh, offset }) => {
        const t = (seconds * 0.022 + offset) % 1;
        const point = routeParts.curve.getPointAt(t);
        const tangent = routeParts.curve.getTangentAt(t);
        mesh.position.set(point.x, 0.06, point.z);
        mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
      });
      routeParts.halo.material.opacity = 0.14 + (Math.sin(seconds * 1.2) + 1) * 0.035;
      routeParts.pulse.scale.setScalar(1 + (Math.sin(seconds * 1.7) + 1) * 0.07);
    }
    renderer.render(scene, camera);
    if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(render);
  };
  const onVisibility = () => {
    cancelAnimationFrame(frame);
    if (!disposed && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(render);
  };
  const onMotion = () => {
    cancelAnimationFrame(frame);
    if (!disposed && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(render);
    else render(0);
  };
  document.addEventListener("visibilitychange", onVisibility);
  reducedMotion.addEventListener?.("change", onMotion);
  resize();
  render(0);
  if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(render);

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.parentElement.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener?.("change", onMotion);
      const geometries = new Set();
      const materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      Object.values(roadParts).forEach((part) => part?.dispose?.());
      Object.values(cityParts).forEach((part) => {
        if (Array.isArray(part)) part.forEach((item) => item?.dispose?.());
        else part?.dispose?.();
      });
      Object.values(routeParts).forEach((part) => {
        if (Array.isArray(part)) part.forEach((item) => item?.dispose?.());
        else part?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
