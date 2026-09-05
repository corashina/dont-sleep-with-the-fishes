import { PerspectiveCamera, Scene } from 'three';
import type { GamePhase, MenuPhaseContext } from '../app/GamePhase';
import type { AudioScope } from '../audio/AudioScope';
import { MenuModelLibrary } from '../menu/MenuModelLibrary';
import { MENU_FADE_SECONDS, sampleMenuFade } from '../menu/menuChoreography';
import type { MenuSignAction } from '../menu/MenuSigns';
import { MenuUI } from '../menu/MenuUI';
import { UnderwaterMenuAnimator } from '../menu/UnderwaterMenuAnimator';
import { UnderwaterMenuWorld } from '../menu/UnderwaterMenuWorld';
import type { MenuSandAssets } from '../menu/MenuSandAssets';
import type { MenuVisualState } from '../rendering/SceneRenderer';
import {
  ignoreCleanupError as attemptCleanup,
  runCleanupSteps,
} from '../world/SceneResources';

const NOOP = (): void => undefined;

export interface MainMenuPhaseDependencies {
  createUI(mount: HTMLElement): MenuUI;
  createWorld(
    scene: Scene,
    camera: PerspectiveCamera,
    models: MenuModelLibrary,
    sand: MenuSandAssets,
  ): UnderwaterMenuWorld;
  createAnimator(
    actors: UnderwaterMenuWorld['actors'],
  ): UnderwaterMenuAnimator;
  requestPointerLock(canvas: HTMLCanvasElement): Promise<void>;
}

const PRODUCTION_MAIN_MENU_DEPENDENCIES: MainMenuPhaseDependencies = {
  createUI: (mount) => new MenuUI(mount),
  createWorld: (scene, camera, models, sand) => (
    new UnderwaterMenuWorld(scene, camera, models, sand)
  ),
  createAnimator: (actors) => new UnderwaterMenuAnimator(actors),
  requestPointerLock: (canvas) => canvas.requestPointerLock(),
};

interface MainMenuResources {
  readonly ui: MenuUI;
  readonly world: UnderwaterMenuWorld;
  readonly animator: UnderwaterMenuAnimator;
}

function createMainMenuResources(
  context: MenuPhaseContext,
  scene: Scene,
  dependencies: MainMenuPhaseDependencies,
): MainMenuResources {
  scene.add(context.camera);
  let ui: MenuUI | undefined;
  let world: UnderwaterMenuWorld | undefined;
  try {
    ui = dependencies.createUI(context.mount);
    world = dependencies.createWorld(
      scene,
      context.camera,
      context.menuModels,
      context.menuSandAssets,
    );
    const animator = dependencies.createAnimator(world.actors);
    return { ui, world, animator };
  } catch (error) {
    scene.remove(context.camera);
    const ownedWorld = world;
    if (ownedWorld) attemptCleanup(() => ownedWorld.dispose());
    const ownedUI = ui;
    if (ownedUI) {
      ownedUI.onStart = NOOP;
      attemptCleanup(() => ownedUI.dispose());
    }
    scene.clear();
    throw error;
  }
}

export class MainMenuPhase implements GamePhase {
  private readonly scene = new Scene();
  private readonly ui: MenuUI;
  private readonly world: UnderwaterMenuWorld;
  private readonly animator: UnderwaterMenuAnimator;
  private readonly audio: AudioScope;
  private readonly visualState: MenuVisualState = {
    kind: 'menu',
    elapsedSeconds: 0,
  };
  private elapsed = 0;
  private fadeElapsed = 0;
  private transitioning = false;
  private pointerLockPending = false;
  private completed = false;
  private started = false;
  private disposed = false;
  private pointerLockListenerRegistered = false;
  private pointerAction: MenuSignAction | null = null;
  private startKeyboardFocused = false;
  private guideKeyboardFocused = false;
  private readonly handlePointerLockChange = (): void => {
    if (
      this.disposed
      || !this.transitioning
      || this.completed
      || document.pointerLockElement === this.context.renderer.domElement
    ) {
      return;
    }
    this.transitioning = false;
    this.fadeElapsed = 0;
    this.ui.setTransitioning(false);
    this.ui.setFadeProgress(0);
    this.audio.setLoopGain('menuAmbient', 1, 0.2);
    this.ui.showPointerLockError();
  };

  constructor(
    private readonly context: MenuPhaseContext,
    private readonly onComplete: () => void,
    private readonly dependencies: MainMenuPhaseDependencies =
      PRODUCTION_MAIN_MENU_DEPENDENCIES,
  ) {
    const resources = createMainMenuResources(
      context,
      this.scene,
      dependencies,
    );
    this.ui = resources.ui;
    this.world = resources.world;
    this.animator = resources.animator;
    this.audio = context.audio.createScope();
    this.ui.onStart = () => {
      void this.requestStart();
    };
    this.ui.onStartFocusChange = (focused) => {
      this.startKeyboardFocused = focused;
      this.syncSignHighlights();
    };
    this.ui.onGuideFocusChange = (focused) => {
      this.guideKeyboardFocused = focused;
      this.syncSignHighlights();
    };
    this.ui.onOverlayChange = () => this.clearSignInteraction();
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.pointerLockListenerRegistered = true;
    const canvas = this.context.renderer.domElement;
    canvas.addEventListener('pointermove', this.handleMenuPointerMove);
    canvas.addEventListener('pointerleave', this.handleMenuPointerLeave);
    canvas.addEventListener('click', this.handleMenuClick);
    this.ui.setTransitioning(false);
    this.ui.setFadeProgress(0);
    this.audio.startLoop('menuAmbient');
  }

  update(_time: number, deltaSeconds: number): void {
    if (this.disposed || !this.started) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.elapsed += delta;
    this.visualState.elapsedSeconds = this.elapsed;
    this.animator.update(this.elapsed, delta);

    if (!this.transitioning || this.completed) return;
    this.fadeElapsed = Math.min(
      MENU_FADE_SECONDS,
      this.fadeElapsed + delta,
    );
    this.ui.setFadeProgress(sampleMenuFade(this.fadeElapsed));
    if (this.fadeElapsed < MENU_FADE_SECONDS) return;
    this.completed = true;
    this.onComplete();
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
  }

  render(): void {
    if (this.disposed || !this.started) return;
    this.context.sceneRenderer.render(
      this.scene,
      this.context.camera,
      this.visualState,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => {
        if (!this.pointerLockListenerRegistered) return;
        this.pointerLockListenerRegistered = false;
        document.removeEventListener(
          'pointerlockchange',
          this.handlePointerLockChange,
        );
      },
      () => {
        const canvas = this.context.renderer.domElement;
        canvas.removeEventListener('pointermove', this.handleMenuPointerMove);
        canvas.removeEventListener('pointerleave', this.handleMenuPointerLeave);
        canvas.removeEventListener('click', this.handleMenuClick);
        canvas.style.cursor = '';
      },
      () => {
        this.ui.onStart = NOOP;
        this.ui.onStartFocusChange = NOOP;
        this.ui.onGuideFocusChange = NOOP;
        this.ui.onOverlayChange = NOOP;
      },
      () => {
        this.pointerAction = null;
        this.startKeyboardFocused = false;
        this.guideKeyboardFocused = false;
        this.world.setMenuSignHighlighted('start', false);
        this.world.setMenuSignHighlighted('guide', false);
      },
      () => this.scene.remove(this.context.camera),
      () => this.animator.dispose(),
      () => this.world.dispose(),
      () => this.ui.dispose(),
      () => this.audio.dispose(),
      () => this.scene.clear(),
    ]);
  }

  private async requestStart(): Promise<void> {
    if (this.disposed || this.transitioning || this.pointerLockPending || this.ui.isOverlayOpen) return;
    this.pointerLockPending = true;
    this.ui.clearPointerLockError();
    try {
      await this.dependencies.requestPointerLock(
        this.context.renderer.domElement,
      );
    } catch {
      this.pointerLockPending = false;
      if (!this.disposed && !this.transitioning) {
        this.ui.showPointerLockError();
      }
      return;
    }
    this.pointerLockPending = false;
    if (this.disposed || this.ui.isOverlayOpen) {
      if (document.pointerLockElement === this.context.renderer.domElement) {
        document.exitPointerLock();
      }
      return;
    }
    if (this.transitioning) return;
    this.ui.clearPointerLockError();
    this.transitioning = true;
    this.audio.setLoopGain('menuAmbient', 0, MENU_FADE_SECONDS);
    this.clearSignInteraction();
    this.fadeElapsed = 0;
    this.ui.setTransitioning(true);
    this.ui.setFadeProgress(0);
  }

  private readonly handleMenuPointerMove = (event: PointerEvent): void => {
    this.pointerAction = this.menuSignAction(event);
    this.context.renderer.domElement.style.cursor = this.pointerAction
      ? 'pointer'
      : '';
    this.syncSignHighlights();
  };

  private readonly handleMenuPointerLeave = (): void => {
    this.pointerAction = null;
    this.context.renderer.domElement.style.cursor = '';
    this.syncSignHighlights();
  };

  private readonly handleMenuClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const action = this.menuSignAction(event);
    if (!action) return;
    event.preventDefault();
    if (action === 'start') this.ui.onStart();
    else this.ui.openGuide();
  };

  private menuSignAction(event: MouseEvent): MenuSignAction | null {
    if (this.disposed || this.transitioning || this.ui.isOverlayOpen) return null;
    const bounds = this.context.renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const ndcY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    return this.world.getMenuSignActionAt(ndcX, ndcY);
  }

  private syncSignHighlights(): void {
    if (this.disposed) return;
    const keyboardAction = this.startKeyboardFocused
      ? 'start'
      : this.guideKeyboardFocused ? 'guide' : null;
    const activeAction = this.transitioning
      ? null
      : this.pointerAction ?? keyboardAction;
    this.world.setMenuSignHighlighted('start', activeAction === 'start');
    this.world.setMenuSignHighlighted('guide', activeAction === 'guide');
  }

  private clearSignInteraction(): void {
    this.pointerAction = null;
    this.startKeyboardFocused = false;
    this.guideKeyboardFocused = false;
    this.context.renderer.domElement.style.cursor = '';
    this.world.setMenuSignHighlighted('start', false);
    this.world.setMenuSignHighlighted('guide', false);
  }
}
