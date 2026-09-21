import { Euler, Mesh, Object3D, Vector3 } from 'three';

interface LooseTimber {
  object: Object3D;
  position: Vector3;
  rotation: Euler;
  side: number;
  end: number;
}

/** Reuses the boat's timber materials. Only the separated hull geometry is owned here. */
export class SinkingBoatBreakup {
  private readonly timber: LooseTimber[] = [];
  private readonly pieces: Mesh[] = [];
  private readonly intact: { object: Object3D; visible: boolean }[] = [];

  constructor(root: Object3D) {
    const hull: Mesh[] = [];
    root.traverse((object) => {
      if (object instanceof Mesh && (object.name.startsWith('lifeboat-hull-strake-')
        || object.name === 'lifeboat-outer-gunwale' || object.name === 'lifeboat-faded-rescue-trim')) {
        hull.push(object);
      } else if (object.name.startsWith('lifeboat-floorboard-')) {
        this.capture(object, Math.sign(Number(object.name.split('-').at(-1)) - 6) || 1, 0);
      } else if (object.name === 'survival-floor') {
        this.intact.push({ object, visible: object.visible });
      }
    });
    for (const source of hull) this.split(source);
  }

  apply(progress: number): void {
    const broken = progress > 0;
    for (const entry of this.intact) entry.object.visible = !broken && entry.visible;
    for (const piece of this.pieces) piece.visible = broken;
    for (const timber of this.timber) {
      timber.object.position.copy(timber.position);
      timber.object.position.x += timber.side * progress * 0.3;
      timber.object.position.z += timber.end * progress * 0.22;
      timber.object.position.y += progress * 0.1;
      timber.object.rotation.copy(timber.rotation);
      timber.object.rotation.z += timber.side * progress * 0.16;
      timber.object.rotation.x += timber.end * progress * 0.07;
    }
  }

  dispose(): void {
    for (const timber of this.timber) {
      timber.object.position.copy(timber.position);
      timber.object.rotation.copy(timber.rotation);
    }
    for (const entry of this.intact) entry.object.visible = entry.visible;
    for (const piece of this.pieces) {
      piece.removeFromParent();
      piece.geometry.dispose();
    }
  }

  private capture(object: Object3D, side: number, end: number): void {
    this.timber.push({ object, side, end, position: object.position.clone(), rotation: object.rotation.clone() });
  }

  private split(source: Mesh): void {
    const positions = source.geometry.getAttribute('position');
    const index = source.geometry.index?.array
      ?? Array.from({ length: positions.count }, (_, vertex) => vertex);
    const sections: number[][] = [[], [], [], []];
    const seam = -0.45 + (this.pieces.length % 3) * 0.12;
    for (let triangle = 0; triangle < index.length; triangle += 3) {
      const a = index[triangle]!;
      const b = index[triangle + 1]!;
      const c = index[triangle + 2]!;
      const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
      const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
      sections[(x < 0 ? 0 : 1) + (z < seam ? 0 : 2)]!.push(a, b, c);
    }
    this.intact.push({ object: source, visible: source.visible });
    for (let section = 0; section < sections.length; section++) {
      const indices = sections[section]!;
      if (indices.length === 0) continue;
      const geometry = source.geometry.clone();
      geometry.setIndex(indices);
      const piece = new Mesh(geometry, source.material);
      piece.name = `sinking-${source.name}-${section}`;
      piece.position.copy(source.position);
      piece.quaternion.copy(source.quaternion);
      piece.scale.copy(source.scale);
      piece.castShadow = source.castShadow;
      piece.receiveShadow = source.receiveShadow;
      piece.visible = false;
      source.parent!.add(piece);
      this.pieces.push(piece);
      this.capture(piece, section % 2 === 0 ? -1 : 1, section < 2 ? -1 : 1);
    }
  }
}
