import * as THREE from 'three';

export interface RoadTextureBundle {
  asphaltMap: THREE.CanvasTexture;
  asphaltBumpMap: THREE.CanvasTexture;
  asphaltRoughnessMap: THREE.CanvasTexture;
  curbMap: THREE.CanvasTexture;
  coldMixMap: THREE.CanvasTexture;
  coldMixBumpMap: THREE.CanvasTexture;
  subbaseMap: THREE.CanvasTexture;
  hazardStripeMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  {
    color = true,
    repeatX = 1,
    repeatY = 1,
    maxAnisotropy = 4,
  }: {
    color?: boolean;
    repeatX?: number;
    repeatY?: number;
    maxAnisotropy?: number;
  }
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
  if (color) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createRoadTextureBundle(maxAnisotropy = 4): RoadTextureBundle {
  const rand = seededRandom(4219);

  // 1. Weathered Urban Asphalt Albedo + Bump + Roughness (512x512)
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const aCtx = asphaltCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rCtx = roughCanvas.getContext('2d')!;

  aCtx.fillStyle = '#2d323b';
  aCtx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);
  rCtx.fillStyle = '#d4d4d4'; // rough matte tarmac ~0.83
  rCtx.fillRect(0, 0, 512, 512);

  // Subtle longitudinal wheel tracks (slightly darker & smoother)
  for (const trackX of [118, 178, 334, 394]) {
    const grad = aCtx.createLinearGradient(trackX - 28, 0, trackX + 28, 0);
    grad.addColorStop(0, 'rgba(18,21,26,0)');
    grad.addColorStop(0.5, 'rgba(18,21,26,0.22)');
    grad.addColorStop(1, 'rgba(18,21,26,0)');
    aCtx.fillStyle = grad;
    aCtx.fillRect(trackX - 28, 0, 56, 512);

    const rGrad = rCtx.createLinearGradient(trackX - 28, 0, trackX + 28, 0);
    rGrad.addColorStop(0, 'rgba(165,165,165,0)');
    rGrad.addColorStop(0.5, 'rgba(165,165,165,0.35)');
    rGrad.addColorStop(1, 'rgba(165,165,165,0)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(trackX - 28, 0, 56, 512);
  }

  // Fine mineral aggregate speckle
  for (let i = 0; i < 16000; i++) {
    const x = Math.floor(rand() * 512);
    const y = Math.floor(rand() * 512);
    const sz = rand() > 0.85 ? 2 : 1;
    const tone = 30 + Math.floor(rand() * 44);
    aCtx.fillStyle = `rgb(${tone},${tone + 2},${tone + 6})`;
    aCtx.fillRect(x, y, sz, sz);

    const bTone = 90 + Math.floor(rand() * 85);
    bCtx.fillStyle = `rgb(${bTone},${bTone},${bTone})`;
    bCtx.fillRect(x, y, sz, sz);
  }

  // Micro hairline fatigue cracks
  aCtx.strokeStyle = 'rgba(16, 18, 22, 0.55)';
  aCtx.lineWidth = 1.2;
  bCtx.strokeStyle = 'rgb(30, 30, 30)';
  bCtx.lineWidth = 1.6;
  for (let c = 0; c < 14; c++) {
    let cx = rand() * 512;
    let cy = rand() * 512;
    aCtx.beginPath();
    bCtx.beginPath();
    aCtx.moveTo(cx, cy);
    bCtx.moveTo(cx, cy);
    for (let seg = 0; seg < 6; seg++) {
      cx += (rand() - 0.5) * 38;
      cy += (rand() - 0.5) * 38;
      aCtx.lineTo(cx, cy);
      bCtx.lineTo(cx, cy);
    }
    aCtx.stroke();
    bCtx.stroke();
  }

  // Crisp thermoplastic road markings
  // Outer solid white shoulder lines
  aCtx.fillStyle = '#d9dfe6';
  aCtx.fillRect(18, 0, 10, 512);
  aCtx.fillRect(484, 0, 10, 512);

  // Double amber center divider
  aCtx.fillStyle = '#e5a31a';
  aCtx.fillRect(247, 0, 6, 512);
  aCtx.fillRect(259, 0, 6, 512);

  // Dashed lane separators (left & right lanes)
  aCtx.fillStyle = '#cfd7e0';
  for (let y = 18; y < 512; y += 128) {
    aCtx.fillRect(132, y, 6, 62);
    aCtx.fillRect(374, y, 6, 62);
  }

  // Painted markings have slightly lower roughness than raw tarmac
  rCtx.fillStyle = '#9a9a9a';
  rCtx.fillRect(18, 0, 10, 512);
  rCtx.fillRect(484, 0, 10, 512);
  rCtx.fillRect(247, 0, 18, 512);

  const asphaltMap = configureTexture(asphaltCanvas, {
    color: true,
    repeatX: 1,
    repeatY: 4,
    maxAnisotropy,
  });
  const asphaltBumpMap = configureTexture(bumpCanvas, {
    color: false,
    repeatX: 1,
    repeatY: 4,
    maxAnisotropy,
  });
  const asphaltRoughnessMap = configureTexture(roughCanvas, {
    color: false,
    repeatX: 1,
    repeatY: 4,
    maxAnisotropy,
  });

  // 2. Municipal Black-and-Yellow Painted Concrete Curb (256x64)
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 256;
  curbCanvas.height = 64;
  const cCtx = curbCanvas.getContext('2d')!;
  cCtx.fillStyle = '#eab308';
  cCtx.fillRect(0, 0, 128, 64);
  cCtx.fillStyle = '#1e242d';
  cCtx.fillRect(128, 0, 128, 64);
  for (let i = 0; i < 1600; i++) {
    const x = Math.floor(rand() * 256);
    const y = Math.floor(rand() * 64);
    cCtx.fillStyle =
      rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(15,18,22,0.14)';
    cCtx.fillRect(x, y, 2, 2);
  }
  const curbMap = configureTexture(curbCanvas, {
    color: true,
    repeatX: 16,
    repeatY: 1,
    maxAnisotropy,
  });

  // 3. IRC:SP:100 Ready-to-Pour Cold-Mix Asphalt (256x256)
  const coldMixCanvas = document.createElement('canvas');
  coldMixCanvas.width = 256;
  coldMixCanvas.height = 256;
  const cmCtx = coldMixCanvas.getContext('2d')!;

  const coldBumpCanvas = document.createElement('canvas');
  coldBumpCanvas.width = 256;
  coldBumpCanvas.height = 256;
  const cmbCtx = coldBumpCanvas.getContext('2d')!;

  cmCtx.fillStyle = '#14171d';
  cmCtx.fillRect(0, 0, 256, 256);
  cmbCtx.fillStyle = '#555555';
  cmbCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 5500; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 2.4;
    const shade = 16 + Math.floor(rand() * 34);
    cmCtx.fillStyle = `rgb(${shade},${shade + 1},${shade + 4})`;
    cmCtx.beginPath();
    cmCtx.arc(x, y, r, 0, Math.PI * 2);
    cmCtx.fill();

    const bShade = 95 + Math.floor(rand() * 145);
    cmbCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
    cmbCtx.beginPath();
    cmbCtx.arc(x, y, r, 0, Math.PI * 2);
    cmbCtx.fill();
  }
  const coldMixMap = configureTexture(coldMixCanvas, {
    color: true,
    repeatX: 2,
    repeatY: 2,
    maxAnisotropy,
  });
  const coldMixBumpMap = configureTexture(coldBumpCanvas, {
    color: false,
    repeatX: 2,
    repeatY: 2,
    maxAnisotropy,
  });

  // 4. Crater Exposed Crushed Aggregate Subbase (256x256)
  const subCanvas = document.createElement('canvas');
  subCanvas.width = 256;
  subCanvas.height = 256;
  const sCtx = subCanvas.getContext('2d')!;
  sCtx.fillStyle = '#4c3e32';
  sCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const sz = 1.5 + rand() * 4.5;
    const pick = rand();
    sCtx.fillStyle =
      pick > 0.65 ? '#6d6259' : pick > 0.3 ? '#3b3027' : '#85776a';
    sCtx.fillRect(x, y, sz, sz);
  }
  const subbaseMap = configureTexture(subCanvas, {
    color: true,
    repeatX: 2,
    repeatY: 2,
    maxAnisotropy,
  });

  // 5. Safety Hazard Chevron Stripe (256x64)
  const hazardCanvas = document.createElement('canvas');
  hazardCanvas.width = 256;
  hazardCanvas.height = 64;
  const hCtx = hazardCanvas.getContext('2d')!;
  hCtx.fillStyle = '#f59e0b';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#18181b';
  for (let x = -64; x < 320; x += 40) {
    hCtx.beginPath();
    hCtx.moveTo(x, 64);
    hCtx.lineTo(x + 20, 64);
    hCtx.lineTo(x + 52, 0);
    hCtx.lineTo(x + 32, 0);
    hCtx.closePath();
    hCtx.fill();
  }
  const hazardStripeMap = configureTexture(hazardCanvas, {
    color: true,
    repeatX: 2,
    repeatY: 1,
    maxAnisotropy,
  });

  // 6. Soft Radial Contact Shadow Texture (128x128)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shCtx = shadowCanvas.getContext('2d')!;
  const radGrad = shCtx.createRadialGradient(64, 64, 10, 64, 64, 62);
  radGrad.addColorStop(0, 'rgba(6, 10, 18, 0.56)');
  radGrad.addColorStop(0.55, 'rgba(6, 10, 18, 0.24)');
  radGrad.addColorStop(1, 'rgba(6, 10, 18, 0)');
  shCtx.fillStyle = radGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.needsUpdate = true;

  return {
    asphaltMap,
    asphaltBumpMap,
    asphaltRoughnessMap,
    curbMap,
    coldMixMap,
    coldMixBumpMap,
    subbaseMap,
    hazardStripeMap,
    contactShadowMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltBumpMap.dispose();
      asphaltRoughnessMap.dispose();
      curbMap.dispose();
      coldMixMap.dispose();
      coldMixBumpMap.dispose();
      subbaseMap.dispose();
      hazardStripeMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
