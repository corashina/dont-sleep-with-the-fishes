import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  type Intersection,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  Texture,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { MenuModelInstance, MenuModelLibrary } from './MenuModelLibrary';
import type { MenuModelId } from './menuModelManifest';
import { enableItemAmbientOcclusionOccluder } from '../rendering/ItemAmbientOcclusion';
import {
  MENU_CAMERA_POSITION,
  MENU_CAMERA_TARGET,
  MENU_SEABED_POSITION,
  MENU_MODEL_PLACEMENTS,
  menuSeabedHeight,
  type MenuGroundPlacement,
} from './MenuSceneLayout';
import { DistantSeabed } from './DistantSeabed';
import type { MenuSceneComponent } from './MenuSceneComponent';
import {
  MenuSigns,
  type MenuSignAction,
  type MenuSignsComponent,
} from './MenuSigns';
import { SunkenDorothyWreck } from './SunkenDorothyWreck';
import {
  type MenuFishActor,
  type MenuSharkActor,
  type UnderwaterMenuActors,
} from './UnderwaterMenuAnimator';
import { UnderwaterParticles } from './UnderwaterParticles';
import { UnderwaterLightShafts } from './UnderwaterLightShafts';
import { UnderwaterPlantField } from './UnderwaterPlantField';
import type { MenuSandAssets } from './MenuSandAssets';
import { createMenuSeabedMaterial } from './MenuSeabedMaterial';
import {
  disposeResourceSets,
  ignoreCleanupError,
  runCleanupSteps,
} from '../world/SceneResources';

export const MENU_PLACEMENT = {
  boat: { position: [0, 0.42, -4.8], rotation: [0.05, -0.12, -0.09] },
} as const;

const MENU_GROUND_MODEL_IDS: readonly MenuGroundPlacement['modelId'][] = [
  'rockA', 'rockB', 'rockC', 'coral', 'seaweed', 'starfish', 'skull',
];

const CAUSTIC_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CAUSTIC_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    float first = sin(vUv.x * 31.0 + uTime * 0.34)
      * sin(vUv.y * 27.0 - uTime * 0.23);
    float second = sin((vUv.x + vUv.y) * 41.0 - uTime * 0.19);
    float bands = smoothstep(0.52, 0.94, first * 0.58 + second * 0.42);
    gl_FragColor = vec4(0.28, 0.58, 0.61, bands * 0.085 * uStrength);
  }
`;

type ModelFactory = Pick<MenuModelLibrary, 'create'>;

export interface UnderwaterMenuComponentFactories {
  createSigns(): MenuSignsComponent;
  createDorothyWreck(): MenuSceneComponent;
  createDistantSeabed(sandTexture: Texture): MenuSceneComponent;
}

const DEFAULT_COMPONENT_FACTORIES: UnderwaterMenuComponentFactories = {
  createSigns: () => new MenuSigns(),
  createDorothyWreck: () => new SunkenDorothyWreck(),
  createDistantSeabed: (sandTexture) => new DistantSeabed(sandTexture),
};

export class UnderwaterMenuWorld {
  readonly root = new Group();
  readonly plants: UnderwaterPlantField;
  readonly particles: UnderwaterParticles;
  readonly lightShafts: UnderwaterLightShafts;
  readonly sharks: readonly [MenuSharkActor, MenuSharkActor];
  readonly fishSchools: readonly [Group, Group];
  readonly fish: readonly MenuFishActor[];
  readonly actors: UnderwaterMenuActors;

  private readonly signRaycaster = new Raycaster();
  private readonly signPointer = new Vector2();
  private readonly signIntersections: Intersection[] = [];
  private readonly modelInstances: MenuModelInstance[] = [];
  private readonly components: MenuSceneComponent[] = [];
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly causticMaterial: ShaderMaterial;
  private readonly menuBackground = new Color(0x071b24);
  private readonly menuFog = new FogExp2(0x0b3440, 0.022);
  private readonly previousBackground: Scene['background'];
  private readonly previousFog: Scene['fog'];
  private readonly previousCameraPosition: Vector3;
  private readonly previousCameraQuaternion: Quaternion;
  private readonly hadCameraFixedFlag: boolean;
  private readonly previousCameraFixed: unknown;
  private readonly signs: MenuSignsComponent;
  private readonly signHitTargets: Mesh[];
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    models: ModelFactory,
    sand: MenuSandAssets,
    components: UnderwaterMenuComponentFactories = DEFAULT_COMPONENT_FACTORIES,
  ) {
    this.root.name = 'menu:underwater-world';

    let boat: MenuModelInstance;
    let groundModelRoots: Group[];
    let sharkOne: MenuModelInstance;
    let sharkTwo: MenuModelInstance;
    let fishSchools: readonly [Group, Group];
    let fish: readonly MenuFishActor[];
    let signs: MenuSignsComponent;
    let dorothy: MenuSceneComponent;
    let distantSeabed: MenuSceneComponent;
    try {
      boat = this.createModel(models, 'boat');
      const placementsByModelId: Record<
        MenuGroundPlacement['modelId'],
        MenuGroundPlacement[]
      > = {
        rockA: [],
        rockB: [],
        rockC: [],
        coral: [],
        seaweed: [],
        starfish: [],
        skull: [],
      };
      for (const placement of MENU_MODEL_PLACEMENTS) {
        placementsByModelId[placement.modelId].push(placement);
      }
      groundModelRoots = [];
      for (const modelId of MENU_GROUND_MODEL_IDS) {
        for (const placement of placementsByModelId[modelId]) {
          const groundModel = this.createModel(models, modelId);
          this.placeModel(groundModel.root, placement.id, placement);
          groundModelRoots.push(groundModel.root);
        }
      }
      sharkOne = this.createModel(models, 'shark');
      sharkTwo = this.createModel(models, 'shark');
      const firstFishSchool = this.createFishSchool(models, 0);
      const secondFishSchool = this.createFishSchool(models, 1);
      fishSchools = [firstFishSchool.root, secondFishSchool.root];
      fish = [...firstFishSchool.fish, ...secondFishSchool.fish];
      signs = components.createSigns();
      this.components.push(signs);
      dorothy = components.createDorothyWreck();
      this.components.push(dorothy);
      distantSeabed = components.createDistantSeabed(sand.smooth);
      this.components.push(distantSeabed);
    } catch (error) {
      this.rollbackConstruction();
      throw error;
    }
    this.signs = signs;
    this.signHitTargets = [signs.startHitTarget, signs.guideHitTarget];

    this.placeModel(boat.root, 'boat', MENU_PLACEMENT.boat);

    sharkOne.root.name = 'menu:shark-1';
    sharkTwo.root.name = 'menu:shark-2';
    const sharkOneClip = sharkOne.animations.find(({ name }) => name === 'Armature|Swim');
    const sharkTwoClip = sharkTwo.animations.find(({ name }) => name === 'Armature|Swim');
    if (!sharkOneClip || !sharkTwoClip) {
      this.rollbackConstruction();
      throw new Error('Menu sharks require the Armature|Swim clip');
    }
    this.sharks = [
      { root: sharkOne.root, clip: sharkOneClip },
      { root: sharkTwo.root, clip: sharkTwoClip },
    ];
    this.fishSchools = fishSchools;
    this.fish = fish;

    this.plants = new UnderwaterPlantField();
    this.particles = new UnderwaterParticles();
    this.lightShafts = new UnderwaterLightShafts();
    const seabed = this.createSeabed(sand);
    const storyProps = this.createStoryProps();
    const caustic = this.createCausticOverlay();
    this.causticMaterial = caustic.material;

    const hemisphereLight = new HemisphereLight(0x8dc6cf, 0x10221f, 1.8);
    hemisphereLight.name = 'menu:hemisphere-light';
    const directionalLight = new DirectionalLight(0xb7e1e5, 2.35);
    directionalLight.name = 'menu:directional-light';
    directionalLight.position.set(-5.5, 8.5, 3.2);

    this.root.add(
      seabed,
      boat.root,
      ...groundModelRoots,
      signs.root,
      dorothy.root,
      distantSeabed.root,
      sharkOne.root,
      sharkTwo.root,
      ...fishSchools,
      storyProps,
      this.plants.root,
      this.lightShafts.root,
      this.particles.root,
      caustic.mesh,
      hemisphereLight,
      directionalLight,
    );
    enableItemAmbientOcclusionOccluder(this.root);

    this.actors = {
      sharks: this.sharks,
      fishSchools: this.fishSchools,
      fish: this.fish,
      setPlantTime: (time) => this.plants.setTime(time),
      setBubbleTime: (time) => this.particles.setBubbleTime(time),
      setMatterTime: (time) => {
        this.particles.setMatterTime(time);
        this.causticMaterial.uniforms.uTime!.value = time;
      },
      setLightTime: (time) => this.lightShafts.setTime(time),
      setCausticStrength: (strength) => {
        this.causticMaterial.uniforms.uStrength!.value = strength;
      },
    };

    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    this.previousCameraPosition = camera.position.clone();
    this.previousCameraQuaternion = camera.quaternion.clone();
    this.hadCameraFixedFlag = Object.prototype.hasOwnProperty.call(
      camera.userData,
      'menuCameraFixed',
    );
    this.previousCameraFixed = camera.userData.menuCameraFixed;

    scene.background = this.menuBackground;
    scene.fog = this.menuFog;
    camera.position.set(...MENU_CAMERA_POSITION);
    camera.lookAt(
      MENU_CAMERA_TARGET[0],
      MENU_CAMERA_TARGET[1],
      MENU_CAMERA_TARGET[2],
    );
    camera.userData.menuCameraFixed = true;
    scene.add(this.root);
  }

  getMenuSignActionAt(ndcX: number, ndcY: number): MenuSignAction | null {
    if (this.disposed) return null;
    this.signPointer.set(ndcX, ndcY);
    this.signRaycaster.setFromCamera(this.signPointer, this.camera);
    this.signIntersections.length = 0;
    this.signRaycaster.intersectObjects(
      this.signHitTargets,
      false,
      this.signIntersections,
    );
    const hit = this.signIntersections[0]?.object;
    if (hit === this.signs.startHitTarget) return 'start';
    if (hit === this.signs.guideHitTarget) return 'guide';
    return null;
  }

  setMenuSignHighlighted(action: MenuSignAction, active: boolean): void {
    if (action === 'start') this.signs.setStartHighlighted(active);
    else this.signs.setGuideHighlighted(active);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const cleanupSteps: Array<() => void> = [
      () => this.root.removeFromParent(),
      ...this.modelInstances.map((instance) => () => instance.dispose()),
    ];
    for (let index = this.components.length - 1; index >= 0; index -= 1) {
      cleanupSteps.push(() => this.components[index]!.dispose());
    }
    cleanupSteps.push(
      () => this.plants.dispose(),
      () => this.lightShafts.dispose(),
      () => this.particles.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
      () => this.restoreSceneState(),
    );
    runCleanupSteps(cleanupSteps);
  }

  private createModel(models: ModelFactory, id: MenuModelId): MenuModelInstance {
    const instance = models.create(id);
    this.modelInstances.push(instance);
    return instance;
  }

  private rollbackConstruction(): void {
    for (let index = this.components.length - 1; index >= 0; index -= 1) {
      ignoreCleanupError(() => this.components[index]!.dispose());
    }
    for (const instance of this.modelInstances) {
      ignoreCleanupError(() => instance.dispose());
    }
  }

  private createFishSchool(
    models: ModelFactory,
    schoolIndex: number,
  ): { readonly root: Group; readonly fish: readonly MenuFishActor[] } {
    const school = new Group();
    const actors: MenuFishActor[] = [];
    school.name = `menu:fish-school-${schoolIndex + 1}`;
    for (let fishIndex = 0; fishIndex < 6; fishIndex += 1) {
      const instance = this.createModel(models, 'redSnapper');
      const clip = instance.animations.find(({ name }) => name === 'Armature|Swim');
      if (!clip) throw new Error('Menu fish require the Armature|Swim clip');
      const slot = new Group();
      slot.name = `menu:fish-school-${schoolIndex + 1}-fish-${fishIndex + 1}`;
      slot.position.set(
        (fishIndex - 2.5) * 0.72,
        ((fishIndex + schoolIndex) % 3 - 1) * 0.34,
        (fishIndex % 2) * 0.8 - 0.4,
      );
      slot.add(instance.root);
      school.add(slot);
      actors.push({ root: instance.root, clip });
    }
    return { root: school, fish: actors };
  }

  private placeModel(
    root: Group,
    name: string,
    placement: {
      readonly position: readonly [number, number, number];
      readonly rotation: readonly [number, number, number];
    },
  ): void {
    root.name = `menu:${name}`;
    root.position.set(...placement.position);
    root.rotation.set(...placement.rotation);
  }

  private createSeabed(
    sand: MenuSandAssets,
  ): Mesh<PlaneGeometry, MeshStandardMaterial> {
    const geometry = new PlaneGeometry(140, 100, 56, 42);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position') as BufferAttribute;
    const color = new Float32BufferAttribute(position.count * 3, 3);
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const height = menuSeabedHeight(
        x + MENU_SEABED_POSITION[0],
        z + MENU_SEABED_POSITION[2],
      ) - MENU_SEABED_POSITION[1];
      position.setY(index, height);
      const shade = 0.88 + Math.sin(x * 0.31 + z * 0.19) * 0.055
        + Math.cos(z * 0.47) * 0.035;
      color.setXYZ(index, 0.46 * shade, 0.43 * shade, 0.33 * shade);
    }
    position.needsUpdate = true;
    geometry.setAttribute('color', color);
    geometry.computeVertexNormals();
    const material = createMenuSeabedMaterial(sand);
    this.ownedGeometries.add(geometry);
    this.ownedMaterials.add(material);
    const seabed = new Mesh(geometry, material);
    seabed.name = 'menu:seabed';
    seabed.position.set(...MENU_SEABED_POSITION);
    seabed.receiveShadow = true;
    return seabed;
  }

  private createStoryProps(): Group {
    const root = new Group();
    root.name = 'menu:boat-debris';
    const plankGeometry = new BoxGeometry(1.45, 0.11, 0.27);
    const woodMaterial = new MeshStandardMaterial({
      color: 0x654735,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });
    this.ownedGeometries.add(plankGeometry);
    this.ownedMaterials.add(woodMaterial);
    const plankPositions = [
      [-2.15, -0.1, -3.95, -0.25],
      [2.2, -0.08, -4.7, 0.42],
      [1.2, -0.17, -6.15, -0.65],
    ] as const;
    for (let index = 0; index < plankPositions.length; index += 1) {
      const [x, y, z, yaw] = plankPositions[index]!;
      const plank = new Mesh(plankGeometry, woodMaterial);
      plank.name = `menu:broken-plank-${index + 1}`;
      plank.position.set(x, y, z);
      plank.rotation.set(index * 0.07, yaw, index * -0.05);
      root.add(plank);
    }

    const ropePath = new CatmullRomCurve3([
      new Vector3(-1.15, 0.02, -4.05),
      new Vector3(-0.7, -0.08, -3.58),
      new Vector3(-0.15, -0.11, -3.82),
      new Vector3(0.38, -0.05, -3.42),
    ]);
    const ropeGeometry = new TubeGeometry(ropePath, 14, 0.035, 5, false);
    const ropeMaterial = new MeshStandardMaterial({
      color: 0x7b6950,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    this.ownedGeometries.add(ropeGeometry);
    this.ownedMaterials.add(ropeMaterial);
    const ropeGroup = new Group();
    ropeGroup.name = 'menu:curved-rope';
    const rope = new Mesh(ropeGeometry, ropeMaterial);
    rope.name = 'menu:curved-rope-mesh';
    ropeGroup.add(rope);
    root.add(ropeGroup);
    return root;
  }

  private createCausticOverlay(): {
    readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
    readonly material: ShaderMaterial;
  } {
    const geometry = new PlaneGeometry(139.5, 99.5, 1, 1);
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStrength: { value: 0.86 },
      },
      vertexShader: CAUSTIC_VERTEX_SHADER,
      fragmentShader: CAUSTIC_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.ownedGeometries.add(geometry);
    this.ownedMaterials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.name = 'menu:caustic-overlay';
    mesh.position.set(0, -0.245, -25);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    return { mesh, material };
  }

  private restoreSceneState(): void {
    if (this.scene.background === this.menuBackground) {
      this.scene.background = this.previousBackground;
    }
    if (this.scene.fog === this.menuFog) this.scene.fog = this.previousFog;
    this.camera.position.copy(this.previousCameraPosition);
    this.camera.quaternion.copy(this.previousCameraQuaternion);
    if (this.hadCameraFixedFlag) {
      this.camera.userData.menuCameraFixed = this.previousCameraFixed;
    } else {
      delete this.camera.userData.menuCameraFixed;
    }
  }
}
