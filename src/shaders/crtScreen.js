import * as THREE from 'three';

/**
 * Phosphor CRT Terminal Shader Material for CRT_Screen.
 * Supports smooth phosphor scanlines, barrel curvature vignette, rolling refresh bar,
 * and emergency crimson shift when Survival Mode activates.
 *
 * @param {THREE.Texture} [screenTexture] Optional canvas texture from createCRTScreenTexture()
 */
export function createCRTScreenMaterial(screenTexture = null) {
  const uniforms = {
    uTime: { value: 0 },
    uSurvival: { value: 0 },
    uMap: { value: screenTexture },
    uHasMap: { value: screenTexture ? 1.0 : 0.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSurvival;
      uniform sampler2D uMap;
      uniform float uHasMap;

      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        // Subtle CRT glass barrel curvature
        vec2 centered = vUv * 2.0 - 1.0;
        vec2 curved = centered * (1.0 + dot(centered, centered) * 0.085);
        vec2 uv = curved * 0.5 + 0.5;

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.015, 0.018, 0.016, 1.0);
          return;
        }

        // Occasional subtle glitch horizontal tear (stronger in Survival Mode)
        float tearGate = step(0.985 - uSurvival * 0.035, hash(vec2(floor(uTime * 14.0), floor(uv.y * 24.0))));
        float tearOffset = (hash(vec2(uTime, uv.y)) - 0.5) * 0.045 * tearGate;
        vec2 sampleUv = vec2(clamp(uv.x + tearOffset, 0.0, 1.0), uv.y);

        vec3 baseCol;
        if (uHasMap > 0.5) {
          // Chromatic phosphor fringe
          float fr = 0.003 + uSurvival * 0.004;
          float r = texture2D(uMap, vec2(min(1.0, sampleUv.x + fr), sampleUv.y)).r;
          float g = texture2D(uMap, sampleUv).g;
          float b = texture2D(uMap, vec2(max(0.0, sampleUv.x - fr), sampleUv.y)).b;
          baseCol = vec3(r, g, b);
        } else {
          baseCol = mix(vec3(0.14, 0.52, 0.24), vec3(0.68, 0.12, 0.12), uSurvival);
        }

        // Tint shift between eerie green phosphor & emergency crimson survival mode
        vec3 idleTint = vec3(0.75, 1.18, 0.82);
        vec3 survTint = vec3(1.38, 0.34, 0.3);
        vec3 col = baseCol * mix(idleTint, survTint, uSurvival);

        // Fine scanlines + rolling vertical hum bar
        float scan = 0.84 + 0.16 * sin(uv.y * 240.0 + uTime * 3.0);
        float humPos = fract(uTime * (0.22 + uSurvival * 0.38));
        float humBand = exp(-pow((uv.y - humPos) * 14.0, 2.0)) * 0.22;

        // Subtle CRT static grain
        float grain = (hash(uv * 320.0 + fract(uTime * 19.0)) - 0.5) * (0.06 + uSurvival * 0.07);

        // Edge glass shadow vignette
        float vig = smoothstep(1.32, 0.28, length(centered));

        col = (col + humBand * mix(vec3(0.2, 0.8, 0.35), vec3(0.95, 0.18, 0.16), uSurvival) + grain) * scan * vig;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  material.userData = {
    isSurvival: false,
    update(delta) {
      uniforms.uTime.value += delta;
      const target = material.userData.isSurvival ? 1.0 : 0.0;
      uniforms.uSurvival.value += (target - uniforms.uSurvival.value) * Math.min(1, delta * 6.0);
    },
    setSurvivalMode(active) {
      material.userData.isSurvival = Boolean(active);
      uniforms.uSurvival.value = active ? 1.0 : 0.0;
    },
    setMap(tex) {
      uniforms.uMap.value = tex;
      uniforms.uHasMap.value = tex ? 1.0 : 0.0;
    },
  };

  return material;
}
