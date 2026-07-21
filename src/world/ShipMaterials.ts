import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from 'three';

export interface ShipMaterials {
  crewFloor: MeshStandardMaterial;
  wheelhouseFloor: MeshStandardMaterial;
  cargoFloor: MeshStandardMaterial;
  storageFloor: MeshStandardMaterial;
  lifeboatFloor: MeshStandardMaterial;
  paintedPanel: MeshStandardMaterial;
  paintedSteel: MeshStandardMaterial;
  darkHull: MeshStandardMaterial;
  darkMetal: MeshStandardMaterial;
  exposedMetal: MeshStandardMaterial;
  rust: MeshStandardMaterial;
  rope: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  emergency: MeshStandardMaterial;
  beacon: MeshStandardMaterial;
  canvas: MeshStandardMaterial;
  ownedMaterialsForTest(): readonly Material[];
  ownedTexturesForTest(): readonly Texture[];
  textureBytesForTest(): readonly (readonly number[])[];
  dispose(): void;
}

type SurfaceKind = 'warmWood' | 'maritimeDeck' | 'industrialFloor' | 'paintedPanel';
type TextureRole = 'color' | 'roughness' | 'bump';

interface SurfaceSpec {
  color: readonly [number, number, number];
  roughness: number;
  bump: number;
  bumpScale: number;
  repeat: readonly [number, number];
  seedOffset: number;
}

interface SurfaceTextureSet {
  color: DataTexture;
  roughness: DataTexture;
  bump: DataTexture;
  bumpScale: number;
}

const TEXTURE_SIZE = 64;
const SURFACE_SPECS: Record<SurfaceKind, SurfaceSpec> = {
  warmWood: {
    color: [96, 66, 48],
    roughness: 224,
    bump: 130,
    bumpScale: 0.035,
    repeat: [3, 12],
    seedOffset: 0x13579bdf,
  },
  maritimeDeck: {
    color: [91, 101, 100],
    roughness: 232,
    bump: 126,
    bumpScale: 0.018,
    repeat: [6, 18],
    seedOffset: 0x2468ace0,
  },
  industrialFloor: {
    color: [82, 89, 91],
    roughness: 205,
    bump: 122,
    bumpScale: 0.024,
    repeat: [5, 8],
    seedOffset: 0x6a09e667,
  },
  paintedPanel: {
    color: [150, 151, 140],
    roughness: 210,
    bump: 128,
    bumpScale: 0.010,
    repeat: [5, 4],
    seedOffset: 0xbb67ae85,
  },
};

function textureByte(seed: number, x: number, y: number, channel: number): number {
  let value = (seed ^ Math.imul(x + 1, 0x9e3779b1)
    ^ Math.imul(y + 1, 0x85ebca6b) ^ Math.imul(channel + 1, 0xc2b2ae35)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) & 0xff;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function centeredNoise(byte: number, amplitude: number): number {
  return (byte % (amplitude * 2 + 1)) - amplitude;
}

function surfaceOffset(kind: SurfaceKind, x: number, y: number, byte: number): number {
  switch (kind) {
    case 'warmWood':
      return x % 16 === 0 ? -28 : centeredNoise(byte, 10);
    case 'maritimeDeck':
      return centeredNoise(byte, 8) - (x % 32 === 0 ? 12 : 0);
    case 'industrialFloor': {
      const tileX = x % 4;
      const tileY = y % 4;
      const diamond = Math.abs(tileX - 1.5) + Math.abs(tileY - 1.5) <= 1.5;
      return centeredNoise(byte, 6) + (diamond ? 8 : -2);
    }
    case 'paintedPanel':
      return centeredNoise(byte, 4) - (x % 32 === 0 || y % 32 === 0 ? 6 : 0);
  }
}

function createTextureBytes(
  seed: number,
  kind: SurfaceKind,
  role: TextureRole,
  spec: SurfaceSpec,
): Uint8Array {
  const bytes = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const roleChannel = role === 'color' ? 0 : role === 'roughness' ? 4 : 8;
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const base = role === 'color'
          ? spec.color[channel]!
          : role === 'roughness' ? spec.roughness : spec.bump;
        const hashChannel = role === 'color' ? channel : roleChannel;
        bytes[offset + channel] = clampByte(base + surfaceOffset(
          kind,
          x,
          y,
          textureByte(seed, x, y, hashChannel),
        ));
      }
      bytes[offset + 3] = 255;
    }
  }
  return bytes;
}

function createSurfaceTexture(
  seed: number,
  kind: SurfaceKind,
  role: TextureRole,
  spec: SurfaceSpec,
  anisotropy: number,
): DataTexture {
  const texture = new DataTexture(
    createTextureBytes(seed, kind, role, spec),
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = `${kind}-${role}`;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...spec.repeat);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  if (role === 'color') texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSurfaceTextureSet(
  seed: number,
  kind: SurfaceKind,
  anisotropy: number,
): SurfaceTextureSet {
  const spec = SURFACE_SPECS[kind];
  const textureSeed = (seed ^ spec.seedOffset) >>> 0;
  return {
    color: createSurfaceTexture(textureSeed, kind, 'color', spec, anisotropy),
    roughness: createSurfaceTexture(textureSeed, kind, 'roughness', spec, anisotropy),
    bump: createSurfaceTexture(textureSeed, kind, 'bump', spec, anisotropy),
    bumpScale: spec.bumpScale,
  };
}

function createSurfaceMaterial(
  textures: SurfaceTextureSet,
  options: { color?: number; roughness?: number; metalness?: number } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    map: textures.color,
    roughness: options.roughness ?? 1,
    roughnessMap: textures.roughness,
    bumpMap: textures.bump,
    bumpScale: textures.bumpScale,
    metalness: options.metalness ?? 0,
  });
}

export function createShipMaterials(seed = 0x51f15e, maxAnisotropy = 1): ShipMaterials {
  const anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
  const warmWood = createSurfaceTextureSet(seed, 'warmWood', anisotropy);
  const maritimeDeck = createSurfaceTextureSet(seed, 'maritimeDeck', anisotropy);
  const industrialFloor = createSurfaceTextureSet(seed, 'industrialFloor', anisotropy);
  const paintedPanelTextures = createSurfaceTextureSet(seed, 'paintedPanel', anisotropy);

  const crewFloor = createSurfaceMaterial(warmWood);
  const wheelhouseFloor = createSurfaceMaterial(warmWood, { color: 0xe8ddd0 });
  const cargoFloor = createSurfaceMaterial(maritimeDeck);
  const storageFloor = createSurfaceMaterial(industrialFloor);
  const lifeboatFloor = createSurfaceMaterial(maritimeDeck, { color: 0xd4d9d7 });
  const paintedPanel = createSurfaceMaterial(paintedPanelTextures);
  const paintedSteel = createSurfaceMaterial(paintedPanelTextures, { color: 0x8d9ba0, roughness: 0.82, metalness: 0.22 });
  const darkHull = new MeshStandardMaterial({ color: 0x242e32, roughness: 0.9, metalness: 0.28, flatShading: true });
  const darkMetal = new MeshStandardMaterial({ color: 0x2f3435, roughness: 0.84, metalness: 0.55, flatShading: true });
  const exposedMetal = new MeshStandardMaterial({ color: 0x81796c, roughness: 0.68, metalness: 0.62, flatShading: true });
  const rust = new MeshStandardMaterial({ color: 0x7a3d28, roughness: 0.95, metalness: 0.08, flatShading: true });
  const rope = new MeshStandardMaterial({ color: 0x3d3022, roughness: 1, metalness: 0, flatShading: true });
  const glass = new MeshPhysicalMaterial({ color: 0x6d8790, roughness: 0.18, transmission: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
  const emergency = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35, roughness: 0.7 });
  const beacon = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35, roughness: 0.7 });
  const canvas = new MeshStandardMaterial({
    color: 0xc7ad7a,
    roughness: 0.96,
    metalness: 0,
    side: DoubleSide,
  });

  const ownedMaterials = new Set<Material>([
    crewFloor,
    wheelhouseFloor,
    cargoFloor,
    storageFloor,
    lifeboatFloor,
    paintedPanel,
    paintedSteel,
    darkHull,
    darkMetal,
    exposedMetal,
    rust,
    rope,
    glass,
    emergency,
    beacon,
    canvas,
  ]);
  const ownedTextures = [
    warmWood.color,
    warmWood.roughness,
    warmWood.bump,
    maritimeDeck.color,
    maritimeDeck.roughness,
    maritimeDeck.bump,
    industrialFloor.color,
    industrialFloor.roughness,
    industrialFloor.bump,
    paintedPanelTextures.color,
    paintedPanelTextures.roughness,
    paintedPanelTextures.bump,
  ] as const;
  let disposed = false;

  return {
    crewFloor,
    wheelhouseFloor,
    cargoFloor,
    storageFloor,
    lifeboatFloor,
    paintedPanel,
    paintedSteel,
    darkHull,
    darkMetal,
    exposedMetal,
    rust,
    rope,
    glass,
    emergency,
    beacon,
    canvas,
    ownedMaterialsForTest: () => [...ownedMaterials],
    ownedTexturesForTest: () => [...ownedTextures],
    textureBytesForTest: () => ownedTextures.map((texture) =>
      Array.from(texture.image.data as Uint8Array)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      ownedMaterials.forEach((material) => material.dispose());
      ownedTextures.forEach((texture) => texture.dispose());
    },
  };
}
