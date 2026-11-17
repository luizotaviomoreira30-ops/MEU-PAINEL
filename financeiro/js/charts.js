// SVG charts drawn to scale with the theme's colours. Values are cents.
import { s, h, brl, brlShort } from "./ui.js";

const niceMax = v => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

// Grouped bars: labels on X, one bar per series. series: [{ name, color, values[] }]
export function groupedBars({ labels, series, height = 220, highlight = -1 }) {
  const W = 640, H = height, L = 56, R = 8, T = 10, B = 26;
  const max = niceMax(Math.max(1, ...series.flatMap(x => x.values)));
  const y = v => T + (H - T - B) * (1 - v / max);
  const groupW = (W - L - R) / labels.length;
  const barW = Math.min(26, (groupW - 12) / series.length);
  const ticks = [0, .25, .5, .75, 1].map(f => max * f);
  return h("div", { style: { display: "grid", gap: "10px" } },
    s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": series.map(x => x.name + ": " + x.values.map(brl).join(", ")).join("; ") },
      ticks.map(t => [s("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: "var(--line)", "stroke-width": 1 }),
        s("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, document.createTextNode(brlShort(t)))]),
      labels.map((lab, i) => {
        const gx = L + i * groupW + (groupW - barW * series.length - 4 * (series.length - 1)) / 2;
        return [
          ...series.map((ser, j) => {
            const v = Math.max(0, ser.values[i] || 0);
            const top = y(v);
            return s("rect", { x: gx + j * (barW + 4), y: top, width: barW, height: Math.max(0, H - B - top), rx: 3,
              fill: ser.color, opacity: highlight === -1 || highlight === i ? 1 : .45 },
              s("title", {}, document.createTextNode(ser.name + " · " + lab + ": " + brl(v))));
          }),
          s("text", { x: L + i * groupW + groupW / 2, y: H - 8, "text-anchor": "middle" }, document.createTextNode(lab))
        ];
      })),
    h("div", { class: "legend" }, series.map(x => h("span", {}, h("i", { class: "dot", style: { background: x.color } }), x.name))));
}

// Line with area fill; points: [{ label, value }]
export function lineChart({ points, height = 200, color = "var(--chart-1)" }) {
  const W = 640, H = height, L = 64, R = 12, T = 12, B = 26;
  const vals = points.map(p => p.value);
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  const max = niceMax(hi), min = lo < 0 ? -niceMax(-lo) : 0;
  const x = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const path = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ");
  const area = path + ` L${x(points.length - 1).toFixed(1)} ${y(Math.max(min, 0))} L${x(0).toFixed(1)} ${y(Math.max(min, 0))} Z`;
  const ticks = [min, (min + max) / 2, max];
  const last = points[points.length - 1];
  return s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": points.map(p => p.label + ": " + brl(p.value)).join(", ") },
    ticks.map(t => [s("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: "var(--line)", "stroke-width": 1 }),
      s("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, document.createTextNode(brlShort(t)))]),
    min < 0 ? s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: "var(--muted)", "stroke-width": 1, "stroke-dasharray": "3 3" }) : null,
    s("path", { d: area, fill: color, opacity: .08 }),
    s("path", { d: path, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round" }),
    points.map((p, i) => s("circle", { cx: x(i), cy: y(p.value), r: i === points.length - 1 ? 4.5 : 3, fill: i === points.length - 1 ? "var(--gold)" : color },
      s("title", {}, document.createTextNode(p.label + ": " + brl(p.value))))),
    points.map((p, i) => s("text", { x: x(i), y: H - 8, "text-anchor": "middle" }, document.createTextNode(p.label))),
    last ? s("text", { x: Math.min(W - R, x(points.length - 1)), y: Math.max(12, y(last.value) - 10), "text-anchor": "end", style: "font-weight:700;fill:var(--ink)" }, document.createTextNode(brlShort(last.value))) : null);
}

// Donut with total in the middle; parts: [{ label, value, color }]
export function donut({ parts, size = 170, center }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  const r = 70, c = 2 * Math.PI * r;
  let off = 0;
  return s("svg", { class: "chart", viewBox: "0 0 170 170", width: size, height: size, role: "img", "aria-label": parts.map(p => p.label + ": " + brl(p.value)).join(", ") },
    s("circle", { cx: 85, cy: 85, r, fill: "none", stroke: "var(--surface-2)", "stroke-width": 20 }),
    parts.map(p => {
      const len = Math.max(0, p.value) / total * c;
      const seg = s("circle", { cx: 85, cy: 85, r, fill: "none", stroke: p.color, "stroke-width": 20, "stroke-dasharray": `${len} ${c - len}`,
        "stroke-dashoffset": -off, transform: "rotate(-90 85 85)" }, s("title", {}, document.createTextNode(p.label + ": " + brl(p.value))));
      off += len;
      return seg;
    }),
    center ? s("text", { x: 85, y: 82, "text-anchor": "middle", style: "font-size:11px" }, document.createTextNode(center[0])) : null,
    center ? s("text", { x: 85, y: 102, "text-anchor": "middle", style: "font-size:17px;font-weight:700;fill:var(--ink)" }, document.createTextNode(center[1])) : null);
}
export const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
