import * as THREE from 'three';

const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.1 });

export const PropFactory = {
  build(id: string): THREE.Group {
    const g = new THREE.Group();
    switch (id) {
      case 'anchor': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 16), mat(0x33383d));
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), mat(0x33383d));
        shank.position.y = -0.2;
        g.add(ring, shank);
        break;
      }
      case 'flareGun': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.08), mat(0xb02b2b));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), mat(0xcc4444));
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = 0.18;
        g.add(body, barrel);
        break;
      }
      case 'flashlight': {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), mat(0x222222));
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), mat(0x555555));
        head.position.y = 0.15;
        g.add(handle, head);
        break;
      }
      case 'ductTape': {
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), mat(0xd9d9d9));
        roll.rotation.x = Math.PI / 2;
        g.add(roll);
        break;
      }
      case 'bucket': {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 12), mat(0x3aa0a0));
        g.add(b);
        break;
      }
      case 'bait': {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0x9999aa));
        fish.scale.set(1.4, 0.7, 0.7);
        g.add(fish);
        break;
      }
      case 'fishingRod': {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.0, 6), mat(0x6b4a2b));
        rod.position.y = 0.5;
        g.add(rod);
        break;
      }
      case 'firstAidKit': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.18), mat(0xeeeeee));
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), mat(0xcc2222));
        g.add(box, cross);
        break;
      }
      case 'harpoonGun': {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), mat(0x444444));
        shaft.rotation.z = Math.PI / 2;
        g.add(shaft);
        break;
      }
      case 'spyglass': {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 10), mat(0xb8862b));
        tube.rotation.z = Math.PI / 2;
        g.add(tube);
        break;
      }
      case 'food': {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xd07a3a));
        g.add(f);
        break;
      }
      default: {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), mat(0x885522)));
      }
    }
    return g;
  },

  hotspot(): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.5 }),
    );
    m.userData.hotspot = true;
    return m;
  },
};
