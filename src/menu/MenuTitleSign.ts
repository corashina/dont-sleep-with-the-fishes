import {
  BoxGeometry, CanvasTexture, Group, LinearFilter, Mesh,
  MeshStandardMaterial, SRGBColorSpace,
} from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { disposeResourceSets } from '../world/SceneResources';

export const MENU_SIGN_TITLE = "don't sleep with the fishes";
export const MENU_TITLE_SIGN_POSITION = [-2.65, 0.05, 1.8] as const;
export const MENU_TITLE_SIGN_ROTATION = [0.02, 0.24, -0.06] as const;

export interface TitleCanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

export type TitleCanvasFactory = () => TitleCanvasSurface;

function browserCanvas(): TitleCanvasSurface {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Menu title sign requires a 2D canvas context');
  return { canvas, context };
}

export class MenuTitleSign implements MenuSceneComponent {
  readonly root = new Group();
  readonly texture: CanvasTexture;
  private readonly geometries = new Set<BoxGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private disposed = false;

  constructor(factory: TitleCanvasFactory = browserCanvas) {
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
    context.font = '900 74px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(MENU_SIGN_TITLE, 512, 184);

    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;

    const boardGeometry = new BoxGeometry(4.2, 1.2, 0.18);
    const leftPostGeometry = new BoxGeometry(0.22, 2.5, 0.22);
    const rightPostGeometry = new BoxGeometry(0.20, 2.2, 0.20);
    const boardMaterial = new MeshStandardMaterial({
      map: this.texture,
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
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
    board.name = 'menu:title-sign-board';
    board.position.set(0, 1.55, 0);
    const leftPost = new Mesh(leftPostGeometry, postMaterial);
    leftPost.name = 'menu:title-sign-post-left';
    leftPost.position.set(-1.45, 0.45, -0.12);
    leftPost.rotation.z = 0.04;
    const rightPost = new Mesh(rightPostGeometry, postMaterial);
    rightPost.name = 'menu:title-sign-post-right';
    rightPost.position.set(1.48, 0.52, -0.12);
    rightPost.rotation.z = -0.035;

    this.root.name = 'menu:title-sign';
    this.root.position.set(...MENU_TITLE_SIGN_POSITION);
    this.root.rotation.set(...MENU_TITLE_SIGN_ROTATION);
    this.root.add(board, leftPost, rightPost);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.texture.dispose();
    disposeResourceSets(this.geometries, this.materials);
  }
}
