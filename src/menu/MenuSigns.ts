import {
  BoxGeometry,
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { disposeResourceSets } from '../world/SceneResources';

export const MENU_SIGN_TITLE = "DON'T SLEEP WITH THE FISHES";
export const MENU_GUIDE_SIGN_TITLE = 'HOW TO PLAY';
export const MENU_TITLE_SIGN_POSITION = [-2.65, -0.35, 1.8] as const;
export const MENU_TITLE_SIGN_ROTATION = [0.02, 0.24, -0.06] as const;
export const MENU_GUIDE_SIGN_POSITION = [2.7, -0.22, 1.7] as const;
export const MENU_GUIDE_SIGN_ROTATION = [0.02, -0.22, 0.05] as const;

export interface MenuSignCanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

export type MenuSignCanvasFactory = () => MenuSignCanvasSurface;

export interface MenuSignsComponent extends MenuSceneComponent {
  readonly guideHitTarget: Mesh<BoxGeometry, MeshStandardMaterial>;
  setGuideHighlighted(active: boolean): void;
}

interface WoodenSignSpec {
  readonly name: string;
  readonly text: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly boardSize: readonly [number, number, number];
  readonly boardHeight: number;
  readonly postHeight: number;
  readonly postSpacing: number;
  readonly font: string;
}

interface WoodenSignParts {
  readonly root: Group;
  readonly board: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly texture: CanvasTexture;
}

function browserCanvas(): MenuSignCanvasSurface {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Menu sign requires a 2D canvas context');
  return { canvas, context };
}

export class MenuSigns implements MenuSignsComponent {
  readonly root = new Group();
  readonly guideHitTarget: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly textures: readonly [CanvasTexture, CanvasTexture];

  private readonly guideRoot: Group;
  private readonly geometries = new Set<BoxGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private guideHighlighted = false;
  private disposed = false;

  constructor(factory: MenuSignCanvasFactory = browserCanvas) {
    const title = this.createWoodenSign(factory, {
      name: 'menu:title-sign',
      text: MENU_SIGN_TITLE,
      position: MENU_TITLE_SIGN_POSITION,
      rotation: MENU_TITLE_SIGN_ROTATION,
      boardSize: [4.2, 1.2, 0.18],
      boardHeight: 1.55,
      postHeight: 2.5,
      postSpacing: 1.46,
      font: '900 52px Georgia, serif',
    });
    const guide = this.createWoodenSign(factory, {
      name: 'menu:guide-sign',
      text: MENU_GUIDE_SIGN_TITLE,
      position: MENU_GUIDE_SIGN_POSITION,
      rotation: MENU_GUIDE_SIGN_ROTATION,
      boardSize: [2.65, 0.9, 0.18],
      boardHeight: 1.32,
      postHeight: 2.1,
      postSpacing: 0.88,
      font: '900 92px Georgia, serif',
    });

    this.root.name = 'menu:signs';
    this.root.add(title.root, guide.root);
    this.guideRoot = guide.root;
    this.guideHitTarget = guide.board;
    this.textures = [title.texture, guide.texture];
  }

  setGuideHighlighted(active: boolean): void {
    if (this.disposed || this.guideHighlighted === active) return;
    this.guideHighlighted = active;
    const scale = active ? 1.035 : 1;
    this.guideRoot.scale.setScalar(scale);
    this.guideRoot.position.y = MENU_GUIDE_SIGN_POSITION[1] + (active ? 0.04 : 0);
    this.guideHitTarget.material.emissive.setHex(active ? 0x5b3f20 : 0x000000);
    this.guideHitTarget.material.emissiveIntensity = active ? 0.45 : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const texture of this.textures) texture.dispose();
    disposeResourceSets(this.geometries, this.materials);
  }

  private createWoodenSign(
    factory: MenuSignCanvasFactory,
    spec: WoodenSignSpec,
  ): WoodenSignParts {
    const { canvas, context } = factory();
    canvas.width = 1024;
    canvas.height = 320;
    const gradient = context.createLinearGradient(0, 0, 1024, 320);
    gradient.addColorStop(0, '#3b281d');
    gradient.addColorStop(0.48, '#76513a');
    gradient.addColorStop(1, '#2d2019');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 320);
    context.strokeStyle = '#21150f';
    context.lineWidth = 14;
    context.strokeRect(10, 10, 1004, 300);
    context.fillStyle = '#e5dcc2';
    context.font = spec.font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(spec.text, 512, 184);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;

    const boardGeometry = new BoxGeometry(...spec.boardSize);
    const leftPostGeometry = new BoxGeometry(0.22, spec.postHeight, 0.22);
    const rightPostGeometry = new BoxGeometry(0.20, spec.postHeight - 0.25, 0.20);
    const boardMaterial = new MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const postMaterial = new MeshStandardMaterial({
      color: 0x4b3425,
      roughness: 1,
      metalness: 0,
    });
    this.geometries.add(boardGeometry);
    this.geometries.add(leftPostGeometry);
    this.geometries.add(rightPostGeometry);
    this.materials.add(boardMaterial);
    this.materials.add(postMaterial);

    const board = new Mesh(boardGeometry, boardMaterial);
    board.name = `${spec.name}-board`;
    board.position.set(0, spec.boardHeight, 0);
    const leftPost = new Mesh(leftPostGeometry, postMaterial);
    leftPost.name = `${spec.name}-post-left`;
    leftPost.position.set(-spec.postSpacing, 0.42, -0.12);
    leftPost.rotation.z = 0.04;
    const rightPost = new Mesh(rightPostGeometry, postMaterial);
    rightPost.name = `${spec.name}-post-right`;
    rightPost.position.set(spec.postSpacing, 0.48, -0.12);
    rightPost.rotation.z = -0.035;

    const root = new Group();
    root.name = spec.name;
    root.position.set(...spec.position);
    root.rotation.set(...spec.rotation);
    root.add(board, leftPost, rightPost);
    return { root, board, texture };
  }
}
