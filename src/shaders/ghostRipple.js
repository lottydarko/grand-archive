import * as THREE from 'three';

/**
 * Unkillable Archive Ghost Phase-Ripple Shader Material.
 * Renders a translucent draped shadow with ghostly Fresnel edges, drifting spectral wisps,
 * and an expanding world-space phase-ripple wave whenever bullets or knife slashes pass through.
 */
export function createGhostRippleMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uHitPoint: { value: new THREE.Vector3(0, -100, 0) },
    uRippleProgress: { value: 2.0 }, // >= 1.0 means idle
    uBaseColor: { value: new THREE.Color(0x0c0e17) },
    uRimColor: { value: new THREE.Color(0x52456e) },
    uRippleColor: { value: new THREE.Color(0xf2a83b) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uHitPoint;
      uniform float uRippleProgress;

      varying vec3 vWorldPos;
      varying vec3 vNormalWorld;
      varying vec2 vUv;
      varying float vRippleWave;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Subtle ethereal floating drape sway
        float drape = sin(uTime * 2.2 + pos.y * 3.2 + pos.x * 4.0) * 0.035 * (1.0 - smoothstep(1.4, 2.3, pos.y));
        pos.x += drape;
        pos.z += cos(uTime * 1.9 + pos.y * 2.8) * 0.028 * (1.0 - smoothstep(1.4, 2.3, pos.y));

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        float wave = 0.0;

        // Expanding spherical phase-ripple displacement when shot or slashed
        if (uRippleProgress < 1.0) {
          float dist = distance(worldPos.xyz, uHitPoint);
          float ringRadius = uRippleProgress * 2.4;
          float band = exp(-pow((dist - ringRadius) * 4.5, 2.0));
          float fade = 1.0 - uRippleProgress;
          wave = sin((dist - ringRadius) * 26.0) * band * fade;
          worldPos.xyz += normalize(mat3(modelMatrix) * normal) * wave * 0.14;
        }

        vRippleWave = wave;
        vWorldPos = worldPos.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uHitPoint;
      uniform float uRippleProgress;
      uniform vec3 uBaseColor;
      uniform vec3 uRimColor;
      uniform vec3 uRippleColor;

      varying vec3 vWorldPos;
      varying vec3 vNormalWorld;
      varying vec2 vUv;
      varying float vRippleWave;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 N = normalize(vNormalWorld);
        float fresnel = pow(1.0 - abs(dot(N, viewDir)), 2.2);

        // Spectral misty vertical flicker
        float mist = 0.5 + 0.5 * sin(vWorldPos.y * 6.5 - uTime * 3.1 + sin(vWorldPos.x * 5.0));

        vec3 col = mix(uBaseColor, uRimColor, fresnel * 0.85 + mist * 0.14);
        float alpha = clamp(0.36 + fresnel * 0.44 + mist * 0.08, 0.18, 0.86);

        // Phase-ripple amber shock ring as weapons pass harmlessly through
        if (uRippleProgress < 1.0) {
          float dist = distance(vWorldPos, uHitPoint);
          float ringRadius = uRippleProgress * 2.4;
          float band = exp(-pow((dist - ringRadius) * 5.2, 2.0)) * (1.0 - uRippleProgress);
          float shimmer = abs(vRippleWave) * 2.2 + band * 1.35;
          col = mix(col, uRippleColor, clamp(shimmer, 0.0, 0.92));
          alpha = clamp(alpha - band * 0.25 + shimmer * 0.28, 0.15, 0.95);
        }

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  material.userData = {
    update(delta) {
      uniforms.uTime.value += delta;
      if (uniforms.uRippleProgress.value < 1.0) {
        uniforms.uRippleProgress.value = Math.min(1.0, uniforms.uRippleProgress.value + delta * 1.9);
      }
    },
    triggerHitRipple(hitPoint) {
      if (hitPoint) {
        uniforms.uHitPoint.value.copy(hitPoint);
      }
      uniforms.uRippleProgress.value = 0.0;
    },
  };

  return material;
}
