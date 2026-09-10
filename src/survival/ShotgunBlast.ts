import { ConeGeometry, Group, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import type { EventItemUseSample } from './eventItemUseChoreography';

// Center of the barrel opening in the normalized shotgun model.
const MUZZLE = new Vector3(0, 0.076, -0.5);

/** A muzzle flash follows the barrel; discharged smoke stays in world space. */
export class ShotgunBlast extends Group {
  private readonly flash = new Group();
  private readonly smoke = new Group();
  private readonly coreGeometry = new SphereGeometry(0.035, 7, 5);
  private readonly flameGeometry = new ConeGeometry(0.045, 0.2, 5);
  private readonly smokeGeometry = new SphereGeometry(0.045, 7, 5);
  private readonly coreMaterial = new MeshBasicMaterial({
    color: 0xfff1c7, transparent: true, depthWrite: false, toneMapped: false,
  });
  private readonly flameMaterial = new MeshBasicMaterial({
    color: 0xffb65e, transparent: true, depthWrite: false, toneMapped: false,
  });
  private readonly smokeMaterial = new MeshBasicMaterial({
    color: 0xa8aaa2, transparent: true, depthWrite: false,
  });
  private readonly muzzleWorld = new Vector3();
  private readonly dischargeWorld = new Vector3();
  private captured = false;
  private travel = 0;

  constructor() {
    super();
    this.name = 'event-item-shotgun-blast';
    this.flash.name = 'event-item-shotgun-flash';
    this.smoke.name = 'event-item-shotgun-smoke';
    const core = new Mesh(this.coreGeometry, this.coreMaterial);
    core.scale.set(1, 0.85, 1.6);
    core.position.z = -0.025;
    const flame = new Mesh(this.flameGeometry, this.flameMaterial);
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -0.1;
    this.flash.add(core, flame);
    for (let index = 0; index < 6; index += 1) {
      const puff = new Mesh(this.smokeGeometry, this.smokeMaterial);
      puff.name = `event-item-shotgun-smoke-puff-${index}`;
      this.smoke.add(puff);
    }
    this.add(this.flash, this.smoke);
    this.reset();
  }

  apply(sample: Readonly<EventItemUseSample>, actor: Object3D): void {
    this.visible = true;
    // The parent effect root is translated to the actor with an identity rotation.
    actor.getWorldPosition(this.position).negate();
    this.muzzleWorld.copy(MUZZLE).applyMatrix4(actor.matrixWorld);
    this.flash.position.copy(this.muzzleWorld);
    actor.getWorldQuaternion(this.flash.quaternion);
    actor.getWorldScale(this.flash.scale);
    const flash = sample.primaryEffect;
    this.flash.visible = flash > 0;
    this.coreMaterial.opacity = flash;
    this.flameMaterial.opacity = flash * 0.75;

    if (!this.captured || sample.effectTravel < this.travel) {
      this.dischargeWorld.copy(this.muzzleWorld);
      this.smoke.quaternion.copy(this.flash.quaternion);
      this.smoke.scale.copy(this.flash.scale);
      this.captured = true;
    }
    this.travel = sample.effectTravel;
    this.smoke.position.copy(this.dischargeWorld);
    this.smoke.position.x += 0.035 * this.travel;
    this.smoke.position.y += 0.16 * this.travel;
    this.smoke.visible = sample.secondaryEffect > 0;
    this.smokeMaterial.opacity = 0.24 * sample.secondaryEffect;
    for (let index = 0; index < this.smoke.children.length; index += 1) {
      const puff = this.smoke.children[index]!;
      const side = index % 2 === 0 ? -1 : 1;
      puff.position.set(
        side * this.travel * (0.015 + index * 0.007),
        this.travel * (index % 3 - 1) * 0.018,
        -index * 0.018 - this.travel * (0.12 + index * 0.035),
      );
      puff.scale.set(
        0.6 + this.travel * (1.1 + index * 0.13),
        0.5 + this.travel * (0.85 + index * 0.15),
        0.85 + this.travel * 1.4,
      );
      puff.rotation.z = side * (0.2 + this.travel * 0.45);
    }
  }

  reset(): void {
    this.visible = false;
    this.captured = false;
    this.travel = 0;
  }

  dispose(): void {
    this.reset();
    this.coreGeometry.dispose();
    this.flameGeometry.dispose();
    this.smokeGeometry.dispose();
    this.coreMaterial.dispose();
    this.flameMaterial.dispose();
    this.smokeMaterial.dispose();
  }
}
