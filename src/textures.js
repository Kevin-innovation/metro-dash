import * as THREE from "three";

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A geometry with its colour in the vertices, ready to merge with others so a
 * whole model can be one mesh and so one draw call.
 */
export function tinted(geometry, hex, x = 0, y = 0, z = 0) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.translate(x, y, z);
  const colour = new THREE.Color(hex);
  const colours = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) colour.toArray(colours, i);
  flat.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return flat;
}

/** Deterministic value noise, so a texture looks the same every session. */
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Snow lying over ballast: a soft pale surface with stones poking through.
 *
 * A base colour under the white rather than a pure white, because tone mapping
 * would blow pure white out, and it is the surface everything else on the track
 * has to be read against. Blobs wrap at the edges, so a tiled floor shows no seam.
 */
function snowOverBallast(ctx, w, h) {
  ctx.fillStyle = "#c9d6e2";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = hash(i, 41) * w;
    const y = hash(i, 42) * h;
    const r = 14 + hash(i, 43) * 26;
    const light = hash(i, 44) > 0.35;
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, light ? "rgba(240,246,252,0.7)" : "rgba(150,172,195,0.28)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  // Stones in small clumps, the way a thin cover actually breaks.
  for (let c = 0; c < 26; c++) {
    const cx = hash(c, 45) * w;
    const cy = hash(c, 46) * h;
    for (let i = 0; i < 16; i++) {
      const v = 70 + hash(c * 31 + i, 47) * 50;
      const s = 1 + hash(c * 31 + i, 48) * 2.5;
      ctx.fillStyle = `rgb(${v + 14},${v + 6},${v})`;
      ctx.fillRect(
        (cx + (hash(c * 31 + i, 49) - 0.5) * 18 + w) % w,
        (cy + (hash(c * 31 + i, 50) - 0.5) * 18 + h) % h,
        s,
        s,
      );
    }
  }
}

export function makeBallast(snow = false) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    if (snow) {
      snowOverBallast(ctx, w, h);
      return;
    }
    ctx.fillStyle = "#6d6053";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const x = (hash(i, 1) * w) | 0;
      const y = (hash(i, 2) * h) | 0;
      const s = 1 + hash(i, 3) * 3;
      const v = 84 + hash(i, 4) * 58;
      ctx.fillStyle = `rgb(${v + 16},${v + 4},${v - 12})`;
      ctx.fillRect(x, y, s, s);
    }
    // Faint oil streaks along the running direction add depth at speed.
    ctx.fillStyle = "rgba(30,24,18,0.18)";
    for (let i = 0; i < 14; i++) {
      const x = hash(i, 21) * w;
      ctx.fillRect(x, 0, 2 + hash(i, 22) * 5, h);
    }
  });
}

/**
 * Corrugated steel skin for the freight container.
 *
 * Drawn in greys so one upload can be tinted to every container colour by the
 * material, and so the folds read as folds — the flat-coloured box it replaced
 * was the same shape and brightness as a bus at distance, which is exactly the
 * read the player has to make in a hurry.
 */
export function makeContainerSkin() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#cfcfcf";
    ctx.fillRect(0, 0, w, h);

    // Vertical folds: a lit face and a shaded face per rib, which is what makes
    // the surface read as pressed metal rather than as printed stripes.
    const pitch = 16;
    for (let x = 0; x < w; x += pitch) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(x, 0, pitch * 0.34, h);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x + pitch * 0.6, 0, pitch * 0.32, h);
    }

    // Top and bottom rails, the heavy edges every container is built around.
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, 0, w, 11);
    ctx.fillRect(0, h - 11, w, 11);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(0, 11, w, 2);

    // A little weathering, so three identical boxes in a row do not look
    // stamped from the same frame.
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 31) * w;
      const y = 12 + hash(i, 32) * (h - 34);
      ctx.fillStyle = `rgba(60,34,18,${0.05 + hash(i, 33) * 0.12})`;
      ctx.fillRect(x, y, 1 + hash(i, 34) * 3, 4 + hash(i, 35) * 22);
    }
  });
}

export function makeWood(snow = false) {
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = "#5d3c24";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const n = 18 + Math.sin(y * 0.4) * 9;
      ctx.fillStyle = `rgb(${96 + n},${60 + n * 0.4},${32})`;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
    // A dusting along the ends of each sleeper, with the middle left dark so the
    // sleeper still reads against the snow around it.
    if (snow) {
      ctx.fillStyle = "rgba(236,243,250,0.9)";
      for (let i = 0; i < 16; i++) {
        const x = hash(i, 51) * 34;
        const y = hash(i, 52) * h;
        const r = 3 + hash(i, 53) * 7;
        ctx.fillRect(x, y, r * 2, r);
        ctx.fillRect(w - x - r * 2, h - y - r, r * 2, r);
      }
    }
  });
}

/**
 * Building facade.
 *
 * Windows are drawn as banded floors with only a scattering lit, which reads as
 * a real building at distance instead of a repeating checkerboard.
 */
export function makeFacade(seed = 1, hex = "#51607a", snow = false) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);

    // Gentle vertical shading so the block has a lit and a shaded face. Kept
    // shallow: the facade is background and must stay bright enough to read as
    // distance rather than as a dark wall beside the track.
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, "rgba(255,255,255,0.12)");
    shade.addColorStop(0.5, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    const cols = 5;
    const rows = 11;
    const bw = 30;
    const bh = 22;
    const gapX = (w - cols * bw) / (cols + 1);
    const gapY = (h - rows * bh) / (rows + 1);

    for (let r = 0; r < rows; r++) {
      const y = gapY + r * (bh + gapY);
      for (let c = 0; c < cols; c++) {
        const x = gapX + c * (bw + gapX);
        const lit = hash(seed * 3 + r, c + 3) > 0.66;
        ctx.fillStyle = lit ? "#ffe9b4" : "#5d6f86";
        ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = lit ? "rgba(255,255,255,0.3)" : "rgba(190,215,235,0.3)";
        ctx.fillRect(x, y, bw, 5);
      }
    }

    // Parapet cap so rooflines do not float.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, w, 9);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(0, 9, w, 3);

    // Snow on the roofline. Painted rather than built: the top of a tower is
    // above the lens, so a real cap would be a draw call nobody could look down
    // on, and every tier gets this for nothing.
    if (snow) snowCap(ctx, w, seed, 26, 20);
  });
}

/**
 * A tower in a city with the lights out, for the Christmas skyline.
 *
 * Many small floors, because the towers are drawn far taller than the daytime
 * ones, and hardly anyone home: most windows are dark glass and only a few are
 * lit. Painted in its final night colours, since these towers are drawn unlit.
 */
export function makeNightFacade(seed = 1, hex = "#1c2536") {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);

    const cols = 7;
    const rows = 26;
    const bw = 22;
    const bh = 12;
    const gapX = (w - cols * bw) / (cols + 1);
    const gapY = (h - rows * bh) / (rows + 1);
    for (let r = 0; r < rows; r++) {
      const y = gapY + r * (bh + gapY);
      for (let c = 0; c < cols; c++) {
        const x = gapX + c * (bw + gapX);
        const lit = hash(seed * 5 + r, c + 9) > 0.93;
        ctx.fillStyle = lit ? (hash(c, r + seed) > 0.5 ? "#ffd98a" : "#ffc266") : "#0b111c";
        ctx.fillRect(x, y, bw, bh);
      }
    }

    // Stone bands every few floors, the way the old Manhattan blocks are built.
    ctx.fillStyle = "rgba(170,190,220,0.08)";
    for (let y = 40; y < h; y += 96) ctx.fillRect(0, y, w, 6);

    snowCap(ctx, w, seed, 10, 7);
  });
}

/** Barber-pole red and white, tiling in both directions. For candy canes. */
export function makeCandyStripes() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#fff5f5";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e11d2e";
    for (let i = -1; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w, h);
      ctx.lineTo(i * w + w / 2, h);
      ctx.lineTo(i * w + w, 0);
      ctx.lineTo(i * w + w / 2, 0);
      ctx.fill();
    }
  });
}

/** A white band with an uneven lower edge, drooping over the top of a surface. */
function snowCap(ctx, w, seed, depth, droop) {
  ctx.fillStyle = "#eef4fa";
  ctx.fillRect(0, 0, w, depth);
  for (let x = 0; x < w; x += 18) {
    const r = 9 + hash(x, seed) * 5;
    ctx.beginPath();
    ctx.ellipse(x + 9, depth, r, hash(x, seed + 1) * droop + 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Trackside retaining wall: concrete panels with a few restrained tags rather
 * than the full-surface scribble it used to be — the wall should frame the
 * track, not compete with it.
 */
export function makeWall(snow = false) {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#8d9098";
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 900; i++) {
      const x = (hash(i, 11) * w) | 0;
      const y = (hash(i, 12) * h) | 0;
      const v = 128 + hash(i, 13) * 34;
      ctx.fillStyle = `rgba(${v},${v + 3},${v + 9},0.45)`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Panel joints give the wall a readable scale as it streams past.
    ctx.strokeStyle = "rgba(60,66,76,0.5)";
    ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Colour band along the top edge, the way transit walls actually carry
    // their livery. Reads at speed without the noise of full-surface graffiti.
    ctx.fillStyle = "#2f6f86";
    ctx.fillRect(0, 12, w, 14);
    ctx.fillStyle = "#f0b53c";
    ctx.fillRect(0, 26, w, 5);

    // Grime at the base grounds the wall.
    const grime = ctx.createLinearGradient(0, h * 0.68, 0, h);
    grime.addColorStop(0, "rgba(48,52,58,0)");
    grime.addColorStop(1, "rgba(48,52,58,0.5)");
    ctx.fillStyle = grime;
    ctx.fillRect(0, h * 0.68, w, h * 0.32);

    if (snow) {
      snowCap(ctx, w, 3, 9, 7);
      // String lights along the wall, in the texture so they cost no draw calls.
      ctx.strokeStyle = "rgba(30,41,59,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 42);
      ctx.lineTo(w, 42);
      ctx.stroke();
      wallBulbs(ctx);
    }
  });
}

function wallBulbs(ctx) {
  const bulbs = ["#ff5252", "#ffd54f", "#66bb6a", "#4fc3f7"];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = bulbs[i % bulbs.length];
    ctx.beginPath();
    // Narrower than tall: this texture is stretched along the wall.
    ctx.ellipse(16 + i * 32, 48, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Only the bulbs, on black: what still shows on the wall once it is dark out. */
export function makeWallGlow() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    wallBulbs(ctx);
  });
}

/**
 * Sky dome gradient. Tuned to sit under the same warm key light as the scene —
 * a clear day with haze at the horizon, rather than a sunset behind noon
 * lighting.
 */
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * Vertical gradient from `top` down to `bottom`.
 *
 * Taking the two ends as arguments is what lets a zone hand it a night sky or a
 * tunnel ceiling without a second texture path.
 */
export function makeSky(top = 0x2f7fc4, bottom = 0xf0e3cf) {
  return canvasTexture(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(top));
    // Two thirds of the way down is where the horizon reads, so the mid stops
    // are weighted towards the bottom colour rather than sitting halfway.
    g.addColorStop(0.5, hex(mixHex(top, bottom, 0.45)));
    g.addColorStop(0.82, hex(mixHex(top, bottom, 0.82)));
    g.addColorStop(1, hex(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function mixHex(a, b, k) {
  const ch = (c, shift) => (c >> shift) & 0xff;
  const m = (shift) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Soft round blob used for the drifting clouds. */
export function makeCloud() {
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const puffs = [
      [40, 40, 22],
      [66, 34, 26],
      [92, 42, 20],
      [56, 46, 18],
    ];
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.65, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
