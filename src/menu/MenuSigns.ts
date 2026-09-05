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
import { onLanguageChange } from '../i18n/language';
import { menuText } from '../i18n/menuMessages';

export const MENU_GUIDE_SIGN_POSITION = [-2.55, -0.94, 3.75] as const;
export const MENU_GUIDE_SIGN_ROTATION = [0.02, 0.24, -0.06] as const;
export const MENU_START_SIGN_POSITION = [2.55, -0.86, 3.72] as const;
export const MENU_START_SIGN_ROTATION = [0.02, -0.22, 0.05] as const;

export interface MenuSignCanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

export type MenuSignCanvasFactory = () => MenuSignCanvasSurface;
export type MenuSignAction = 'start' | 'guide';

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
}

interface WoodenSignParts {
  readonly surface: MenuSignCanvasSurface;
  readonly spec: WoodenSignSpec;
  readonly root: Group;
  readonly board: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly texture: CanvasTexture;
  readonly boardMaterial: MeshStandardMaterial;
  readonly edgeMaterial: MeshStandardMaterial;
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
  readonly startHitTarget: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly guideHitTarget: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  readonly textures: readonly [CanvasTexture, CanvasTexture];

  private readonly startSign: WoodenSignParts;
  private readonly guideSign: WoodenSignParts;
  private readonly geometries = new Set<BoxGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private startHighlighted = false;
  private guideHighlighted = false;
  private disposed = false;
  private readonly unsubscribeLanguage: () => void;

  constructor(factory: MenuSignCanvasFactory = browserCanvas) {
    const guide = this.createWoodenSign(factory, {
      name: 'menu:guide-sign',
      get textLines() { return [menuText('guideLine1'), menuText('guideLine2')]; },
      textLineWidths: [510, 340],
      textLineYs: [112, 226],
      position: MENU_GUIDE_SIGN_POSITION,
      rotation: MENU_GUIDE_SIGN_ROTATION,
      boardSize: [2.4, 0.76, 0.16],
      boardHeight: 1.18,
      postHeight: 1.82,
      postSpacing: 0.78,
      fontSize: 108,
      wearSeed: 0x486f77,
    });
    const start = this.createWoodenSign(factory, {
      name: 'menu:start-sign',
      get textLines() { return [menuText('start')]; },
      textLineWidths: [560],
      textLineYs: [184],
      position: MENU_START_SIGN_POSITION,
      rotation: MENU_START_SIGN_ROTATION,
      boardSize: [2.05, 0.72, 0.16],
      boardHeight: 1.12,
      postHeight: 1.72,
      postSpacing: 0.66,
      fontSize: 150,
      wearSeed: 0x537461,
    });

    this.root.name = 'menu:signs';
    this.root.add(guide.root, start.root);
    this.startSign = start;
    this.guideSign = guide;
    this.startHitTarget = start.board;
    this.guideHitTarget = guide.board;
    this.textures = [guide.texture, start.texture];
    this.unsubscribeLanguage = onLanguageChange(() => {
      for (const sign of [this.guideSign, this.startSign]) {
        this.paintSign(sign.surface, sign.spec);
        sign.texture.needsUpdate = true;
      }
    });
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
    this.unsubscribeLanguage();
    this.root.removeFromParent();
    for (const texture of this.textures) texture.dispose();
    disposeResourceSets(this.geometries, this.materials);
  }

  private createWoodenSign(
    factory: MenuSignCanvasFactory,
    spec: WoodenSignSpec,
  ): WoodenSignParts {
    const surface = factory();
    this.paintSign(surface, spec);
    const texture = new CanvasTexture(surface.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;

    const boardGeometry = new BoxGeometry(...spec.boardSize);
    const leftPostGeometry = new BoxGeometry(0.22, spec.postHeight, 0.22);
    const rightPostGeometry = new BoxGeometry(0.20, spec.postHeight - 0.25, 0.20);
    const boardMaterial = new MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 0.9, metalness: 0, emissive: 0x000000, emissiveIntensity: 0 });
    const edgeMaterial = new MeshStandardMaterial({ color: 0x36251b, roughness: 1, metalness: 0 });
    const postMaterial = new MeshStandardMaterial({ color: 0x4b3425, roughness: 1, metalness: 0 });
    this.geometries.add(boardGeometry);
    this.geometries.add(leftPostGeometry);
    this.geometries.add(rightPostGeometry);
    this.materials.add(boardMaterial);
    this.materials.add(edgeMaterial);
    this.materials.add(postMaterial);
    const board = new Mesh(boardGeometry, [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, boardMaterial, edgeMaterial]);
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
    return { root, board, texture, boardMaterial, edgeMaterial, postMaterial, surface, spec };
  }

  private paintSign({ canvas, context }: MenuSignCanvasSurface, spec: WoodenSignSpec): void {
    canvas.width = 1024;
    canvas.height = 320;
    const gradient = context.createLinearGradient(0, 0, 1024, 320);
    gradient.addColorStop(0, '#3b281d');
    gradient.addColorStop(0.48, '#76513a');
    gradient.addColorStop(1, '#2d2019');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 320);

    let wearState = spec.wearSeed >>> 0;
    const wearUnit = (): number => {
      wearState = (Math.imul(wearState, 1664525) + 1013904223) >>> 0;
      return wearState / 0x100000000;
    };
    for (let index = 0; index < 34; index += 1) {
      const x = 24 + wearUnit() * 930;
      const y = 24 + wearUnit() * 270;
      const width = 24 + wearUnit() * 150;
      context.globalAlpha = 0.08 + wearUnit() * 0.12;
      context.fillStyle = wearUnit() > 0.5 ? '#d0a572' : '#160e0a';
      context.fillRect(x, y, width, 1 + wearUnit() * 3);
    }

    context.globalAlpha = 1;
    const algae = context.createLinearGradient(0, 210, 0, 320);
    algae.addColorStop(0, 'rgba(26, 58, 50, 0)');
    algae.addColorStop(1, 'rgba(20, 50, 43, 0.48)');
    context.fillStyle = algae;
    context.fillRect(0, 210, 1024, 110);
    context.strokeStyle = '#21150f';
    context.lineWidth = 14;
    context.strokeRect(10, 10, 1004, 300);

    context.font = `400 ${spec.fontSize}px "Bowlby One SC", Impact, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    for (let index = 0; index < spec.textLines.length; index += 1) {
      const line = spec.textLines[index]!;
      const y = spec.textLineYs[index]!;
      context.globalAlpha = 0.82;
      context.strokeStyle = '#211711';
      context.lineWidth = 16;
      context.strokeText(line, 518, y + 5);
      context.fillStyle = '#c9bd94';
      context.fillText(line, 512, y);

      const lineWidth = spec.textLineWidths[index]!;
      const left = 512 - lineWidth * 0.5;
      for (let chip = 0; chip < 24; chip += 1) {
        const x = left + wearUnit() * lineWidth;
        const chipY = y - spec.fontSize * 0.38 + wearUnit() * spec.fontSize * 0.7;
        context.globalAlpha = 0.58 + wearUnit() * 0.28;
        context.fillStyle = wearUnit() > 0.28 ? '#5b3d2c' : '#273b33';
        context.fillRect(
          x,
          chipY,
          5 + wearUnit() * 28,
          2 + wearUnit() * 7,
        );
      }
    }

    context.globalAlpha = 0.22;
    context.fillStyle = '#9ca789';
    for (let index = 0; index < 12; index += 1) {
      context.fillRect(
        32 + wearUnit() * 920,
        250 + wearUnit() * 48,
        5 + wearUnit() * 25,
        2 + wearUnit() * 5,
      );
    }
    context.globalAlpha = 1;

  }

  private setSignHighlighted(sign: WoodenSignParts, active: boolean): void {
    sign.boardMaterial.color.setHex(active ? 0xffe8bf : 0xffffff);
    sign.boardMaterial.emissive.setHex(active ? 0x6b431c : 0x000000);
    sign.boardMaterial.emissiveIntensity = active ? 0.72 : 0;
    sign.edgeMaterial.color.setHex(active ? 0x765637 : 0x36251b);
    sign.edgeMaterial.emissive.setHex(active ? 0x4b2f16 : 0x000000);
    sign.edgeMaterial.emissiveIntensity = active ? 0.58 : 0;
    sign.postMaterial.color.setHex(active ? 0x765637 : 0x4b3425);
    sign.postMaterial.emissive.setHex(active ? 0x4b2f16 : 0x000000);
    sign.postMaterial.emissiveIntensity = active ? 0.58 : 0;
  }
}
