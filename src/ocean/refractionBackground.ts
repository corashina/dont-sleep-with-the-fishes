import type { Object3D, Scene } from 'three';

// Open water uses authored radiance at far depth, so refraction does not need the sky draw.
export const sceneRefractionBackgrounds = new WeakMap<Scene, Object3D>();
