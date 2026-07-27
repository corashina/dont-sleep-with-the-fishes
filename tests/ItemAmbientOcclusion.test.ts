import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  enableItemAmbientOcclusion,
  enableItemAmbientOcclusionOccluder,
  ITEM_AMBIENT_OCCLUSION_LAYER,
  ItemAmbientOcclusionPass,
} from '../src/rendering/ItemAmbientOcclusion';
import type { ItemId } from '../src/game/ItemState';
import { PropModelLibrary } from '../src/world/PropModelLibrary';

describe('item ambient occlusion', () => {
  it('adds item meshes to the dedicated AO layer without hiding them from the beauty pass', () => {
    const root = new Group();
    const transform = new Object3D();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    transform.add(mesh);
    root.add(transform);

    enableItemAmbientOcclusion(root);

    expect(mesh.layers.isEnabled(0)).toBe(true);
    expect(mesh.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(true);
    expect(transform.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('keeps transparent collectible meshes out of the dedicated AO layer', () => {
    const root = new Group();
    const opaque = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const transparent = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ transparent: true, opacity: 0.4 }),
    );
    root.add(opaque, transparent);

    enableItemAmbientOcclusion(root);

    expect(opaque.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(true);
    expect(transparent.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);

    opaque.geometry.dispose();
    opaque.material.dispose();
    transparent.geometry.dispose();
    transparent.material.dispose();
  });

  it('adds opaque ship meshes as AO depth occluders but keeps glass transparent', () => {
    const root = new Group();
    const wall = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const glass = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
    );
    root.add(wall, glass);

    enableItemAmbientOcclusionOccluder(root);

    expect(wall.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(true);
    expect(glass.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);

    wall.geometry.dispose();
    wall.material.dispose();
    glass.geometry.dispose();
    glass.material.dispose();
  });

  it('runs full-resolution GTAO with visible screen-scaled item settings', () => {
    const pass = new ItemAmbientOcclusionPass('composite', 'high');
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    pass.setContext(scene, camera);
    pass.setSize(321, 181);

    expect(pass.scene).toBe(scene);
    expect(pass.camera).toBe(camera);
    expect(pass.gtaoRenderTarget.width).toBe(321);
    expect(pass.gtaoRenderTarget.height).toBe(181);
    expect(pass.blendIntensity).toBe(1);
    expect(pass.gtaoMaterial.uniforms.radius!.value).toBe(0.5);
    expect(pass.gtaoMaterial.defines.SCREEN_SPACE_RADIUS).toBe(1);

    pass.dispose();
  });

  it('uses half-resolution eight-sample AO for low quality', () => {
    const pass = new ItemAmbientOcclusionPass('composite', 'low');
    pass.setSize(800, 450);
    expect(pass.gtaoRenderTarget.width).toBe(400);
    expect(pass.gtaoRenderTarget.height).toBe(225);
    expect(pass.gtaoMaterial.defines.SAMPLES).toBe(8);
    expect(pass.pdMaterial.defines.SAMPLES).toBe(8);
    pass.dispose();
  });

  it('reconfigures existing targets for high quality without replacing the pass', () => {
    const pass = new ItemAmbientOcclusionPass('composite', 'low');
    pass.setSize(800, 450);
    const target = pass.gtaoRenderTarget;
    pass.setVisualQuality('high');
    expect(pass.gtaoRenderTarget).toBe(target);
    expect(target.width).toBe(800);
    expect(target.height).toBe(450);
    expect(pass.gtaoMaterial.defines.SAMPLES).toBe(16);
    expect(pass.pdMaterial.defines.SAMPLES).toBe(16);
    pass.dispose();
  });

  it('supports composite, raw-buffer, and disabled comparison modes', () => {
    const pass = new ItemAmbientOcclusionPass('debug');
    expect(pass.enabled).toBe(true);
    expect(pass.output).toBe(ItemAmbientOcclusionPass.OUTPUT.AO);

    pass.setMode('off');
    expect(pass.enabled).toBe(false);

    pass.setMode('composite');
    expect(pass.enabled).toBe(true);
    expect(pass.output).toBe(ItemAmbientOcclusionPass.OUTPUT.Default);
    pass.dispose();
  });

  it('updates AO intensity and radius from console controls', () => {
    const pass = new ItemAmbientOcclusionPass();
    pass.setIntensity(0.4);
    pass.setRadius(0.18);
    expect(pass.blendIntensity).toBe(0.4);
    expect(pass.gtaoMaterial.uniforms.radius!.value).toBe(0.18);
    pass.dispose();
  });

  it('marks collectible clones without adding equipment to the AO layer', () => {
    const template = () => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
      return root;
    };
    const library = PropModelLibrary.fromTemplatesForTest(
      new Map<ItemId, Group>([['cannedFood', template()]]),
      new Map([['fishingRod', template()]]),
    );

    const item = library.create({ instanceId: 'cannedFood-1', type: 'cannedFood' });
    const equipment = library.createEquipment('fishingRod');
    const itemMesh = item.children[0] as Mesh;
    const equipmentMesh = equipment.children[0] as Mesh;

    expect(itemMesh.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(true);
    expect(itemMesh.castShadow).toBe(false);
    expect(itemMesh.receiveShadow).toBe(true);
    expect(equipmentMesh.layers.isEnabled(ITEM_AMBIENT_OCCLUSION_LAYER)).toBe(false);
    expect(equipmentMesh.castShadow).toBe(true);

    itemMesh.geometry.dispose();
    (Array.isArray(itemMesh.material) ? itemMesh.material : [itemMesh.material])
      .forEach((material) => material.dispose());
    equipmentMesh.geometry.dispose();
    (Array.isArray(equipmentMesh.material) ? equipmentMesh.material : [equipmentMesh.material])
      .forEach((material) => material.dispose());
    library.dispose();
  });
});
