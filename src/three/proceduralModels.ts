import * as THREE from 'three';
import { RoadTextureBundle } from './roadTextures';

export interface PatchTruckHandle {
  group: THREE.Group;
  beaconMaterial: THREE.MeshStandardMaterial;
  headlightMaterial: THREE.MeshStandardMaterial;
}

export interface ScooterHandle {
  group: THREE.Group;
  headlightMaterial: THREE.MeshStandardMaterial;
  frontWheel: THREE.Object3D;
  rearWheel: THREE.Object3D;
}

export interface StreetLampHandle {
  group: THREE.Group;
  bulbMaterials: THREE.MeshStandardMaterial[];
  glowCones: THREE.Mesh[];
}

export interface CraterAssemblyHandle {
  group: THREE.Group;
  craterRim: THREE.Mesh;
  waterDisc: THREE.Mesh;
  tackLayer: THREE.Mesh;
  coldMixLayer: THREE.Mesh;
  compactedCap: THREE.Mesh;
  laserBracket: THREE.Group;
  updateDimensions: (widthCm: number, depthCm: number, isWaterlogged: boolean) => void;
  updateRepairState: (progress01: number, exploded: boolean) => void;
}

function addContactShadow(
  parent: THREE.Group,
  shadowMap: THREE.CanvasTexture,
  width: number,
  depth: number,
  yOffset = 0.012
) {
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = yOffset;
  mesh.renderOrder = 1;
  parent.add(mesh);
}

/**
 * Composite 11-part Routix Rapid Cold-Mix Patch Truck (bottom-center ground pivot y=0).
 */
export function createPatchTruck(textures: RoadTextureBundle): PatchTruckHandle {
  const group = new THREE.Group();
  group.name = 'patch_truck';
  group.userData = { selectableId: 'truck', label: 'Routix Rapid Patch Truck' };

  const bodyPaint = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.36,
    metalness: 0.25,
  });
  const cabRoofWhite = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.42,
    metalness: 0.1,
  });
  const chassisDark = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    roughness: 0.78,
    metalness: 0.45,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.26,
    metalness: 0.85,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x162235,
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x17191e,
    roughness: 0.92,
    metalness: 0.02,
  });
  const bumperMat = new THREE.MeshStandardMaterial({
    map: textures.hazardStripeMap,
    roughness: 0.55,
    metalness: 0.12,
  });
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.1,
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef3c7,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.1,
  });
  const bagMat = new THREE.MeshStandardMaterial({
    color: 0xd6cfc2,
    roughness: 0.88,
    metalness: 0.02,
  });
  const coldMixHeapMat = new THREE.MeshStandardMaterial({
    map: textures.coldMixMap,
    bumpMap: textures.coldMixBumpMap,
    bumpScale: 0.04,
    roughness: 0.82,
    metalness: 0.05,
  });

  // 1. Lower Chassis Rail
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.26, 4.35), chassisDark);
  chassis.position.set(0, 0.46, 0);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // 2. Front Cab Body
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.72, 1.28, 1.55), bodyPaint);
  cab.position.set(0, 1.22, 1.25);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  // 3. Cab White Cap Roof
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.14, 1.46), cabRoofWhite);
  cabRoof.position.set(0, 1.9, 1.24);
  cabRoof.castShadow = true;
  group.add(cabRoof);

  // 4. Windshield + Side Cab Windows
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.56, 0.08), glassMat);
  windshield.position.set(0, 1.44, 2.02);
  group.add(windshield);

  const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.48, 0.84), glassMat);
  sideWindows.position.set(0, 1.44, 1.32);
  group.add(sideWindows);

  // 5. Rear Flatbed + Cold-Mix Hopper Side Walls
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.18, 2.65), chassisDark);
  bedBase.position.set(0, 0.68, -0.88);
  bedBase.castShadow = true;
  bedBase.receiveShadow = true;
  group.add(bedBase);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.68, 2.62), steelMat);
  leftWall.position.set(-0.86, 1.1, -0.88);
  leftWall.castShadow = true;
  group.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = 0.86;
  group.add(rightWall);

  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.68, 0.1), bumperMat);
  rearWall.position.set(0, 1.1, -2.18);
  rearWall.castShadow = true;
  group.add(rearWall);

  // 6. Cold-Mix Aggregate Heap + Stacked 25kg IRC:SP:100 Bags inside bed
  const heap = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.36, 1.52), coldMixHeapMat);
  heap.position.set(0, 0.96, -1.25);
  heap.castShadow = true;
  group.add(heap);

  for (let i = 0; i < 4; i++) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.42), bagMat);
    bag.position.set(i % 2 === 0 ? -0.34 : 0.34, 0.86 + Math.floor(i / 2) * 0.19, -0.18);
    bag.rotation.y = i % 2 === 0 ? 0.08 : -0.06;
    bag.castShadow = true;
    group.add(bag);
  }

  // 7. Front Safety Hazard Bumper & Headlights
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.24, 0.18), bumperMat);
  frontBumper.position.set(0, 0.48, 2.15);
  frontBumper.castShadow = true;
  group.add(frontBumper);

  for (const side of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.08), headlightMaterial);
    lamp.position.set(side, 0.78, 2.04);
    group.add(lamp);
  }

  // 8. Roof Amber Warning Beacon Lightbar
  const barMount = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.06, 0.22), chassisDark);
  barMount.position.set(0, 2.0, 1.35);
  group.add(barMount);

  const beaconBar = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.13, 0.18), beaconMaterial);
  beaconBar.position.set(0, 2.09, 1.35);
  group.add(beaconBar);

  // 9. Four Composite Wheels (Rubber Tire + Alloy Rim Hub)
  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.3, 14);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelCoords: Array<[number, number]> = [
    [-0.86, 1.32],
    [0.86, 1.32],
    [-0.86, -1.28],
    [0.86, -1.28],
  ];
  for (const [wx, wz] of wheelCoords) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wx, 0.38, wz);
    const tire = new THREE.Mesh(tireGeo, rubberMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, steelMat);
    wheelGroup.add(tire, rim);
    group.add(wheelGroup);
  }

  addContactShadow(group, textures.contactShadowMap, 2.6, 5.2);

  group.traverse((obj) => {
    obj.userData.selectableId = 'truck';
  });

  return { group, beaconMaterial, headlightMaterial };
}

/**
 * Composite 9-part Urban Two-Wheeler Scooter + Rider Silhouette (y=0 pivot).
 */
export function createCommuterScooter(
  shadowMap: THREE.CanvasTexture
): ScooterHandle {
  const group = new THREE.Group();
  group.name = 'commuter_scooter';
  group.userData = { selectableId: 'scooter', label: 'Two-Wheeler Commuter (IMU Swarm)' };

  const fairingMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.32,
    metalness: 0.35,
  });
  const darkTrim = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.2,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x17191e,
    roughness: 0.92,
    metalness: 0.02,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.85,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.65,
    metalness: 0.05,
  });
  const helmetMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.16,
    metalness: 0.05,
    clearcoat: 0.9,
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 1.1,
    roughness: 0.12,
    metalness: 0.1,
  });

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 12);
  rimGeo.rotateZ(Math.PI / 2);

  const frontWheel = new THREE.Group();
  frontWheel.position.set(0, 0.24, 0.66);
  frontWheel.add(new THREE.Mesh(wheelGeo, rubberMat), new THREE.Mesh(rimGeo, rimMat));
  frontWheel.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  group.add(frontWheel);

  const rearWheel = new THREE.Group();
  rearWheel.position.set(0, 0.24, -0.58);
  rearWheel.add(new THREE.Mesh(wheelGeo, rubberMat), new THREE.Mesh(rimGeo, rimMat));
  rearWheel.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  group.add(rearWheel);

  // Floorboard & rear body cowling
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.85), darkTrim);
  deck.position.set(0, 0.3, 0.04);
  deck.castShadow = true;
  group.add(deck);

  const rearBody = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.72), fairingMat);
  rearBody.position.set(0, 0.52, -0.34);
  rearBody.castShadow = true;
  group.add(rearBody);

  // Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.62), darkTrim);
  seat.position.set(0, 0.74, -0.26);
  seat.castShadow = true;
  group.add(seat);

  // Front leg shield & handlebar stem
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.66, 0.18), fairingMat);
  shield.position.set(0, 0.64, 0.52);
  shield.rotation.x = -0.18;
  shield.castShadow = true;
  group.add(shield);

  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.66, 10), darkTrim);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.98, 0.44);
  group.add(handlebar);

  const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.08), headlightMaterial);
  headlamp.position.set(0, 0.96, 0.55);
  group.add(headlamp);

  // Rider torso + helmet
  const riderTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.36, 6, 12), vestMat);
  riderTorso.position.set(0, 1.12, -0.14);
  riderTorso.rotation.x = 0.16;
  riderTorso.castShadow = true;
  group.add(riderTorso);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), helmetMat);
  helmet.position.set(0, 1.52, -0.05);
  helmet.castShadow = true;
  group.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.12), darkTrim);
  visor.position.set(0, 1.52, 0.07);
  group.add(visor);

  addContactShadow(group, shadowMap, 1.0, 2.0);

  group.traverse((obj) => {
    obj.userData.selectableId = 'scooter';
  });

  return { group, headlightMaterial, frontWheel, rearWheel };
}

/**
 * Composite 3-part Safety Cone (y=0 pivot).
 */
export function createTrafficCone(shadowMap: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1e242b,
    roughness: 0.9,
    metalness: 0.05,
  });
  const orangeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.48,
    metalness: 0.05,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xe2e8f0,
    emissiveIntensity: 0.25,
    roughness: 0.3,
    metalness: 0.1,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.36), baseMat);
  base.position.y = 0.03;
  base.castShadow = true;
  group.add(base);

  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.14, 0.56, 16), orangeMat);
  cone.position.y = 0.34;
  cone.castShadow = true;
  group.add(cone);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.12, 16), collarMat);
  collar.position.y = 0.42;
  group.add(collar);

  addContactShadow(group, shadowMap, 0.55, 0.55);
  return group;
}

/**
 * Composite 5-part Municipal Roadwork Barricade (y=0 pivot).
 */
export function createSafetyBarricade(textures: RoadTextureBundle): THREE.Group {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.78,
  });
  const boardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardStripeMap,
    roughness: 0.52,
    metalness: 0.08,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  const legGeo = new THREE.BoxGeometry(0.06, 0.98, 0.06);
  for (const lx of [-0.62, 0.62]) {
    for (const tilt of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, 0.48, tilt * 0.9);
      leg.rotation.x = tilt;
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const topBoard = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.24, 0.06), boardMat);
  topBoard.position.set(0, 0.78, 0);
  topBoard.castShadow = true;
  group.add(topBoard);

  const lowBoard = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 0.06), boardMat);
  lowBoard.position.set(0, 0.42, 0);
  lowBoard.castShadow = true;
  group.add(lowBoard);

  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12), lampMat);
  beacon.position.set(0.58, 0.98, 0);
  group.add(beacon);

  addContactShadow(group, textures.contactShadowMap, 1.85, 0.75);
  return group;
}

/**
 * Streetlight Poles lined along the corridor with Night-mode luminaire control.
 */
export function createCorridorStreetLamps(
  zPositions: number[],
  roadHalfWidth: number
): StreetLampHandle {
  const group = new THREE.Group();
  const bulbMaterials: THREE.MeshStandardMaterial[] = [];
  const glowCones: THREE.Mesh[] = [];

  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.38,
    metalness: 0.82,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.6,
    metalness: 0.55,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const baseGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.45, 10);
  const poleGeo = new THREE.CylinderGeometry(0.065, 0.1, 5.4, 10);
  const armGeo = new THREE.BoxGeometry(1.6, 0.07, 0.07);
  const headGeo = new THREE.BoxGeometry(0.56, 0.1, 0.24);
  const bulbGeo = new THREE.BoxGeometry(0.46, 0.04, 0.18);
  const coneGeo = new THREE.ConeGeometry(2.4, 5.2, 16, 1, true);

  zPositions.forEach((z, idx) => {
    const side = idx % 2 === 0 ? -1 : 1;
    const lamp = new THREE.Group();
    lamp.position.set(side * (roadHalfWidth + 0.85), 0, z);

    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.225;
    base.castShadow = true;

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2.9;
    pole.castShadow = true;

    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(-side * 0.72, 5.55, 0);

    const head = new THREE.Mesh(headGeo, baseMat);
    head.position.set(-side * 1.48, 5.5, 0);

    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfde047,
      emissiveIntensity: 0.4,
      roughness: 0.18,
      metalness: 0.05,
    });
    bulbMaterials.push(bulbMat);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(-side * 1.48, 5.44, 0);

    const cone = new THREE.Mesh(coneGeo, glowMat);
    cone.position.set(-side * 1.48, 2.8, 0);
    cone.visible = false;
    glowCones.push(cone);

    lamp.add(base, pole, arm, head, bulb, cone);
    group.add(lamp);
  });

  return { group, bulbMaterials, glowCones };
}

/**
 * Instanced roadside urban trees & reflective road studs (cat's eyes) for low draw calls.
 */
export function createRoadsideInstancedProps(roadHalfWidth: number): THREE.Group {
  const group = new THREE.Group();

  // 28 roadside trees (14 per side) using 3 InstancedMeshes (trunk, lower canopy, upper canopy)
  const treePositions: Array<[number, number, number]> = [];
  for (let i = 0; i < 12; i++) {
    const z = -22 + i * 4.2;
    treePositions.push([-(roadHalfWidth + 3.2 + (i % 2) * 0.9), z, 0.85 + (i % 3) * 0.14]);
    treePositions.push([roadHalfWidth + 3.2 + ((i + 1) % 2) * 0.9, z + 1.4, 0.9 + ((i + 1) % 3) * 0.12]);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.8, 8);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    roughness: 0.92,
    metalness: 0.02,
  });
  const canopyLowGeo = new THREE.DodecahedronGeometry(1.18, 1);
  const canopyHighGeo = new THREE.DodecahedronGeometry(0.86, 1);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x2f6f44,
    roughness: 0.86,
    metalness: 0.02,
  });

  const count = treePositions.length;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const lowCanopies = new THREE.InstancedMesh(canopyLowGeo, canopyMat, count);
  const highCanopies = new THREE.InstancedMesh(canopyHighGeo, canopyMat, count);
  trunks.castShadow = true;
  lowCanopies.castShadow = true;
  highCanopies.castShadow = true;

  const dummy = new THREE.Object3D();
  const cColor = new THREE.Color();

  treePositions.forEach(([tx, tz, sc], idx) => {
    dummy.position.set(tx, 0.9 * sc, tz);
    dummy.scale.set(sc, sc, sc);
    dummy.rotation.set(0, idx * 0.9, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tx, 2.35 * sc, tz);
    dummy.scale.set(sc, sc * 0.88, sc);
    dummy.updateMatrix();
    lowCanopies.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tx, 3.18 * sc, tz);
    dummy.scale.set(sc * 0.92, sc * 0.84, sc * 0.92);
    dummy.updateMatrix();
    highCanopies.setMatrixAt(idx, dummy.matrix);

    cColor.setHSL(0.36 + (idx % 3) * 0.015, 0.42, 0.28 + (idx % 4) * 0.03);
    lowCanopies.setColorAt(idx, cColor);
    cColor.offsetHSL(0.01, 0.04, 0.04);
    highCanopies.setColorAt(idx, cColor);
  });

  trunks.instanceMatrix.needsUpdate = true;
  lowCanopies.instanceMatrix.needsUpdate = true;
  highCanopies.instanceMatrix.needsUpdate = true;
  if (lowCanopies.instanceColor) lowCanopies.instanceColor.needsUpdate = true;
  if (highCanopies.instanceColor) highCanopies.instanceColor.needsUpdate = true;
  group.add(trunks, lowCanopies, highCanopies);

  // 30 Instanced Amber Road Reflector Studs (Cat's Eyes) along center divider
  const studCount = 30;
  const studGeo = new THREE.BoxGeometry(0.14, 0.035, 0.14);
  const studMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.4,
  });
  const studs = new THREE.InstancedMesh(studGeo, studMat, studCount);
  for (let i = 0; i < studCount; i++) {
    dummy.position.set(0, 0.018, -23 + i * 1.6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    studs.setMatrixAt(i, dummy.matrix);
  }
  studs.instanceMatrix.needsUpdate = true;
  group.add(studs);

  return group;
}

/**
 * Organic irregular 3D crater + IRC:SP:100 multi-layer exploded repair assembly.
 */
export function createCraterAndRepairAssembly(
  textures: RoadTextureBundle
): CraterAssemblyHandle {
  const group = new THREE.Group();
  group.name = 'pothole_crater';
  group.position.set(-1.75, 0, 0);

  // Build organic irregular polygon shape for crater footprint
  const points: THREE.Vector2[] = [];
  const segs = 28;
  for (let i = 0; i < segs; i++) {
    const angle = (i / segs) * Math.PI * 2;
    const jitter =
      1 +
      0.16 * Math.sin(angle * 3 + 0.4) +
      0.1 * Math.cos(angle * 5 - 0.8) +
      0.06 * Math.sin(angle * 7);
    points.push(new THREE.Vector2(Math.cos(angle) * 0.52 * jitter, Math.sin(angle) * 0.42 * jitter));
  }
  const craterShape = new THREE.Shape(points);

  // Outer spalled asphalt rim ring
  const outerPoints = points.map((p) => new THREE.Vector2(p.x * 1.24, p.y * 1.24));
  const rimShape = new THREE.Shape(outerPoints);
  const holePath = new THREE.Path(points.slice().reverse());
  rimShape.holes.push(holePath);

  const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  rimGeo.rotateX(Math.PI / 2);

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x20242c,
    map: textures.asphaltMap,
    bumpMap: textures.asphaltBumpMap,
    bumpScale: 0.04,
    roughness: 0.9,
    metalness: 0.04,
  });
  const craterRim = new THREE.Mesh(rimGeo, rimMat);
  craterRim.position.y = 0.038;
  craterRim.receiveShadow = true;
  craterRim.castShadow = true;
  group.add(craterRim);

  // Exposed granular subbase cavity floor
  const subbaseGeo = new THREE.ShapeGeometry(craterShape);
  subbaseGeo.rotateX(-Math.PI / 2);
  const subbaseMat = new THREE.MeshStandardMaterial({
    map: textures.subbaseMap,
    roughness: 0.95,
    metalness: 0.02,
  });
  const subbaseMesh = new THREE.Mesh(subbaseGeo, subbaseMat);
  subbaseMesh.position.y = 0.008;
  subbaseMesh.receiveShadow = true;
  group.add(subbaseMesh);

  // Rainwater puddle surface (visible for waterlogged craters before dewatering)
  const waterGeo = new THREE.ShapeGeometry(craterShape);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a4559,
    roughness: 0.06,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.84,
  });
  const waterDisc = new THREE.Mesh(waterGeo, waterMat);
  waterDisc.position.y = 0.024;
  group.add(waterDisc);

  // Layer 1: Bituminous Tack Coat Primer
  const tackGeo = new THREE.ExtrudeGeometry(craterShape, {
    depth: 0.018,
    bevelEnabled: false,
  });
  tackGeo.rotateX(Math.PI / 2);
  const tackMat = new THREE.MeshStandardMaterial({
    color: 0x0f1217,
    roughness: 0.28,
    metalness: 0.12,
    transparent: true,
    opacity: 0,
  });
  const tackLayer = new THREE.Mesh(tackGeo, tackMat);
  tackLayer.position.y = 0.026;
  group.add(tackLayer);

  // Layer 2: IRC:SP:100 Ready-to-Pour Cold-Mix Asphalt Aggregate Fill
  const coldMixGeo = new THREE.ExtrudeGeometry(craterShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  coldMixGeo.rotateX(Math.PI / 2);
  const coldMixMat = new THREE.MeshStandardMaterial({
    map: textures.coldMixMap,
    bumpMap: textures.coldMixBumpMap,
    bumpScale: 0.06,
    roughness: 0.84,
    metalness: 0.04,
    transparent: true,
    opacity: 0,
  });
  const coldMixLayer = new THREE.Mesh(coldMixGeo, coldMixMat);
  coldMixLayer.position.y = 0.065;
  coldMixLayer.castShadow = true;
  coldMixLayer.receiveShadow = true;
  group.add(coldMixLayer);

  // Layer 3: Compacted Flush Wearing Course Cap
  const capGeo = new THREE.ExtrudeGeometry(craterShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  capGeo.rotateX(Math.PI / 2);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x1d222b,
    map: textures.coldMixMap,
    roughness: 0.72,
    metalness: 0.06,
    transparent: true,
    opacity: 0,
  });
  const compactedCap = new THREE.Mesh(capGeo, capMat);
  compactedCap.position.y = 0.042;
  compactedCap.receiveShadow = true;
  group.add(compactedCap);

  // Edge CV Laser Measurement Bounding Bracket (4 corner L-brackets)
  const laserBracket = new THREE.Group();
  const laserMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.85,
  });
  const barH = new THREE.BoxGeometry(0.26, 0.015, 0.028);
  const barV = new THREE.BoxGeometry(0.028, 0.015, 0.26);
  const corners: Array<[number, number]> = [
    [-0.74, -0.62],
    [0.74, -0.62],
    [-0.74, 0.62],
    [0.74, 0.62],
  ];
  for (const [cx, cz] of corners) {
    const h = new THREE.Mesh(barH, laserMat);
    h.position.set(cx - Math.sign(cx) * 0.12, 0.045, cz);
    const v = new THREE.Mesh(barV, laserMat);
    v.position.set(cx, 0.045, cz - Math.sign(cz) * 0.12);
    laserBracket.add(h, v);
  }
  group.add(laserBracket);

  group.traverse((obj) => {
    obj.userData.selectableId = 'crater';
  });

  let waterloggedFlag = true;

  const updateDimensions = (
    widthCm: number,
    depthCm: number,
    isWaterlogged: boolean
  ) => {
    waterloggedFlag = isWaterlogged;
    const scaleXZ = THREE.MathUtils.clamp(widthCm / 70, 0.75, 1.85);
    const scaleDepth = THREE.MathUtils.clamp(depthCm / 8, 0.7, 1.7);
    group.scale.set(scaleXZ, scaleDepth, scaleXZ);
    waterDisc.visible = isWaterlogged;
  };

  const updateRepairState = (progress01: number, exploded: boolean) => {
    const p = THREE.MathUtils.clamp(progress01, 0, 1);

    // Rainwater drains between 0% and 30%
    if (waterloggedFlag) {
      const waterFade = THREE.MathUtils.clamp(1 - p / 0.3, 0, 1);
      waterDisc.visible = waterFade > 0.02;
      (waterDisc.material as THREE.MeshPhysicalMaterial).opacity = 0.84 * waterFade;
    } else {
      waterDisc.visible = false;
    }

    // Layer 1: Tack coat appears 15% -> 40%
    const tackAlpha = THREE.MathUtils.smoothstep(p, 0.12, 0.38);
    tackLayer.visible = tackAlpha > 0.01;
    (tackLayer.material as THREE.MeshStandardMaterial).opacity = tackAlpha;
    tackLayer.position.y = 0.026 + (exploded ? 0.28 : 0);

    // Layer 2: IRC:SP:100 cold-mix appears 35% -> 72%
    const mixAlpha = THREE.MathUtils.smoothstep(p, 0.34, 0.7);
    coldMixLayer.visible = mixAlpha > 0.01;
    (coldMixLayer.material as THREE.MeshStandardMaterial).opacity = mixAlpha;
    coldMixLayer.position.y =
      (exploded ? 0.78 : 0.056) + (1 - mixAlpha) * 0.25;

    // Layer 3: Flush compacted surface cap appears 70% -> 100%
    const capAlpha = THREE.MathUtils.smoothstep(p, 0.68, 0.96);
    compactedCap.visible = capAlpha > 0.01;
    (compactedCap.material as THREE.MeshStandardMaterial).opacity = capAlpha;
    compactedCap.position.y =
      (exploded ? 1.24 : 0.044) + (1 - capAlpha) * 0.18;

    // Laser bracket shifts from rose (hazard) to emerald (verified compacted)
    const bracketColor = p >= 0.88 ? 0x10b981 : 0xf43f5e;
    laserMat.color.setHex(bracketColor);
  };

  return {
    group,
    craterRim,
    waterDisc,
    tackLayer,
    coldMixLayer,
    compactedCap,
    laserBracket,
    updateDimensions,
    updateRepairState,
  };
}
