// Orçamento: monthly limits per expense category, with 50/75/90/100% alerts and month comparison.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, monthLabel, openForm, money, moneyField, toast, emptyState } from "../ui.js";
import { live, categoriesOf, budgetFor, monthSeries } from "../domain.js";
import { errText } from "../store.js";

const LEVEL_TEXT = { 0: "", 50: "metade usada", 75: "atenção", 90: "quase no limite", 100: "estourou" };

function editLimits(app, mk) {
  const st = app.store.state;
  const { limits } = budgetFor(st, mk);
  const cats = categoriesOf(st, "despesa");
  const values = Object.fromEntries(cats.map(c => ["c_" + c.id, moneyField(limits[c.id] || 0)]));
  openForm({
    title: "Limites de " + monthLabel(mk).toLowerCase(),
    values,
    fields: [
      { type: "node", node: h("p", { class: "hint", text: "Deixe em branco a categoria sem limite. Os próximos meses usam estes valores até você mudar." }) },
      ...cats.map(c => ({ key: "c_" + c.id, label: c.name, type: "money", placeholder: "sem limite" }))
    ],
    onSave: async v => {
      const out = {};
      for (const c of cats) {
        const raw = v["c_" + c.id];
        if (!raw) continue;
        const n = money(raw);
        if (!Number.isFinite(n) || n < 0) return "Valor inválido em " + c.name + ".";
        if (n > 0) out[c.id] = n;
      }
      try { await app.store.save("finBudgets", { id: mk, month: mk, limits: out }); toast("Orçamento salvo"); return true; }
      catch (e) { return errText(e); }
    }
  });
}

export function viewBudget(app) {
  const st = app.store.state, mk = app.ui.month;
  const txns = live(st);
  const { limits, from } = budgetFor(st, mk);
  const spent = F.monthSummary(txns, mk).byCategory;
  const cats = categoriesOf(st, "despesa");
  const rows = cats.map(c => ({ cat: c, ...F.budgetStatus(limits[c.id] || 0, Math.max(0, spent[c.id] || 0)) }))
    .filter(r => r.limit > 0 || r.spent > 0)
    .sort((a, b) => (b.limit > 0) - (a.limit > 0) || b.pct - a.pct || b.spent - a.spent);
  const planned = rows.reduce((s, r) => s + r.limit, 0);
  const used = rows.filter(r => r.limit > 0).reduce((s, r) => s + r.spent, 0);
  const outside = rows.filter(r => !r.limit).reduce((s, r) => s + r.spent, 0);
  const total = F.budgetStatus(planned, used);

  // Comparison: last 6 months, limits vs spent in the categories that have a limit.
  const series = monthSeries(st, mk, 6).map(s => {
    const lim = budgetFor(st, s.month).limits;
    const p = Object.values(lim).reduce((a, b) => a + b, 0);
    const u = Object.keys(lim).reduce((a, k) => a + Math.max(0, s.byCategory[k] || 0), 0);
    return { month: s.month, planned: p, used: u };
  });

  return [
    h("div", { class: "toolbar" }, app.monthNav(), h("span", { class: "spacer" }),
      h("button", { class: "btn primary", type: "button", text: Object.keys(limits).length ? "Editar limites" : "Definir limites", onclick: () => editLimits(app, mk) })),
    from && from !== mk ? h("div", { class: "alert info" }, icon("info"), h("span", { text: "Usando os limites definidos em " + monthLabel(from).toLowerCase() + ". Editar cria os limites próprios de " + monthLabel(mk).toLowerCase() + "." })) : null,
    h("div", { class: "kpis" },
      h("div", { class: "kpi hero" }, h("span", { class: "k" }, icon("budget"), "Planejado"), h("span", { class: "v", text: brl(planned) }), h("span", { class: "d", text: "soma dos limites do mês" })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("down"), "Gasto nas categorias"), h("span", { class: "v", text: brl(used) }), h("span", { class: "d", text: total.pct + "% do planejado" })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("wallet"), "Saldo do orçamento"), h("span", { class: "v " + (total.remaining < 0 ? "neg" : ""), text: brl(total.remaining) }),
        h("span", { class: "d", text: outside ? "fora do orçamento: " + brl(outside) : "nenhum gasto fora do orçamento" }))),
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: "Por categoria" }), h("span", { class: "sub", text: "alertas em 50%, 75%, 90% e 100%" })),
      rows.length ? h("div", { style: { display: "grid", gap: "16px" } }, rows.map(r => h("div", { style: { display: "grid", gap: "6px" } },
        h("div", { class: "card-head" },
          h("span", { style: { fontWeight: 700 }, text: r.cat.name }),
          h("span", { class: "hint" }, r.limit ? brl(r.spent) + " de " + brl(r.limit) + " · " : brl(r.spent) + " · sem limite",
            r.limit ? h("b", { class: r.remaining < 0 ? "neg" : "", text: (r.remaining < 0 ? "passou " + brl(-r.remaining) : "restam " + brl(r.remaining)) }) : null)),
        r.limit ? h("div", { class: "bar l" + r.level }, h("span", { style: { width: Math.min(100, r.pct) + "%" } })) : null,
        r.limit && r.level ? h("span", { class: "chip " + (r.level >= 90 ? "neg" : r.level >= 75 ? "warn" : "info"), style: { justifySelf: "start" }, text: r.pct + "% · " + LEVEL_TEXT[r.level] }) : null)))
        : emptyState("Defina quanto quer gastar por categoria (ex.: Alimentação R$ 700, Transporte R$ 300).", "Definir limites", () => editLimits(app, mk))),
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: "Comparativo dos últimos meses" }), h("span", { class: "sub", text: "planejado × gasto nas categorias com limite" })),
      h("div", { class: "table-wrap" }, h("table", { class: "t" },
        h("thead", {}, h("tr", {}, ["Mês", "Planejado", "Gasto", "Diferença", "%"].map((l, i) => h("th", { class: i ? "r" : null, text: l })))),
        h("tbody", {}, series.map(s => {
          const st2 = F.budgetStatus(s.planned, s.used);
          return h("tr", {}, h("td", { text: monthLabel(s.month) }), h("td", { class: "r amt", text: s.planned ? brl(s.planned) : "—" }), h("td", { class: "r amt", text: brl(s.used) }),
            h("td", { class: "r amt " + (st2.remaining < 0 ? "neg" : "pos"), text: s.planned ? brl(st2.remaining) : "—" }), h("td", { class: "r", text: s.planned ? st2.pct + "%" : "—" }));
        })))))
  ];
}
