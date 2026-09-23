import {
  BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene,
  ShaderLib, ShaderMaterial, Texture, Vector3,
  type WebGLProgramParametersWithUniforms, type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import { supernaturalItemUseDuration, supernaturalRevealDuration } from '../src/survival/supernaturalEventChoreography';
import { Skybox } from '../src/world/Skybox';

describe('Eerie Melody fog', () => {
  // Importance: 95/100. Every reef surface must share the water's fog, without a second mist overlay.
  it('binds the singer and reef to scene fog and releases fog in clear weather', () => {
    const scene = new Scene();
    const texture = new Texture();
    const sky = new Skybox(scene, { phase: 'night', weather: 'fog', severity: 0 }, texture);
    const display = { clearEventPose: vi.fn() } as unknown as BoatSupplyDisplay;
    const models = { create: () => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
      return root;
    } } as unknown as EventModelLibrary;
    const boat = new Group();
    scene.add(boat);
    const animator = new SupernaturalEventAnimator(boat, display, models, undefined, 'eerie-melody');
    const renderer = {} as WebGLRenderer;
    const camera = new PerspectiveCamera();
    try {
      animator.stage('eerie-melody');
      expect(animator.worldRoot.getObjectByName('supernatural-sea-mist')!.visible).toBe(false);
      const surfaces: Mesh[] = [];
      animator.worldRoot.getObjectByName('siren-tableau')!.traverse(object => {
        if (object instanceof Mesh) surfaces.push(object);
      });
      expect(surfaces.length).toBeGreaterThan(1);
      for (const mesh of surfaces) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const shader = {
            uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
            fragmentShader: ShaderLib.standard.fragmentShader,
          } as WebGLProgramParametersWithUniforms;
          material.onBeforeCompile(shader, renderer);
          sky.update(2, { phase: 'night', weather: 'fog', severity: 0 }, new Vector3(0, 1.5, 0));
          material.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh, null!);
          expect(shader.uniforms.uSeaFogAmount?.value, mesh.name).toBe(1);
          expect(shader.uniforms.uSeaFogColor?.value, mesh.name).toEqual(sky.palette.fogColor);
          sky.update(2, { phase: 'night', weather: 'calm', severity: 0 }, new Vector3());
          material.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh, null!);
          expect(shader.uniforms.uSeaFogAmount?.value, mesh.name).toBe(0);
        }
      }
    } finally {
      animator.dispose();
      sky.dispose();
      texture.dispose();
    }
  });

  it.each([-10])('keeps fog stable through every phase with health change %s', async (health) => {
    const display = {
      resetEventPoseForFrame: vi.fn(), clearEventPose: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const models = {
      create: () => {
        const model = new Group();
        model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
        return model;
      },
    } as unknown as EventModelLibrary;
    const animator = new SupernaturalEventAnimator(new Group(), display, models, undefined, 'eerie-melody');
    try {
      animator.stage('eerie-melody');
      const fog = animator.worldRoot.getObjectByName('supernatural-sea-mist')!;
      const snapshot = () => ({
        visible: fog.visible,
        scale: fog.scale.toArray(),
        layers: fog.children.map((child) => {
          const mesh = child as Mesh;
          const material = mesh.material as ShaderMaterial;
          return [material.uniforms.uOpacity!.value, ...mesh.position.toArray()];
        }),
      });
      const staged = snapshot();
      const advance = (duration: number) => {
        for (let frame = 0; frame < 20; frame += 1) {
          animator.update(0, duration / 20);
          expect(snapshot()).toEqual(staged);
        }
        animator.update(0, 0.001);
      };
      const reveal = animator.reveal('eerie-melody');
      advance(supernaturalRevealDuration('eerie-melody')!);
      await reveal;
      advance(3);
      const item = animator.playItemUse('eerie-melody', 'ductTape', 'ductTape-0');
      advance(supernaturalItemUseDuration('eerie-melody', 'ductTape')!);
      await item;
      const reaction = animator.react('eerie-melody', {
        accepted: true, code: 'event-resolved', message: '', deltas: { health }, cue: 'none',
      }, null);
      // Check the attack before the event's final cleanup.
      advance(0.8);
      animator.update(0, 1);
      await reaction;
      animator.clear();
      expect(fog.visible).toBe(false);
    } finally {
      animator.dispose();
    }
  });
});
