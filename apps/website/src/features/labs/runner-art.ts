import { travelTime, type TrailState } from "./runner-engine";

/** Original procedural scenery: no borrowed game art or claimed cultural monument. */
export function drawTrail(canvas: HTMLCanvasElement, state: TrailState, calm: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = 720, h = 660;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== w * pixelRatio) { canvas.width = w * pixelRatio; canvas.height = h * pixelRatio; }
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const poly = (points: number[][], fill: string) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  };
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#133f40"); sky.addColorStop(.36, "#9fafa0"); sky.addColorStop(.62, "#f4ce85");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ellipse(470, 148, 53, 53, "#ffdc8c");
  poly([[0, 260], [90, 165], [190, 235], [280, 164], [384, 270]], "#567969");
  poly([[334, 282], [460, 213], [540, 251], [630, 194], [720, 264], [720, 380]], "#668577");
  // A fictional trail gate on the horizon.
  ctx.fillStyle = "#254c43"; ctx.fillRect(310, 189, 23, 132); ctx.fillRect(388, 189, 23, 132); ctx.fillRect(308, 184, 105, 26);
  ctx.fillStyle = "#c9ad70"; ctx.fillRect(308, 206, 105, 5);
  poly([[0, 318], [720, 318], [720, 660], [0, 660]], "#295746");
  poly([[325, 286], [395, 286], [692, 660], [28, 660]], "#bf8960");
  poly([[325, 286], [28, 660], [0, 660], [314, 286]], "#e3b277");
  poly([[395, 286], [692, 660], [720, 660], [406, 286]], "#e3b277");
  const project = (lane: number, z: number) => {
    const depth = z * z;
    return { x: 360 + (lane - 1) * (20 + 214 * depth), y: 286 + 374 * depth, s: .12 + 1.35 * depth };
  };
  for (let i = 0; i < 13; i++) {
    const z = ((i / 13 + (calm ? 0 : state.elapsed * .24)) % 1);
    const a = project(0, z), b = project(2, z);
    ctx.strokeStyle = "#e4bc87"; ctx.lineWidth = Math.max(1, 3 * z); ctx.beginPath(); ctx.moveTo(a.x - 70 * z * z, a.y); ctx.lineTo(b.x + 70 * z * z, b.y); ctx.stroke();
  }
  for (const lane of [.5, 1.5]) {
    const near = project(lane, 1), far = project(lane, 0);
    ctx.strokeStyle = "#a06f53"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(far.x, far.y); ctx.lineTo(near.x, near.y); ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const z = ((i / 5 + (calm ? .2 : state.elapsed * .06)) % 1), y = 310 + 360 * z * z, s = .3 + z;
    for (const side of [-1, 1]) {
      const x = 360 + side * (70 + 420 * z * z);
      ctx.fillStyle = "#70563a"; ctx.fillRect(x - 5 * s, y - 75 * s, 10 * s, 84 * s);
      ellipse(x, y - 98 * s, 48 * s, 25 * s, "#173d32");
      ellipse(x - 24 * s, y - 80 * s, 36 * s, 21 * s, "#204b38");
    }
  }
  for (const item of [...state.items].sort((a, b) => a.age - b.age)) {
    if (item.hit && item.kind === "spark") continue;
    const z = item.age / travelTime(state.section), { x, y, s } = project(item.lane, z);
    ellipse(x, y + 5, 28 * s, 8 * s, "#71543b66");
    if (item.kind === "spark") {
      ellipse(x, y - 29 * s, 15 * s, 20 * s, "#ffdf81");
      ctx.strokeStyle = "#a57529"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.ellipse(x, y - 29 * s, 9 * s, 14 * s, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (item.kind === "rock") {
      poly([[x - 31 * s, y], [x - 26 * s, y - 42 * s], [x - 8 * s, y - 63 * s], [x + 20 * s, y - 54 * s], [x + 35 * s, y]], "#50686a");
      poly([[x - 26 * s, y - 42 * s], [x - 8 * s, y - 63 * s], [x + 5 * s, y - 15 * s], [x - 31 * s, y]], "#799090");
    } else {
      ctx.fillStyle = "#774b32"; ctx.fillRect(x - 43 * s, y - 26 * s, 86 * s, 27 * s);
      ellipse(x + 43 * s, y - 12 * s, 10 * s, 15 * s, "#d5a46b");
      ctx.strokeStyle = "#d5a46b"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(x - 37 * s, y - 21 * s); ctx.lineTo(x + 35 * s, y - 21 * s); ctx.stroke();
    }
  }
  // Runner viewed from behind; a turquoise jacket and gold scarf stay readable on the path.
  const player = project(state.lane, .86), jump = state.jump > 0 ? Math.sin(state.jump / .9 * Math.PI) * 95 : 0;
  const x = player.x, y = player.y - jump, bob = calm ? 0 : Math.sin(state.elapsed * 20) * 5;
  ellipse(x, player.y + 4, 28, 8, "#4e392b66");
  ctx.globalAlpha = state.invincible > 0 && Math.floor(state.elapsed * 12) % 2 ? .45 : 1;
  ctx.strokeStyle = "#203c44"; ctx.lineWidth = 13; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x - 10, y - 35); ctx.lineTo(x - 15 - bob, y - 4); ctx.moveTo(x + 10, y - 35); ctx.lineTo(x + 15 + bob, y - 4); ctx.stroke();
  ctx.strokeStyle = "#41beb0"; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(x - 15, y - 74); ctx.lineTo(x - 28, y - 47 + bob); ctx.moveTo(x + 15, y - 74); ctx.lineTo(x + 28, y - 47 - bob); ctx.stroke();
  poly([[x - 19, y - 83], [x + 19, y - 83], [x + 15, y - 34], [x - 15, y - 34]], "#54cfb9");
  ellipse(x, y - 103, 18, 21, "#855233"); ellipse(x, y - 112, 18, 12, "#252b29");
  poly([[x - 20, y - 85], [x + 20, y - 85], [x + 22, y - 76], [x - 20, y - 75]], "#ffda76");
  poly([[x + 14, y - 81], [x + 43, y - 68 + bob], [x + 41, y - 53 + bob], [x + 13, y - 73]], "#ffda76");
  ctx.globalAlpha = 1;
}
