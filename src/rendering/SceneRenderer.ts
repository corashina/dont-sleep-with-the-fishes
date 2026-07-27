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
import {
  ITEM_AMBIENT_OCCLUSION_HOTKEY,
  ItemAmbientOcclusionPass,
  nextItemAmbientOcclusionMode,
  resolveItemAmbientOcclusionMode,
  type ItemAmbientOcclusionMode,
} from './ItemAmbientOcclusion';

export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
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
  private itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null = null;
  private outlinePass: OutlinePass | null = null;
  private outputPass: OutputPass | null = null;
  private disposed = false;
  private ambientOcclusionHotkeyRegistered = false;
  private itemAmbientOcclusionMode: ItemAmbientOcclusionMode;

  constructor(
    private readonly renderer: WebGLRenderer,
    itemAmbientOcclusionMode: ItemAmbientOcclusionMode = resolveItemAmbientOcclusionMode(
      typeof window === 'undefined' ? '' : window.location.search,
    ),
  ) {
    this.itemAmbientOcclusionMode = itemAmbientOcclusionMode;
    if (!(renderer instanceof WebGLRenderer)) {
      return;
    }
    try {
      const size = renderer.getSize(new Vector2());
      this.composer = new EffectComposer(renderer);
      this.renderPass = new RenderPass(new Scene(), new Camera());
      this.itemAmbientOcclusionPass = new ItemAmbientOcclusionPass(itemAmbientOcclusionMode);
      this.outlinePass = new OutlinePass(size, new Scene(), new PerspectiveCamera());
      this.outlinePass.visibleEdgeColor.setHex(0xffffff);
      this.outlinePass.hiddenEdgeColor.setHex(0x000000);
      this.outlinePass.edgeStrength = 5;
      this.outlinePass.edgeThickness = 4;
      this.outlinePass.edgeGlow = 0;
      this.outlinePass.downSampleRatio = 2;
      this.outlinePass.setSize(size.x, size.y);
      this.outputPass = new OutputPass();
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.itemAmbientOcclusionPass);
      this.composer.addPass(this.outlinePass);
      this.composer.addPass(this.outputPass);
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', this.handleAmbientOcclusionHotkey);
        this.ambientOcclusionHotkeyRegistered = true;
      }
    } catch (error) {
      this.itemAmbientOcclusionPass?.dispose();
      this.outlinePass?.dispose();
      this.outputPass?.dispose();
      this.composer?.dispose();
      throw error;
    }
  }

  render(scene: Scene, camera: Camera): void {
    if (this.disposed) return;
    if (
      this.composer === null
      || this.renderPass === null
      || this.itemAmbientOcclusionPass === null
      || this.outlinePass === null
    ) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.itemAmbientOcclusionPass.setContext(scene, camera);
    this.outlinePass.renderScene = scene;
    this.outlinePass.renderCamera = camera;
    this.outlinePass.selectedObjects = sceneHoverOutlineTargets(scene);
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
    if (this.ambientOcclusionHotkeyRegistered && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleAmbientOcclusionHotkey);
      this.ambientOcclusionHotkeyRegistered = false;
    }
    this.itemAmbientOcclusionPass?.dispose();
    this.outlinePass?.dispose();
    this.outputPass?.dispose();
    this.composer?.dispose();
  }

  private readonly handleAmbientOcclusionHotkey = (event: KeyboardEvent): void => {
    if (
      event.code !== ITEM_AMBIENT_OCCLUSION_HOTKEY
      || event.repeat
      || event.altKey
      || event.ctrlKey
      || event.metaKey
    ) {
      return;
    }
    this.itemAmbientOcclusionMode = nextItemAmbientOcclusionMode(
      this.itemAmbientOcclusionMode,
    );
    this.itemAmbientOcclusionPass?.setMode(this.itemAmbientOcclusionMode);
  };
}
