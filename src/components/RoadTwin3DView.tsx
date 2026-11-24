import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Layers,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RotateCcw,
  Wrench,
  X,
} from 'lucide-react';
import { HazardReport } from '../types/routix';
import { createRoadTextureBundle } from '../three/roadTextures';
import {
  createCommuterScooter,
  createCorridorStreetLamps,
  createCraterAndRepairAssembly,
  createPatchTruck,
  createRoadsideInstancedProps,
  createSafetyBarricade,
  createTrafficCone,
} from '../three/proceduralModels';

interface RoadTwin3DViewProps {
  hazards: HazardReport[];
  selectedHazardId: string | null;
  onSelectHazard: (id: string) => void;
  theme: 'light' | 'dark';
  onOpenRoadIntel?: (hazardId: string) => void;
}

type CameraPreset = 'isometric' | 'crater' | 'swerve' | 'aerial';
type InspectedObjectId = 'crater' | 'truck' | 'scooter' | null;

const CAMERA_PRESETS: Record<
  CameraPreset,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  isometric: {
    label: 'Corridor',
    pos: [8.6, 5.4, 9.2],
    target: [-0.8, 0.55, 0.2],
  },
  crater: {
    label: 'Crater Spec',
    pos: [0.45, 2.35, 3.1],
    target: [-1.75, 0.15, 0],
  },
  swerve: {
    label: 'Rider Swerve',
    pos: [-2.4, 2.1, 8.8],
    target: [-1.45, 0.65, -2.5],
  },
  aerial: {
    label: 'Aerial Plan',
    pos: [0.2, 16.5, 4.2],
    target: [-0.5, 0, 0],
  },
};

// Module-scope pre-allocated scratch vectors (zero per-frame heap allocations)
const _vPos = new THREE.Vector3();
const _vNext = new THREE.Vector3();
const _vCamDest = new THREE.Vector3();
const _vCtrlDest = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();

function detectSoftwareWebGL(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /swiftshader|llvmpipe|software|mesa offscreen|angle.*swiftshader/i.test(
      rendererStr
    );
  } catch {
    return false;
  }
}

function getRepairStageLabel(progress: number): string {
  if (progress < 15) return 'Raw Crater · Active Hazard';
  if (progress < 40) return 'Dewatered + Bituminous Tack Coat';
  if (progress < 78) return 'IRC:SP:100 Cold-Mix Aggregate Pour';
  if (progress < 95) return 'Vibratory Plate Compaction';
  return 'Flush Compacted · Ready for Traffic';
}

export function RoadTwin3DView({
  hazards,
  selectedHazardId,
  onSelectHazard,
  theme,
  onOpenRoadIntel,
}: RoadTwin3DViewProps) {
  const activeHazard = useMemo(() => {
    if (hazards.length === 0) return null;
    return hazards.find((h) => h.id === selectedHazardId) ?? hazards[0];
  }, [hazards, selectedHazardId]);

  const [repairProgress, setRepairProgress] = useState<number>(() =>
    activeHazard?.status === 'verified' ? 100 : 12
  );
  const [explodedView, setExplodedView] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [isPlayingTraffic, setIsPlayingTraffic] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [inspectedId, setInspectedId] = useState<InspectedObjectId>('crater');

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef<{
    repairProgress: number;
    explodedView: boolean;
    isPlayingTraffic: boolean;
    theme: 'light' | 'dark';
    widthCm: number;
    depthCm: number;
    isWaterlogged: boolean;
    desiredPreset: CameraPreset | null;
    applyTheme?: (t: 'light' | 'dark') => void;
    applyHazardGeometry?: (w: number, d: number, water: boolean) => void;
    applyRepair?: (progress: number, exploded: boolean) => void;
  }>({
    repairProgress,
    explodedView,
    isPlayingTraffic,
    theme,
    widthCm: activeHazard?.estimatedWidthCm ?? 82,
    depthCm: activeHazard?.craterGeometry?.depthCm ?? 10,
    isWaterlogged:
      (activeHazard?.hazardType || '').toLowerCase().includes('water') ||
      (activeHazard?.psiBreakdown?.monsoonRiskScore ?? 0) >= 80,
    desiredPreset: 'isometric',
  });

  // Sync default repair progress when switching to a verified vs active hazard
  useEffect(() => {
    if (!activeHazard) return;
    setRepairProgress(activeHazard.status === 'verified' ? 100 : 10);
  }, [activeHazard?.id]);

  // Push reactive state updates into Three.js ref without tearing down the WebGL context
  useEffect(() => {
    const s = sceneStateRef.current;
    s.repairProgress = repairProgress;
    s.explodedView = explodedView;
    s.isPlayingTraffic = isPlayingTraffic;
    s.applyRepair?.(repairProgress, explodedView);
  }, [repairProgress, explodedView, isPlayingTraffic]);

  useEffect(() => {
    const s = sceneStateRef.current;
    s.theme = theme;
    s.applyTheme?.(theme);
  }, [theme]);

  useEffect(() => {
    if (!activeHazard) return;
    const s = sceneStateRef.current;
    const w = activeHazard.estimatedWidthCm || 75;
    const d = activeHazard.craterGeometry?.depthCm || 8;
    const water =
      activeHazard.hazardType.toLowerCase().includes('water') ||
      (activeHazard.psiBreakdown?.monsoonRiskScore ?? 0) >= 80;
    s.widthCm = w;
    s.depthCm = d;
    s.isWaterlogged = water;
    s.applyHazardGeometry?.(w, d, water);
  }, [activeHazard]);

  const handleSelectPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    sceneStateRef.current.desiredPreset = preset;
  };

  // Mount & manage WebGL scene lifecycle
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = Math.max(mount.clientWidth, 320);
    const height = Math.max(mount.clientHeight, 320);

    // Probe software WebGL once cleanly
    const probeCanvas = document.createElement('canvas');
    const probeGl =
      probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    const isSoftwareGl = probeGl ? detectSoftwareWebGL(probeGl) : false;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    mount.innerHTML = '';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Studio IBL via RoomEnvironment on EVERY device (zero external HDRI fetch)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.15, 160);
    camera.position.set(...CAMERA_PRESETS.isometric.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 2.1;
    controls.maxDistance = 30;
    controls.target.set(...CAMERA_PRESETS.isometric.target);
    controls.update();

    const onControlStart = () => {
      sceneStateRef.current.desiredPreset = null;
    };
    controls.addEventListener('start', onControlStart);

    // Lighting rig: warm key DirectionalLight + cool HemisphereLight
    const hemiLight = new THREE.HemisphereLight(0xcbe2ff, 0x3b444f, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sunLight.position.set(12, 16, 10);
    if (!isSoftwareGl) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(1024, 1024);
      sunLight.shadow.camera.left = -14;
      sunLight.shadow.camera.right = 14;
      sunLight.shadow.camera.top = 14;
      sunLight.shadow.camera.bottom = -14;
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 42;
      sunLight.shadow.bias = -0.0002;
      sunLight.shadow.normalBias = 0.02;
    }
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(-10, 8, -12);
    scene.add(rimLight);

    // Procedural textures
    const maxAniso = isSoftwareGl ? 1 : renderer.capabilities.getMaxAnisotropy();
    const textures = createRoadTextureBundle(maxAniso);

    // Road Corridor & Surrounding Ground
    const roadWidth = 9.2;
    const roadHalfWidth = roadWidth / 2;
    const roadLength = 52;

    const roadGeo = new THREE.PlaneGeometry(roadWidth, roadLength);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshStandardMaterial({
      map: textures.asphaltMap,
      bumpMap: textures.asphaltBumpMap,
      bumpScale: 0.035,
      roughnessMap: textures.asphaltRoughnessMap,
      roughness: 0.92,
      metalness: 0.04,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Flanking Concrete Curbs + Sidewalks + Urban Verge Ground
    const curbGeo = new THREE.BoxGeometry(0.32, 0.2, roadLength);
    const curbMat = new THREE.MeshStandardMaterial({
      map: textures.curbMap,
      roughness: 0.86,
      metalness: 0.04,
    });
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(side * (roadHalfWidth + 0.16), 0.1, 0);
      curb.receiveShadow = true;
      curb.castShadow = true;
      scene.add(curb);

      const walkGeo = new THREE.BoxGeometry(2.4, 0.16, roadLength);
      const walkMat = new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        roughness: 0.9,
        metalness: 0.03,
      });
      const sidewalk = new THREE.Mesh(walkGeo, walkMat);
      sidewalk.position.set(side * (roadHalfWidth + 1.52), 0.08, 0);
      sidewalk.receiveShadow = true;
      scene.add(sidewalk);
    }

    const vergeGeo = new THREE.PlaneGeometry(140, 140);
    vergeGeo.rotateX(-Math.PI / 2);
    const vergeMat = new THREE.MeshStandardMaterial({
      color: 0x627067,
      roughness: 0.96,
      metalness: 0.0,
    });
    const verge = new THREE.Mesh(vergeGeo, vergeMat);
    verge.position.y = -0.02;
    verge.receiveShadow = true;
    scene.add(verge);

    // Streetlamps & Instanced Roadside Trees + Reflectors
    const streetLamps = createCorridorStreetLamps([-18, -6, 6, 18], roadHalfWidth);
    scene.add(streetLamps.group);

    const instancedProps = createRoadsideInstancedProps(roadHalfWidth);
    scene.add(instancedProps);

    // Hero 1: Crater & IRC:SP:100 Multi-Layer Repair Assembly
    const craterAssembly = createCraterAndRepairAssembly(textures);
    craterAssembly.updateDimensions(
      sceneStateRef.current.widthCm,
      sceneStateRef.current.depthCm,
      sceneStateRef.current.isWaterlogged
    );
    craterAssembly.updateRepairState(
      sceneStateRef.current.repairProgress / 100,
      sceneStateRef.current.explodedView
    );
    scene.add(craterAssembly.group);

    // Hero 2: Routix Rapid Patch Truck stationed safely upstream in adjacent shoulder bay
    const patchTruck = createPatchTruck(textures);
    patchTruck.group.position.set(2.35, 0, -2.4);
    patchTruck.group.rotation.y = Math.PI - 0.12;
    scene.add(patchTruck.group);

    // Roadwork Safety Perimeter: Barricade + 3 Traffic Cones around the crater
    const safetyPerimeter = new THREE.Group();
    const barricade = createSafetyBarricade(textures);
    barricade.position.set(-1.75, 0, 2.35);
    barricade.rotation.y = 0.06;
    safetyPerimeter.add(barricade);

    const coneOffsets: Array<[number, number]> = [
      [-3.15, 1.35],
      [-0.45, 1.25],
      [-3.05, -1.45],
    ];
    for (const [cx, cz] of coneOffsets) {
      const cone = createTrafficCone(textures.contactShadowMap);
      cone.position.set(cx, 0, cz);
      safetyPerimeter.add(cone);
    }
    scene.add(safetyPerimeter);

    // Hero 3: Commuter Two-Wheeler Scooter + Dual Trajectory Ribbons (S-Curve Swerve vs Smooth Straight)
    const scooter = createCommuterScooter(textures.contactShadowMap);
    scene.add(scooter.group);

    const swerveCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.75, 0.04, 15.5),
      new THREE.Vector3(-1.75, 0.04, 7.2),
      new THREE.Vector3(-0.35, 0.04, 2.6),
      new THREE.Vector3(0.42, 0.04, 0.0),
      new THREE.Vector3(-0.45, 0.04, -3.2),
      new THREE.Vector3(-1.75, 0.04, -8.5),
      new THREE.Vector3(-1.75, 0.04, -15.5),
    ]);

    const straightCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.75, 0.04, 15.5),
      new THREE.Vector3(-1.75, 0.04, 5.0),
      new THREE.Vector3(-1.75, 0.04, 0.0),
      new THREE.Vector3(-1.75, 0.04, -5.0),
      new THREE.Vector3(-1.75, 0.04, -15.5),
    ]);

    const swerveRibbonMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.72,
    });
    const swerveRibbon = new THREE.Mesh(
      new THREE.TubeGeometry(swerveCurve, 56, 0.055, 8, false),
      swerveRibbonMat
    );
    scene.add(swerveRibbon);

    const smoothRibbonMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.72,
    });
    const smoothRibbon = new THREE.Mesh(
      new THREE.TubeGeometry(straightCurve, 32, 0.055, 8, false),
      smoothRibbonMat
    );
    smoothRibbon.visible = false;
    scene.add(smoothRibbon);

    // Apply Theme (Light Daylight vs Dark Night Municipal Mode)
    const applyTheme = (mode: 'light' | 'dark') => {
      if (mode === 'dark') {
        const nightSky = 0x0b1220;
        scene.background = new THREE.Color(nightSky);
        scene.fog = new THREE.FogExp2(nightSky, 0.024);
        hemiLight.color.setHex(0x3b5998);
        hemiLight.groundColor.setHex(0x111827);
        hemiLight.intensity = 0.55;
        sunLight.color.setHex(0xbfd7ff);
        sunLight.intensity = 1.05;
        rimLight.intensity = 0.65;
        renderer.toneMappingExposure = 1.0;
        vergeMat.color.setHex(0x1f2937);
        streetLamps.bulbMaterials.forEach((m) => {
          m.emissiveIntensity = 3.2;
        });
        streetLamps.glowCones.forEach((c) => {
          c.visible = true;
        });
        patchTruck.headlightMaterial.emissiveIntensity = 2.8;
        scooter.headlightMaterial.emissiveIntensity = 3.0;
      } else {
        const daySky = 0xdbeafe;
        scene.background = new THREE.Color(daySky);
        scene.fog = new THREE.FogExp2(daySky, 0.017);
        hemiLight.color.setHex(0xdbeafe);
        hemiLight.groundColor.setHex(0x52525b);
        hemiLight.intensity = 0.82;
        sunLight.color.setHex(0xfff4e0);
        sunLight.intensity = 2.15;
        rimLight.intensity = 0.4;
        renderer.toneMappingExposure = 1.08;
        vergeMat.color.setHex(0x708276);
        streetLamps.bulbMaterials.forEach((m) => {
          m.emissiveIntensity = 0.35;
        });
        streetLamps.glowCones.forEach((c) => {
          c.visible = false;
        });
        patchTruck.headlightMaterial.emissiveIntensity = 0.9;
        scooter.headlightMaterial.emissiveIntensity = 1.1;
      }
    };

    const applyRepair = (progress: number, exploded: boolean) => {
      const p01 = progress / 100;
      craterAssembly.updateRepairState(p01, exploded);
      const isFlush = progress >= 88;
      swerveRibbon.visible = !isFlush;
      smoothRibbon.visible = isFlush;
      safetyPerimeter.visible = !isFlush;
    };

    sceneStateRef.current.applyTheme = applyTheme;
    sceneStateRef.current.applyHazardGeometry = (w, d, water) => {
      craterAssembly.updateDimensions(w, d, water);
    };
    sceneStateRef.current.applyRepair = applyRepair;

    applyTheme(sceneStateRef.current.theme);
    applyRepair(
      sceneStateRef.current.repairProgress,
      sceneStateRef.current.explodedView
    );

    // Click Raycasting for Crater / Truck / Scooter Telemetry Selection
    const raycaster = new THREE.Raycaster();
    const clickTargets = [craterAssembly.group, patchTruck.group, scooter.group];
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 6) return; // Dragging OrbitControls, not clicking

      const rect = renderer.domElement.getBoundingClientRect();
      _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_rayMouse, camera);
      const hits = raycaster.intersectObjects(clickTargets, true);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData?.selectableId as
          | InspectedObjectId
          | undefined;
        if (hitId) {
          setInspectedId(hitId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Software WebGL fence-sync pacing helper
    const glCtx = renderer.getContext();
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && glCtx instanceof WebGL2RenderingContext;
    let rafId = 0;
    let fenceTimerId: number | null = null;
    let disposed = false;

    const afterDraw = (nextTick: () => void) => {
      if (disposed) return;
      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(nextTick);
        return;
      }
      if (isWebGL2) {
        const gl2 = glCtx as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (disposed) {
              gl2.deleteSync(sync);
              return;
            }
            const status = gl2.clientWaitSync(sync, 0, 0);
            if (status === gl2.TIMEOUT_EXPIRED) {
              fenceTimerId = window.setTimeout(poll, 8);
            } else {
              gl2.deleteSync(sync);
              rafId = requestAnimationFrame(nextTick);
            }
          };
          poll();
          return;
        }
      }
      rafId = requestAnimationFrame(nextTick);
    };

    // ResizeObserver for crisp layout & fullscreen transitions
    const resizeObserver = new ResizeObserver((entries) => {
      if (disposed) return;
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(Math.floor(entry.contentRect.width), 300);
      const h = Math.max(Math.floor(entry.contentRect.height), 300);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(mount);

    // Animation loop
    let lastTime = performance.now();
    let scooterT = 0.08;
    let elapsed = 0;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      elapsed += dt;

      const s = sceneStateRef.current;

      // Smoothly transition camera if a preset was triggered
      if (s.desiredPreset) {
        const preset = CAMERA_PRESETS[s.desiredPreset];
        _vCamDest.set(...preset.pos);
        _vCtrlDest.set(...preset.target);
        const lerpAlpha = Math.min(1, dt * 5.2);
        camera.position.lerp(_vCamDest, lerpAlpha);
        controls.target.lerp(_vCtrlDest, lerpAlpha);
        if (
          camera.position.distanceToSquared(_vCamDest) < 0.002 &&
          controls.target.distanceToSquared(_vCtrlDest) < 0.002
        ) {
          camera.position.copy(_vCamDest);
          controls.target.copy(_vCtrlDest);
          s.desiredPreset = null;
        }
      }

      // Animate patch truck amber warning beacon
      const beaconPulse = 0.9 + Math.abs(Math.sin(elapsed * 5.2)) * 2.4;
      patchTruck.beaconMaterial.emissiveIntensity = beaconPulse;

      // Animate commuter two-wheeler along S-curve swerve (or smooth straight line when repaired)
      if (s.isPlayingTraffic) {
        scooterT = (scooterT + dt * 0.13) % 1;
        scooter.frontWheel.rotation.x += dt * 11;
        scooter.rearWheel.rotation.x += dt * 11;
      }

      const activeCurve = s.repairProgress >= 88 ? straightCurve : swerveCurve;
      activeCurve.getPointAt(scooterT, _vPos);
      activeCurve.getPointAt((scooterT + 0.015) % 1, _vNext);
      scooter.group.position.set(_vPos.x, 0, _vPos.z);

      const dx = _vNext.x - _vPos.x;
      const dz = _vNext.z - _vPos.z;
      const heading = Math.atan2(dx, dz);
      scooter.group.rotation.y = heading;
      // Subtle realistic rider lean into S-curve swerve
      const lateralSlope = THREE.MathUtils.clamp(dx * 1.45, -0.35, 0.35);
      scooter.group.rotation.z = -lateralSlope;

      controls.update();
      renderer.render(scene, camera);
      afterDraw(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (fenceTimerId !== null) window.clearTimeout(fenceTimerId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      envTarget.dispose();
      textures.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneStateRef.current.applyTheme = undefined;
      sceneStateRef.current.applyHazardGeometry = undefined;
      sceneStateRef.current.applyRepair = undefined;
    };
  }, []);

  const stageLabel = getRepairStageLabel(repairProgress);

  return (
    <section
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col'
          : 'relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden shadow-sm'
      }
    >
      {/* WebGL Mount Container — isolated from React HUD overlays */}
      <div
        className={
          isFullscreen
            ? 'relative flex-1 w-full h-full'
            : 'relative w-full h-[68vh] min-h-[540px] max-h-[780px]'
        }
      >
        <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

        {/* Top-Left Compact Inspection Card (solid surface, zero backdrop-filter over WebGL) */}
        <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-start justify-between gap-3">
          <div className="pointer-events-auto max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3.5 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  3D Road Digital Twin
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight mt-0.5">
                  {activeHazard ? activeHazard.streetName : 'Corridor Simulation'}
                </div>
              </div>
              {activeHazard && (
                <span className="rounded-md bg-slate-900 dark:bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-white dark:text-slate-950 shrink-0">
                  PSI {activeHazard.priorityScore}
                </span>
              )}
            </div>

            {inspectedId && activeHazard && (
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {inspectedId === 'crater'
                      ? `Crater · ${activeHazard.hazardType}`
                      : inspectedId === 'truck'
                      ? 'Routix Rapid Patch Truck'
                      : 'Two-Wheeler IMU Swarm Rider'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectedId(null)}
                    aria-label="Close object telemetry"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {inspectedId === 'crater' && (
                  <div className="grid grid-cols-3 gap-2 pt-0.5 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-500 block font-sans">Width</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {activeHazard.estimatedWidthCm} cm
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-sans">Depth</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {activeHazard.craterGeometry?.depthCm ?? 8} cm
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-sans">IRC Mix</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {activeHazard.craterGeometry?.ircColdMixKg ?? 55} kg
                      </span>
                    </div>
                  </div>
                )}

                {inspectedId === 'truck' && (
                  <p className="text-[11px] leading-relaxed">
                    Loaded with{' '}
                    <span className="font-semibold">
                      {activeHazard.craterGeometry?.ircBags25Kg ?? 3} × 25 kg
                    </span>{' '}
                    IRC:SP:100 cold-mix bags (est. ₹
                    {activeHazard.microJobPayoutInr.toLocaleString('en-IN')}). Zero heating or heavy roller required.
                  </p>
                )}

                {inspectedId === 'scooter' && (
                  <p className="text-[11px] leading-relaxed">
                    {repairProgress >= 88
                      ? 'Patch compacted flush: rider glides straight through lane with zero lateral swerve.'
                      : `Logging ${activeHazard.peakVerticalG.toFixed(2)}g vertical shock & ${activeHazard.evasiveManoeuvreCount} S-curve swerves along the red trajectory ribbon.`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Top-Right Compact Action Controls */}
          <div className="pointer-events-auto flex items-center gap-2">
            {activeHazard && onOpenRoadIntel && (
              <button
                type="button"
                onClick={() => onOpenRoadIntel(activeHazard.id)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm cursor-pointer"
              >
                Search Ward Intel
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm cursor-pointer"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exit</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Collapsible Control Dock (<= 15% viewport height, zero backdrop-blur) */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex justify-center">
          <div className="pointer-events-auto w-full max-w-5xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-md">
            <div className="flex items-center justify-between gap-3 px-3.5 py-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Wrench className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {stageLabel}
                </span>
                <span className="hidden md:inline text-[11px] text-slate-500 dark:text-slate-400">
                  · Drag to orbit · Scroll to zoom · Click 3D objects to inspect
                </span>
              </div>
              <button
                type="button"
                onClick={() => setControlsCollapsed((c) => !c)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0 cursor-pointer"
              >
                {controlsCollapsed ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>Show Controls</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>Hide Controls</span>
                  </>
                )}
              </button>
            </div>

            {!controlsCollapsed && (
              <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 border-t border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
                {/* Hazard Picker */}
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Active Corridor Hazard
                  </label>
                  <select
                    value={activeHazard?.id ?? ''}
                    onChange={(e) => onSelectHazard(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  >
                    {hazards.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.id} · {h.streetName} (PSI {h.priorityScore})
                      </option>
                    ))}
                  </select>
                </div>

                {/* IRC:SP:100 Cold-Mix Repair Progress Slider */}
                <div className="md:col-span-4">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    <span>IRC:SP:100 Repair Stage</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      {repairProgress}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={repairProgress}
                    onChange={(e) => setRepairProgress(Number(e.target.value))}
                    className="w-full accent-rose-600 cursor-pointer"
                  />
                </div>

                {/* Camera Presets & Toggles */}
                <div className="md:col-span-5 flex flex-wrap items-center justify-end gap-1.5">
                  {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectPreset(key)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        cameraPreset === key
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Camera className="h-3 w-3" />
                      <span>{CAMERA_PRESETS[key].label}</span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setExplodedView((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      explodedView
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    <span>Explode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPlayingTraffic((p) => !p)}
                    aria-label={isPlayingTraffic ? 'Pause Traffic' : 'Play Traffic'}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {isPlayingTraffic ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('isometric')}
                    aria-label="Reset 3D Camera"
                    className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
