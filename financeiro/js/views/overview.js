// Dashboard: where the money is, how the month is going and what is coming.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, signed, monthLabel, fmtDay, today, addDaysIso, emptyState, plural } from "../ui.js";
import { groupedBars, lineChart, donut, PALETTE } from "../charts.js";
import { live, monthSeries, netWorthAt, endOfMonth, activeAccounts, activeCards, categoryName, budgetRows, alerts, whereLabel } from "../domain.js";
import { openTxnForm } from "./txnForm.js";

export function viewOverview(app) {
  const st = app.store.state, t = today(), mk = app.ui.month;
  const txns = live(st);
  const isCurrent = mk === t.slice(0, 7);
  const asOf = isCurrent ? t : endOfMonth(mk);
  const nw = netWorthAt(st, asOf);
  const cur = F.monthSummary(txns, mk), prev = F.monthSummary(txns, F.addMonths(mk, -1));
  const bal = F.balances(st.accounts, txns, asOf);
  const cashAccounts = activeAccounts(st).filter(a => F.accountGroup(a) === "ativo" && a.type !== "investimento");
  const cashTotal = cashAccounts.reduce((s, a) => s + (bal[a.id] || 0), 0);

  const delta = (now, before, invert) => {
    if (!before) return null;
    const d = Math.round((now - before) / Math.abs(before) * 100);
    if (!d) return "igual ao mês anterior";
    const good = invert ? d < 0 : d > 0;
    return h("span", { class: good ? "pos" : "neg", text: (d > 0 ? "▲ " : "▼ ") + Math.abs(d) + "% vs " + monthLabel(F.addMonths(mk, -1), true) });
  };
  const kpi = (label, ic, value, detail, cls = "", to) => h(to ? "a" : "div", { class: "kpi " + cls, href: to || null, style: to ? { textDecoration: "none" } : null },
    h("span", { class: "k" }, icon(ic), label), h("span", { class: "v", text: value }), detail ? h("span", { class: "d" }, detail) : null);

  const header = h("div", { class: "toolbar" },
    app.monthNav(),
    h("span", { class: "hint", text: isCurrent ? "Saldos de hoje · resultados do mês até agora" : "Saldos no fim de " + monthLabel(mk).toLowerCase() }));

  const kpis = h("div", { class: "kpis" },
    kpi("Patrimônio líquido", "shield", brl(nw.net), h("span", {}, "Ativos " + brl(nw.assets) + " · Passivos " + brl(nw.liabilities)), "hero", "#/contas"),
    kpi("Saldo das contas", "bank", brl(cashTotal), plural(cashAccounts.length, "conta", "contas"), "", "#/contas"),
    kpi("Total investido", "invest", brl(nw.invested), nw.invested ? null : "Cadastre uma conta do tipo Investimentos", "", "#/contas"),
    kpi("Receitas do mês", "up", brl(cur.income + cur.yields), delta(cur.income + cur.yields, prev.income + prev.yields)),
    kpi("Despesas do mês", "down", brl(cur.expense), delta(cur.expense, prev.expense, true)),
    kpi("Resultado do mês", "chart", signed(cur.result), cur.plannedExpense || cur.plannedIncome
      ? "Previsto ainda: " + signed(cur.plannedIncome - cur.plannedExpense) : (cur.result > 0 ? "sobrou dinheiro" : cur.result < 0 ? "gastou mais do que entrou" : "mês zerado"), cur.result < 0 ? "neg-v" : ""));

  // Charts
  const series = monthSeries(st, mk, 6);
  const labels = series.map(x => monthLabel(x.month, true));
  const flow = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Receitas × despesas" }), h("span", { class: "sub", text: "últimos 6 meses · realizado" })),
    groupedBars({ labels, highlight: 5, series: [
      { name: "Receitas", color: "var(--chart-1)", values: series.map(x => x.income + x.yields) },
      { name: "Despesas", color: "var(--chart-2)", values: series.map(x => x.expense) }] }));
  const worth = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Evolução patrimonial" }), h("span", { class: "sub", text: "patrimônio líquido no fim de cada mês" })),
    lineChart({ points: series.map(x => ({ label: monthLabel(x.month, true), value: netWorthAt(st, x.month === t.slice(0, 7) ? t : endOfMonth(x.month)).net })) }));

  const cats = Object.entries(cur.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = cats.slice(0, 5), rest = cats.slice(5).reduce((s, [, v]) => s + v, 0);
  const parts = top.map(([k, v], i) => ({ label: categoryName(st, k), value: v, color: PALETTE[i] }));
  if (rest) parts.push({ label: "Outras", value: rest, color: "var(--line)" });
  const byCat = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Despesas por categoria" }), h("a", { class: "link", href: "#/relatorios", text: "Relatórios" })),
    parts.length ? h("div", { class: "donut-wrap" },
      donut({ parts, center: ["Total", brl(cur.expense)] }),
      h("div", { class: "cat-lines" }, parts.map(p => h("div", { class: "cat-line" }, h("i", { class: "dot", style: { background: p.color } }),
        h("span", { text: p.label }), h("span", { class: "amt" }, brl(p.value), h("small", { text: Math.round(p.value / cur.expense * 100) + "%" }))))))
      : emptyState("Nenhuma despesa realizada em " + monthLabel(mk).toLowerCase() + ".", "+ Lançamento", () => openTxnForm(app)));

  // Accounts
  const accBlock = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Contas" }), h("a", { class: "link", href: "#/contas", text: "Ver todas" })),
    activeAccounts(st).length ? h("div", { class: "rows" }, activeAccounts(st).filter(a => F.accountGroup(a) !== "fora").map(a =>
      h("a", { class: "r-item", href: "#/contas/" + a.id, style: { textDecoration: "none", color: "inherit" } },
        h("span", { class: "ico" + (a.type === "investimento" ? " gold" : a.type === "divida" ? " neg" : "") }, icon(a.type === "investimento" ? "invest" : a.type === "divida" ? "down" : "bank")),
        h("span", { class: "grow desc" }, h("b", { text: a.name }), h("small", { text: (F.ACCOUNT_TYPES[a.type] || {}).label || "" })),
        h("span", { class: "amt " + ((bal[a.id] || 0) < 0 ? "neg" : ""), text: brl(bal[a.id] || 0) }))))
      : emptyState("Cadastre suas contas (Nubank, Santander, dinheiro…) para ver os saldos.", "Nova conta", () => app.go("#/contas?nova=1")));

  // Upcoming (next 30 days)
  const up = F.upcoming(txns, activeCards(st), t, addDaysIso(t, 30), t);
  const pay = up.filter(x => x.type === "pagar"), receive = up.filter(x => x.type === "receber");
  const upRow = x => h("button", { type: "button", class: "r-item", onclick: () => x.invoice ? app.go("#/cartoes/" + x.card.id) : openTxnForm(app, x.txn) },
    h("span", { class: "ico " + (x.type === "receber" ? "pos" : "neg") }, icon(x.invoice ? "card" : "calendar")),
    h("span", { class: "grow desc" }, h("b", { text: x.invoice ? "Fatura " + x.card.name : x.txn.desc || categoryName(st, x.txn.categoryId) }),
      h("small", { text: fmtDay(x.date) + (x.invoice ? " · vencimento" : " · " + whereLabel(st, x.txn)) })),
    h("span", { class: "amt " + (x.type === "receber" ? "pos" : ""), text: brl(x.amount) }));
  const upcomingBlock = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Próximos 30 dias" }), h("a", { class: "link", href: "#/a-pagar-receber", text: "Contas a pagar e receber" })),
    up.length ? [
      pay.length ? [h("div", { class: "hint", text: "A pagar · " + brl(pay.reduce((s, x) => s + x.amount, 0)) }), h("div", { class: "rows" }, pay.slice(0, 6).map(upRow))] : null,
      receive.length ? [h("div", { class: "hint", text: "A receber · " + brl(receive.reduce((s, x) => s + x.amount, 0)) }), h("div", { class: "rows" }, receive.slice(0, 6).map(upRow))] : null
    ] : h("p", { class: "hint", text: "Nenhuma conta a pagar ou a receber nos próximos 30 dias. Lançamentos marcados como A pagar / A receber aparecem aqui." }));

  // Open invoices
  const invs = activeCards(st).map(c => {
    const id = F.invoiceFor(t, c.closingDay, c.dueDay);
    return { c, inv: F.invoiceSummary(c, txns, id, t), lim: F.cardLimit(c, txns) };
  });
  const invBlock = activeCards(st).length ? h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Faturas" }), h("a", { class: "link", href: "#/cartoes", text: "Cartões" })),
    h("div", { class: "rows" }, invs.map(({ c, inv, lim }) => h("a", { class: "r-item", href: "#/cartoes/" + c.id, style: { textDecoration: "none", color: "inherit" } },
      h("span", { class: "ico info" }, icon("card")),
      h("span", { class: "grow desc" }, h("b", { text: c.name + " · " + monthLabel(inv.id, true) }), h("small", { text: F.INVOICE_STATUS[inv.status] + " · vence " + fmtDay(inv.due) + " · limite livre " + brl(lim.available) })),
      h("span", { class: "amt " + (inv.open < 0 ? "pos" : ""), text: inv.open < 0 ? "crédito " + brl(-inv.open) : brl(inv.open) }))))) : null;

  // Budget
  const { rows: brows } = budgetRows(st, mk);
  const limited = brows.filter(r => r.limit > 0).sort((a, b) => b.pct - a.pct).slice(0, 5);
  const budgetBlock = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Orçamento do mês" }), h("a", { class: "link", href: "#/orcamento", text: "Ajustar" })),
    limited.length ? h("div", { style: { display: "grid", gap: "12px" } }, limited.map(r => h("div", { style: { display: "grid", gap: "5px" } },
      h("div", { class: "card-head" }, h("span", { style: { fontWeight: 600 }, text: r.cat.name }), h("span", { class: "hint", text: brl(r.spent) + " de " + brl(r.limit) + " · " + r.pct + "%" })),
      h("div", { class: "bar l" + r.level }, h("span", { style: { width: Math.min(100, r.pct) + "%" } })))))
      : emptyState("Defina limites por categoria para acompanhar o mês.", "Criar orçamento", () => app.go("#/orcamento")));

  // Alerts
  const al = alerts(st, t);
  const alertBlock = h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Alertas" }), h("span", { class: "sub", text: al.length ? plural(al.length, "ponto de atenção", "pontos de atenção") : "tudo em ordem" })),
    al.length ? h("div", { style: { display: "grid", gap: "8px" } }, al.slice(0, 6).map(a => h("a", { class: "alert " + a.level, href: a.to, style: { textDecoration: "none" } }, icon("alert"), h("span", { text: a.text }))))
      : h("div", { class: "alert info" }, icon("info"), h("span", { text: "Nenhum alerta: orçamento, faturas e saldos sem problemas." })));

  // Investments distribution (by investment account)
  const inv = activeAccounts(st).filter(a => a.type === "investimento" && (bal[a.id] || 0) > 0);
  const invDist = inv.length ? h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: "Investimentos" }), h("span", { class: "sub", text: brl(nw.invested) })),
    h("div", { class: "donut-wrap" }, donut({ parts: inv.map((a, i) => ({ label: a.name, value: bal[a.id], color: PALETTE[i % 6] })), center: ["Investido", brl(nw.invested)] }),
      h("div", { class: "cat-lines" }, inv.map((a, i) => h("div", { class: "cat-line" }, h("i", { class: "dot", style: { background: PALETTE[i % 6] } }), h("span", { text: a.name }),
        h("span", { class: "amt" }, brl(bal[a.id]), h("small", { text: Math.round(bal[a.id] / nw.invested * 100) + "%" }))))))) : null;

  return [header, kpis,
    h("div", { class: "grid2" }, flow, worth),
    h("div", { class: "cols-wide" }, byCat, alertBlock),
    h("div", { class: "grid3" }, accBlock, upcomingBlock, invBlock || budgetBlock),
    invBlock ? h("div", { class: "grid2" }, budgetBlock, invDist) : null];
}
