import { CLOUD_GROUP_COUNT, CLOUD_RINGS } from './cloudImpostorLayout';

// Analytic cloud impostors: surface depth and normals, with no density ray march or cloud textures.
export const cloudImpostorShader = `
  uniform float uCloudTime;
  uniform vec4 uCloudCenters[${CLOUD_GROUP_COUNT}];
  uniform vec4 uCloudScales[${CLOUD_GROUP_COUNT}];
  uniform vec4 uCloudBlockers[${CLOUD_GROUP_COUNT}];
  uniform vec4 uCloudQueryRings[${CLOUD_RINGS.length}];
  uniform int uCloudQueryCount;

  struct CloudSurface {
    float distance;
    vec3 normal;
    float alpha;
    float body;
    int group;
  };

  CloudSurface emptyCloudSurface() {
    return CloudSurface(10000.0, vec3(0.0, 1.0, 0.0), 0.0, 0.0, -1);
  }

  void cloudBillow(
    vec3 ray, vec3 center, vec3 radii, float pixelWidth, inout CloudSurface surface
  ) {
    vec3 origin = -center / radii;
    vec3 scaledRay = ray / radii;
    float a = dot(scaledRay, scaledRay);
    float closest = -dot(origin, scaledRay) / a;
    vec3 impact = origin + scaledRay * closest;
    float radialDistance = dot(impact, impact);
    if (closest <= 0.0 || radialDistance > 1.40) return;

    float footprint = pixelWidth * closest / min(radii.x, min(radii.y, radii.z));
    float detail = 1.0 - smoothstep(0.012, 0.060, footprint);
    vec3 noisePoint = impact * 5.0 + center * 3.1 + vec3(0.0, uCloudTime * 0.006, 0.0);
    float broadNoise = cloudValueNoise3D(noisePoint);
    float fineNoise = cloudValueNoise3D(noisePoint * 2.7 + 7.1);
    float boundary = 0.96 + (broadNoise - 0.5) * 0.56
      + (fineNoise - 0.5) * 0.18 * detail;
    float inside = boundary - radialDistance;
    float edgeWidth = 0.026 + footprint * 1.2;
    float alpha = smoothstep(-edgeWidth, edgeWidth, inside);
    if (alpha <= 0.0) return;

    float distance = closest - sqrt(max(inside, 0.0) / a);
    vec3 normal = normalize((origin + scaledRay * distance) / radii);
    // Blend overlapping lobes into a single cloud surface instead of separate smooth balls.
    float blendWidth = min(radii.x, radii.z) * 0.45;
    float weight = clamp(0.5 + 0.5 * (surface.distance - distance) / blendWidth, 0.0, 1.0);
    surface.normal = normalize(mix(surface.normal, normal, weight));
    surface.body = mix(surface.body, broadNoise * 0.65 + fineNoise * 0.35, weight);
    surface.distance = mix(surface.distance, distance, weight)
      - blendWidth * weight * (1.0 - weight);
    surface.alpha = max(surface.alpha, alpha);
  }

  CloudSurface cloudGroup(vec3 ray, int index, vec3 expansion, float pixelWidth, float limit) {
    CloudSurface surface = emptyCloudSurface();
    vec4 group = uCloudCenters[index];
    float opacity = uCloudScales[index].w;
    if (opacity <= 0.0) return surface;
    vec3 scale = uCloudScales[index].xyz * expansion;
    float closest = dot(ray, group.xyz);
    float bound = max(scale.x, max(scale.y, scale.z)) * 2.1;
    if (closest <= 0.0 || closest - bound > limit
      || dot(group.xyz, group.xyz) - closest * closest > bound * bound) {
      return surface;
    }
    float shape = group.w;
    cloudBillow(ray, group.xyz + vec3(-0.38, -0.10, 0.20) * scale,
      vec3(0.76, 0.46, 0.66) * scale, pixelWidth, surface);
    cloudBillow(ray, group.xyz + vec3(-0.72, 0.25 + shape * 0.22, -0.12) * scale,
      vec3(0.58, 0.58, 0.59) * scale, pixelWidth, surface);
    cloudBillow(ray, group.xyz + vec3(-0.12 + shape * 0.24, 0.46, -0.30) * scale,
      vec3(0.66, 0.83 + shape * 0.20, 0.66) * scale, pixelWidth, surface);
    cloudBillow(ray, group.xyz + vec3(0.60, 0.28 - shape * 0.14, 0.02) * scale,
      vec3(0.68, 0.67, 0.70) * scale, pixelWidth, surface);
    cloudBillow(ray, group.xyz + vec3(0.26, 0.14, -0.74) * scale,
      vec3(0.62, 0.60, 0.66) * scale, pixelWidth, surface);
    cloudBillow(ray, group.xyz + vec3(0.18, -0.02, 0.48) * scale,
      vec3(0.62, 0.40, 0.56) * scale, pixelWidth, surface);
    surface.alpha *= opacity;
    surface.group = index;
    return surface;
  }

  float cloudShadow(vec3 point, vec3 sun, int ownGroup, vec3 expansion) {
    float light = 1.0;
    vec4 blockers = uCloudBlockers[ownGroup];
    for (int slot = 0; slot < 4; slot++) {
      int index = int(blockers[slot]);
      if (index < 0) continue;
      vec4 group = uCloudCenters[index];
      float opacity = uCloudScales[index].w;
      if (opacity <= 0.0) continue;
      vec3 radii = uCloudScales[index].xyz * vec3(1.28, 0.84, 1.06) * expansion;
      vec3 origin = (point - group.xyz) / radii;
      vec3 ray = sun / radii;
      float a = dot(ray, ray);
      float nearest = -dot(origin, ray) / a;
      if (nearest <= 0.0) continue;
      vec3 impact = origin + ray * nearest;
      float thickness = max(0.0, 1.0 - dot(impact, impact));
      light *= 1.0 - opacity * smoothstep(0.0, 0.8, thickness) * 0.72;
      if (light < 0.12) break;
    }
    return light;
  }

  vec3 shadeCloud(CloudSurface surface, vec3 ray, vec3 sun, float storm, vec3 expansion) {
    vec3 point = ray * surface.distance;
    float shadow = cloudShadow(point, sun, surface.group, expansion);
    vec3 detailPoint = point / uCloudScales[surface.group].xyz * 3.5;
    float relief = cloudValueNoise3D(detailPoint);
    vec3 gradient = vec3(
      cloudValueNoise3D(detailPoint + vec3(0.12, 0.0, 0.0)),
      cloudValueNoise3D(detailPoint + vec3(0.0, 0.12, 0.0)),
      cloudValueNoise3D(detailPoint + vec3(0.0, 0.0, 0.12))
    ) - relief;
    vec3 normal = normalize(surface.normal - gradient * 3.0);
    float direct = max(dot(normal, sun), 0.0) * shadow;
    float light = clamp(0.20 + normal.y * 0.14 + direct * 0.78
      + (surface.body - 0.5) * 0.18, 0.0, 1.0);
    vec3 underside = mix(vec3(0.20, 0.29, 0.37), vec3(0.07, 0.11, 0.15), storm);
    vec3 litCloud = mix(vec3(0.98, 0.97, 0.92), vec3(0.64, 0.68, 0.69), storm);
    vec3 color = mix(underside, litCloud, light);
    float rim = pow(1.0 - abs(dot(surface.normal, ray)), 3.0);
    color += uSunColor * uSunVisibility * rim
      * pow(max(dot(ray, sun), 0.0), 6.0) * 0.24;
    float haze = 1.0 - exp(-surface.distance * (0.018 + uHaze * 0.028));
    return mix(color, uHorizonColor, min(haze, 0.85));
  }

  vec4 cloudLayer(vec3 direction) {
    float pixelWidth = length(fwidth(direction));
    if (uCloudCoverage <= 0.0 || direction.y <= 0.0) {
      return vec4(0.0);
    }
    float angle = uCloudTime * 0.0012;
    mat2 wind = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec3 ray = vec3(wind * direction.xz, direction.y).xzy;
    vec3 sun = vec3(wind * uSunDirection.xz, uSunDirection.y).xzy;
    float storm = smoothstep(0.48, 0.88, uCloudCoverage);
    vec3 expansion = mix(vec3(1.0), vec3(2.1, 1.40, 2.1), storm);
    CloudSurface front = emptyCloudSurface();
    CloudSurface back = emptyCloudSurface();
    float azimuth = atan(ray.x, -ray.z);
    // A uniform bound keeps the compiler from expanding the expensive query body per ring or slot.
    // Nearby rings surround the view; far rings use five sectors facing the viewing ray.
    int ringIndex = 0;
    int slot = 0;
    vec4 ring = uCloudQueryRings[0];
    int sector = int(floor((azimuth - ring.z) * ring.w));
    for (int query = 0; query < uCloudQueryCount; query++) {
      if (slot >= (ringIndex < 2 ? int(ring.y) : 5)) {
        ringIndex++;
        slot = 0;
        ring = uCloudQueryRings[ringIndex];
        sector = int(floor((azimuth - ring.z) * ring.w));
      }
      int index = int(ring.x) + int(mod(float(sector + slot - 2), ring.y));
      slot++;
      float limit = front.alpha >= 0.999 ? front.distance : 10000.0;
      CloudSurface candidate = cloudGroup(ray, index, expansion, pixelWidth, limit);
      if (candidate.alpha <= 0.0) continue;
      if (candidate.distance < front.distance) {
        back = front;
        front = candidate;
      } else if (candidate.distance < back.distance) {
        back = candidate;
      }
    }
    if (front.alpha <= 0.0) return vec4(0.0);
    vec3 color = shadeCloud(front, ray, sun, storm, expansion) * front.alpha;
    float alpha = front.alpha;
    if (back.alpha > 0.0 && front.alpha < 0.999) {
      float behind = back.alpha * (1.0 - front.alpha);
      color += shadeCloud(back, ray, sun, storm, expansion) * behind;
      alpha += behind;
    }
    color /= max(alpha, 0.0001);
    alpha *= smoothstep(0.0, 0.025, direction.y);
    return vec4(color, alpha);
  }
`;
