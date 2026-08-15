export class Input {
  constructor(el) {
    this.queue = [];
    this.start = null;
    this.blocked = false;
    this.held = { jump: false, slide: false, left: false, right: false };

    const map = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      ArrowUp: "jump",
      KeyW: "jump",
      Space: "jump",
      ArrowDown: "slide",
      KeyS: "slide",
      KeyP: "pause",
      Escape: "pause",
      Enter: "start",
    };

    window.addEventListener("keydown", (e) => {
      const act = map[e.code];
      if (!act) return;
      e.preventDefault();
      if (act === "jump" || act === "slide" || act === "left" || act === "right") {
        this.held[act] = true;
      }
      if (e.repeat) return;
      this.push(act);
    });

    window.addEventListener("keyup", (e) => {
      const act = map[e.code];
      if (act === "jump" || act === "slide" || act === "left" || act === "right") {
        this.held[act] = false;
      }
    });

    window.addEventListener("blur", () => {
      this.held.jump = false;
      this.held.slide = false;
      this.held.left = false;
      this.held.right = false;
    });

    const down = (x, y) => {
      this.start = { x, y, t: performance.now() };
    };
    const up = (x, y) => {
      if (!this.start) return;
      const dx = x - this.start.x;
      const dy = y - this.start.y;
      const dt = performance.now() - this.start.t;
      this.start = null;
      if (dt > 700) return;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < 28 && ay < 28) return;
      if (ax > ay) this.push(dx > 0 ? "right" : "left");
      else this.push(dy > 0 ? "slide" : "jump");
    };

    el.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target.closest("button")) return;
        down(e.clientX, e.clientY);
      },
      { passive: true },
    );
    el.addEventListener(
      "pointerup",
      (e) => {
        if (e.target.closest("button")) return;
        up(e.clientX, e.clientY);
      },
      { passive: true },
    );
  }

  push(act) {
    if (this.blocked) return;
    if (this.queue.length > 4) this.queue.shift();
    this.queue.push(act);
  }

  consume() {
    return this.queue.shift() || null;
  }

  clear() {
    this.queue.length = 0;
  }
}
