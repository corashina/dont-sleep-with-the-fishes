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

export const MENU_START_SIGN_TITLE = 'START';
export const MENU_GUIDE_SIGN_TITLE = 'HOW TO PLAY';
export const MENU_GUIDE_SIGN_POSITION = [-2.55, -0.94, 2.55] as const;
export const MENU_GUIDE_SIGN_ROTATION = [0.02, 0.24, -0.06] as const;
export const MENU_START_SIGN_POSITION = [2.55, -0.86, 2.45] as const;
export const MENU_START_SIGN_ROTATION = [0.02, -0.22, 0.05] as const;

export interface MenuSignCanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

export type MenuSignCanvasFactory = () => MenuSignCanvasSurface;
export type MenuSignAction = 'start' | 'guide';

export interface MenuSignsComponent extends MenuSceneComponent {
  readonly startHitTarget: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly guideHitTarget: Mesh<BoxGeometry, MeshStandardMaterial>;
  setStartHighlighted(active: boolean): void;
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
  readonly boardMaterial: MeshStandardMaterial;
  readonly postMaterial: MeshStandardMaterial;
}

function browserCanvas(): MenuSignCanvasSurface {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Menu sign requires a 2D canvas context');
  return { canvas, context };
}

export class MenuSigns implements MenuSignsComponent {
  readonly root = new Group();
  readonly startHitTarget: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly guideHitTarget: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly textures: readonly [CanvasTexture, CanvasTexture];

  private readonly startSign: WoodenSignParts;
  private readonly guideSign: WoodenSignParts;
  private readonly geometries = new Set<BoxGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private startHighlighted = false;
  private guideHighlighted = false;
  private disposed = false;

  constructor(factory: MenuSignCanvasFactory = browserCanvas) {
    const guide = this.createWoodenSign(factory, {
      name: 'menu:guide-sign',
      text: MENU_GUIDE_SIGN_TITLE,
      position: MENU_GUIDE_SIGN_POSITION,
      rotation: MENU_GUIDE_SIGN_ROTATION,
      boardSize: [2.4, 0.76, 0.16],
      boardHeight: 1.18,
      postHeight: 1.82,
      postSpacing: 0.78,
      font: '900 86px Georgia, serif',
    });
    const start = this.createWoodenSign(factory, {
      name: 'menu:start-sign',
      text: MENU_START_SIGN_TITLE,
      position: MENU_START_SIGN_POSITION,
      rotation: MENU_START_SIGN_ROTATION,
      boardSize: [2.05, 0.72, 0.16],
      boardHeight: 1.12,
      postHeight: 1.72,
      postSpacing: 0.66,
      font: '900 112px Georgia, serif',
    });

    this.root.name = 'menu:signs';
    this.root.add(guide.root, start.root);
    this.startSign = start;
    this.guideSign = guide;
    this.startHitTarget = start.board;
    this.guideHitTarget = guide.board;
    this.textures = [guide.texture, start.texture];
  }

  setStartHighlighted(active: boolean): void {
    if (this.disposed || this.startHighlighted === active) return;
    this.startHighlighted = active;
    this.setSignHighlighted(this.startSign, active);
  }

  setGuideHighlighted(active: boolean): void {
    if (this.disposed || this.guideHighlighted === active) return;
    this.guideHighlighted = active;
    this.setSignHighlighted(this.guideSign, active);
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
    return { root, board, texture, boardMaterial, postMaterial };
  }

  private setSignHighlighted(sign: WoodenSignParts, active: boolean): void {
    sign.boardMaterial.color.setHex(active ? 0xffe8bf : 0xffffff);
    sign.boardMaterial.emissive.setHex(active ? 0x6b431c : 0x000000);
    sign.boardMaterial.emissiveIntensity = active ? 0.72 : 0;
    sign.postMaterial.color.setHex(active ? 0x765637 : 0x4b3425);
    sign.postMaterial.emissive.setHex(active ? 0x4b2f16 : 0x000000);
    sign.postMaterial.emissiveIntensity = active ? 0.58 : 0;
  }
}
