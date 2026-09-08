import { Float32BufferAttribute, Matrix3, Mesh, Vector3, type Group, type MeshStandardMaterial } from 'three';
import { PLAYER_BODY_HEIGHT } from '../player/collisions';
import { FREIGHTER_DIMENSIONS, SHIP_TRANSVERSE_PORTHOLE_CENTER_X } from './ShipLayoutTypes';

const declarations = `
  varying vec3 vRoomWearPosition;
  varying vec4 vRoomWearPanel;
  varying vec2 vRoomWearFeatures;
  varying vec2 vRoomWearSurface;
`;

/** Layer paint loss over the existing texture and water film, in ship coordinates. */
export function applyShipRoomWear(material: MeshStandardMaterial, metal: boolean): void {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 roomWearPosition;
        attribute vec4 roomWearPanel;
        attribute vec2 roomWearFeatures;
        attribute vec2 roomWearSurface;
        ${declarations}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRoomWearPosition = roomWearPosition;
        vRoomWearPanel = roomWearPanel;
        vRoomWearFeatures = roomWearFeatures;
        vRoomWearSurface = roomWearSurface;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${declarations}
        float roomHash(vec2 p) {
          vec3 h = fract(vec3(p.xyx) * 0.1031);
          h += dot(h, h.yzx + 33.33);
          return fract((h.x + h.y) * h.z);
        }
        float roomNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(roomHash(cell), roomHash(cell + vec2(1.0, 0.0)), f.x),
            mix(roomHash(cell + vec2(0.0, 1.0)), roomHash(cell + vec2(1.0)), f.x), f.y);
        }
        float roomGradientDot(vec2 cell, vec2 offset) {
          float hash = roomHash(cell);
          vec2 gradient = vec2(hash, fract(hash * 7.13)) * 2.0 - 1.0;
          return dot(gradient, offset);
        }
        // Gradient noise removes the square plateaus of thresholded value noise.
        float roomFlakeNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          vec2 blend = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          float lower = mix(roomGradientDot(cell, f),
            roomGradientDot(cell + vec2(1.0, 0.0), f - vec2(1.0, 0.0)), blend.x);
          float upper = mix(roomGradientDot(cell + vec2(0.0, 1.0), f - vec2(0.0, 1.0)),
            roomGradientDot(cell + vec2(1.0), f - vec2(1.0)), blend.x);
          return clamp(0.5 + 1.3 * mix(lower, upper, blend.y), 0.0, 1.0);
        }
      `)
      // Run after the wet surface hook. Bare wood and rust retain a rough finish.
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (vRoomWearPanel.z > 0.0) {
          vec2 panel = vRoomWearPanel.xy;
          vec2 edgeDistance = min(panel, vRoomWearPanel.zw - panel);
          float edge = max(0.0, min(edgeDistance.x, edgeDistance.y));
          float horizontal = step(0.5, abs(vRoomWearFeatures.x));
          float ceiling = step(vRoomWearFeatures.x, -0.5);
          vec3 p = vRoomWearPosition;
          vec2 surface = vRoomWearSurface;
          float broad = roomNoise(surface * 1.6);
          float flakes = roomFlakeNoise(surface * 26.0 + broad * 3.0);
          float grain = roomNoise(surface * vec2(85.0, 9.0));
          float edgeWear = (1.0 - smoothstep(0.015, 0.12 + broad * 0.36, edge))
            * (0.4 + broad * 0.6);
          float roof = horizontal * (1.0 - ceiling) * ${metal ? '1.0' : '0.0'};
          vec2 sheetDistance = abs(fract(surface / vec2(1.35, 3.6) + vec2(0.17, 0.23)) - 0.5)
            * vec2(1.35, 3.6);
          float seamDistance = min(sheetDistance.x, sheetDistance.y);
          float seam = roof * (1.0 - smoothstep(0.005, 0.015, seamDistance));
          float seamWear = roof * (1.0 - smoothstep(0.015, 0.13, seamDistance))
            * smoothstep(0.3, 0.75, broad);
          float foot = (1.0 - horizontal) * (1.0 - smoothstep(0.02, 0.48,
            p.y - ${FREIGHTER_DIMENSIONS.deckY.toFixed(3)}));
          float runs = smoothstep(0.52, 0.8,
            roomNoise(vec2(surface.x * 13.0, surface.y * 0.65)));
          float topRun = (1.0 - horizontal)
            * (1.0 - smoothstep(0.05, 1.25, vRoomWearPanel.w - panel.y)) * runs;
          // Runoff starts at the lower porthole rim, not in the middle of a wall.
          float windowX = abs(abs(p.x) - ${SHIP_TRANSVERSE_PORTHOLE_CENTER_X.toFixed(3)});
          float belowWindow = ${ (FREIGHTER_DIMENSIONS.deckY + PLAYER_BODY_HEIGHT - 0.48).toFixed(3)} - p.y;
          float windowRun = (1.0 - smoothstep(0.35, 0.72, windowX))
            * smoothstep(-0.06, 0.06, belowWindow)
            * (1.0 - smoothstep(0.1, 1.35, belowWindow)) * (0.25 + runs * 0.75)
            * step(0.5, vRoomWearFeatures.y) * (1.0 - step(1.5, vRoomWearFeatures.y));
          float sillRun = step(1.5, vRoomWearFeatures.y) * topRun;
          float damp = max(max(topRun * 0.48, foot * (0.3 + broad * 0.4)),
            max(windowRun * 0.8, sillRun * 0.65));
          damp = max(damp, horizontal * edgeWear * (0.25 + broad * 0.55));
          float leak = ceiling * (1.0 - smoothstep(0.15, 1.6, edge))
            * smoothstep(0.35, 0.67, broad);
          damp = max(damp, leak * 0.85);
          float wearSignal = flakes * 0.44 + grain * 0.09 + broad * 0.22
            + max(edgeWear, seamWear) * 0.42 + foot * 0.17 + damp * 0.12;
          float feather = max(0.07, fwidth(wearSignal) * 0.75);
          float loss = smoothstep(0.6 - feather, 0.6 + feather, wearSignal);
          loss *= mix(1.0, 0.42, ceiling);
          vec3 substrate = ${metal
            ? 'mix(vec3(0.105, 0.043, 0.019), vec3(0.31, 0.13, 0.045), grain)'
            : 'mix(vec3(0.09, 0.057, 0.031), vec3(0.27, 0.18, 0.10), grain)'};
          vec3 oldPaint = diffuseColor.rgb * mix(vec3(0.78, 0.75, 0.65), vec3(1.03, 1.0, 0.91), broad);
          oldPaint *= 1.0 - damp * 0.45;
          oldPaint *= mix(vec3(1.0), vec3(0.67, 0.49, 0.28), leak * 0.6);
          oldPaint *= 1.0 - seam * 0.35;
          // Pale salt remains at the edge of dried runoff and exposed roof seams.
          float salt = (smoothstep(0.13, 0.22, edge) - smoothstep(0.22, 0.3, edge))
            * runs * (0.1 + horizontal * 0.14) * (1.0 - ceiling);
          diffuseColor.rgb = mix(oldPaint, substrate, loss);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.63, 0.60, 0.49), salt);
          roughnessFactor = mix(roughnessFactor, 0.96, max(loss, 0.22 + broad * 0.2));
          metalnessFactor *= 1.0 - loss;
        }
      `);
  };
  material.customProgramCacheKey = () => `${cacheKey}:room-wear-v2:${metal ? 'steel' : 'wood'}`;
}

function writeSurfaceProjection(
  surfaces: Float32Array, index: number, point: Vector3, normal: Vector3, horizontal: boolean,
): void {
  // Project along the wall tangent. Adding X and Z collapses 45-degree walls.
  const u = horizontal ? point.x
    : (point.x * normal.z - point.z * normal.x) / Math.hypot(normal.x, normal.z);
  surfaces.set([u, horizontal ? point.z : point.y], index * 2);
}

/** Bake once. Coordinates stay attached when the ship moves or sinks. */
export function prepareShipRoomWear(root: Group, materials: readonly MeshStandardMaterial[]): void {
  root.updateMatrixWorld(true);
  const point = new Vector3();
  const faceNormal = new Vector3();
  const normalMatrix = new Matrix3();
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !materials.includes(object.material)) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const coordinates = new Float32Array(position.count * 3);
    const panels = new Float32Array(position.count * 4);
    const features = new Float32Array(position.count * 2);
    const surfaces = new Float32Array(position.count * 2);
    const cabin = /wall-|wheelhouse-pane:|^door-wall:|roof|^cabin-/.test(object.name);
    const portholes = /^(crew-cabin|storage-workroom)-wall-(aft|forward)-/.test(object.name);
    const sill = object.name.startsWith('wheelhouse-pane:') && object.name.endsWith(':sill');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    normalMatrix.getNormalMatrix(object.matrixWorld);
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      const up = normal.getY(index);
      const horizontal = Math.abs(up) > 0.5;
      const uAxis = horizontal || Math.abs(normal.getZ(index)) >= Math.abs(normal.getX(index)) ? 'x' : 'z';
      const vAxis = horizontal ? 'z' : 'y';
      panels.set([
        point[uAxis] - bounds.min[uAxis], point[vAxis] - bounds.min[vAxis],
        cabin ? bounds.max[uAxis] - bounds.min[uAxis] : 0, bounds.max[vAxis] - bounds.min[vAxis],
      ], index * 4);
      point.applyMatrix4(object.matrixWorld);
      faceNormal.fromBufferAttribute(normal, index).applyNormalMatrix(normalMatrix);
      writeSurfaceProjection(surfaces, index, point, faceNormal, horizontal);
      coordinates.set([point.x, point.y, point.z], index * 3);
      features.set([up, portholes ? 1 : sill ? 2 : 0], index * 2);
    }
    geometry.setAttribute('roomWearPosition', new Float32BufferAttribute(coordinates, 3));
    geometry.setAttribute('roomWearPanel', new Float32BufferAttribute(panels, 4));
    geometry.setAttribute('roomWearFeatures', new Float32BufferAttribute(features, 2));
    geometry.setAttribute('roomWearSurface', new Float32BufferAttribute(surfaces, 2));
  });
}
