import { Group, type Object3D } from 'three';

/** An aim point with an explicit model for effects that need its full bounds. */
export class ItemAimTarget extends Group {
  /** Select a model subtree without rebuilding the effect's cached mesh bounds. */
  activeModel: Object3D;

  constructor(readonly model: Object3D) {
    super();
    this.activeModel = model;
  }
}
