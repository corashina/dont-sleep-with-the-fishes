import {
  Camera,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { WeatherId } from '../survival/survivalTypes';
import { sceneHoverOutlineTargets } from './HoverOutline';

export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
  reducedMotion: boolean;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
  reducedMotion: boolean;
}

export type SceneVisualState = ScavengeVisualState | SurvivalVisualState;

export interface SceneRenderer {
  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export class DirectSceneRenderer implements SceneRenderer {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private outlinePass: OutlinePass | null = null;
  private outputPass: OutputPass | null = null;
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {
    if (!(renderer instanceof WebGLRenderer)) {
      return;
    }
    try {
      const size = renderer.getSize(new Vector2());
      this.composer = new EffectComposer(renderer);
      this.renderPass = new RenderPass(new Scene(), new Camera());
      this.outlinePass = new OutlinePass(size, new Scene(), new PerspectiveCamera());
      this.outlinePass.visibleEdgeColor.setHex(0xffffff);
      this.outlinePass.hiddenEdgeColor.setHex(0xffffff);
      this.outlinePass.edgeStrength = 5;
      this.outlinePass.edgeThickness = 4;
      this.outlinePass.edgeGlow = 0;
      this.outlinePass.downSampleRatio = 2;
      this.outlinePass.setSize(size.x, size.y);
      this.outputPass = new OutputPass();
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.outlinePass);
      this.composer.addPass(this.outputPass);
    } catch (error) {
      this.outlinePass?.dispose();
      this.outputPass?.dispose();
      this.composer?.dispose();
      throw error;
    }
  }

  render(scene: Scene, camera: Camera): void {
    if (this.disposed) return;
    const targets = sceneHoverOutlineTargets(scene);
    if (
      targets.length === 0
      || this.composer === null
      || this.renderPass === null
      || this.outlinePass === null
    ) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.outlinePass.renderScene = scene;
    this.outlinePass.renderCamera = camera;
    this.outlinePass.selectedObjects = targets;
    this.composer.render(0);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || this.composer === null) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.outlinePass?.dispose();
    this.outputPass?.dispose();
    this.composer?.dispose();
  }
}
