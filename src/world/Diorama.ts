import * as THREE from 'three';
import { Environment } from './Environment';
import { PropFactory } from './PropFactory';
import { CREWMATES } from '../content/crewmates';

export class Diorama {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly env: Environment;
  private boat = new THREE.Group();
  private crewmate: THREE.Group | null = null;
  private ocean: THREE.Mesh;
  private hotspotGroup = new THREE.Group();
  private inventoryGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dragging = false;
  private lastX = 0;
  private azimuth = 0.6;
  private orbitEnabled = true;
  private hotspotClickCb: ((id: string) => void) | null = null;
  private clock = 0;

  constructor(private renderer: THREE.WebGLRenderer, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.positionCamera();

    this.env = new Environment(this.scene);
    this.scene.add(this.boat, this.hotspotGroup, this.inventoryGroup);

    this.ocean = this.buildOcean();
    this.scene.add(this.ocean);

    this.buildBoat();
  }

  private positionCamera(): void {
    const r = 6;
    this.camera.position.set(Math.sin(this.azimuth) * r, 4.2, Math.cos(this.azimuth) * r);
    this.camera.lookAt(0, 0.4, 0);
  }

  private buildOcean(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(120, 120, 40, 40);
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1d6a8c, roughness: 0.4 }));
  }

  private buildBoat(): void {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.7), hullMat);
    hull.position.y = 0;
    this.boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), hullMat);
    mast.position.set(0, 0.6, 0);
    this.boat.add(mast);
    this.boat.position.y = 0.2;
  }

  setCrewmate(id: 'frederik' | 'row'): void {
    if (this.crewmate) this.boat.remove(this.crewmate);
    const def = CREWMATES[id];
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 8), m);
    body.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m);
    head.position.y = 0.62;
    g.add(body, head);
    g.position.set(0.2, 0.2, 0);
    this.crewmate = g;
    this.boat.add(g);
  }

  showInventory(ids: string[], food: number): void {
    this.inventoryGroup.clear();
    const all = [...ids];
    if (food > 0) all.push('food');
    all.forEach((id, i) => {
      const mesh = PropFactory.build(id);
      const row = Math.floor(i / 3);
      const col = i % 3;
      mesh.position.set(-0.5 + col * 0.35, 0.3, -0.5 + row * 0.35);
      this.inventoryGroup.add(mesh);
    });
  }

  showHotspots(ids: string[], onClick: (id: string) => void): void {
    this.clearHotspots();
    this.hotspotClickCb = onClick;
    ids.forEach((id, i) => {
      const hs = PropFactory.hotspot();
      hs.userData.id = id;
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
      hs.position.set(Math.cos(a) * 1.6, 0.8, Math.sin(a) * 1.6);
      const icon = PropFactory.build(id);
      icon.position.copy(hs.position);
      this.hotspotGroup.add(hs, icon);
    });
  }

  clearHotspots(): void {
    this.hotspotGroup.clear();
    this.hotspotClickCb = null;
  }

  getCamera(): THREE.PerspectiveCamera { return this.camera; }

  enableOrbit(v: boolean): void { this.orbitEnabled = v; }

  onPointerDown(e: PointerEvent, _fallback?: () => void): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.hotspotGroup.children, true);
    const hit = hits.find((h) => h.object.userData.hotspot || h.object.userData.id);
    if (hit && this.hotspotClickCb) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.id) o = o.parent;
      if (o?.userData.id) this.hotspotClickCb(o.userData.id);
    }
  }

  onDrag(e: PointerEvent, isDown: boolean): void {
    if (!this.orbitEnabled) return;
    if (isDown) { this.dragging = true; this.lastX = e.clientX; }
    else if (e.type === 'pointermove' && this.dragging) {
      this.azimuth += (e.clientX - this.lastX) * 0.005;
      this.lastX = e.clientX;
      this.positionCamera();
    } else if (!isDown && e.type === 'pointerup') this.dragging = false;
  }

  update(dt: number): void {
    this.clock += dt;
    const swell = Math.sin(this.clock * 0.8) * 0.06;
    this.boat.position.y = 0.2 + swell;
    this.boat.rotation.z = Math.sin(this.clock * 0.6) * 0.03;
    this.env.update(dt);
    this.positionCamera();
  }
}
