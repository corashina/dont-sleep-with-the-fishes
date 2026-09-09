import { BufferGeometry, Group, Material, Mesh, MeshStandardMaterial, ShaderChunk } from 'three';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type {
  EventChoicePresentation, FocusedEventPresentation, FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';
import { LighthouseLight } from './LighthouseLight';
import { ItemAimTarget } from './ItemAimTarget';
import { eventSideFromSeed } from './eventVariant';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

const LANTERN_HEIGHT = 20.4;
const SIDE_DISTANCE = 210;

export class LighthousePresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly tower = new Group();
  private readonly lantern: ItemAimTarget;
  private readonly light = new LighthouseLight();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly animation = new TimedPresentationAnimation<'reveal' | 'result'>(() => undefined);
  private disposed = false;

  constructor(private readonly dependencies: FocusedEventPresentationDependencies) {
    this.root.name = 'focused-event:lighthouse';
    this.root.visible = false;
    this.tower.name = 'lighthouse-tower';
    this.tower.position.set(-SIDE_DISTANCE, -0.2, -260);
    const model = dependencies.propModels.createEventModel('lighthouse')?.root;
    if (model === undefined) throw new Error('Missing lighthouse model.');
    this.lantern = new ItemAimTarget(model);
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        // Preserve weather haze while keeping the distant silhouette readable.
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <fog_fragment>',
            ShaderChunk.fog_fragment.replaceAll('fogDensity', '(fogDensity * 0.15)'),
          );
        };
        material.customProgramCacheKey = () => 'lighthouse-distance-fog';
        material.emissive.copy(material.color);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 0.12;
      }
    });
    this.tower.add(model);
    this.lantern.name = 'lighthouse-lantern';
    this.lantern.position.set(0, LANTERN_HEIGHT, 0);
    this.lantern.add(this.light);
    this.tower.add(this.lantern);
    this.root.add(this.tower);
    collectMeshResources(this.root, this.geometries, this.materials);
  }

  itemAimTarget(): Group { return this.lantern; }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.clear();
    this.tower.position.x = SIDE_DISTANCE * eventSideFromSeed(variantSeed);
    this.light.reset();
    this.root.visible = true;
    this.update(0, 0);
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.animation.start('reveal', 2.4);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (!['flareGun', 'flashlight', 'shotgun', 'sleep'].includes(choice.choiceId)) {
      throw new Error(`Unsupported lighthouse choice: ${choice.choiceId}`);
    }
    return Promise.resolve();
  }

  react(result: EventResultPresentation, _outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'lighthouse') throw new Error('Invalid lighthouse result.');
    return this.animation.start('result', 1.5);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.root.visible || !Number.isFinite(delta) || delta < 0) return;
    this.animation.update(time, delta);
    this.light.update(delta, this.dependencies.camera);
  }

  settleForVisibilityChange(): void { this.animation.settle(); }

  clear(): void {
    this.animation.cancel();
    this.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }
}
