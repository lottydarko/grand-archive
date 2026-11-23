# Antigravity wiring note — fps_arms_v8 (bitkiln rig) — Nov 22, 2026

**Asset:** `fps_arms_v8.glb` (in ~/workspace/tools/blender/, next to fps_arms_v7.glb). Replaces the J-Toastie fps_arms as the viewmodel arms when wired. Do NOT delete v7 until v8 is playtested.

**Why:** Lotty directed a switch to the best free hand-grip rig found online. Winner = bitkiln PSX Horror FPS Kit free sampler arms (free for commercial use, edit/re-rig/re-animate allowed, credit appreciated not required). Verified in Blender: 43 bones, FULL individual finger chains (index/middle/ring/pinky/thumb × proximal/intermediate/distal, both hands), plus Weapon/Eject/Mag/Muzzle/Slide/Trigger bones. Muse added: MW3 charcoal glove material on both hands (baked texture), knuckle guard pads merged into the mesh (KnuckleRubber material), and 5 baked GA_* shotgun clips.

**Bone-name changes vs the old rig (weapons.js mounts must follow):**
- Grip hand bone: `RightHand` (was `Hand.R.001`). Weapon anchor bone: `Weapon` (use it for the hero gun mount — it sits in the right hand).
- Support hand: `LeftHand`. Fingers: `{Left|Right}{Index|Middle|Ring|Pinky|Thumb}{Proximal|Intermediate|Distal}`.
- The old rig's built-in Glock19 mesh problem does NOT exist here — the file contains exactly ONE mesh (`Arms`, 1,564 verts; materials: Arms / GloveMW3 / KnuckleRubber). No hidden pistol to suppress.
- Scale/space: the rig is modeled in meters, viewmodel camera space (eye at origin, forward +Y in glTF space before the loader's conversion). The existing armsPivot placement values were tuned for the old rig and will need re-fitting for this one.

**Clip table (30 fps):**
- `GA_Carry` 90f — shotgun carry loop; support (left) hand cupped UNDER the forend at 1.35× scale, fingers individually curled; micro grip-adjust at f45.
- `GA_Pump` 11f — rack: support hand GLUED to the forend, travel exactly 0.09 (matches shotgunAnimator's pump travel — keep them in sync).
- `GA_Reload` 40f — cant → 2 shell pushes → return → full rack → settle. **Weapon-side requirement:** while GA_Reload plays, the weapon viewmodel must cant about its grip point: pitch −24° (muzzle up) + roll 10°, easing in over f0–f5, holding (with a +0.006 lift on each shell push at f13/f19), unwinding f34–f39. The hands are solved locked to that canted gun (verified to 0.5 mm in gun space) — if the gun doesn't cant with the hands, the grip will visibly detach.
- `GA_Draw` 18f / `GA_Holster` 15f — from/to behind the back (Root-bone driven), matching the cycler prompt's draw/holster slots. Shotgun draw target ≈ 0.6 s ✓.
- Bitkiln originals also in the file for the Glock later: `Draw` 14f, `Holster` 10f, `Fire`, `FireLast`, `DryFire`, `Reload` 38f, `ReloadEmpty` 48f, `Inspect` 62f, `Idle` 96f, `Walk`, `Run`.

**Cycler integration:** the cycler state machine (CARRY→HOLSTER→DRAW) should use GA_Holster/GA_Draw for the Balistucia and bitkiln's Holster/Draw for the Glock. Flashlight hand-mount anchor moves to `LeftHand`.
