// lib/reportCharts.js
// Draws the three report charts on an off-screen HTML canvas and returns PNG
// data URLs for embedding in the pdfmake document. Browser-only.

const COL = {
  rust: "#B0451F", slate: "#3F5870", sage: "#5A7359", ochre: "#C8961A",
  ink: "#0E1116", ink500: "#5B5F66", rule: "#C8C2B4",
  appt: "#2B2A26", cb: "#4A7BA6", ud: "#6FA052", load: "#E0A21C",
};
const SCALE = 2; // render at 2x for crisp embedding

function makeCanvas(wCss, hCss) {
  const c = document.createElement("canvas");
  c.width = wCss * SCALE;
  c.height = hCss * SCALE;
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, wCss, hCss);
  ctx.textBaseline = "alphabetic";
  return { c, ctx, w: wCss, h: hCss };
}

function axes(ctx, x0, y0, x1, yTop, label) {
  ctx.strokeStyle = COL.ink500;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x0, yTop); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0);
  ctx.stroke();
  if (label) {
    ctx.save();
    ctx.translate(x0 - 30, (y0 + yTop) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = COL.ink;
    ctx.font = "10px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function yTicks(ctx, x0, y0, yTop, vMax, fmt = (v) => v) {
  const steps = 5;
  ctx.fillStyle = COL.ink500;
  ctx.font = "9px Helvetica, Arial, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= steps; i++) {
    const v = (vMax / steps) * i;
    const y = y0 - ((y0 - yTop) * i) / steps;
    ctx.fillText(fmt(v), x0 - 6, y + 3);
    ctx.strokeStyle = COL.rule;
    ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 0.0, y); ctx.stroke();
  }
}

// ---- Chart 1: solids holding capacity, grouped bars ----
export function chartCapacity(model) {
  const { w, h, ctx, c } = makeCanvas(560, 220);
  const x0 = 52, y0 = 175, x1 = 540, yTop = 24;
  const measures = [
    ["Pore-fill\nceiling", model.poreFill.D1, model.poreFill.D2],
    ["Kawamura\n(upper)", layerDepth(model.filters.D1, "anthracite") * 1.5,
      layerDepth(model.filters.D2, "anthracite") * 1.5],
    ["AWWA M37\n(upper)", 5.0, 5.0],
    ["K cap", model.kCap, model.kCap],
  ];
  const vMax = 12;
  axes(ctx, x0, y0, x1, yTop, "K  (kg/m2/run)");
  yTicks(ctx, x0, y0, yTop, vMax);
  const groupW = (x1 - x0) / measures.length;
  const bw = groupW * 0.30;
  measures.forEach((m, i) => {
    const gx = x0 + groupW * i + groupW / 2;
    [["D1", m[1], COL.rust, -1], ["D2", m[2], COL.slate, 1]].forEach(([, v, col, side]) => {
      const bx = gx + side * (bw / 2 + 1) - bw / 2;
      const bh = ((y0 - yTop) * v) / vMax;
      ctx.fillStyle = col;
      ctx.fillRect(bx, y0 - bh, bw, bh);
      ctx.fillStyle = col;
      ctx.font = "8px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(v.toFixed(1), bx + bw / 2, y0 - bh - 4);
    });
    ctx.fillStyle = COL.ink500;
    ctx.font = "8.5px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    m[0].split("\n").forEach((ln, k) => ctx.fillText(ln, gx, y0 + 14 + k * 10));
  });
  legend(ctx, x1 - 110, yTop + 4, [["D1", COL.rust], ["D2", COL.slate]]);
  return c.toDataURL("image/png");
}

// ---- Chart 2: as-built head budget, four stacked bars ----
export function chartHeadBudget(model) {
  const { ctx, c } = makeCanvas(560, 250);
  const x0 = 52, y0 = 188, x1 = 540, yTop = 24;
  const pts = [
    ["D1 coag", model.modes.coag.D1, model.filters.D1],
    ["D2 coag", model.modes.coag.D2, model.filters.D2],
    ["D1 soft", model.modes.soft.D1, model.filters.D1],
    ["D2 soft", model.modes.soft.D2, model.filters.D2],
  ];
  const vMax = Math.max(model.filters.D1.drivingHead_m, model.filters.D2.drivingHead_m) + 0.9;
  axes(ctx, x0, y0, x1, yTop, "Head (m)");
  yTicks(ctx, x0, y0, yTop, vMax, (v) => v.toFixed(1));
  const slots = [0, 1, 2.4, 3.4];
  const span = (x1 - x0) / 4.2;
  const bw = span * 0.62;
  const sc = (v) => ((y0 - yTop) * v) / vMax;
  pts.forEach(([lab, r, filt], i) => {
    const cx = x0 + 20 + slots[i] * span;
    let base = y0;
    [[r.appurt, COL.appt], [r.cb, COL.cb], [r.ud, COL.ud], [r.load, COL.load]]
      .forEach(([v, col]) => {
        const bh = sc(v);
        ctx.fillStyle = col;
        ctx.fillRect(cx - bw / 2, base - bh, bw, bh);
        base -= bh;
      });
    // driving head line
    const hy = y0 - sc(filt.drivingHead_m);
    ctx.strokeStyle = COL.rust;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2 - 3, hy); ctx.lineTo(cx + bw / 2 + 3, hy);
    ctx.stroke();
    ctx.fillStyle = COL.ink500;
    ctx.font = "8.5px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    lab.split(" ").forEach((ln, k) => ctx.fillText(ln, cx, y0 + 14 + k * 10));
  });
  legend(ctx, x0 + 4, yTop - 6, [
    ["Appurtenances", COL.appt], ["Clean bed", COL.cb],
    ["Underdrain", COL.ud], ["Solids load", COL.load],
  ], true);
  return c.toDataURL("image/png");
}

// ---- Chart 3: run length retained, as-built vs feed doubled ----
export function chartSensitivity(model) {
  const { ctx, c } = makeCanvas(560, 220);
  const x0 = 52, y0 = 175, x1 = 540, yTop = 24;
  const pts = [
    ["D1 coag", model.modes.coag.D1.modeDesign.run, model.modes.coag.D1.sens.runRet],
    ["D2 coag", model.modes.coag.D2.modeDesign.run, model.modes.coag.D2.sens.runRet],
    ["D1 soft", model.modes.soft.D1.modeDesign.run, model.modes.soft.D1.sens.runRet],
    ["D2 soft", model.modes.soft.D2.modeDesign.run, model.modes.soft.D2.sens.runRet],
  ];
  const vMax = 48;
  axes(ctx, x0, y0, x1, yTop, "Run length (h)");
  yTicks(ctx, x0, y0, yTop, vMax, (v) => v.toFixed(0));
  const groupW = (x1 - x0) / pts.length;
  const bw = groupW * 0.30;
  pts.forEach((p, i) => {
    const gx = x0 + groupW * i + groupW / 2;
    [[p[1], COL.sage, -1], [p[2], COL.ochre, 1]].forEach(([v, col, side]) => {
      const bx = gx + side * (bw / 2 + 1) - bw / 2;
      const bh = ((y0 - yTop) * v) / vMax;
      ctx.fillStyle = col;
      ctx.fillRect(bx, y0 - bh, bw, bh);
      ctx.fillStyle = col;
      ctx.font = "8px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(v.toFixed(0), bx + bw / 2, y0 - bh - 4);
    });
    ctx.fillStyle = COL.ink500;
    ctx.font = "8.5px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p[0], gx, y0 + 14);
  });
  legend(ctx, x1 - 170, yTop + 4, [
    ["As-built feed", COL.sage], ["Feed doubled", COL.ochre]]);
  return c.toDataURL("image/png");
}

function legend(ctx, x, y, items, horizontal = false) {
  ctx.font = "8.5px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  let cx = x;
  items.forEach(([lab, col], i) => {
    const ly = horizontal ? y : y + i * 13;
    const lx = horizontal ? cx : x;
    ctx.fillStyle = col;
    ctx.fillRect(lx, ly - 6, 9, 9);
    ctx.fillStyle = COL.ink500;
    ctx.fillText(lab, lx + 13, ly + 1.5);
    if (horizontal) cx += 13 + ctx.measureText(lab).width + 14;
  });
}

function layerDepth(filter, media) {
  const l = filter.mediaLayers.find((x) => x.media === media);
  return l ? l.depth : 0;
}

export function buildAllCharts(model) {
  return {
    capacity: chartCapacity(model),
    headBudget: chartHeadBudget(model),
    sensitivity: chartSensitivity(model),
  };
}
