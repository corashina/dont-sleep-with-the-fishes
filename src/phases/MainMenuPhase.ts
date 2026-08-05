import { PerspectiveCamera, Scene } from 'three';
import type { GamePhase, PhaseContext } from '../app/GamePhase';
import { MenuModelLibrary } from '../menu/MenuModelLibrary';
import { MenuUI } from '../menu/MenuUI';
import { UnderwaterMenuAnimator } from '../menu/UnderwaterMenuAnimator';
import { UnderwaterMenuWorld } from '../menu/UnderwaterMenuWorld';
import type { MenuVisualState } from '../rendering/SceneRenderer';
import { ignoreCleanupError as attemptCleanup } from '../world/SceneResources';

const FADE_DURATION_SECONDS = 0.7;
const NOOP = (): void => undefined;

export interface MainMenuPhaseDependencies {
  createUI(mount: HTMLElement): MenuUI;
  createWorld(
    scene: Scene,
    camera: PerspectiveCamera,
    models: MenuModelLibrary,
  ): UnderwaterMenuWorld;
  createAnimator(
    actors: UnderwaterMenuWorld['actors'],
  ): UnderwaterMenuAnimator;
  requestPointerLock(canvas: HTMLCanvasElement): Promise<void>;
}

const PRODUCTION_MAIN_MENU_DEPENDENCIES: MainMenuPhaseDependencies = {
  createUI: (mount) => new MenuUI(mount),
  createWorld: (scene, camera, models) => (
    new UnderwaterMenuWorld(scene, camera, models)
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
  context: PhaseContext,
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

  constructor(
    private readonly context: PhaseContext,
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
    this.ui.onStart = () => {
      void this.requestStart();
    };
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.ui.setTransitioning(false);
    this.ui.setFadeProgress(0);
  }

  update(_time: number, deltaSeconds: number): void {
    if (this.disposed || !this.started) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.elapsed += delta;
    this.visualState.elapsedSeconds = this.elapsed;
    this.animator.update(this.elapsed, delta);

    if (!this.transitioning || this.completed) return;
    this.fadeElapsed = Math.min(
      FADE_DURATION_SECONDS,
      this.fadeElapsed + delta,
    );
    this.ui.setFadeProgress(this.fadeElapsed / FADE_DURATION_SECONDS);
    if (this.fadeElapsed < FADE_DURATION_SECONDS) return;
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
    this.ui.onStart = NOOP;
    this.scene.remove(this.context.camera);
    this.animator.dispose();
    this.world.dispose();
    this.ui.dispose();
    this.scene.clear();
  }

  private async requestStart(): Promise<void> {
    if (this.disposed || this.transitioning || this.pointerLockPending) return;
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
    if (this.disposed || this.transitioning) return;
    this.ui.clearPointerLockError();
    this.transitioning = true;
    this.fadeElapsed = 0;
    this.ui.setTransitioning(true);
    this.ui.setFadeProgress(0);
  }
}
