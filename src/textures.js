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

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function makeBallast() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#7d6b57";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const x = (hash(i, 1) * w) | 0;
      const y = (hash(i, 2) * h) | 0;
      const s = 1 + hash(i, 3) * 3;
      const v = 90 + hash(i, 4) * 70;
      ctx.fillStyle = `rgb(${v + 20},${v},${v - 18})`;
      ctx.fillRect(x, y, s, s);
    }
  });
}

export function makeWood() {
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = "#6b4428";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const n = 20 + Math.sin(y * 0.4) * 10;
      ctx.fillStyle = `rgb(${110 + n},${68 + n * 0.4},${36})`;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
  });
}

export function makeFacade(seed = 1, hex = "#5c6bc0") {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, 18, h);
    const cols = 4;
    const rows = 8;
    const bw = 36;
    const bh = 28;
    const gapX = (w - cols * bw) / (cols + 1);
    const gapY = 28;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = hash(seed + r, c + 3) > 0.22;
        const x = gapX + c * (bw + gapX);
        const y = 36 + r * (bh + gapY);
        ctx.fillStyle = on ? "#ffe082" : "#1a2740";
        ctx.fillRect(x, y, bw, bh);
        if (on) {
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(x, y, bw, 6);
        }
      }
    }
  });
}

export function makeGraffiti() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#3d4454";
    ctx.fillRect(0, 0, w, h);
    const colors = ["#14d4b8", "#ff7a3c", "#ffd24a", "#7c4dff", "#40c4ff"];
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 6 + hash(i, 8) * 8;
      ctx.beginPath();
      ctx.moveTo(hash(i, 1) * w, hash(i, 2) * h);
      ctx.bezierCurveTo(
        hash(i, 3) * w,
        hash(i, 4) * h,
        hash(i, 5) * w,
        hash(i, 6) * h,
        hash(i, 7) * w,
        hash(i, 9) * h,
      );
      ctx.stroke();
    }
  });
}

export function makeSky() {
  return canvasTexture(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#4fc3f7");
    g.addColorStop(0.45, "#81d4fa");
    g.addColorStop(0.7, "#ffe082");
    g.addColorStop(1, "#ff8a65");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
