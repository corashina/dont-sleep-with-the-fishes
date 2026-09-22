import { Group, Mesh, Object3D } from 'three';
import type { HeartPieceId } from './heartOfTheSea';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';

/** Templates belong to the model library; this display owns only cloned scene nodes. */
export class HeartOfTheSeaModels {
  readonly root = new Group();
  readonly pieces: Readonly<Record<HeartPieceId, Object3D>>;

  constructor(models: SurvivalEventModels) {
    this.pieces = {
      flowers: models.clone('flowersHeart'),
      chest: models.clone('chestHeart'),
      blood: models.clone('bloodHeart'),
    };
    for (const [id, piece] of Object.entries(this.pieces)) {
      piece.name = id + '-heart-piece';
      piece.traverse((object) => {
        if (object instanceof Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.root.add(piece);
    }
    this.root.name = 'heart-of-the-sea';
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
  }
}
