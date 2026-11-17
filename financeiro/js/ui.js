// Small UI kit shared by every screen: element builder, formatting, toasts, modal forms, icons.
import { parseMoney } from "../../shared/fincore.js";

export const $ = (s, r = document) => r.querySelector(s);
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const c of kids.flat(Infinity)) if (c) el.append(c);
  return el;
}

/* ---------- icons (constant markup) ---------- */
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  txns: '<path d="M7 7h13M7 12h13M7 17h13"/><path d="M3.5 7h.01M3.5 12h.01M3.5 17h.01"/>',
  bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  budget: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  up: '<path d="M7 17L17 7M9 7h8v8"/>',
  down: '<path d="M17 7L7 17M15 17H7V9"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16 15h2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  invest: '<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'
};
export function icon(name) {
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true");
  el.innerHTML = ICONS[name] || "";
  return el;
}

/* ---------- formatting ---------- */
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
export const brl = cents => BRL.format((Number(cents) || 0) / 100);
export const brlShort = cents => BRL_SHORT.format((Number(cents) || 0) / 100);
export const signed = cents => (cents > 0 ? "+\u00a0" : cents < 0 ? "−\u00a0" : "") + BRL.format(Math.abs(cents) / 100);
export const moneyField = cents => cents ? (Math.abs(cents) / 100).toFixed(2).replace(".", ",") : "";
export const pad = n => String(n).padStart(2, "0");
export const isoOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const today = () => isoOf(new Date());
export const parseIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d || 1); };
export const addDaysIso = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const fmtDate = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
export const fmtDay = iso => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(parseIso(iso)).replace(".", "");
export function monthLabel(mk, short = false) {
  const s = new Intl.DateTimeFormat("pt-BR", short ? { month: "short", year: "2-digit" } : { month: "long", year: "numeric" }).format(parseIso(mk + "-01")).replace(".", "");
  return s[0].toUpperCase() + s.slice(1);
}
export const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

/* ---------- toast and save indicator ---------- */
let toastTimer;
export function toast(msg, kind) {
  let t = $(".toast");
  if (!t) { t = h("div", { class: "toast", role: "status", "aria-live": "polite" }); document.body.append(t); }
  t.className = "toast" + (kind === "err" ? " err" : "");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === "err" ? 6500 : 3000);
}

/* ---------- confirm-in-place buttons ---------- */
export function confirmButton(label, confirmLabel, run, cls = "btn danger") {
  let armed = false;
  const b = h("button", { type: "button", class: cls, text: label, onclick: async () => {
    if (!armed) { armed = true; b.classList.add("armed"); b.textContent = confirmLabel; return; }
    b.disabled = true; b.textContent = "Aguarde…";
    const ok = await run();
    if (!ok) { b.disabled = false; b.textContent = confirmLabel; }
  } });
  return b;
}

/* ---------- modal form ----------
   fields: { key, label, type: text|money|date|month|select|textarea|checkbox|number|seg|node, options, show(values),
             full, required, hint, placeholder, suggestions }
   The form re-checks each field's show() whenever a value changes, so one form serves several kinds. */
export function openForm({ title, fields, values = {}, onSave, onDelete, deleteLabel = "Excluir", extra, saveLabel = "Salvar", onChange }) {
  let saving = false;
  const state = { ...values };
  const onKey = e => { if (e.key === "Escape") close(); };
  const close = () => { if (saving) return; scrim.remove(); document.removeEventListener("keydown", onKey); };
  const formId = "form-" + Math.random().toString(36).slice(2, 9);
  const form = h("form", { class: "form", id: formId, novalidate: true });
  const rows = [];
  const read = () => {
    for (const f of fields) {
      if (!f.key || f.type === "node" || f.type === "seg") continue;
      const el = form.elements[f.key];
      if (!el) continue;
      state[f.key] = f.type === "checkbox" ? el.checked : el.value;
    }
    return state;
  };
  const refresh = () => {
    read();
    for (const { f, row } of rows) row.hidden = f.show ? !f.show(state) : false;
  };
  for (const f of fields) {
    let row;
    if (f.type === "node") row = h("div", { class: "full" }, typeof f.node === "function" ? f.node(state) : f.node);
    else if (f.type === "heading") row = h("h3", { class: "full", style: { fontSize: "15px" }, text: f.label });
    else if (f.type === "seg") {
      const seg = h("div", { class: "seg", role: "group", "aria-label": f.label });
      const paint = () => { for (const b of seg.children) b.setAttribute("aria-pressed", b.dataset.v === state[f.key] ? "true" : "false"); };
      for (const [v, l] of f.options) seg.append(h("button", { type: "button", "data-v": v, text: l, onclick: () => { state[f.key] = v; paint(); refresh(); onChange && onChange(state, form); } }));
      paint();
      row = h("div", { class: "full" }, seg);
    } else {
      const id = "f-" + f.key;
      const v = state[f.key] ?? "";
      let input;
      if (f.type === "select") {
        const opts = typeof f.options === "function" ? f.options(state) : f.options;
        input = h("select", { class: "field", id, name: f.key }, opts.map(o => Array.isArray(o)
          ? h("option", { value: o[0], text: o[1] })
          : h("optgroup", { label: o.group }, o.items.map(([ov, ol]) => h("option", { value: ov, text: ol })))));
        input.value = String(v);
      } else if (f.type === "textarea") {
        input = h("textarea", { class: "field", id, name: f.key, rows: f.rows || 3, placeholder: f.placeholder });
        input.value = String(v);
      } else if (f.type === "checkbox") {
        input = h("input", { type: "checkbox", id, name: f.key });
        input.checked = !!v;
      } else {
        const type = f.type === "money" ? "text" : f.type || "text";
        input = h("input", { class: "field" + (f.type === "money" ? " money-input" : ""), id, name: f.key, type,
          inputmode: f.type === "money" ? "decimal" : f.inputmode, placeholder: f.placeholder, autocomplete: "off",
          step: f.step, min: f.min, max: f.max, list: f.suggestions ? id + "-list" : null });
        input.value = String(v);
      }
      input.addEventListener("change", () => { refresh(); onChange && onChange(state, form); });
      if (f.type === "checkbox") row = h("label", { class: "check-label full", for: id }, input, h("span", {}, f.label, f.hint ? h("span", { class: "hint", text: " " + f.hint }) : null));
      else row = h("label", { class: f.full ? "full" : null, for: id }, f.label, input,
        f.suggestions ? h("datalist", { id: id + "-list" }, f.suggestions.map(x => h("option", { value: x }))) : null,
        f.hint ? h("span", { class: "hint", text: f.hint }) : null);
    }
    rows.push({ f, row });
    form.append(row);
  }
  const errEl = h("p", { class: "form-error", role: "alert", hidden: true });
  // The save button sits outside the form but belongs to it, so Enter and the click both submit.
  const submit = h("button", { type: "submit", form: formId, class: "btn primary", text: saveLabel });
  const showErr = m => { errEl.textContent = m; errEl.hidden = false; };
  const left = h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } });
  if (onDelete) left.append(confirmButton(deleteLabel, "Confirmar", async () => { saving = true; const ok = await onDelete(); saving = false; if (ok) close(); else showErr("Não foi possível excluir. Tente de novo."); return ok; }));
  for (const x of extra || []) left.append(h("button", { type: "button", class: "btn", text: x.label, onclick: async () => { const r = await x.run(read()); if (r === true) close(); else if (typeof r === "string") showErr(r); } }));
  const modal = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("h2", { text: title }), form, errEl,
    h("div", { class: "modal-actions" }, left, h("div", { class: "right" }, h("button", { type: "button", class: "btn", text: "Cancelar", onclick: close }), submit)));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (saving) return;
    read();
    for (const { f, row } of rows) {
      if (row.hidden || !f.required || !f.key) continue;
      if (state[f.key] === "" || state[f.key] == null) { showErr("Preencha: " + f.label.toLowerCase() + "."); return; }
    }
    saving = true; submit.disabled = true; submit.textContent = "Salvando…"; errEl.hidden = true;
    let res;
    try { res = await onSave({ ...state }); } catch (err) { console.error(err); res = false; }
    saving = false;
    if (res === true) { close(); return; }
    submit.disabled = false; submit.textContent = saveLabel;
    showErr(typeof res === "string" ? res : "Não foi possível salvar. O que você digitou continua aqui; tente de novo.");
  });
  const scrim = h("div", { class: "scrim", onclick: e => { if (e.target === scrim) close(); } }, modal);
  document.body.append(scrim);
  document.addEventListener("keydown", onKey);
  refresh();
  const first = form.querySelector("input:not([type=checkbox]), select, textarea"); first && first.focus();
  return { close, state, form };
}
export const money = v => {
  const n = parseMoney(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/* ---------- simple sortable, paginated table ---------- */
export function dataTable({ columns, rows, pageSize = 50, page = 0, onPage, sort, onSort, onRow, empty: emptyMsg }) {
  if (!rows.length) return h("div", { class: "empty", text: emptyMsg || "Nada por aqui ainda." });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(page, pages - 1);
  const slice = rows.slice(p * pageSize, (p + 1) * pageSize);
  const table = h("table", { class: "t" },
    h("thead", {}, h("tr", {}, columns.map(c => h("th", { class: c.align === "right" ? "r" : null, scope: "col" },
      c.sortKey && onSort ? h("button", { type: "button", onclick: () => onSort(c.sortKey), "aria-label": "Ordenar por " + c.label },
        c.label + (sort && sort.key === c.sortKey ? (sort.dir === "asc" ? " ↑" : " ↓") : "")) : c.label)))),
    h("tbody", {}, slice.map(r => h("tr", { class: onRow ? "clickable" : null, onclick: onRow ? e => { if (!e.target.closest("button")) onRow(r); } : null },
      columns.map(c => h("td", { class: c.align === "right" ? "r" : null }, c.render(r)))))));
  return h("div", { style: { display: "grid", gap: "10px" } },
    h("div", { class: "table-wrap" }, table),
    pages > 1 ? h("div", { class: "pager" },
      h("span", { text: (p * pageSize + 1) + "–" + Math.min(rows.length, (p + 1) * pageSize) + " de " + rows.length }),
      h("span", { style: { display: "flex", gap: "6px" } },
        h("button", { class: "btn small", disabled: p === 0, text: "Anterior", onclick: () => onPage(p - 1) }),
        h("button", { class: "btn small", disabled: p >= pages - 1, text: "Próxima", onclick: () => onPage(p + 1) }))) : null);
}

export const emptyState = (text, label, fn) => h("div", { class: "empty" }, h("span", { text }), label ? h("button", { class: "btn small", type: "button", text: label, onclick: fn }) : null);
