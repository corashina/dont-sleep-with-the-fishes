import { Group, type Object3D } from 'three';

/** An aim point with an explicit model for effects that need its full bounds. */
export class ItemAimTarget extends Group {
  constructor(readonly model: Object3D) {
    super();
  }
}
