# MetDash generated-asset style lock v1

## Reference assets

- `metdash-style-anchor-v1.png` — overall scene, palette, lighting, and material reference.
- `character-kai-master-v1.png` — front-side identity and costume reference for Kai.
- `character-kai-master-v2-rear.png` — primary rear gameplay-facing master reference for Kai; validated RGBA cutout.
- `../character/kai/character-kai-run-rear-v1.png` — first rear running-pose test; validated RGBA cutout and joint-only pose change.
- `../character/kai/character-kai-jump-rear-v1.png` — rear airborne jump-pose test; validated RGBA cutout and joint-only pose change.
- `../character/kai/character-kai-slide-rear-v1.png` — rear low slide-pose test; validated RGBA cutout and joint-only pose change.
- `../character/kai/character-kai-mount-rear-v1.png` — rear mounting-transition pose test; validated RGBA cutout and joint-only pose change.
- `../character/kai/character-kai-boarding-rear-v1.png` — rear hoverboard-riding pose test without the separate board object; validated RGBA cutout and joint-only pose change.
- `../character/kai/character-kai-flying-rear-v1.png` — rear flying pose test without separate jet effects; validated RGBA cutout and joint-only pose change.
- `../objects/train/train-rear-3q-v1.png` — rear three-quarter train asset; validated RGBA cutout and rear gameplay cues.
- `../objects/bus/bus-oncoming-front-3q-v1.png` — front three-quarter oncoming bus asset; validated RGBA cutout and approach cues.
- `../objects/obstacles/barrier-jump-v1.png` — orange-and-white jump barrier asset; validated RGBA cutout and jump readability.
- `../objects/obstacles/slide-gate-v1.png` — yellow-black low-clearance slide gate asset; validated RGBA cutout and slide readability.
- `../objects/obstacles/crate-v1.png` — corrugated freight-container jump obstacle; validated RGBA cutout and obstacle distinction.
- `../objects/collectibles/coin-v1.png` — gold collectible coin with teal chevron emblem; validated RGBA cutout and small-screen readability.
- `../objects/powerups/magnet-v1.png` — lavender magnet pickup with luminous ring and gem core; validated RGBA cutout.
- `../objects/powerups/jetpack-v1.png` — orange twin-cylinder jetpack with cyan core and rocket flames; validated RGBA cutout.
- `../objects/powerups/double-v1.png` — gold faceted double-score pickup with warm halo; validated RGBA cutout.
- `../objects/powerups/sneakers-v1.png` — white/cyan super-sneakers pickup with speed fins and teal halo; validated RGBA cutout.
- `../environment/buildings/apartment-tower-3q-v1.png` — muted lavender/taupe apartment tower environment candidate; opaque RGB scene asset.
- `../environment/city/city-skyline-panorama-v1.png` — wide hazy city skyline backdrop with a clear central vanishing corridor; opaque RGB scene asset.
- `../environment/tunnel/tunnel-mouth-3q-v1.png` — dark tunnel portal with warm rim lighting and interior strip lights; opaque RGB scene asset.
- `../environment/track/elevated-track-deck-v1.png` — three-lane elevated railway deck with teal/gold side-wall livery; opaque RGB scene asset.
- `../environment/props/streetlamp-v1.png` — trackside streetlamp prop with warm lantern; validated RGBA cutout.

## Art direction

- Polished stylized 3D mobile-game illustration.
- Soft beveled forms with clear silhouettes at small on-screen sizes.
- Warm daylight key light, cool atmospheric rim light, and restrained soft shadows.
- Primary palette: teal, deep navy, coral/orange, warm gold, muted cyan, and blue-gray/lavender city tones.
- Painted materials with moderate surface detail; readable shapes take priority over realism.
- No text, logos, signage copy, watermark, or unnecessary micro-detail in generated assets.

## Character invariants

- The primary gameplay view is a rear three-quarter view: the camera follows behind Kai and looks down the track.
- Kai's hair silhouette, hood, backpack, clothing, colors, proportions, camera angle, scale, and lighting remain fixed.
- The face is a secondary reference only; it must not force a front-facing gameplay pose.
- Animation changes only joint angles and limb positions: shoulders, elbows, wrists, hips, knees, and ankles.
- Do not regenerate a redesigned character for a new pose.
- Do not add or remove accessories between poses.
- No baked ground shadow; the game supplies the contact shadow.
- Future character skins share the same skeleton, rear gameplay camera, proportions, and pose anchors.

## Runtime alignment

- Generated images are visual assets only; collision and pickup geometry remains defined by `src/specs.js`.
- Character motion remains driven by the existing player root/hip/limb state model.
- Vehicle and pickup assets must preserve their logical entity IDs and pooled root transform behavior.
- Transparent assets must contain real alpha and must not rely on a black or colored matte background.
- Vehicle direction is explicit: rear windows and red tail lamps mean moving away; front windshield and white headlights mean approaching the camera.

## Phase 1 acceptance checks

- Style anchor exists and is visually coherent with the intended game direction.
- Front master is full-body, uncropped, centered, and RGBA.
- Rear gameplay master is full-body, uncropped, centered, correctly oriented away from the camera, and validated with a true alpha channel.
- All future prompts include the character invariants and joint-only animation rule.
- Phase 2 may begin with modular character-part extraction and rig-compatible pose planning.
