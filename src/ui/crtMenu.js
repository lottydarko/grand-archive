
import * as THREE from 'three';

// =============================================================================
// CRT MENU — The Grand Archive (Lotty's ruling, Nov 25, 2026: replaces the old
// menu law — "that first menu is horrible cookie cutter, this is blockbuster").
// Ported by Muse (Draft 1, real checkout) from Lotty's uploaded working
// prototype (the_grand_archive_ps2_crt_menu_prototype.html, three r128) to the
// repo's modern three as a self-contained module. Design, text, numbers and
// behavior are the prototype's, verbatim wherever the seam allows. Seams:
//  - reuses the game's renderer + canvas (prototype made its own);
//  - input acts only while the menu is visible (it shares the window with the
//    game); keyboard + mouse picking as prototyped;
//  - FILES slots read NO DATA: the game has no save system yet, and this build
//    does not fake one. NEW FILE launches the game via onEnterConfirmed;
//  - OPTIONS toggles persist to localStorage;
//  - the game's renderer tone mapping/exposure is saved on show() and
//    restored on hide(); the menu runs at the prototype's ACES 1.15.
// =============================================================================

export function createCrtMenu(renderer, { onEnterConfirmed, onSurvivalConfirmed } = {}) {
  const canvas = renderer.domElement;
  const statusReadout = { textContent: '' };
  let menuVisible = false;

      // =========================================================================
      // 1. WEB AUDIO SYNTHESIZER (CRT HUM, STATIC CRACKLE, STABS & GLITCH BURSTS)
      // =========================================================================
      let audioCtx = null;
      let humGain = null;
      let crackleGain = null;
      let audioEnabled = true;

      function initAudio() {
        if (audioCtx) {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          return;
        }
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioContextClass();

          // 60Hz CRT flyback transformer hum
          const humOsc = audioCtx.createOscillator();
          humOsc.type = 'sawtooth';
          humOsc.frequency.value = 60;

          const humFilter = audioCtx.createBiquadFilter();
          humFilter.type = 'lowpass';
          humFilter.frequency.value = 145;

          humGain = audioCtx.createGain();
          humGain.gain.value = 0.022 * appState.audioVolume;
          humOsc.connect(humFilter);
          humFilter.connect(humGain);
          humGain.connect(audioCtx.destination);
          humOsc.start();

          // Continuous high-voltage CRT static crackle bed
          const crackleLen = audioCtx.sampleRate * 3;
          const crackleBuf = audioCtx.createBuffer(1, crackleLen, audioCtx.sampleRate);
          const crackleData = crackleBuf.getChannelData(0);
          for (let i = 0; i < crackleLen; i++) {
            const rnd = Math.random();
            if (rnd > 0.996) {
              crackleData[i] = (Math.random() * 2 - 1) * (0.45 + Math.random() * 0.55);
            } else if (rnd > 0.984) {
              crackleData[i] = (Math.random() * 2 - 1) * 0.14;
            } else {
              crackleData[i] = (Math.random() * 2 - 1) * 0.012;
            }
          }

          const crackleSrc = audioCtx.createBufferSource();
          crackleSrc.buffer = crackleBuf;
          crackleSrc.loop = true;

          const crackleHp = audioCtx.createBiquadFilter();
          crackleHp.type = 'highpass';
          crackleHp.frequency.value = 2600;

          crackleGain = audioCtx.createGain();
          crackleGain.gain.value = 0.055 * appState.audioVolume;

          crackleSrc.connect(crackleHp);
          crackleHp.connect(crackleGain);
          crackleGain.connect(audioCtx.destination);
          crackleSrc.start();
        } catch (e) {}
      }

      function playRelayClick(freq = 210, dur = 0.045, vol = 0.08) {
        if (!audioEnabled || !audioCtx || audioCtx.state !== 'running') return;
        try {
          const now = audioCtx.currentTime;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          osc.frequency.exponentialRampToValueAtTime(55, now + dur);

          gain.gain.setValueAtTime(vol * appState.audioVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + dur);
        } catch (e) {}
      }

      function playGlitchBurstSound(intensity = 1.0) {
        if (!audioEnabled || !audioCtx || audioCtx.state !== 'running') return;
        try {
          const now = audioCtx.currentTime;
          const dur = 0.11;
          const bufLen = Math.floor(audioCtx.sampleRate * dur);
          const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < bufLen; i++) {
            const env = Math.pow(1.0 - i / bufLen, 1.6);
            const bitCrush = Math.floor((Math.random() * 2 - 1) * 4) / 4;
            d[i] = bitCrush * env;
          }
          const src = audioCtx.createBufferSource();
          src.buffer = buf;

          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1800 + Math.random() * 2200;
          bp.Q.value = 1.4;

          const g = audioCtx.createGain();
          g.gain.setValueAtTime(0.12 * intensity * appState.audioVolume, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + dur);

          src.connect(bp);
          bp.connect(g);
          g.connect(audioCtx.destination);
          src.start(now);
        } catch (e) {}
      }

      function playDiceClatter() {
        if (!audioEnabled || !audioCtx || audioCtx.state !== 'running') return;
        for (let b = 0; b < 4; b++) {
          setTimeout(() => playRelayClick(420 - b * 55, 0.035, 0.12 - b * 0.02), b * 115);
        }
      }

      // Synthesized wet metallic stabbing sound (blade transient + visceral squelch)
      function playStabSound(intensity = 1.0) {
        if (!audioEnabled || !audioCtx || audioCtx.state !== 'running') return;
        try {
          const now = audioCtx.currentTime;
          const vol = intensity * appState.audioVolume;

          const bladeOsc = audioCtx.createOscillator();
          const bladeGain = audioCtx.createGain();
          bladeOsc.type = 'sawtooth';
          bladeOsc.frequency.setValueAtTime(1450 + Math.random() * 250, now);
          bladeOsc.frequency.exponentialRampToValueAtTime(110, now + 0.085);

          bladeGain.gain.setValueAtTime(0.22 * vol, now);
          bladeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          bladeOsc.connect(bladeGain);
          bladeGain.connect(audioCtx.destination);
          bladeOsc.start(now);
          bladeOsc.stop(now + 0.095);

          const thudOsc = audioCtx.createOscillator();
          const thudGain = audioCtx.createGain();
          thudOsc.type = 'sine';
          thudOsc.frequency.setValueAtTime(135, now + 0.015);
          thudOsc.frequency.exponentialRampToValueAtTime(34, now + 0.19);

          thudGain.gain.setValueAtTime(0.32 * vol, now + 0.015);
          thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          thudOsc.connect(thudGain);
          thudGain.connect(audioCtx.destination);
          thudOsc.start(now + 0.015);
          thudOsc.stop(now + 0.21);

          const squelchDur = 0.24;
          const bufLen = Math.floor(audioCtx.sampleRate * squelchDur);
          const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < bufLen; i++) {
            const t = i / bufLen;
            const env = Math.sin(Math.min(1, t * 5) * Math.PI * 0.5) * Math.pow(1.0 - t, 1.5);
            d[i] = (Math.random() * 2 - 1) * env;
          }
          const noiseSrc = audioCtx.createBufferSource();
          noiseSrc.buffer = buf;

          const wetFilter = audioCtx.createBiquadFilter();
          wetFilter.type = 'bandpass';
          wetFilter.Q.value = 3.8;
          wetFilter.frequency.setValueAtTime(920, now + 0.02);
          wetFilter.frequency.exponentialRampToValueAtTime(320, now + 0.14);
          wetFilter.frequency.exponentialRampToValueAtTime(680, now + 0.24);

          const wetGain = audioCtx.createGain();
          wetGain.gain.setValueAtTime(0.28 * vol, now + 0.02);
          wetGain.gain.exponentialRampToValueAtTime(0.001, now + squelchDur);

          noiseSrc.connect(wetFilter);
          wetFilter.connect(wetGain);
          wetGain.connect(audioCtx.destination);
          noiseSrc.start(now + 0.02);
        } catch (e) {}
      }

      // =========================================================================
      // 2. THREE.JS RENDERER, SCENE & CLEAN-BACKED FLOATING CRT MONITOR
      // =========================================================================
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050507);
      scene.fog = new THREE.FogExp2(0x050507, 0.048);

      const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 60);

      // Lighting: Moody dark room + warm CRT phosphor glow
      const ambientLight = new THREE.AmbientLight(0x22252e, 0.95);
      scene.add(ambientLight);

      const rimLight = new THREE.DirectionalLight(0x6d7c99, 1.15);
      rimLight.position.set(-4, 5, -5);
      scene.add(rimLight);

      const crimsonGlow = new THREE.PointLight(0x9e111a, 1.9, 12);
      crimsonGlow.position.set(0, -1.4, 1.9);
      scene.add(crimsonGlow);

      const screenGlowLight = new THREE.PointLight(0xd8d3c8, 2.35, 5.2);
      screenGlowLight.position.set(0, 0.04, 0.95);
      scene.add(screenGlowLight);

      const phosphorBleedLight = new THREE.PointLight(0xb81a24, 1.45, 3.8);
      phosphorBleedLight.position.set(0, -0.05, 0.72);
      scene.add(phosphorBleedLight);

      // Spherical Globe Grid around the dark void
      const globeGeo = new THREE.SphereGeometry(14.5, 28, 20);
      const globeMat = new THREE.MeshBasicMaterial({
        color: 0x261215,
        wireframe: true,
        transparent: true,
        opacity: 0.24
      });
      const globeMesh = new THREE.Mesh(globeGeo, globeMat);
      scene.add(globeMesh);

      // =========================================================================
      // 3. FLOATING SPARE FAT CRT MONITOR (CLEAN MOLDED CASING & REAR HOUSING)
      // =========================================================================
      const crtGroup = new THREE.Group();
      scene.add(crtGroup);

      const bezelMat = new THREE.MeshStandardMaterial({
        color: 0x2a2927,
        roughness: 0.68,
        metalness: 0.15
      });

      const darkVentMat = new THREE.MeshStandardMaterial({
        color: 0x141415,
        roughness: 0.85,
        metalness: 0.1
      });

      const screenW = 1.36;
      const screenH = 1.02;
      const frameThickness = 0.13;

      const topBar = new THREE.Mesh(new THREE.BoxGeometry(screenW + frameThickness * 2, frameThickness, 0.34), bezelMat);
      topBar.position.set(0, screenH * 0.5 + frameThickness * 0.5, 0.04);
      crtGroup.add(topBar);

      const botBar = new THREE.Mesh(new THREE.BoxGeometry(screenW + frameThickness * 2, frameThickness * 1.15, 0.34), bezelMat);
      botBar.position.set(0, -(screenH * 0.5 + frameThickness * 0.57), 0.04);
      crtGroup.add(botBar);

      const leftBar = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, screenH, 0.34), bezelMat);
      leftBar.position.set(-(screenW * 0.5 + frameThickness * 0.5), 0, 0.04);
      crtGroup.add(leftBar);

      const rightBar = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, screenH, 0.34), bezelMat);
      rightBar.position.set(screenW * 0.5 + frameThickness * 0.5, 0, 0.04);
      crtGroup.add(rightBar);

      // Power LED on bottom right bezel
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xd91e2a });
      const powerLed = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.016, 0.02), ledMat);
      powerLed.position.set(0.54, -(screenH * 0.5 + frameThickness * 0.55), 0.21);
      crtGroup.add(powerLed);

      // Clean Fat CRT Tapered Rear Casing (100% clean back)
      const midBody = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.14, 0.46), bezelMat);
      midBody.position.set(0, 0, -0.34);
      crtGroup.add(midBody);

      const rearTube = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.84, 0.44), darkVentMat);
      rearTube.position.set(0, 0.02, -0.76);
      crtGroup.add(rearTube);

      const neckCap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.24), bezelMat);
      neckCap.position.set(0, 0.02, -1.06);
      crtGroup.add(neckCap);

      const neckRing = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.09, 16), darkVentMat);
      neckRing.position.set(0, -0.68, -0.14);
      crtGroup.add(neckRing);

      // Offscreen 2D Canvas Texture for Dynamic CRT UI + Inner-Screen Blood Flow
      const crtCanvas = document.createElement('canvas');
      crtCanvas.width = 1024;
      crtCanvas.height = 768;
      const ctx = crtCanvas.getContext('2d');

      const crtTexture = new THREE.CanvasTexture(crtCanvas);
      crtTexture.minFilter = THREE.LinearFilter;
      crtTexture.magFilter = THREE.LinearFilter;

      // Slightly bulged curved CRT screen mesh
      const screenGeo = new THREE.PlaneGeometry(screenW, screenH, 24, 18);
      const posAttr = screenGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i) / (screenW * 0.5);
        const vy = posAttr.getY(i) / (screenH * 0.5);
        const bulge = (1.0 - (vx * vx * 0.35 + vy * vy * 0.35)) * 0.065;
        posAttr.setZ(i, Math.max(0, bulge));
      }
      screenGeo.computeVertexNormals();

      const screenMat = new THREE.MeshBasicMaterial({ map: crtTexture });
      const crtScreenMesh = new THREE.Mesh(screenGeo, screenMat);
      crtScreenMesh.position.set(0, 0, 0.145);
      crtGroup.add(crtScreenMesh);

      // =========================================================================
      // 4. ANCIENT NORDIC RELICS FLOATING BEHIND & AROUND IN DARK VOID
      // =========================================================================
      const relicsGroup = new THREE.Group();
      scene.add(relicsGroup);

      const relicIronMat = new THREE.MeshStandardMaterial({
        color: 0x3a3d42,
        roughness: 0.55,
        metalness: 0.72
      });
      const relicStoneMat = new THREE.MeshStandardMaterial({
        color: 0x2b2a29,
        roughness: 0.9,
        metalness: 0.08
      });
      const runeGlowMat = new THREE.MeshBasicMaterial({ color: 0x8f161e });

      function createNordicRelic(typeIdx) {
        const g = new THREE.Group();
        if (typeIdx === 0) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.15, 0.22), relicStoneMat);
          const rune = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.24), runeGlowMat);
          const cross = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.24), runeGlowMat);
          cross.position.y = 0.12;
          g.add(slab, rune, cross);
        } else if (typeIdx === 1) {
          const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 16), relicStoneMat);
          shield.rotation.x = Math.PI * 0.5;
          const boss = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), relicIronMat);
          boss.position.z = 0.05;
          g.add(shield, boss);
        } else if (typeIdx === 2) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.35, 0.03), relicIronMat);
          const guard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.08), relicIronMat);
          guard.position.y = -0.45;
          const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), relicStoneMat);
          hilt.position.y = -0.62;
          g.add(blade, guard, hilt);
        } else {
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), relicIronMat);
          const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 8), relicStoneMat);
          hornL.position.set(-0.36, 0.18, 0);
          hornL.rotation.z = 0.65;
          const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 8), relicStoneMat);
          hornR.position.set(0.36, 0.18, 0);
          hornR.rotation.z = -0.65;
          g.add(dome, hornL, hornR);
        }
        return g;
      }

      const relicItems = [];
      for (let i = 0; i < 26; i++) {
        const relic = createNordicRelic(i % 4);
        const angle = (i / 26) * Math.PI * 2 + (i % 3) * 0.18;
        const yBand = ((i % 5) - 2) * 1.45;
        const dist = 7.2 + (i % 4) * 1.35;
        const zBias = Math.cos(angle) > 0.45 ? -Math.abs(Math.cos(angle)) * dist : Math.cos(angle) * dist;
        relic.position.set(Math.sin(angle) * dist, yBand, zBias - 2.2);
        relic.rotation.set(i * 0.5, i * 0.8, i * 0.3);
        relicsGroup.add(relic);
        relicItems.push({
          mesh: relic,
          baseY: relic.position.y,
          phase: i * 0.7,
          rotSpeed: 0.15 + (i % 4) * 0.06
        });
      }

      // =========================================================================
      // 5. BLOOD-PIPPED BONE DICE PAIR (LAUNCH SEQUENCE)
      // =========================================================================
      const diceGroup = new THREE.Group();
      diceGroup.visible = false;
      scene.add(diceGroup);

      function buildBoneDie() {
        const dGroup = new THREE.Group();
        const boneMat = new THREE.MeshStandardMaterial({
          color: 0xd9d2c5,
          roughness: 0.45,
          metalness: 0.05
        });
        const pipMat = new THREE.MeshBasicMaterial({ color: 0x990f18 });
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), boneMat);
        dGroup.add(cube);

        const pipOffsets = [
          [0, 0, 0.175],
          [-0.08, 0.08, -0.175], [0.08, -0.08, -0.175],
          [0.175, 0.08, 0.08], [0.175, 0, 0], [0.175, -0.08, -0.08],
          [-0.175, 0.08, 0.08], [-0.175, 0.08, -0.08], [-0.175, -0.08, 0.08], [-0.175, -0.08, -0.08]
        ];
        pipOffsets.forEach(([px, py, pz]) => {
          const pip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), pipMat);
          pip.position.set(px, py, pz);
          dGroup.add(pip);
        });
        return dGroup;
      }

      const dieA = buildBoneDie();
      const dieB = buildBoneDie();
      diceGroup.add(dieA, dieB);

      // =========================================================================
      // 6. CIRCULAR CRT BARREL DISTORTION & SIGNAL GLITCH POST-PROCESSING PASS
      // =========================================================================
      const rt = new THREE.WebGLRenderTarget(renderer.domElement.width || window.innerWidth, renderer.domElement.height || window.innerHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat
      });

      const postScene = new THREE.Scene();
      const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const postMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: rt.texture },
          uTime: { value: 0 },
          uWarpEnabled: { value: 1.0 },
          uGlitchStrength: { value: 0.25 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uTime;
          uniform float uWarpEnabled;
          uniform float uGlitchStrength;
          varying vec2 vUv;

          float rand(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
          }

          vec2 warpUv(vec2 uv) {
            vec2 c = uv * 2.0 - 1.0;
            float r2 = dot(c, c);
            vec2 warped = c * (1.0 + 0.16 * r2 * uWarpEnabled);
            return warped * 0.5 + 0.5;
          }

          void main() {
            vec2 uv = warpUv(vUv);

            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
              gl_FragColor = vec4(0.015, 0.015, 0.018, 1.0);
              return;
            }

            float bandY = floor(uv.y * 38.0 + uTime * 14.0);
            float tearNoise = rand(vec2(bandY, floor(uTime * 22.0)));
            float tearMask = step(1.0 - (0.06 + uGlitchStrength * 0.28), tearNoise);
            float xJitter = (rand(vec2(bandY, uTime)) - 0.5) * 0.045 * uGlitchStrength * tearMask;
            uv.x = clamp(uv.x + xJitter, 0.001, 0.999);

            vec2 centered = vUv * 2.0 - 1.0;
            float aberr = (0.0028 + length(centered) * 0.0032) + uGlitchStrength * 0.0085;

            float r = texture2D(tDiffuse, uv + vec2(aberr, 0.0)).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - vec2(aberr, 0.0)).b;
            vec3 col = vec3(r, g, b);

            vec3 bloom = texture2D(tDiffuse, uv + vec2(0.004, 0.003)).rgb
                       + texture2D(tDiffuse, uv - vec2(0.004, 0.003)).rgb;
            col += bloom * 0.15;

            float spark = rand(floor(uv * vec2(260.0, 190.0)) + floor(uTime * 30.0));
            if (spark > (0.9965 - uGlitchStrength * 0.015)) {
              col += vec3(0.26, 0.22, 0.21) * uWarpEnabled;
            }

            float rollBar = smoothstep(0.08, 0.0, abs(fract(uv.y - uTime * 0.22) - 0.5));
            col += vec3(0.04, 0.035, 0.035) * rollBar * uWarpEnabled;

            float scan = sin(uv.y * 640.0 + uTime * 12.0) * 0.034 * uWarpEnabled;
            col -= scan;

            float vig = smoothstep(1.62, 0.52, length(centered));
            col *= mix(1.0, vig, 0.45 * uWarpEnabled);

            gl_FragColor = vec4(col, 1.0);
          }
        `
      });

      const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
      postScene.add(postQuad);

      // =========================================================================
      // 7. MENU STATE MACHINE, GALLERY DOSSIERS & CRT CANVAS RENDERER
      // =========================================================================
      const GALLERY_SPECIMENS = [
        {
          id: '01',
          name: 'SHADOW WHISPERER',
          classTag: 'STALKER // SILHOUETTE',
          lore: 'MOVING = 100% INVISIBLE. LEAVES SOOT FOOTPRINTS. STRIKES ONLY WHEN STILL.'
        },
        {
          id: '02',
          name: 'ARCHIVE GHOUL',
          classTag: 'FERAL // MAZE ONE',
          lore: 'CROUCHED WET-STONE PREDATOR. SNAPS FROM SHADOWS AT CLOSE RANGE.'
        },
        {
          id: '03',
          name: 'RITUAL ZONBI',
          classTag: 'BOUND DEAD // HALL',
          lore: 'KAOLIN-MARKED SPIRIT VESSEL. UNBLINKING TRANCE ADVANCE.'
        },
        {
          id: '04',
          name: 'WHITE AETHER LION',
          classTag: 'APEX GUARDIAN // BOSS',
          lore: 'DARK SILHOUETTE ON BLINDING WHITE. GUN TILL EMPTY, FINISH WITH BLADE.'
        }
      ];

      const appState = {
        screen: 'MAIN',
        selectedIndex: 0,
        selectedFileSlot: 0,
        galleryIndex: 0,
        warpEnabled: true,
        glitchPulse: 0.35,
        audioVolume: 0.75,
        brightness: 0.65,
        crtFlicker: true,
        hitboxes: [],
        bloodFlowTime: 0
      };

      const CAMERA_PRESETS = {
        MAIN:    { azimuthDeg:  23, elevationDeg:  7, radius: 1.24, targetY:  0.00, fov: 46 },
        FILES:   { azimuthDeg: -24, elevationDeg: -6, radius: 1.22, targetY:  0.04, fov: 45 },
        OPTIONS: { azimuthDeg:  24, elevationDeg:  4, radius: 1.20, targetY:  0.04, fov: 45 },
        GALLERY: { azimuthDeg: -23, elevationDeg:  8, radius: 1.28, targetY: -0.06, fov: 47 },
        EXIT:    { azimuthDeg:  22, elevationDeg: -7, radius: 1.22, targetY:  0.05, fov: 45 }
      };

      function triggerGlitch(strength = 0.85, withSound = true) {
        appState.glitchPulse = Math.max(appState.glitchPulse, strength);
        if (withSound) {
          playGlitchBurstSound(Math.min(1.3, strength));
        }
      }

      function seededRand(seed) {
        const x = Math.sin(seed * 12.9898) * 43758.5453;
        return x - Math.floor(x);
      }

      // Persistent inner-screen blood rivulets flowing down the inside of the CRT glass
      const innerScreenRivulets = Array.from({ length: 24 }, (_, i) => ({
        x: (i / 23) * 980 + 22 + (seededRand(i * 4.1) - 0.5) * 26,
        speed: 55 + seededRand(i * 7.3) * 85,
        length: 140 + seededRand(i * 9.7) * 340,
        width: 3.5 + seededRand(i * 5.2) * 6.5,
        offset: seededRand(i * 11.4) * 900,
        wobbleFreq: 0.018 + seededRand(i * 3.3) * 0.015,
        wobbleAmp: 2.5 + seededRand(i * 6.8) * 5.0
      }));

      function getMenuItemsForCurrentScreen() {
        switch (appState.screen) {
          case 'MAIN':
            return [
              { label: 'NEW FILE', action: () => startGameLaunch() },
              { label: 'SURVIVAL', action: () => startSurvivalLaunch() },
              { label: 'CONTINUE', action: () => switchScreen('FILES', 1) },
              { label: 'OPTIONS', action: () => switchScreen('OPTIONS', 1) },
              { label: 'GALLERY', action: () => switchScreen('GALLERY', 1) },
              { label: 'EXIT', action: () => switchScreen('EXIT', 1) }
            ];
          case 'FILES':
            return [
              { label: 'FILE 1: — NO DATA —', action: () => triggerGlitch(0.9, true) },
              { label: 'FILE 2: — NO DATA —', action: () => triggerGlitch(0.9, true) },
              { label: 'FILE 3: — NO DATA —', action: () => triggerGlitch(0.9, true) },
              { label: 'BACK TO MAIN', action: () => switchScreen('MAIN', -1) }
            ];
          case 'OPTIONS':
            return [
              {
                label: `CRT WARP: ${appState.warpEnabled ? 'ON' : 'OFF'}`,
                action: () => {
                  appState.warpEnabled = !appState.warpEnabled;
                  postMat.uniforms.uWarpEnabled.value = appState.warpEnabled ? 1.0 : 0.0;
                  saveSettings();
                  triggerGlitch(0.75, true);
                }
              },
              {
                label: `AUDIO: ${Math.round(appState.audioVolume * 100)}%`,
                action: () => {
                  appState.audioVolume = appState.audioVolume >= 0.95 ? 0.0 : +(appState.audioVolume + 0.25).toFixed(2);
                  audioEnabled = appState.audioVolume > 0;
                  if (humGain && audioCtx) {
                    humGain.gain.setTargetAtTime(0.022 * appState.audioVolume, audioCtx.currentTime, 0.05);
                  }
                  if (crackleGain && audioCtx) {
                    crackleGain.gain.setTargetAtTime(0.055 * appState.audioVolume, audioCtx.currentTime, 0.05);
                  }
                  saveSettings();
                }
              },
              {
                label: `PHOSPHOR GLOW: ${Math.round(appState.brightness * 100)}%`,
                action: () => {
                  appState.brightness = appState.brightness >= 0.95 ? 0.4 : +(appState.brightness + 0.2).toFixed(2);
                  screenGlowLight.intensity = 1.6 + appState.brightness * 1.4;
                  saveSettings();
                }
              },
              { label: 'BACK TO MAIN', action: () => switchScreen('MAIN', -1) }
            ];
          case 'GALLERY':
            return [
              {
                label: `NEXT SPECIMEN [${GALLERY_SPECIMENS[appState.galleryIndex].id}/04]`,
                action: () => {
                  appState.galleryIndex = (appState.galleryIndex + 1) % GALLERY_SPECIMENS.length;
                  flipCameraSide();
                  triggerGlitch(0.8, true);
                }
              },
              { label: 'BACK TO MAIN', action: () => switchScreen('MAIN', -1) }
            ];
          case 'EXIT':
            return [
              { label: 'YES — SEVER SIGNAL', action: () => startLaunchSequence('SIGNAL TERMINATED...') },
              { label: 'NO — RETURN TO ARCHIVE', action: () => switchScreen('MAIN', -1) }
            ];
          default:
            return [];
        }
      }

      function drawBloodSplatter(cx, cy, radius, seedBase) {
        ctx.save();
        ctx.fillStyle = 'rgba(138, 12, 20, 0.86)';
        ctx.beginPath();
        const pts = 18;
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const r = radius * (0.55 + seededRand(seedBase + i) * 0.75);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        for (let d = 0; d < 10; d++) {
          const da = seededRand(seedBase + 40 + d) * Math.PI * 2;
          const dist = radius * (0.9 + seededRand(seedBase + 60 + d) * 0.85);
          const dr = 3 + seededRand(seedBase + 80 + d) * 7;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(da) * dist, cy + Math.sin(da) * dist, dr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      function renderCRTCanvas() {
        const W = crtCanvas.width;
        const H = crtCanvas.height;
        const isDarkScreen = appState.screen === 'FILES' || appState.screen === 'EXIT';

        const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.48, 60, W * 0.5, H * 0.5, W * 0.65);
        if (isDarkScreen) {
          bgGrad.addColorStop(0, '#18181b');
          bgGrad.addColorStop(1, '#070709');
        } else {
          bgGrad.addColorStop(0, '#dbd6cb');
          bgGrad.addColorStop(1, '#8c867b');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = isDarkScreen ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
        for (let i = 0; i < 420; i++) {
          const gx = seededRand(i * 1.7 + appState.selectedIndex) * W;
          const gy = seededRand(i * 2.9 + appState.galleryIndex) * H;
          ctx.fillRect(gx, gy, 3, 2);
        }

        if (appState.screen === 'MAIN') {
          drawBloodSplatter(W * 0.27, H * 0.48, 86, 11);
          drawBloodSplatter(W * 0.74, H * 0.31, 44, 29);
        } else if (appState.screen === 'OPTIONS') {
          drawBloodSplatter(W * 0.78, H * 0.62, 68, 53);
        } else if (appState.screen === 'FILES') {
          drawBloodSplatter(W * 0.82, H * 0.75, 58, 71);
        }

        ctx.textAlign = 'center';
        if (appState.screen === 'MAIN') {
          ctx.fillStyle = '#6e0b12';
          ctx.font = 'bold 26px "Courier New", monospace';
          ctx.fillText('THE', W * 0.5, 112);

          ctx.font = '900 74px Georgia, serif';
          ctx.fillText('GRAND', W * 0.5, 182);
          ctx.fillText('ARCHIVE', W * 0.5, 252);

          ctx.fillRect(W * 0.36, 256, 5, 34);
          ctx.fillRect(W * 0.61, 256, 6, 46);
        } else {
          ctx.fillStyle = isDarkScreen ? '#c92a34' : '#6e0b12';
          ctx.font = 'bold 46px Georgia, serif';
          const titles = {
            FILES: 'FILE SELECT',
            OPTIONS: '90s SYSTEM OPTIONS',
            GALLERY: 'ARCHIVE SPECIMENS',
            EXIT: 'TERMINATE SESSION?'
          };
          ctx.fillText(titles[appState.screen] || appState.screen, W * 0.5, 128);
        }

        if (appState.screen === 'GALLERY') {
          const spec = GALLERY_SPECIMENS[appState.galleryIndex];
          ctx.save();
          ctx.fillStyle = 'rgba(10, 10, 12, 0.88)';
          ctx.strokeStyle = '#7c141b';
          ctx.lineWidth = 3;
          ctx.fillRect(W * 0.16, 165, W * 0.68, 285);
          ctx.strokeRect(W * 0.16, 165, W * 0.68, 285);

          ctx.strokeStyle = '#c42b35';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(W * 0.5, 245, 28, 0, Math.PI * 2);
          ctx.moveTo(W * 0.5, 273);
          ctx.lineTo(W * 0.5, 348);
          ctx.moveTo(W * 0.43, 295);
          ctx.lineTo(W * 0.57, 295);
          ctx.stroke();

          ctx.fillStyle = '#e5e0d8';
          ctx.font = 'bold 28px "Courier New", monospace';
          ctx.fillText(`${spec.id} // ${spec.name}`, W * 0.5, 385);

          ctx.fillStyle = '#d1434c';
          ctx.font = 'bold 18px "Courier New", monospace';
          ctx.fillText(spec.classTag, W * 0.5, 412);

          ctx.fillStyle = '#b8b2a6';
          ctx.font = '15px "Courier New", monospace';
          ctx.fillText(spec.lore, W * 0.5, 436);
          ctx.restore();
        }

        const items = getMenuItemsForCurrentScreen();
        appState.hitboxes = [];

        const startY = appState.screen === 'MAIN' ? 338 : appState.screen === 'GALLERY' ? 515 : 250;
        const rowStep = appState.screen === 'MAIN' ? 58 : 78;

        items.forEach((item, idx) => {
          const y = startY + idx * rowStep;
          const isSelected = idx === appState.selectedIndex;

          const boxW = 640;
          const boxH = appState.screen === 'MAIN' ? 46 : 52;
          const boxX = (W - boxW) * 0.5;
          const boxY = y - (appState.screen === 'MAIN' ? 33 : 36);

          appState.hitboxes.push({
            uMin: boxX / W,
            uMax: (boxX + boxW) / W,
            vMin: 1.0 - (boxY + boxH) / H,
            vMax: 1.0 - boxY / H,
            yNorm: 0.5 - y / H
          });

          if (isSelected) {
            ctx.fillStyle = 'rgba(135, 14, 22, 0.88)';
            ctx.fillRect(boxX, boxY, boxW, boxH);

            ctx.fillStyle = 'rgba(220, 40, 50, 0.45)';
            ctx.fillRect(boxX - 10, boxY + 12, boxW + 20, 6);

            ctx.fillStyle = '#f5f2eb';
            ctx.font = 'bold 34px "Courier New", monospace';
            ctx.fillText(`► ${item.label} ◄`, W * 0.5, y);
          } else {
            ctx.fillStyle = isDarkScreen ? '#c7c2b8' : '#1c1817';
            ctx.font = 'bold 31px "Courier New", monospace';
            ctx.fillText(item.label, W * 0.5, y);
          }
        });

        ctx.fillStyle = isDarkScreen ? 'rgba(200, 50, 60, 0.7)' : 'rgba(90, 12, 18, 0.75)';
        ctx.font = 'bold 17px "Courier New", monospace';
        ctx.fillText('MATURE 17+ // BLOOD & GORE // INTENSE HORROR', W * 0.5, H - 34);

        // Constant Blood Flowing Down Inside the CRT Glass Screen
        ctx.save();
        const topBloodGrad = ctx.createLinearGradient(0, 0, 0, 75);
        topBloodGrad.addColorStop(0, 'rgba(128, 6, 14, 0.92)');
        topBloodGrad.addColorStop(1, 'rgba(128, 6, 14, 0.0)');
        ctx.fillStyle = topBloodGrad;
        ctx.fillRect(0, 0, W, 75);

        const leftPoolGrad = ctx.createLinearGradient(0, 0, 58, 0);
        leftPoolGrad.addColorStop(0, 'rgba(120, 5, 12, 0.88)');
        leftPoolGrad.addColorStop(1, 'rgba(120, 5, 12, 0.0)');
        ctx.fillStyle = leftPoolGrad;
        ctx.fillRect(0, 0, 58, H);

        const rightPoolGrad = ctx.createLinearGradient(W, 0, W - 58, 0);
        rightPoolGrad.addColorStop(0, 'rgba(120, 5, 12, 0.88)');
        rightPoolGrad.addColorStop(1, 'rgba(120, 5, 12, 0.0)');
        ctx.fillStyle = rightPoolGrad;
        ctx.fillRect(W - 58, 0, 58, H);

        innerScreenRivulets.forEach((riv) => {
          const headY = ((appState.bloodFlowTime * riv.speed + riv.offset) % (H + riv.length + 120)) - 60;
          const tailY = Math.max(0, headY - riv.length);

          if (headY > 0) {
            const grad = ctx.createLinearGradient(0, tailY, 0, headY);
            grad.addColorStop(0, 'rgba(110, 4, 10, 0.15)');
            grad.addColorStop(0.65, 'rgba(148, 10, 18, 0.86)');
            grad.addColorStop(1, 'rgba(175, 14, 24, 0.96)');

            ctx.strokeStyle = grad;
            ctx.lineWidth = riv.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let y = tailY; y <= headY; y += 14) {
              const wx = riv.x + Math.sin(y * riv.wobbleFreq + appState.bloodFlowTime * 1.4) * riv.wobbleAmp;
              if (y === tailY) ctx.moveTo(wx, y);
              else ctx.lineTo(wx, y);
            }
            ctx.stroke();

            const tipX = riv.x + Math.sin(headY * riv.wobbleFreq + appState.bloodFlowTime * 1.4) * riv.wobbleAmp;
            ctx.fillStyle = 'rgba(165, 12, 20, 0.95)';
            ctx.beginPath();
            ctx.ellipse(tipX, headY, riv.width * 0.72, riv.width * 1.15, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.restore();

        // CRT Scanlines & Static Crackle Hairlines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (let y = 0; y < H; y += 3) {
          ctx.fillRect(0, y, W, 1.4);
        }

        ctx.save();
        ctx.strokeStyle = isDarkScreen ? 'rgba(220, 225, 235, 0.16)' : 'rgba(255, 255, 255, 0.30)';
        ctx.lineWidth = 1.2;
        for (let s = 0; s < 16; s++) {
          const sx = seededRand(s * 17.3 + appState.selectedIndex) * W;
          const sy = seededRand(s * 29.1 + appState.galleryIndex) * H;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + (seededRand(s * 3.7) - 0.5) * 38, sy + (seededRand(s * 5.9) - 0.5) * 16);
          ctx.stroke();
        }
        ctx.restore();

        const edgeVig = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.38, W * 0.5, H * 0.5, W * 0.62);
        edgeVig.addColorStop(0, 'rgba(0,0,0,0)');
        edgeVig.addColorStop(1, 'rgba(0,0,0,0.70)');
        ctx.fillStyle = edgeVig;
        ctx.fillRect(0, 0, W, H);

        crtTexture.needsUpdate = true;
      }

      // =========================================================================
      // 8. HIGH-TORQUE OBLIQUE CAMERA RIG (KING'S DEAD WHIP + ROW LOCKING)
      // =========================================================================
      const camRig = {
        azimuth: THREE.MathUtils.degToRad(CAMERA_PRESETS.MAIN.azimuthDeg),
        elevation: THREE.MathUtils.degToRad(CAMERA_PRESETS.MAIN.elevationDeg),
        radius: CAMERA_PRESETS.MAIN.radius,
        targetY: CAMERA_PRESETS.MAIN.targetY,
        fov: CAMERA_PRESETS.MAIN.fov,

        sideSign: 1,
        baseAzimuth: THREE.MathUtils.degToRad(CAMERA_PRESETS.MAIN.azimuthDeg),
        baseElevation: THREE.MathUtils.degToRad(CAMERA_PRESETS.MAIN.elevationDeg),
        goalAzimuth: THREE.MathUtils.degToRad(CAMERA_PRESETS.MAIN.azimuthDeg),
        goalElevation: THREE.MathUtils.degToRad(CAMERA_PRESETS.MAIN.elevationDeg),
        goalRadius: CAMERA_PRESETS.MAIN.radius,
        goalTargetY: CAMERA_PRESETS.MAIN.targetY,
        goalFov: CAMERA_PRESETS.MAIN.fov,

        swoopActive: false,
        swoopTime: 0,
        swoopDuration: 0.52,
        swoopStartAz: 0,
        swoopStartEl: 0,
        swoopStartR: 1.24,
        swoopStartFov: 46,
        swoopDirection: 1,
        swoopTotalAzDelta: 0
      };

      function updateCursorCameraOffset(index, totalItems) {
        const norm = totalItems > 1 ? (index / (totalItems - 1)) - 0.5 : 0;
        const lateralSweep = THREE.MathUtils.degToRad(norm * 10);
        const verticalSweep = THREE.MathUtils.degToRad(-norm * 12);

        camRig.goalAzimuth = camRig.baseAzimuth + lateralSweep;
        camRig.goalElevation = camRig.baseElevation + verticalSweep;

        const hb = appState.hitboxes[index];
        camRig.goalTargetY = hb ? hb.yNorm * screenH * 0.85 : -norm * 0.25;
      }

      function flipCameraSide() {
        camRig.sideSign *= -1;
        const preset = CAMERA_PRESETS[appState.screen] || CAMERA_PRESETS.MAIN;
        camRig.baseAzimuth = THREE.MathUtils.degToRad(Math.abs(preset.azimuthDeg) * camRig.sideSign);
        const items = getMenuItemsForCurrentScreen();
        updateCursorCameraOffset(appState.selectedIndex, items.length);
      }

      function switchScreen(nextScreen, direction = 1) {
        appState.screen = nextScreen;
        appState.selectedIndex = 0;

        const preset = CAMERA_PRESETS[nextScreen] || CAMERA_PRESETS.MAIN;
        camRig.sideSign = preset.azimuthDeg >= 0 ? 1 : -1;
        camRig.baseAzimuth = THREE.MathUtils.degToRad(preset.azimuthDeg);
        camRig.baseElevation = THREE.MathUtils.degToRad(preset.elevationDeg);
        camRig.goalRadius = preset.radius;
        camRig.goalFov = preset.fov;

        renderCRTCanvas();
        const items = getMenuItemsForCurrentScreen();
        updateCursorCameraOffset(0, items.length);

        camRig.swoopActive = true;
        camRig.swoopTime = 0;
        camRig.swoopStartAz = camRig.azimuth;
        camRig.swoopStartEl = camRig.elevation;
        camRig.swoopStartR = camRig.radius;
        camRig.swoopStartFov = camRig.fov;
        camRig.swoopDirection = direction;
        camRig.swoopTotalAzDelta = camRig.goalAzimuth - camRig.azimuth;

        triggerGlitch(1.05, true);
        statusReadout.textContent = `NODE: ${nextScreen} // SIGNAL UNSTABLE`;
      }

      // =========================================================================
      // 9. CRT-TO-DICE LAUNCH SEQUENCE
      // =========================================================================
      const launchState = {
        active: false,
        completed: false,
        timer: 0,
        label: '',
        toGame: false,
        mode: 'story'
      };

      function startGameLaunch() {
        launchState.toGame = true;
        launchState.mode = 'story';
        startLaunchSequence('NEW FILE // THE BASEMENT');
      }

      function startSurvivalLaunch() {
        launchState.toGame = true;
        launchState.mode = 'survival';
        startLaunchSequence('SURVIVAL // THE BAILY YARD');
      }

      function startLaunchSequence(label) {
        launchState.active = true;
        launchState.completed = false;
        launchState.timer = 0;
        launchState.label = label;
        triggerGlitch(1.3, true);
        playStabSound(1.2);
        setTimeout(() => playStabSound(0.95), 140);
        playDiceClatter();
        statusReadout.textContent = label;
      }

      function resetFromLaunchSequence() {
        launchState.active = false;
        launchState.completed = false;
        launchState.timer = 0;
        crtGroup.visible = true;
        crtGroup.scale.set(1, 1, 1);
        crtGroup.rotation.set(0, 0, 0);
        diceGroup.visible = false;
        renderer.toneMappingExposure = 1.15;
        switchScreen('MAIN', -1);
      }

      // =========================================================================
      // 10. 3D RAYCASTING (INVERSE CRT BARREL DISTORTION) & INPUT HANDLERS
      // =========================================================================
      const raycaster = new THREE.Raycaster();
      const mouseNDC = new THREE.Vector2();

      function inverseWarpUv(uvX, uvY) {
        if (!appState.warpEnabled) return { x: uvX, y: uvY };
        const cx = uvX * 2.0 - 1.0;
        const cy = uvY * 2.0 - 1.0;
        const r2 = cx * cx + cy * cy;
        const wx = cx * (1.0 + 0.16 * r2);
        const wy = cy * (1.0 + 0.16 * r2);
        return { x: wx * 0.5 + 0.5, y: wy * 0.5 + 0.5 };
      }

      function getHitboxAtClientXY(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const rawU = (clientX - rect.left) / rect.width;
        const rawV = 1.0 - (clientY - rect.top) / rect.height;
        const warped = inverseWarpUv(rawU, rawV);

        mouseNDC.x = warped.x * 2.0 - 1.0;
        mouseNDC.y = warped.y * 2.0 - 1.0;

        raycaster.setFromCamera(mouseNDC, camera);
        const hits = raycaster.intersectObject(crtScreenMesh, false);
        if (!hits.length || !hits[0].uv) return -1;

        const uv = hits[0].uv;
        for (let i = 0; i < appState.hitboxes.length; i++) {
          const hb = appState.hitboxes[i];
          if (uv.x >= hb.uMin && uv.x <= hb.uMax && uv.y >= hb.vMin && uv.y <= hb.vMax) {
            return i;
          }
        }
        return -1;
      }

      window.addEventListener('mousemove', (e) => {
        if (!menuVisible) return;
        if (launchState.active) return;
        const hitIdx = getHitboxAtClientXY(e.clientX, e.clientY);
        if (hitIdx !== -1 && hitIdx !== appState.selectedIndex) {
          appState.selectedIndex = hitIdx;
          const items = getMenuItemsForCurrentScreen();
          updateCursorCameraOffset(hitIdx, items.length);
          initAudio();
          playRelayClick(290, 0.03, 0.05);
          triggerGlitch(0.45, false);
          renderCRTCanvas();
        }
        canvas.style.cursor = hitIdx !== -1 ? 'pointer' : 'crosshair';
      });

      window.addEventListener('click', (e) => {
        if (!menuVisible) return;
        initAudio();
        if (launchState.completed) {
          resetFromLaunchSequence();
          return;
        }
        if (launchState.active) return;
        const hitIdx = getHitboxAtClientXY(e.clientX, e.clientY);
        const items = getMenuItemsForCurrentScreen();
        if (hitIdx !== -1 && items[hitIdx]) {
          appState.selectedIndex = hitIdx;
          updateCursorCameraOffset(hitIdx, items.length);
          playRelayClick(190, 0.055, 0.11);
          playStabSound(1.0);
          items[hitIdx].action();
          renderCRTCanvas();
        }
      });

      window.addEventListener('keydown', (e) => {
        if (!menuVisible) return;
        initAudio();
        if (launchState.completed) {
          resetFromLaunchSequence();
          return;
        }
        if (launchState.active) return;

        const items = getMenuItemsForCurrentScreen();
        if (!items.length) return;

        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          e.preventDefault();
          appState.selectedIndex = (appState.selectedIndex + 1) % items.length;
          updateCursorCameraOffset(appState.selectedIndex, items.length);
          playRelayClick(260, 0.035, 0.07);
          playStabSound(0.45);
          triggerGlitch(0.42, false);
          renderCRTCanvas();
        } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          appState.selectedIndex = (appState.selectedIndex - 1 + items.length) % items.length;
          updateCursorCameraOffset(appState.selectedIndex, items.length);
          playRelayClick(280, 0.035, 0.07);
          playStabSound(0.45);
          triggerGlitch(0.42, false);
          renderCRTCanvas();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd' || e.key === 'A' || e.key === 'D') {
          e.preventDefault();
          if (appState.screen === 'GALLERY') {
            const dir = (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') ? 1 : -1;
            appState.galleryIndex = (appState.galleryIndex + dir + GALLERY_SPECIMENS.length) % GALLERY_SPECIMENS.length;
          }
          flipCameraSide();
          playRelayClick(220, 0.04, 0.08);
          playStabSound(0.65);
          triggerGlitch(0.75, true);
          renderCRTCanvas();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          playRelayClick(175, 0.06, 0.12);
          playStabSound(1.05);
          items[appState.selectedIndex].action();
          renderCRTCanvas();
        } else if (e.key === 'Escape' || e.key === 'Backspace') {
          if (appState.screen !== 'MAIN') {
            e.preventDefault();
            playStabSound(0.85);
            switchScreen('MAIN', -1);
          }
        }
      });

      window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });

      // =========================================================================
      // 11. MAIN ANIMATION LOOP
      // =========================================================================
      renderCRTCanvas();
      updateCursorCameraOffset(0, getMenuItemsForCurrentScreen().length);

      let prevTime = performance.now();
      let bloodRenderAccum = 0;

      function updateMenu(now) {
        const dt = Math.min(0.05, (now - prevTime) * 0.001);
        prevTime = now;
        const elapsed = now * 0.001;

        postMat.uniforms.uTime.value = elapsed;

        // Continuously advance inner-screen blood flow & refresh CRT texture smoothly
        appState.bloodFlowTime += dt;
        bloodRenderAccum += dt;
        if (bloodRenderAccum >= 0.033 && !launchState.active) {
          bloodRenderAccum = 0;
          renderCRTCanvas();
        }

        // Spontaneous PS2/CRT signal glitch spikes + occasional distant stab echo
        if (Math.random() < 0.018) {
          appState.glitchPulse = Math.max(appState.glitchPulse, 0.55 + Math.random() * 0.45);
          if (Math.random() < 0.16 && !launchState.active) {
            playStabSound(0.32);
          }
        }
        appState.glitchPulse = THREE.MathUtils.lerp(appState.glitchPulse, 0.12, 1.0 - Math.exp(-7.5 * dt));
        postMat.uniforms.uGlitchStrength.value = appState.glitchPulse;

        if (appState.glitchPulse > 0.55) {
          crtScreenMesh.position.x = (Math.random() - 0.5) * 0.012 * appState.glitchPulse;
        } else {
          crtScreenMesh.position.x = 0;
        }

        // Orbiting Nordic relics & globe grid rotation
        globeMesh.rotation.y = elapsed * 0.03;
        relicItems.forEach((item) => {
          item.mesh.position.y = item.baseY + Math.sin(elapsed * 0.9 + item.phase) * 0.18;
          item.mesh.rotation.y += item.rotSpeed * dt;
          item.mesh.rotation.x += item.rotSpeed * 0.4 * dt;
        });

        // Camera motion update
        let bankRoll = 0;
        if (camRig.swoopActive) {
          camRig.swoopTime += dt;
          const u = Math.min(1.0, camRig.swoopTime / camRig.swoopDuration);
          const easeT = 1.0 - Math.pow(1.0 - u, 3.2);
          const arcEnv = Math.sin(u * Math.PI);

          camRig.azimuth = camRig.swoopStartAz + camRig.swoopTotalAzDelta * easeT;
          camRig.elevation = THREE.MathUtils.lerp(camRig.swoopStartEl, camRig.goalElevation, easeT) + arcEnv * 0.11 * camRig.swoopDirection;

          const baseLerpR = THREE.MathUtils.lerp(camRig.swoopStartR, camRig.goalRadius, easeT);
          camRig.radius = baseLerpR + arcEnv * 0.62;
          camRig.fov = THREE.MathUtils.lerp(camRig.swoopStartFov, camRig.goalFov, easeT) + arcEnv * 6.5;
          camRig.targetY = THREE.MathUtils.lerp(camRig.targetY, camRig.goalTargetY, 1.0 - Math.exp(-14 * dt));
          bankRoll = arcEnv * 0.11 * camRig.swoopDirection;

          if (u >= 1.0) {
            camRig.swoopActive = false;
          }
        } else {
          const springK = 14.0;
          const alpha = 1.0 - Math.exp(-springK * dt);
          const prevAz = camRig.azimuth;
          camRig.azimuth = THREE.MathUtils.lerp(camRig.azimuth, camRig.goalAzimuth, alpha);
          camRig.elevation = THREE.MathUtils.lerp(camRig.elevation, camRig.goalElevation, alpha);
          camRig.radius = THREE.MathUtils.lerp(camRig.radius, camRig.goalRadius, alpha);
          camRig.targetY = THREE.MathUtils.lerp(camRig.targetY, camRig.goalTargetY, alpha);
          camRig.fov = THREE.MathUtils.lerp(camRig.fov, camRig.goalFov, alpha);
          bankRoll = (camRig.azimuth - prevAz) * 2.2;
        }

        // Launch sequence: CRT spins into tumbling bone dice then fades to black
        if (launchState.active) {
          launchState.timer += dt;
          const lt = launchState.timer;
          if (lt < 0.85) {
            const spinT = lt / 0.85;
            crtGroup.rotation.y = spinT * Math.PI * 6.0;
            crtGroup.rotation.z = spinT * Math.PI * 2.0;
            const shrink = Math.max(0.05, 1.0 - spinT * 0.95);
            crtGroup.scale.set(shrink, shrink, shrink);
          } else if (lt < 1.95) {
            crtGroup.visible = false;
            diceGroup.visible = true;
            const dtDice = lt - 0.85;
            const bounce = Math.abs(Math.sin(dtDice * 7.5)) * Math.exp(-dtDice * 1.4) * 0.35;
            dieA.position.set(-0.26, bounce - 0.08, 0.1);
            dieB.position.set(0.26, bounce * 0.8 - 0.08, -0.05);
            dieA.rotation.set(dtDice * 11, dtDice * 8, dtDice * 6);
            dieB.rotation.set(-dtDice * 9, dtDice * 12, -dtDice * 7);
          } else {
            const fadeOut = Math.max(0.0, 1.0 - (lt - 1.95) / 0.65);
            renderer.toneMappingExposure = 1.15 * fadeOut;
            if (fadeOut <= 0.01 && !launchState.completed) {
              launchState.completed = true;
              if (launchState.toGame) {
                launchState.active = false;
                menuVisible = false;
                if (launchState.mode === 'survival') {
                  if (typeof onSurvivalConfirmed === 'function') onSurvivalConfirmed();
                } else if (typeof onEnterConfirmed === 'function') {
                  onEnterConfirmed();
                }
              } else {
                statusReadout.textContent = `${launchState.label} // CLICK OR PRESS ANY KEY TO RETURN`;
              }
            }
          }
        } else {
          crtGroup.position.y = Math.sin(elapsed * 1.1) * 0.032;
          crtGroup.rotation.z = Math.cos(elapsed * 0.85) * 0.01;
          screenGlowLight.intensity = 2.25 + Math.sin(elapsed * 29.0) * 0.18 + (Math.random() > 0.92 ? 0.35 : 0.0);
          phosphorBleedLight.intensity = 1.35 + Math.cos(elapsed * 23.0) * 0.16;
        }

        const cosEl = Math.cos(camRig.elevation);
        camera.position.set(
          Math.sin(camRig.azimuth) * cosEl * camRig.radius,
          camRig.targetY + Math.sin(camRig.elevation) * camRig.radius,
          Math.cos(camRig.azimuth) * cosEl * camRig.radius
        );
        camera.fov = camRig.fov;
        camera.updateProjectionMatrix();
        camera.lookAt(0, camRig.targetY, 0);
        camera.rotation.z += bankRoll;

      }

      function renderMenu() {
        const dbW = renderer.domElement.width || window.innerWidth;
        const dbH = renderer.domElement.height || window.innerHeight;
        if (rt.width !== dbW || rt.height !== dbH) rt.setSize(dbW, dbH);
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCam);
      }

      // =========================================================================
      // SETTINGS PERSISTENCE (OPTIONS toggles) + PUBLIC API
      // =========================================================================
      const SETTINGS_KEY = 'ga_crt_menu_settings_v1';
      function saveSettings() {
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            warpEnabled: appState.warpEnabled,
            audioVolume: appState.audioVolume,
            brightness: appState.brightness
          }));
        } catch (e) {}
      }
      (function loadSettings() {
        try {
          const raw = localStorage.getItem(SETTINGS_KEY);
          if (!raw) return;
          const s = JSON.parse(raw);
          if (typeof s.warpEnabled === 'boolean') {
            appState.warpEnabled = s.warpEnabled;
            postMat.uniforms.uWarpEnabled.value = s.warpEnabled ? 1.0 : 0.0;
          }
          if (typeof s.audioVolume === 'number') {
            appState.audioVolume = s.audioVolume;
            audioEnabled = s.audioVolume > 0;
          }
          if (typeof s.brightness === 'number') {
            appState.brightness = s.brightness;
            screenGlowLight.intensity = 1.6 + s.brightness * 1.4;
          }
        } catch (e) {}
      })();

      let savedToneMapping = null;
      let savedExposure = null;
      let menuClockMs = performance.now();

      return {
        get visible() { return menuVisible; },
        show() {
          if (launchState.completed || launchState.active) {
            resetFromLaunchSequence();
          }
          menuVisible = true;
          savedToneMapping = renderer.toneMapping;
          savedExposure = renderer.toneMappingExposure;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.15;
          prevTime = menuClockMs;
          initAudio();
          renderCRTCanvas();
        },
        hide() {
          menuVisible = false;
          if (savedToneMapping !== null) {
            renderer.toneMapping = savedToneMapping;
            renderer.toneMappingExposure = savedExposure;
            savedToneMapping = null;
          }
          if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
        },
        update(dtSeconds) {
          if (!menuVisible) return;
          // main.js drives menus with dt seconds (stepSimulation); the
          // prototype ran on performance.now(), so keep an accumulated clock
          // in that same unit for both dt and elapsed inside updateMenu.
          const step = (typeof dtSeconds === 'number' && dtSeconds > 0 && dtSeconds < 1) ? dtSeconds : 0.016;
          menuClockMs += step * 1000;
          updateMenu(menuClockMs);
        },
        render() {
          if (!menuVisible) return;
          renderMenu();
        },
        getStateSnapshot() {
          return {
            screen: appState.screen,
            selectedIndex: appState.selectedIndex,
            galleryIndex: appState.galleryIndex,
            visible: menuVisible,
            launching: launchState.active
          };
        },
        dispose() {
          this.hide();
          rt.dispose();
          crtTexture.dispose();
          scene.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
            }
          });
          postQuad.geometry.dispose();
          postMat.dispose();
          if (audioCtx) audioCtx.close();
        }
      };
    }
  