import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { disposeResourceSets } from './SceneResources';
import type { DangerAnchor } from './ShipDangerLayout';

export interface ShipAlarmLightsSnapshot {
  lampCount: number;
  pulse: number;
}

export class ShipAlarmLights {
  readonly root = new Group();

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly lights: PointLight[] = [];
  private readonly lensMaterial: MeshStandardMaterial;
  private pulse = 0;
  private disposed = false;

  constructor(anchors: readonly DangerAnchor[]) {
    this.root.name = 'ship-danger-alarms';

    const housingGeometry = this.ownGeometry(new CylinderGeometry(0.22, 0.25, 0.16, 10));
    const lensGeometry = this.ownGeometry(new CylinderGeometry(0.15, 0.15, 0.05, 12));
    const ringGeometry = this.ownGeometry(new TorusGeometry(0.19, 0.025, 5, 12));
    const barGeometry = this.ownGeometry(new BoxGeometry(0.035, 0.035, 0.42));
    const metalMaterial = this.ownMaterial(new MeshStandardMaterial({ color: 0x242729, metalness: 0.72, roughness: 0.38 }));
    this.lensMaterial = this.ownMaterial(new MeshStandardMaterial({
      color: 0x9f2118,
      emissive: 0xff2f19,
      emissiveIntensity: 0.18,
      roughness: 0.38,
    }));

    anchors.forEach((anchor) => {
      const lamp = new Group();
      lamp.name = `ship-danger-alarm:${anchor.id}`;
      lamp.position.set(...anchor.position);
      lamp.rotation.set(...anchor.rotation);

      const housing = new Mesh(housingGeometry, metalMaterial);
      housing.name = `ship-danger-alarm-housing:${anchor.id}`;
      housing.rotation.x = Math.PI / 2;
      lamp.add(housing);

      const lens = new Mesh(lensGeometry, this.lensMaterial);
      lens.name = `ship-danger-alarm-lens:${anchor.id}`;
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.1;
      lamp.add(lens);

      const ring = new Mesh(ringGeometry, metalMaterial);
      ring.name = `ship-danger-alarm-ring:${anchor.id}`;
      ring.position.z = 0.13;
      lamp.add(ring);

      for (let barIndex = 0; barIndex < 3; barIndex += 1) {
        const bar = new Mesh(barGeometry, metalMaterial);
        bar.name = `ship-danger-alarm-cage:${anchor.id}:${barIndex + 1}`;
        bar.rotation.z = (barIndex - 1) * (Math.PI / 3);
        bar.position.z = 0.14;
        lamp.add(bar);
      }

      const light = new PointLight(0xff2f19, 0, 4.2, 2);
      light.name = `ship-danger-alarm-light:${anchor.id}`;
      light.castShadow = false;
      light.position.z = 0.18;
      this.lights.push(light);
      lamp.add(light);
      this.root.add(lamp);
    });
  }

  update(state: Readonly<ShipDangerState>): void {
    if (this.disposed) return;
    this.pulse = state.alarmPulse;
    this.lensMaterial.emissiveIntensity = 0.18 + state.alarmPulse * 2.6;
    for (const light of this.lights) light.intensity = 0.06 + state.alarmPulse * 1.15;
  }

  snapshotForTest(): ShipAlarmLightsSnapshot {
    return { lampCount: this.lights.length, pulse: this.pulse };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.lights.length = 0;
    this.root.clear();
  }

  private ownGeometry(geometry: BufferGeometry): BufferGeometry {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial<T extends Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
}
