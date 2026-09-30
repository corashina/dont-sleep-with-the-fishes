import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { disposeResourceSets } from '../world/SceneResources';
import { onLanguageChange } from '../i18n/language';
import { menuText } from '../i18n/menuMessages';

export async function loadMenuSignFont(): Promise<void> {
  await document.fonts.load('400 150px "Bowlby One SC"');
}

export const MENU_GUIDE_SIGN_POSITION = [-2.55, -0.94, 4.65] as const;
export const MENU_GUIDE_SIGN_ROTATION = [0.02, 0.24, -0.06] as const;
export const MENU_START_SIGN_POSITION = [0, -0.86, 4.62] as const;
export const MENU_START_SIGN_ROTATION = [0.02, 0, 0] as const;
export const MENU_SETTINGS_SIGN_POSITION = [2.55, -0.94, 4.65] as const;
export const MENU_SETTINGS_SIGN_ROTATION = [0.02, -0.24, 0.05] as const;

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 320;
const PLANK_COUNT = 3;
const HOVER_GLOW = 0xffc58a;
const SPRING_STIFFNESS = 120;
const SPRING_DAMPING = 11;

export interface MenuSignCanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

export type MenuSignCanvasFactory = () => MenuSignCanvasSurface;
export type MenuSignAction = 'start' | 'guide' | 'settings';

export interface MenuSignsComponent extends MenuSceneComponent {
  readonly startHitTarget: Mesh<
    BoxGeometry,
    MeshStandardMaterial | MeshStandardMaterial[]
  >;
  readonly guideHitTarget: Mesh<
    BoxGeometry,
    MeshStandardMaterial | MeshStandardMaterial[]
  >;
  setStartHighlighted(active: boolean): void;
  setGuideHighlighted(active: boolean): void;
  readonly settingsHitTarget: Mesh<BoxGeometry, MeshStandardMaterial | MeshStandardMaterial[]>;
  setSettingsHighlighted(active: boolean): void;
  update(elapsedSeconds: number, deltaSeconds: number): void;
}

interface WoodenSignSpec {
  readonly name: string;
  readonly textLines: readonly string[];
  readonly textLineWidths: readonly number[];
  readonly textLineYs: readonly number[];
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly boardSize: readonly [number, number, number];
  readonly boardHeight: number;
  readonly postHeight: number;
  readonly postSpacing: number;
  readonly fontSize: number;
  readonly wearSeed: number;
  readonly swayPhase: number;
}

interface WoodenSignParts {
  readonly surface: MenuSignCanvasSurface;
  readonly spec: WoodenSignSpec;
  readonly root: Group;
  readonly face: Group;
  readonly board: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly texture: CanvasTexture;
  readonly boardMaterial: MeshStandardMaterial;
  highlighted: boolean;
  glow: number;
  lean: number;
  leanVelocity: number;
  lift: number;
  liftVelocity: number;
}

interface SharedSignResources {
  readonly edge: MeshStandardMaterial;
  readonly post: MeshStandardMaterial;
  readonly iron: MeshStandardMaterial;
  readonly rope: MeshStandardMaterial;
  readonly barnacle: MeshStandardMaterial;
  readonly algae: MeshStandardMaterial;
  readonly nail: CylinderGeometry;
  readonly barnacleCone: ConeGeometry;
  readonly algaeClump: DodecahedronGeometry;
}

function browserCanvas(): MenuSignCanvasSurface {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Menu sign requires a 2D canvas context');
  return { canvas, context };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export class MenuSigns implements MenuSignsComponent {
  readonly root = new Group();
  readonly startHitTarget: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly guideHitTarget: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly settingsHitTarget: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly textures: readonly CanvasTexture[];

  private readonly startSign: WoodenSignParts;
  private readonly guideSign: WoodenSignParts;
  private readonly settingsSign: WoodenSignParts;
  private readonly signs: readonly WoodenSignParts[];
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private readonly shared: SharedSignResources;
  private disposed = false;
  private readonly unsubscribeLanguage: () => void;

  constructor(factory: MenuSignCanvasFactory = browserCanvas) {
    this.shared = this.createSharedResources();
    const guide = this.createWoodenSign(factory, {
      name: 'menu:guide-sign',
      get textLines() { return [menuText('guideLine1'), menuText('guideLine2')]; },
      textLineWidths: [510, 340],
      textLineYs: [112, 226],
      position: MENU_GUIDE_SIGN_POSITION,
      rotation: MENU_GUIDE_SIGN_ROTATION,
      boardSize: [2.4, 0.76, 0.12],
      boardHeight: 1.18,
      postHeight: 1.82,
      postSpacing: 0.78,
      fontSize: 108,
      wearSeed: 0x486f77,
      swayPhase: 0.4,
    });
    const start = this.createWoodenSign(factory, {
      name: 'menu:start-sign',
      get textLines() { return [menuText('start')]; },
      textLineWidths: [560],
      textLineYs: [170],
      position: MENU_START_SIGN_POSITION,
      rotation: MENU_START_SIGN_ROTATION,
      boardSize: [2.05, 0.72, 0.12],
      boardHeight: 1.12,
      postHeight: 1.72,
      postSpacing: 0.66,
      fontSize: 150,
      wearSeed: 0x537461,
      swayPhase: 2.1,
    });
    const settings = this.createWoodenSign(factory, {
      name: 'menu:settings-sign',
      get textLines() { return [menuText('settings')]; },
      textLineWidths: [880],
      textLineYs: [166],
      position: MENU_SETTINGS_SIGN_POSITION,
      rotation: MENU_SETTINGS_SIGN_ROTATION,
      boardSize: [2.4, 0.76, 0.12],
      boardHeight: 1.18,
      postHeight: 1.82,
      postSpacing: 0.78,
      fontSize: 96,
      wearSeed: 0x536574,
      swayPhase: 4.3,
    });

    this.root.name = 'menu:signs';
    this.root.add(guide.root, start.root, settings.root);
    this.startSign = start;
    this.guideSign = guide;
    this.settingsSign = settings;
    this.signs = [guide, start, settings];
    this.startHitTarget = start.board;
    this.guideHitTarget = guide.board;
    this.settingsHitTarget = settings.board;
    this.textures = [guide.texture, start.texture, settings.texture];
    this.unsubscribeLanguage = onLanguageChange(() => {
      for (const sign of this.signs) {
        this.paintSign(sign.surface, sign.spec);
        sign.texture.needsUpdate = true;
      }
    });
  }

  setStartHighlighted(active: boolean): void {
    this.setSignHighlighted(this.startSign, active);
  }

  setGuideHighlighted(active: boolean): void {
    this.setSignHighlighted(this.guideSign, active);
  }

  setSettingsHighlighted(active: boolean): void {
    this.setSignHighlighted(this.settingsSign, active);
  }

  update(elapsedSeconds: number, deltaSeconds: number): void {
    if (this.disposed) return;
    // Fixed substeps keep the spring stable when a frame arrives late.
    const step = Math.min(deltaSeconds, 0.05) / 2;
    for (const sign of this.signs) {
      const target = sign.highlighted ? 1 : 0;
      for (let substep = 0; substep < 2; substep += 1) {
        sign.leanVelocity += ((target * -0.11 - sign.lean) * SPRING_STIFFNESS
          - sign.leanVelocity * SPRING_DAMPING) * step;
        sign.lean += sign.leanVelocity * step;
        sign.liftVelocity += ((target - sign.lift) * SPRING_STIFFNESS
          - sign.liftVelocity * SPRING_DAMPING) * step;
        sign.lift += sign.liftVelocity * step;
      }
      sign.glow += (target - sign.glow) * (1 - Math.exp(-9 * deltaSeconds));

      const current = Math.sin(elapsedSeconds * 0.7 + sign.spec.swayPhase) * 0.012;
      const shimmer = sign.glow * (0.9 + Math.sin(elapsedSeconds * 5.2 + sign.spec.swayPhase) * 0.1);
      sign.face.rotation.set(sign.lean, 0, current + Math.sin(elapsedSeconds * 2.4) * 0.02 * sign.glow);
      sign.face.position.y = sign.spec.boardHeight + sign.lift * 0.07;
      sign.face.scale.setScalar(1 + sign.lift * 0.045);
      sign.boardMaterial.emissiveIntensity = shimmer * 0.62;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeLanguage();
    this.root.removeFromParent();
    for (const texture of this.textures) texture.dispose();
    disposeResourceSets(this.geometries, this.materials);
  }

  private setSignHighlighted(sign: WoodenSignParts, active: boolean): void {
    if (this.disposed || sign.highlighted === active) return;
    sign.highlighted = active;
    if (active) sign.leanVelocity -= 0.9;
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial(material: MeshStandardMaterial): MeshStandardMaterial {
    this.materials.add(material);
    return material;
  }

  private createSharedResources(): SharedSignResources {
    return {
      edge: this.ownMaterial(new MeshStandardMaterial({ color: 0x3a281d, roughness: 1, metalness: 0 })),
      post: this.ownMaterial(new MeshStandardMaterial({ color: 0x4f3a2a, roughness: 1, metalness: 0, flatShading: true })),
      iron: this.ownMaterial(new MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.65, metalness: 0.35 })),
      rope: this.ownMaterial(new MeshStandardMaterial({ color: 0x6f5d42, roughness: 1, metalness: 0, flatShading: true })),
      barnacle: this.ownMaterial(new MeshStandardMaterial({ color: 0xb9b6a2, roughness: 0.9, metalness: 0, flatShading: true })),
      algae: this.ownMaterial(new MeshStandardMaterial({ color: 0x2f5a44, roughness: 0.95, metalness: 0, flatShading: true })),
      nail: this.ownGeometry(new CylinderGeometry(0.036, 0.04, 0.035, 8).rotateX(Math.PI / 2)),
      barnacleCone: this.ownGeometry(new ConeGeometry(0.035, 0.05, 6)),
      algaeClump: this.ownGeometry(new DodecahedronGeometry(0.075, 0)),
    };
  }

  private createWoodenSign(
    factory: MenuSignCanvasFactory,
    spec: WoodenSignSpec,
  ): WoodenSignParts {
    const shared = this.shared;
    const random = seededRandom(spec.wearSeed);
    const surface = factory();
    this.paintSign(surface, spec);
    const texture = new CanvasTexture(surface.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;

    const [boardWidth, boardHeight, boardDepth] = spec.boardSize;
    const boardMaterial = this.ownMaterial(new MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: HOVER_GLOW,
      emissiveIntensity: 0,
      roughness: 0.88,
      metalness: 0,
    }));
    const board = new Mesh(
      this.ownGeometry(new BoxGeometry(boardWidth, boardHeight, boardDepth)),
      [shared.edge, shared.edge, shared.edge, shared.edge, boardMaterial, shared.edge],
    );
    board.name = `${spec.name}-board`;

    const face = new Group();
    face.name = `${spec.name}-face`;
    face.position.y = spec.boardHeight;
    face.add(board);

    // A batten across the back holds the planks together.
    const batten = new Mesh(
      this.ownGeometry(new BoxGeometry(boardWidth * 0.86, 0.1, 0.05)),
      shared.edge,
    );
    batten.name = `${spec.name}-batten`;
    batten.position.set(0, boardHeight * 0.18, -boardDepth / 2 - 0.025);
    face.add(batten);

    const nailX = boardWidth / 2 - 0.1;
    const nailY = boardHeight / 2 - 0.09;
    for (const [x, y] of [[-nailX, nailY], [nailX, nailY], [-nailX, -nailY], [nailX, -nailY], [0, nailY + 0.02]] as const) {
      const nail = new Mesh(shared.nail, shared.iron);
      nail.name = `${spec.name}-nail`;
      nail.position.set(x + (random() - 0.5) * 0.04, y + (random() - 0.5) * 0.03, boardDepth / 2 + 0.008);
      face.add(nail);
    }


    // A cap plank sheds water, and rope lashes the board to each post.
    const cap = new Mesh(
      this.ownGeometry(new BoxGeometry(boardWidth + 0.08, 0.06, boardDepth + 0.07)),
      shared.post,
    );
    cap.name = `${spec.name}-cap`;
    cap.position.set(0, boardHeight / 2 + 0.03, 0);
    cap.rotation.z = (random() - 0.5) * 0.03;
    face.add(cap);
    const ropeStrand = this.ownGeometry(new CylinderGeometry(0.026, 0.026, boardHeight + 0.1, 6));
    for (const side of [-1, 1] as const) {
      for (const strand of [-1, 0, 1] as const) {
        const rope = new Mesh(ropeStrand, shared.rope);
        rope.name = `${spec.name}-rope`;
        rope.position.set(side * spec.postSpacing + strand * 0.042, -0.02, boardDepth / 2 + 0.02);
        rope.rotation.z = 0.05 + strand * 0.015;
        face.add(rope);
      }
    }
    // Kelp hangs from one lower corner of the board.
    const kelpSide = random() > 0.5 ? 1 : -1;
    const kelpX = kelpSide * (boardWidth / 2 - 0.18);
    const kelp = new Mesh(
      this.ownGeometry(new TubeGeometry(new CatmullRomCurve3([
        new Vector3(kelpX, -boardHeight / 2 + 0.02, boardDepth / 2 + 0.01),
        new Vector3(kelpX + kelpSide * 0.04, -boardHeight / 2 - 0.14, boardDepth / 2 + 0.03),
        new Vector3(kelpX - kelpSide * 0.02, -boardHeight / 2 - 0.3, boardDepth / 2 + 0.02),
        new Vector3(kelpX + kelpSide * 0.05, -boardHeight / 2 - 0.42, boardDepth / 2 + 0.05),
      ]), 12, 0.018, 4, false)),
      shared.algae,
    );
    kelp.name = `${spec.name}-kelp`;
    face.add(kelp);

    const root = new Group();
    root.name = spec.name;
    root.position.set(...spec.position);
    root.rotation.set(...spec.rotation);
    root.add(face);

    for (const side of [-1, 1] as const) {
      const height = side < 0 ? spec.postHeight : spec.postHeight - 0.2;
      const post = new Mesh(
        this.ownGeometry(new CylinderGeometry(0.085, 0.11, height, 7)),
        shared.post,
      );
      post.name = `${spec.name}-post-${side < 0 ? 'left' : 'right'}`;
      const postY = height / 2 - 0.46;
      post.position.set(side * spec.postSpacing, postY, -0.13);
      post.rotation.set(0, random() * Math.PI, side * -0.035);
      root.add(post);

      for (const lashY of [boardHeight / 2 - 0.12, -boardHeight / 2 + 0.12]) {
        const lashing = new Mesh(
          this.ownGeometry(new TorusGeometry(0.115, 0.022, 5, 12)),
          shared.rope,
        );
        lashing.name = `${spec.name}-lashing`;
        lashing.rotation.x = Math.PI / 2 + (random() - 0.5) * 0.3;
        lashing.position.set(side * spec.postSpacing, spec.boardHeight + lashY, -0.13);
        root.add(lashing);
      }

      for (let index = 0; index < 5; index += 1) {
        const barnacle = new Mesh(shared.barnacleCone, shared.barnacle);
        barnacle.name = `${spec.name}-barnacle`;
        const angle = random() * Math.PI * 2;
        barnacle.position.set(
          side * spec.postSpacing + Math.cos(angle) * 0.1,
          -0.3 + random() * 0.35,
          -0.13 + Math.sin(angle) * 0.1,
        );
        barnacle.rotation.set(Math.sin(angle) * 1.3, 0, -Math.cos(angle) * 1.3);
        barnacle.scale.setScalar(0.7 + random() * 0.6);
        root.add(barnacle);
      }
      const algae = new Mesh(shared.algaeClump, shared.algae);
      algae.name = `${spec.name}-algae`;
      algae.position.set(side * spec.postSpacing + (random() - 0.5) * 0.12, -0.36, -0.05);
      algae.scale.set(1.3, 0.7, 1.1);
      root.add(algae);
    }

    return {
      root, face, board, texture, boardMaterial, surface, spec,
      highlighted: false, glow: 0, lean: 0, leanVelocity: 0, lift: 0, liftVelocity: 0,
    };
  }

  private paintSign({ canvas, context }: MenuSignCanvasSurface, spec: WoodenSignSpec): void {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const random = seededRandom(spec.wearSeed);
    const plankHeight = CANVAS_HEIGHT / PLANK_COUNT;
    const plankTones = ['#86664b', '#937257', '#7b5c44'];

    for (let plank = 0; plank < PLANK_COUNT; plank += 1) {
      const top = plank * plankHeight;
      const tone = context.createLinearGradient(0, top, CANVAS_WIDTH, top + plankHeight);
      tone.addColorStop(0, '#553d2c');
      tone.addColorStop(0.3 + random() * 0.3, plankTones[plank]!);
      tone.addColorStop(1, '#4a3526');
      context.globalAlpha = 1;
      context.fillStyle = tone;
      context.fillRect(0, top, CANVAS_WIDTH, plankHeight);

      // Wood grain runs along each plank in long, slightly wavy strokes.
      for (let line = 0; line < 26; line += 1) {
        const y = top + 6 + random() * (plankHeight - 12);
        const wave = 2 + random() * 5;
        context.globalAlpha = 0.07 + random() * 0.12;
        context.strokeStyle = random() > 0.45 ? '#241810' : '#a57b55';
        context.lineWidth = 1 + random() * 2.2;
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(
          CANVAS_WIDTH * 0.3, y + (random() - 0.5) * wave * 2,
          CANVAS_WIDTH * 0.7, y + (random() - 0.5) * wave * 2,
          CANVAS_WIDTH, y + (random() - 0.5) * wave,
        );
        context.stroke();
      }

      const knotX = 80 + random() * (CANVAS_WIDTH - 160);
      const knotY = top + plankHeight * (0.3 + random() * 0.4);
      for (let ring = 4; ring >= 1; ring -= 1) {
        context.globalAlpha = 0.18;
        context.strokeStyle = '#1d130d';
        context.lineWidth = 1.5;
        context.beginPath();
        context.ellipse(knotX, knotY, ring * 7, ring * 3, 0, 0, Math.PI * 2);
        context.stroke();
      }

      if (plank > 0) {
        context.globalAlpha = 0.85;
        context.fillStyle = '#140d09';
        context.fillRect(0, top - 4, CANVAS_WIDTH, 7);
        context.globalAlpha = 0.25;
        context.fillStyle = '#b48a62';
        context.fillRect(0, top + 2, CANVAS_WIDTH, 2);
      }
    }

    // Rust bleeds down from each nail.
    for (const [x, y] of [[62, 34], [962, 34], [62, 262], [962, 262], [512, 20]] as const) {
      const streak = context.createLinearGradient(0, y, 0, y + 70);
      streak.addColorStop(0, 'rgba(120, 58, 28, 0.55)');
      streak.addColorStop(1, 'rgba(120, 58, 28, 0)');
      context.globalAlpha = 1;
      context.fillStyle = streak;
      context.fillRect(x - 5 + (random() - 0.5) * 6, y, 10, 70);
    }

    const algae = context.createLinearGradient(0, 200, 0, CANVAS_HEIGHT);
    algae.addColorStop(0, 'rgba(26, 58, 50, 0)');
    algae.addColorStop(1, 'rgba(20, 54, 44, 0.55)');
    context.globalAlpha = 1;
    context.fillStyle = algae;
    context.fillRect(0, 200, CANVAS_WIDTH, 120);
    context.strokeStyle = '#1c120d';
    context.lineWidth = 12;
    context.strokeRect(6, 6, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 12);

    context.font = `400 ${spec.fontSize}px "Bowlby One SC", Impact, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    for (let index = 0; index < spec.textLines.length; index += 1) {
      const line = spec.textLines[index]!;
      const y = spec.textLineYs[index]!;
      // The letters are carved: a dark groove, a lit lower lip, then worn paint.
      context.globalAlpha = 0.9;
      context.fillStyle = '#140d09';
      context.fillText(line, 508, y - 4, 900);
      context.globalAlpha = 0.35;
      context.fillStyle = '#c29a6c';
      context.fillText(line, 515, y + 5, 900);
      context.globalAlpha = 1;
      context.fillStyle = '#d9cba3';
      context.fillText(line, 512, y, 900);

      const lineWidth = spec.textLineWidths[index]!;
      const left = 512 - lineWidth * 0.5;
      for (let chip = 0; chip < 12; chip += 1) {
        const x = left + random() * lineWidth;
        const chipY = y - spec.fontSize * 0.38 + random() * spec.fontSize * 0.7;
        context.globalAlpha = 0.55 + random() * 0.3;
        context.fillStyle = random() > 0.3 ? '#7a5a42' : '#3d5247';
        context.beginPath();
        context.ellipse(x, chipY, 3 + random() * 9, 2 + random() * 4, random() * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.globalAlpha = 0.24;
    context.fillStyle = '#a7b397';
    for (let index = 0; index < 16; index += 1) {
      context.beginPath();
      context.arc(24 + random() * 976, 250 + random() * 56, 2 + random() * 5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}
