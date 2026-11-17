// Lançamentos: every movement, with tabs, filters, search, sorting and paging.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, fmtDate, monthLabel, dataTable, emptyState, plural, today } from "../ui.js";
import { live, whereLabel, direction, txnAmount, kindLabel, categoryName, activeAccounts, activeCards, METHOD_LABEL } from "../domain.js";
import { openTxnForm, settle } from "./txnForm.js";

const TABS = [["todos", "Todos"], ["receitas", "Receitas"], ["despesas", "Despesas"], ["transferencias", "Transferências"], ["pendentes", "Pendentes"], ["efetivados", "Pagos e recebidos"]];
const tabFilter = {
  todos: () => true,
  receitas: t => t.kind === "receita" || t.kind === "rendimento",
  despesas: t => t.kind === "despesa" || t.kind === "estorno",
  transferencias: t => t.kind === "transferencia" || t.kind === "pagamento_fatura",
  pendentes: t => t.status === "previsto",
  efetivados: t => t.status === "efetivado"
};

export function viewTransactions(app) {
  const st = app.store.state, ui = app.ui.txn;
  const params = app.params();
  if (params.status === "previsto" && !ui._fromParam) { ui.tab = "pendentes"; ui._fromParam = true; ui.allMonths = true; }
  const q = ui.query.trim().toLowerCase();
  const all = live(st);
  const rows = all.filter(t =>
    (ui.allMonths || F.monthOf(t.date) === app.ui.month) &&
    tabFilter[ui.tab](t) &&
    (!ui.where || t.accountId === ui.where || t.cardId === ui.where || t.fromId === ui.where || t.toId === ui.where) &&
    (!ui.category || t.categoryId === ui.category) &&
    (!q || [t.desc, t.notes, t.subcategory, categoryName(st, t.categoryId), whereLabel(st, t), ...(t.tags || [])].some(v => (v || "").toLowerCase().includes(q))));
  const dir = ui.sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const k = ui.sort.key;
    const va = k === "amount" ? txnAmount(a) * (direction(a) || 1) : k === "desc" ? (a.desc || "").toLowerCase() : a.date + (a.createdAt || 0);
    const vb = k === "amount" ? txnAmount(b) * (direction(b) || 1) : k === "desc" ? (b.desc || "").toLowerCase() : b.date + (b.createdAt || 0);
    return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
  });

  // Totals of what is shown: realized in/out and still planned.
  let inSum = 0, outSum = 0, planned = 0;
  for (const t of rows) {
    if (t.kind === "ajuste") continue;   // corrections are not money in or out
    const d = direction(t), v = txnAmount(t);
    if (t.status !== "efetivado") { planned += d * v; continue; }
    if (d > 0) inSum += v; else if (d < 0) outSum += v;
  }

  const set = (k, v) => { ui[k] = v; ui.page = 0; app.render(); };
  const toolbar = h("div", { class: "toolbar" },
    ui.allMonths ? h("button", { class: "btn", type: "button", text: "Mostrar por mês", onclick: () => set("allMonths", false) }) : app.monthNav(),
    !ui.allMonths ? h("button", { class: "btn small", type: "button", text: "Todos os meses", onclick: () => set("allMonths", true) }) : null,
    h("span", { class: "spacer" }),
    h("button", { class: "btn primary", type: "button", text: "+ Lançamento", onclick: () => openTxnForm(app) }));
  const search = h("input", { class: "field grow", type: "search", id: "txn-search", placeholder: "Buscar por descrição, categoria, conta, etiqueta…", "aria-label": "Buscar lançamentos",
    oninput: e => { ui.query = e.target.value; ui.page = 0; app.render(); } });
  search.value = ui.query;
  const whereSel = h("select", { class: "field", id: "txn-where", "aria-label": "Filtrar por conta ou cartão", onchange: e => set("where", e.target.value) },
    h("option", { value: "", text: "Todas as contas e cartões" }),
    h("optgroup", { label: "Contas" }, activeAccounts(st).map(a => h("option", { value: a.id, text: a.name }))),
    activeCards(st).length ? h("optgroup", { label: "Cartões" }, activeCards(st).map(c => h("option", { value: c.id, text: c.name }))) : null);
  whereSel.value = ui.where;
  const catSel = h("select", { class: "field", id: "txn-cat", "aria-label": "Filtrar por categoria", onchange: e => set("category", e.target.value) },
    h("option", { value: "", text: "Todas as categorias" }),
    st.categories.filter(c => !c.deleted).map(c => h("option", { value: c.id, text: c.name + (c.kind === "receita" ? " (receita)" : "") })));
  catSel.value = ui.category;
  const filters = h("div", { class: "toolbar" }, search, whereSel, catSel);
  const tabs = h("div", { class: "seg", role: "tablist", "aria-label": "Tipo de lançamento" }, TABS.map(([k, l]) =>
    h("button", { type: "button", role: "tab", "aria-pressed": ui.tab === k ? "true" : "false", "aria-selected": ui.tab === k ? "true" : "false", text: l, onclick: () => set("tab", k) })));

  const amountCell = t => {
    const d = direction(t), v = txnAmount(t);
    return h("span", { class: "amt " + (d > 0 ? "pos" : d < 0 ? "" : "muted"), text: (d > 0 ? "+ " : d < 0 ? "− " : "") + brl(v) });
  };
  const statusChip = t => t.status === "previsto"
    ? h("span", { class: "chip warn", text: (t.dueDate || t.date) < today() ? "Atrasado" : direction(t) > 0 ? "A receber" : "A pagar" })
    : h("span", { class: "chip pos", text: t.cardId ? "Na fatura" : direction(t) > 0 ? "Recebido" : t.kind === "transferencia" ? "Feita" : "Pago" });
  const descCell = t => h("div", { class: "desc" },
    h("b", { text: (t.desc || categoryName(st, t.categoryId) || kindLabel(t)) + (t.installment ? " (" + t.installment.n + "/" + t.installment.of + ")" : "") }),
    h("small", { text: [kindLabel(t), t.subcategory, t.method && !t.cardId ? METHOD_LABEL[t.method] : null, t.recurrence ? "fixo" : null, t.cardId && t.invoice ? "fatura " + monthLabel(t.invoice, true) : null, ...(t.tags || []).map(x => "#" + x)].filter(Boolean).join(" · ") }));
  const actions = t => h("div", { class: "row-actions" },
    t.status === "previsto" ? h("button", { class: "btn small", type: "button", title: "Marcar como " + (direction(t) > 0 ? "recebido" : "pago"), text: direction(t) > 0 ? "Recebi" : "Paguei", onclick: () => settle(app, t) }) : null,
    h("button", { class: "icon-btn sm", type: "button", title: "Duplicar", "aria-label": "Duplicar " + (t.desc || ""), onclick: () => openTxnForm(app, t, { duplicate: true }) }, icon("copy")));

  const table = h("div", { class: "only-wide" }, dataTable({
    rows, page: ui.page, onPage: p => { ui.page = p; app.render(); },
    sort: ui.sort, onSort: k => { ui.sort = { key: k, dir: ui.sort.key === k && ui.sort.dir === "desc" ? "asc" : "desc" }; app.render(); },
    onRow: t => openTxnForm(app, t),
    empty: ui.query || ui.where || ui.category ? "Nenhum lançamento com esses filtros." : "Nenhum lançamento " + (ui.allMonths ? "ainda." : "em " + monthLabel(app.ui.month).toLowerCase() + "."),
    columns: [
      { label: "Data", sortKey: "date", render: t => h("span", { class: "num", text: fmtDate(t.date) }) },
      { label: "Descrição", sortKey: "desc", render: descCell },
      { label: "Categoria", render: t => t.categoryId ? categoryName(st, t.categoryId) : "—" },
      { label: "Conta / cartão", render: t => whereLabel(st, t) },
      { label: "Situação", render: statusChip },
      { label: "Valor", sortKey: "amount", align: "right", render: amountCell },
      { label: "", render: actions }
    ]
  }));
  // Phones: a list grouped by date.
  const byDay = new Map();
  for (const t of rows.slice(ui.page * 50, ui.page * 50 + 50)) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
  const list = h("div", { class: "only-narrow", style: { display: "grid", gap: "6px" } },
    rows.length ? [...byDay].map(([d, items]) => [
      h("div", { class: "hint", style: { fontWeight: 700, marginTop: "6px" }, text: fmtDate(d) }),
      h("div", { class: "rows" }, items.map(t => h("button", { type: "button", class: "r-item", onclick: () => openTxnForm(app, t) },
        h("span", { class: "ico " + (direction(t) > 0 ? "pos" : direction(t) < 0 ? "neg" : "info") }, icon(t.cardId ? "card" : direction(t) > 0 ? "up" : direction(t) < 0 ? "down" : "swap")),
        h("span", { class: "grow" }, descCell(t), h("small", { class: "hint", text: whereLabel(st, t) })),
        h("span", { style: { display: "grid", justifyItems: "end", gap: "4px" } }, amountCell(t), statusChip(t)))))
    ]) : emptyState("Nenhum lançamento por aqui.", "+ Lançamento", () => openTxnForm(app)),
    rows.length > 50 ? h("div", { class: "pager" }, h("span", { text: "Página " + (ui.page + 1) + " de " + Math.ceil(rows.length / 50) }),
      h("span", { style: { display: "flex", gap: "6px" } },
        h("button", { class: "btn small", disabled: ui.page === 0, text: "Anterior", onclick: () => { ui.page--; app.render(); } }),
        h("button", { class: "btn small", disabled: (ui.page + 1) * 50 >= rows.length, text: "Próxima", onclick: () => { ui.page++; app.render(); } }))) : null);

  return [toolbar,
    h("section", { class: "card" }, tabs, filters,
      h("div", { class: "toolbar" },
        h("span", { class: "chip", text: plural(rows.length, "lançamento", "lançamentos") }),
        inSum ? h("span", { class: "chip pos", text: "Entradas " + brl(inSum) }) : null,
        outSum ? h("span", { class: "chip neg", text: "Saídas " + brl(outSum) }) : null,
        planned ? h("span", { class: "chip warn", text: "Previsto " + (planned >= 0 ? "+ " : "− ") + brl(Math.abs(planned)) }) : null,
        h("span", { class: "hint", text: "Transferências e pagamentos de fatura não contam como entrada ou saída." })),
      table, list)];
}
