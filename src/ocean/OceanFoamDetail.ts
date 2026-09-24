import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping } from 'three';
import { FOAM_DETAIL_BASE64, FOAM_DETAIL_SIZE } from '../assets/ocean/foamDetail.generated';

/** Each ocean owns one reusable texture; decoding happens only at construction. */
export function createOceanFoamDetail(): DataTexture {
  const source = atob(FOAM_DETAIL_BASE64);
  const bytes = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i);
  const texture = new DataTexture(bytes, FOAM_DETAIL_SIZE, FOAM_DETAIL_SIZE);
  texture.name = 'ocean-foam-detail';
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
  texture.generateMipmaps = true; texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
