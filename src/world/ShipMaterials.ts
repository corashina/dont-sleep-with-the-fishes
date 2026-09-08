import {
  DataTexture,
  Color,
  DoubleSide,
  FrontSide,
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
  Vector2,
} from 'three';
import type { ShipAssets } from './ShipAssets';
import { disposeResourceSets } from './SceneResources';
import { applyShipWetSurface } from './ShipWetSurface';

export interface ShipMaterials {
  timber: MeshStandardMaterial;
  timberFloor: MeshStandardMaterial;
  crewFloor: MeshStandardMaterial;
  wheelhouseFloor: MeshStandardMaterial;
  cargoFloor: MeshStandardMaterial;
  storageFloor: MeshStandardMaterial;
  lifeboatFloor: MeshStandardMaterial;
  dropoffArea: MeshStandardMaterial;
  emergencyFootprint: MeshStandardMaterial;
  upperHull: MeshStandardMaterial;
  waterline: MeshStandardMaterial;
  plainPaintedSteel: MeshStandardMaterial;
  plainTimber: MeshStandardMaterial;
  paintedPanel: MeshStandardMaterial;
  paintedSteel: MeshStandardMaterial;
  deckSteel: MeshStandardMaterial;
  deckTimber: MeshStandardMaterial;
  darkHull: MeshStandardMaterial;
  darkMetal: MeshStandardMaterial;
  exposedMetal: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  rust: MeshStandardMaterial;
  rope: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  emergency: MeshStandardMaterial;
  canvas: MeshStandardMaterial;
  canvasEdge: MeshStandardMaterial;
  ownedMaterialsForTest(): readonly Material[];
  ownedTexturesForTest(): readonly Texture[];
  textureBytesForTest(): readonly (readonly number[])[];
  dispose(): void;
}

type SurfaceKind = 'warmWood' | 'industrialFloor' | 'paintedPanel';
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
  industrialFloor: {
    color: [82, 89, 91],
    roughness: 205,
    bump: 122,
    bumpScale: 0.024,
    repeat: [5, 8],
    seedOffset: 0x6a09e667,
  },
  paintedPanel: {
    color: [214, 210, 194],
    roughness: 224,
    bump: 128,
    bumpScale: 0.014,
    repeat: [1, 1],
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
    case 'industrialFloor': {
      const tileX = x % 4;
      const tileY = y % 4;
      const diamond = Math.abs(tileX - 1.5) + Math.abs(tileY - 1.5) <= 1.5;
      return centeredNoise(byte, 6) + (diamond ? 8 : -2);
    }
    case 'paintedPanel':
      return centeredNoise(byte, 3)
        + Math.sin(x * Math.PI / 32) * Math.cos(y * Math.PI / 32) * 3;
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

function createAssetMaterial(
  colorMap: Texture,
  roughnessMap: Texture,
  normalMap: Texture,
  metalnessMap: Texture | undefined,
  options: {
    color?: number;
    roughness?: number;
    metalness?: number;
    normalScale?: number;
    flatShading?: boolean;
  } = {},
): MeshStandardMaterial {
  const normalScale = options.normalScale ?? 0.35;
  return new MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    map: colorMap,
    roughness: options.roughness ?? 1,
    roughnessMap,
    normalMap,
    normalScale: new Vector2(normalScale, normalScale),
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    ...(metalnessMap ? { metalnessMap } : {}),
  });
}

export function createShipMaterials(
  seed = 0x51f15e,
  maxAnisotropy = 1,
  assets?: ShipAssets,
): ShipMaterials {
  const anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
  const warmWood = createSurfaceTextureSet(seed, 'warmWood', anisotropy);
  const industrialFloor = createSurfaceTextureSet(seed, 'industrialFloor', anisotropy);
  const paintedPanelTextures = createSurfaceTextureSet(seed, 'paintedPanel', anisotropy);

  const timber = (
    assets
      ? createAssetMaterial(
        assets.darkWoodColor,
        assets.darkWoodRoughness,
        assets.darkWoodNormal,
        undefined,
        { roughness: 0.96, metalness: 0, normalScale: 0.42 },
      )
      : createSurfaceMaterial(warmWood, {
        color: 0xb88759,
        roughness: 0.94,
        metalness: 0,
      })
  );
  const timberFloor = timber.clone();
  const crewFloor = timber.clone();
  crewFloor.color.setHex(0xb7c2bb);
  const cargoFloor = timberFloor;
  const wheelhouseFloor = timber.clone();
  wheelhouseFloor.color.setHex(0xaabbb9);
  const storageFloor = timber.clone();
  storageFloor.color.setHex(0xc1b29c);
  const lifeboatFloor = createSurfaceMaterial(industrialFloor, {
    color: 0xcbd1cf,
    roughness: 0.9,
    metalness: 0.36,
  });
  const dropoffArea = new MeshStandardMaterial({
    color: 0x252b29,
    roughness: 1,
    metalness: 0,
    opacity: 0.35,
    transparent: true,
  });
  const emergencyFootprint = new MeshStandardMaterial({
    color: 0xd8d0b8,
    roughness: 1,
    metalness: 0,
    opacity: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    transparent: true,
  });
  const roomWallMaterial = assets
    ? createAssetMaterial(
        assets.roomWallColor,
        assets.roomWallRoughness,
        assets.roomWallNormal,
        undefined,
        {
          roughness: 0.94,
          metalness: 0,
          normalScale: 0.32,
          flatShading: true,
        },
      )
    : undefined;
  const plainPaintedSteel = new MeshStandardMaterial({
      color: 0xcbd2cf,
      roughness: 0.9,
      metalness: 0.08,
    });
  const plainTimber = assets
    ? createAssetMaterial(
        assets.darkWoodColor,
        assets.darkWoodRoughness,
        assets.darkWoodNormal,
        undefined,
        {
          roughness: 0.96,
          metalness: 0,
          normalScale: 0.36,
          flatShading: true,
        },
      )
    : new MeshStandardMaterial({
        color: 0x60442f,
        roughness: 0.96,
        metalness: 0,
        flatShading: true,
      });
  const paintedPanel = roomWallMaterial ?? createSurfaceMaterial(paintedPanelTextures, {
      color: 0xf5f0e5,
      roughness: 0.94,
      metalness: 0.12,
    });
  const paintedSteel = createSurfaceMaterial(paintedPanelTextures, {
    color: 0xb6c4bb, roughness: 0.68, metalness: 0.08,
  });
  // Use the full wall and roof thickness to block light at interior seams.
  // Back-face shadows lose seam occlusion to the light's depth bias.
  paintedPanel.shadowSide = FrontSide;
  paintedSteel.shadowSide = FrontSide;
  const deckSteel = new MeshStandardMaterial({
    color: 0x35423f, roughness: 0.6, metalness: 0.22,
  });
  const deckTimber = timber.clone();
  deckTimber.color.multiply(new Color(0x9c8571));
  const darkHull = createSurfaceMaterial(paintedPanelTextures, {
    color: 0x3f565b, roughness: 0.78, metalness: 0.08,
  });
  const darkMetal = new MeshStandardMaterial({ color: 0x303a3b, roughness: 0.64, metalness: 0.65 });
  const exposedMetal = new MeshStandardMaterial({ color: 0x9c9789, roughness: 0.42, metalness: 0.85 });
  const rubber = new MeshStandardMaterial({ color: 0x202725, roughness: 0.96, metalness: 0 });
  const rust = new MeshStandardMaterial({ color: 0x7a3d28, roughness: 0.95, metalness: 0.08, flatShading: true });
  const rope = new MeshStandardMaterial({ color: 0x3d3022, roughness: 1, metalness: 0, flatShading: true });
  const glass = new MeshPhysicalMaterial({ color: 0xb2cbcb, roughness: 0.24, metalness: 0, transmission: 0, transparent: true, opacity: 0.3, depthWrite: false, clearcoat: 0.6, clearcoatRoughness: 0.18 });
  const emergency = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35, roughness: 0.7 });
  const canvas = new MeshStandardMaterial({
    color: 0xb9cad0,
    roughness: 0.96,
    metalness: 0,
    side: DoubleSide,
  });
  const upperHull = createSurfaceMaterial(paintedPanelTextures, {
    color: 0x718984, roughness: 0.72, metalness: 0.08,
  });
  const waterline = createSurfaceMaterial(paintedPanelTextures, {
    color: 0x343e3d, roughness: 0.53, metalness: 0.04,
  });
  const canvasEdge = new MeshStandardMaterial({
    color: 0x647b82,
    roughness: 0.98,
    metalness: 0,
    side: DoubleSide,
  });

  applyShipWetSurface(timberFloor, 1);
  applyShipWetSurface(deckTimber, 0.85);
  applyShipWetSurface(plainTimber, 0.65);
  applyShipWetSurface(paintedPanel, 0.45);
  applyShipWetSurface(plainPaintedSteel, 0.65);
  applyShipWetSurface(paintedSteel, 0.65);
  applyShipWetSurface(deckSteel, 0.8);
  applyShipWetSurface(upperHull, 0.8);
  applyShipWetSurface(waterline, 1);

  const ownedMaterials = new Set<Material>([
    timber,
    timberFloor,
    crewFloor,
    wheelhouseFloor,
    cargoFloor,
    storageFloor,
    lifeboatFloor,
    dropoffArea,
    emergencyFootprint,
    upperHull,
    waterline,
    plainPaintedSteel,
    plainTimber,
    paintedPanel,
    paintedSteel,
    deckSteel,
    deckTimber,
    darkHull,
    darkMetal,
    exposedMetal,
    rubber,
    rust,
    rope,
    glass,
    emergency,
    canvas,
    canvasEdge,
  ]);
  const ownedTextures = new Set<Texture>([
    warmWood.color,
    warmWood.roughness,
    warmWood.bump,
    industrialFloor.color,
    industrialFloor.roughness,
    industrialFloor.bump,
    paintedPanelTextures.color,
    paintedPanelTextures.roughness,
    paintedPanelTextures.bump,
  ]);
  let disposed = false;

  return {
    timber,
    timberFloor,
    crewFloor,
    wheelhouseFloor,
    cargoFloor,
    storageFloor,
    lifeboatFloor,
    dropoffArea,
    emergencyFootprint,
    upperHull,
    waterline,
    plainPaintedSteel,
    plainTimber,
    paintedPanel,
    paintedSteel,
    deckSteel,
    deckTimber,
    darkHull,
    darkMetal,
    exposedMetal,
    rubber,
    rust,
    rope,
    glass,
    emergency,
    canvas,
    canvasEdge,
    ownedMaterialsForTest: () => [...ownedMaterials],
    ownedTexturesForTest: () => [...ownedTextures],
    textureBytesForTest: () => [...ownedTextures].map((texture) =>
      Array.from(texture.image.data as Uint8Array)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeResourceSets(ownedMaterials, ownedTextures);
    },
  };
}
