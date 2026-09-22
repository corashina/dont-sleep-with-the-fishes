import { Box3, Group, Matrix4, Object3D, Vector3 } from 'three';
import { LIFEBOAT_DISPLAY_SHELF_SURFACE_Y } from '../world/Lifeboat';
import { EMPTY_HEART, HEART_PIECE_IDS, type HeartPieceId, type HeartPieces } from './heartOfTheSea';
import { HeartOfTheSeaModels } from './HeartOfTheSeaModels';
import { HeartBasket } from './HeartBasket';
import { getLanguage } from '../i18n/language';
import { presentationUiText } from '../i18n/presentationUiMessages';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import type { SurvivalSnapshot } from './survivalSnapshot';

/** Collected pieces share a shallow basket on the display bench. */
export class BoatHeartDisplay {
  readonly root: Group;
  private readonly models: HeartOfTheSeaModels;
  private readonly basket: HeartBasket;
  private tooltipLanguage = getLanguage();
  private tooltipMask = -1;
  private tooltipText = '?';
  private ownedPieces: HeartPieces = EMPTY_HEART;
  private collecting = false;
  private returned = false;
  private restParent: Object3D | null = null;
  private readonly restTransform = new Matrix4();

  get tooltip(): string {
    const { flowers, blood, chest } = this.models.pieces;
    const mask = Number(flowers.visible && flowers.parent === this.root)
      | Number(blood.visible && blood.parent === this.root) << 1
      | Number(chest.visible && chest.parent === this.root) << 2;
    const language = getLanguage();
    if (mask !== this.tooltipMask || language !== this.tooltipLanguage) {
      const labels: string[] = [];
      if (mask & 1) labels.push(presentationUiText('brain'));
      if (mask & 2) labels.push(presentationUiText('heart'));
      if (mask & 4) labels.push(presentationUiText('kidneys'));
      this.tooltipText = labels.join(', ') || '?';
      this.tooltipMask = mask;
      this.tooltipLanguage = language;
    }
    return this.tooltipText;
  }

  constructor(models: SurvivalEventModels) {
    this.models = new HeartOfTheSeaModels(models);
    this.root = this.models.root;
    this.root.name = 'boat-heart-pieces';
    const bounds = new Box3();
    const center = new Vector3();
    const size = new Vector3();
    // Turn the brain onto its narrow side; the thin kidneys stand behind it.
    // Each footprint has a separate cell, including clearance from the weave.
    const placements = {
      flowers: [-0.083, 0.030, Math.PI / 2],
      blood: [0.089, 0.035, 0],
      chest: [0, -0.085, 0],
    } as const;
    HEART_PIECE_IDS.forEach((id) => {
      const piece = this.models.pieces[id];
      const [x, z, tilt] = placements[id];
      piece.rotation.set(0, 0, tilt);
      bounds.setFromObject(piece);
      if (!bounds.isEmpty()) {
        bounds.getSize(size);
        piece.scale.multiplyScalar(0.2 / Math.max(size.x, size.y, size.z));
        bounds.setFromObject(piece);
        bounds.getCenter(center);
        piece.position.set(x - center.x, 0.028 - bounds.min.y, z - center.z);
      }
      piece.visible = false;
    });
    this.basket = new HeartBasket(0.37, 0.25);
    this.root.add(this.basket.root);
    this.root.position.set(1.05, LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, -1.62);
  }

  sync(snapshot: Pick<SurvivalSnapshot, 'heartPieces' | 'ending'>): void {
    this.ownedPieces = snapshot.heartPieces;
    if (this.collecting) return;
    this.returned = snapshot.ending?.id === 'kraken';
    this.root.visible = !this.returned;
    for (const id of HEART_PIECE_IDS) this.models.pieces[id].visible = this.ownedPieces[id] && !this.returned;
  }

  beginCollection(): void {
    this.restParent = this.root.parent;
    this.root.updateMatrix();
    this.restTransform.copy(this.root.matrix);
    this.collecting = true;
  }

  piece(id: HeartPieceId): Object3D { return this.models.pieces[id]; }

  takeBasket(carrier: Object3D): void {
    carrier.attach(this.root);
  }

  endCollection(returned: boolean): void {
    if (!this.collecting) return;
    this.collecting = false;
    this.returned = returned;
    if (this.restParent === null) this.root.removeFromParent();
    else this.restParent.add(this.root);
    this.restTransform.decompose(this.root.position, this.root.quaternion, this.root.scale);
    this.restParent = null;
    this.root.visible = !returned;
    for (const id of HEART_PIECE_IDS) {
      const piece = this.models.pieces[id];
      piece.visible = this.ownedPieces[id] && !returned;
    }
  }
  dispose(): void {
    this.endCollection(this.returned);
    this.basket.dispose();
    this.models.dispose();
  }
}
