import {
  AdditiveBlending, type Box3, type BufferGeometry, type Group,
  IcosahedronGeometry, type Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D,
  PointLight, SphereGeometry, Vector3,
} from 'three';
import { clamp01, smoothstep } from './animationMath';
import type { GhostShipAudioCue } from './eventPresentationCue';
import { CannonWaterSplash } from './CannonWaterSplash';
import { CannonWoodImpact } from './CannonWoodImpact';

export const CANNONADE_DURATION = 7.4;

type ShotTarget = 'short' | 'hit' | 'wide';

interface ShotSpec {
  readonly fire: number;
  readonly flight: number;
  readonly arc: number;
  readonly target: ShotTarget;
  readonly port: number;
}

const SHOTS: readonly ShotSpec[] = [
  { fire: 1.1, flight: 2.2, arc: 12, target: 'short', port: -1 },
  { fire: 1.45, flight: 2.5, arc: 16, target: 'hit', port: 0 },
  { fire: 1.85, flight: 2.35, arc: 14, target: 'wide', port: 1 },
];
const HIT_SHOT = SHOTS.find(({ target }) => target === 'hit')!;
export const CANNONADE_IMPACT_TIME = HIT_SHOT.fire + HIT_SHOT.flight;

// Boat-local strike point: the bow gunwale on the side that faces the ship.
const BOW_STRIKE = Object.freeze({ x: 0.62, y: 0.5, z: -2.45 });
const WATER_Y = 0;
const TRAIL_LENGTH = 6;
const SMOKE_PUFFS = 3;
const FLASH_TIME = 0.2;
const SMOKE_TIME = 3.3;

interface Shot {
  readonly spec: ShotSpec;
  readonly port: Vector3;
  readonly muzzle: Vector3;
  readonly target: Vector3;
  readonly ball: Mesh;
  readonly halo: Mesh;
  readonly trail: readonly Mesh[];
  readonly flash: Mesh;
  readonly flashMaterial: MeshBasicMaterial;
  readonly smoke: readonly Mesh[];
  readonly smokeMaterial: MeshBasicMaterial;
  readonly splash: CannonWaterSplash;
  fired: boolean;
  landed: boolean;
}

function envelope(age: number, rise: number, duration: number): number {
  if (age < 0 || age > duration) return 0;
  return smoothstep(age / rise) * (1 - smoothstep((age - rise) / (duration - rise)));
}

export interface CannonadeMotion {
  /** Camera aim offset in meters at the ship distance. */
  aimX: number;
  aimY: number;
  /** Ship heel away from the player, in radians. */
  heel: number;
  boatRoll: number;
  boatPitch: number;
  boatHeave: number;
}

/** Owns the ghost ship broadside: port glow, muzzle fire, cannonballs, splashes, and hull damage. */
export class GhostShipCannonade {
  readonly motion: CannonadeMotion = { aimX: 0, aimY: 0, heel: 0, boatRoll: 0, boatPitch: 0, boatHeave: 0 };
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly shots: Shot[] = [];
  private readonly woodImpact = new CannonWoodImpact();
  private readonly ports: Mesh[] = [];
  private readonly portMaterial: MeshBasicMaterial;
  private readonly burst: Mesh;
  private readonly burstMaterial: MeshBasicMaterial;
  private readonly muzzleLight = new PointLight(0x8dffb8, 0, 36, 2);
  private readonly impactLight = new PointLight(0xffb36b, 0, 14, 2);
  private readonly impact = new Vector3();
  private readonly toShip = new Vector3();
  private readonly lateral = new Vector3();
  private readonly scratch = new Vector3();
  private strikeSide = 1;
  private portSide = 1;
  private impactEmitted = false;

  constructor(
    private readonly root: Group,
    private readonly ship: Group,
    bounds: Box3,
    private readonly onCue: (cue: GhostShipAudioCue) => void,
  ) {
    const ballGeometry = this.geometry(new SphereGeometry(0.2, 12, 8));
    const glowGeometry = this.geometry(new SphereGeometry(1, 12, 8));
    const puffGeometry = this.geometry(new IcosahedronGeometry(1, 1));
    const iron = this.material(new MeshStandardMaterial({
      name: 'ghost-ship-cannonball', color: 0x252622, roughness: 0.55, metalness: 0.7,
    }));
    const ghostFire = this.glow(0x7dffb0, 0.7);
    this.portMaterial = this.glow(0x6dffa0, 0);
    this.burstMaterial = this.glow(0xd4ffe0, 0);

    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    for (const spec of SHOTS) {
      const port = new Vector3(size.x * 0.5, bounds.min.y + size.y * 0.16, center.z + spec.port * size.z * 0.22);
      const portGlow = new Mesh(glowGeometry, this.portMaterial);
      portGlow.name = 'ghost-ship-gunport';
      portGlow.scale.setScalar(1.2);
      this.ports.push(portGlow);
      const flashMaterial = this.glow(0xe0ffe9, 0);
      const flash = new Mesh(glowGeometry, flashMaterial);
      flash.name = 'ghost-ship-muzzle-flash';
      const ball = new Mesh(ballGeometry, iron);
      ball.name = 'ghost-ship-cannonball';
      const halo = new Mesh(glowGeometry, ghostFire);
      halo.name = 'ghost-ship-cannonball-fire';
      const trail = Array.from({ length: TRAIL_LENGTH }, () => {
        const ember = new Mesh(glowGeometry, ghostFire);
        ember.name = 'ghost-ship-cannonball-trail';
        return ember;
      });
      const smokeMaterial = this.material(new MeshBasicMaterial({
        name: 'ghost-ship-cannon-smoke', color: 0x9db8a8, transparent: true, opacity: 0, depthWrite: false,
      }));
      const smoke = Array.from({ length: SMOKE_PUFFS }, () => {
        const puff = new Mesh(puffGeometry, smokeMaterial);
        puff.name = 'ghost-ship-cannon-smoke';
        return puff;
      });
      const splash = new CannonWaterSplash();
      this.shots.push({
        spec, port, muzzle: new Vector3(), target: new Vector3(), ball, halo, trail, flash, flashMaterial,
        smoke, smokeMaterial, splash, fired: false, landed: false,
      });
      this.ship.add(portGlow, flash);
      this.root.add(ball, halo, ...trail, ...smoke, splash.root);
    }
    this.root.add(this.woodImpact.root);
    this.burst = new Mesh(glowGeometry, this.burstMaterial);
    this.burst.name = 'ghost-ship-impact-burst';
    this.muzzleLight.name = 'ghost-ship-muzzle-light';
    this.impactLight.name = 'ghost-ship-impact-light';
    this.ship.add(this.muzzleLight);
    this.root.add(this.burst, this.impactLight);
    this.reset();
  }

  /** Aims the volley at the boat. Call once when the reaction starts. */
  begin(boat: Object3D | undefined): void {
    this.reset();
    this.strikeSide = this.ship.position.x >= 0 ? 1 : -1;
    this.impact.set(this.strikeSide * BOW_STRIKE.x, BOW_STRIKE.y, BOW_STRIKE.z);
    if (boat === undefined) this.impact.y += 0.22;
    else {
      boat.updateWorldMatrix(true, false);
      boat.localToWorld(this.impact);
    }
    this.root.updateWorldMatrix(true, false);
    this.root.worldToLocal(this.impact);
    this.toShip.subVectors(this.ship.position, this.impact).setY(0).normalize();
    this.lateral.set(-this.toShip.z, 0, this.toShip.x);
    // Fire from the broadside that faces the boat.
    this.ship.updateMatrix();
    const port = this.shots[0]!.port;
    this.scratch.set(Math.abs(port.x), port.y, port.z).applyMatrix4(this.ship.matrix);
    const positive = this.scratch.distanceToSquared(this.impact);
    this.scratch.set(-Math.abs(port.x), port.y, port.z).applyMatrix4(this.ship.matrix);
    this.portSide = this.scratch.distanceToSquared(this.impact) < positive ? -1 : 1;
    for (let index = 0; index < this.shots.length; index += 1) {
      const shot = this.shots[index]!;
      shot.port.x = Math.abs(shot.port.x) * this.portSide;
      this.ports[index]!.position.copy(shot.port);
      shot.flash.position.copy(shot.port);
      this.placeTarget(shot);
      this.scratch.copy(shot.target);
      if (shot.spec.target === 'hit') this.scratch.addScaledVector(this.toShip, 0.9);
      shot.splash.place(this.scratch, shot.spec.target === 'hit' ? 0.45 : 1);
    }
    this.woodImpact.place(this.impact, this.toShip, this.lateral);
  }

  sample(time: number, live: boolean): void {
    const motion = this.motion;
    motion.aimX = 0; motion.aimY = 0; motion.heel = 0;
    motion.boatRoll = 0; motion.boatPitch = 0; motion.boatHeave = 0;
    const portGlow = smoothstep((time - 0.15) / 0.8) * (1 - smoothstep((time - 2.2) / 1.2));
    this.portMaterial.opacity = portGlow * (0.55 + 0.25 * Math.sin(time * 23) * Math.sin(time * 7.3));
    let muzzleLight = 0;
    for (let index = 0; index < this.shots.length; index += 1) {
      const shot = this.shots[index]!;
      this.ports[index]!.visible = portGlow > 0.01;
      const age = time - shot.spec.fire;
      if (age >= 0 && !shot.fired) this.fire(shot, live);
      const flash = age >= 0 && age < FLASH_TIME ? 1 - age / FLASH_TIME : 0;
      shot.flash.visible = flash > 0;
      shot.flashMaterial.opacity = flash;
      shot.flash.scale.set(2.6 + (1 - flash) * 2.4, 2.6 + (1 - flash) * 2.4, 6 + (1 - flash) * 5);
      muzzleLight = Math.max(muzzleLight, flash);
      if (flash > 0) this.muzzleLight.position.copy(shot.port);
      if (age >= 0) {
        const kick = Math.exp(-age * 2.4) * Math.sin(Math.min(Math.PI, age * 7));
        // Positive roll about the length axis tips the masts toward local -X.
        motion.heel += this.portSide * 0.022 * kick;
        const thump = 0.3 * Math.exp(-age * 7);
        motion.aimX += thump * Math.sin(time * 41.7 + index);
        motion.aimY += thump * Math.sin(time * 33.9 + index * 2);
      }
      this.sampleSmoke(shot, age);
      this.sampleFlight(shot, age, live);
    }
    this.muzzleLight.intensity = muzzleLight * 320;
    this.sampleImpact(time - CANNONADE_IMPACT_TIME, time, live);
  }

  reset(): void {
    for (const shot of this.shots) {
      shot.fired = false;
      shot.landed = false;
      shot.flash.visible = false;
      shot.ball.visible = false;
      shot.halo.visible = false;
      shot.splash.reset();
      for (const ember of shot.trail) ember.visible = false;
      for (const puff of shot.smoke) puff.visible = false;
    }
    for (const port of this.ports) port.visible = false;
    this.woodImpact.reset();
    this.burst.visible = false;
    this.muzzleLight.intensity = 0;
    this.impactLight.intensity = 0;
    this.impactEmitted = false;
    const motion = this.motion;
    motion.aimX = 0; motion.aimY = 0; motion.heel = 0;
    motion.boatRoll = 0; motion.boatPitch = 0; motion.boatHeave = 0;
  }

  dispose(): void {
    this.reset();
    this.muzzleLight.dispose();
    this.impactLight.dispose();
    for (const shot of this.shots) shot.splash.dispose();
    this.woodImpact.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private placeTarget(shot: Shot): void {
    const target = shot.target.copy(this.impact);
    if (shot.spec.target === 'short') {
      target.addScaledVector(this.toShip, 12).addScaledVector(this.lateral, 2.5);
      target.y = WATER_Y;
    } else if (shot.spec.target === 'wide') {
      target.addScaledVector(this.toShip, 8).addScaledVector(this.lateral, -4.5);
      target.y = WATER_Y;
    }
  }

  private fire(shot: Shot, live: boolean): void {
    shot.fired = true;
    this.ship.updateMatrix();
    shot.muzzle.copy(shot.port).applyMatrix4(this.ship.matrix);
    this.root.localToWorld(this.scratch.copy(shot.target));
    shot.flash.lookAt(this.scratch);
    if (live) this.onCue('cannon-fire');
  }

  private sampleSmoke(shot: Shot, age: number): void {
    const visible = age >= 0 && age < SMOKE_TIME;
    shot.smokeMaterial.opacity = visible ? 0.5 * envelope(age, 0.12, SMOKE_TIME) : 0;
    for (let index = 0; index < shot.smoke.length; index += 1) {
      const puff = shot.smoke[index]!;
      puff.visible = visible;
      if (!visible) continue;
      const spread = 1 - Math.exp(-age * 1.6);
      puff.position.copy(shot.muzzle)
        .addScaledVector(this.toShip, -(0.8 + index * 1.4) * spread * 2.4)
        .addScaledVector(this.lateral, (index - 1) * 0.9 * spread);
      puff.position.y += age * 0.45 + index * 0.3;
      puff.scale.setScalar((1.8 + index * 0.6) * (1 + age * 0.9));
    }
  }

  private sampleFlight(shot: Shot, age: number, live: boolean): void {
    const progress = age / shot.spec.flight;
    const flying = progress >= 0 && progress < 1;
    shot.ball.visible = flying;
    shot.halo.visible = flying;
    // Large fire reads at the ship's distance. It shrinks near the boat so it never floods the view.
    const fire = 1 - 0.7 * smoothstep((progress - 0.55) / 0.4);
    if (flying) {
      this.arcPoint(shot, progress, shot.ball.position);
      shot.halo.position.copy(shot.ball.position);
      shot.halo.scale.setScalar(fire * (1.05 + 0.15 * Math.sin(age * 41)));
    }
    for (let index = 0; index < shot.trail.length; index += 1) {
      const ember = shot.trail[index]!;
      const trailProgress = progress - (index + 1) * 0.016;
      ember.visible = flying && trailProgress > 0;
      if (!ember.visible) continue;
      this.arcPoint(shot, trailProgress, ember.position);
      ember.scale.setScalar(fire * 0.85 * (1 - index / TRAIL_LENGTH));
    }
    if (progress >= 1 && !shot.landed) {
      shot.landed = true;
      if (live && shot.spec.target !== 'hit') this.onCue('cannon-splash');
    }
    shot.splash.sample(age - shot.spec.flight);
  }

  private arcPoint(shot: Shot, progress: number, output: Vector3): void {
    output.lerpVectors(shot.muzzle, shot.target, progress);
    output.y += shot.spec.arc * 4 * progress * (1 - progress);
  }

  private sampleImpact(age: number, time: number, live: boolean): void {
    this.woodImpact.sample(age);
    if (age < 0) {
      this.burst.visible = false;
      this.impactLight.intensity = 0;
      return;
    }
    if (!this.impactEmitted) {
      this.impactEmitted = true;
      if (live) this.onCue('cannon-impact');
    }
    const flash = clamp01(1 - age / 0.28);
    this.burst.visible = flash > 0;
    this.burst.position.copy(this.impact);
    this.burst.scale.setScalar(0.3 + (1 - flash) * 1.3);
    this.burstMaterial.opacity = flash * 0.9;
    this.impactLight.position.copy(this.impact);
    this.impactLight.position.y += 0.4;
    this.impactLight.intensity = 70 * Math.exp(-age * 7);
    const jolt = Math.exp(-age * 3.2);
    const motion = this.motion;
    motion.boatRoll = -this.strikeSide * 0.1 * jolt * Math.sin(age * 13 + 0.4);
    motion.boatPitch = 0.05 * jolt * Math.sin(age * 17);
    motion.boatHeave = -0.08 * jolt * Math.sin(age * 11 + 0.2);
    const shake = 2.6 * Math.exp(-age * 4.2);
    motion.aimX += shake * Math.sin(time * 47.3);
    motion.aimY += shake * Math.sin(time * 38.1 + 1.3);
  }

  private geometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private material<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private glow(color: number, opacity: number): MeshBasicMaterial {
    return this.material(new MeshBasicMaterial({
      name: 'ghost-ship-cannon-glow', color, transparent: true, opacity,
      blending: AdditiveBlending, depthWrite: false, fog: false,
    }));
  }
}
