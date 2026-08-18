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

/** Deterministic value noise, so a texture looks the same every session. */
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function makeBallast() {
  return canvasTexture(256, 256, (ctx, w, h) => {
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

export function makeWood() {
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
  });
}

/**
 * Building facade.
 *
 * Windows are drawn as banded floors with only a scattering lit, which reads as
 * a real building at distance instead of a repeating checkerboard.
 */
export function makeFacade(seed = 1, hex = "#51607a") {
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
  });
}

/**
 * Trackside retaining wall: concrete panels with a few restrained tags rather
 * than the full-surface scribble it used to be — the wall should frame the
 * track, not compete with it.
 */
export function makeWall() {
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
