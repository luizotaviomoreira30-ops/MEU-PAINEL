// Bills to pay and to receive: planned entries and card invoices, by due date.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, fmtDay, today, addDaysIso, plural, emptyState } from "../ui.js";
import { live, activeAccounts, activeCards, categoryName, whereLabel } from "../domain.js";
import { openTxnForm, settle } from "./txnForm.js";

const PERIODS = [
  ["7", "7 dias"], ["30", "30 dias"], ["mes", "Este mês"], ["prox", "Próximo mês"], ["12m", "12 meses"]
];
const TYPES = [["todas", "Tudo"], ["pagar", "A pagar"], ["receber", "A receber"]];

function range(period, t) {
  const mk = t.slice(0, 7);
  if (period === "7") return [t, addDaysIso(t, 7)];
  if (period === "mes") return [t, F.dayIn(mk, 31)];
  if (period === "prox") return [F.addMonths(mk, 1) + "-01", F.dayIn(F.addMonths(mk, 1), 31)];
  if (period === "12m") return [t, addDaysIso(t, 365)];
  return [t, addDaysIso(t, 30)];
}

export function viewBills(app) {
  const st = app.store.state, t = today(), txns = live(st);
  const ui = app.ui.bills || (app.ui.bills = { type: app.params().tipo || "todas", period: "30" });
  const [from, to] = range(ui.period, t);
  const cards = activeCards(st);
  // Overdue items are always listed, whatever the period: they still have to be dealt with.
  const late = F.payables(txns, cards, t, { to: addDaysIso(t, -1) });
  const ahead = F.payables(txns, cards, t, { from, to });
  const ofType = x => ui.type === "todas" || x.type === ui.type;
  const lateT = F.payablesTotals(late), aheadT = F.payablesTotals(ahead);

  // Cash in current, savings and cash accounts today, then what is left after everything listed here.
  const bal = F.balances(st.accounts, txns, t);
  const cash = activeAccounts(st).filter(a => F.accountGroup(a) === "ativo" && a.type !== "investimento").reduce((s, a) => s + (bal[a.id] || 0), 0);
  const after = cash + lateT.receive + aheadT.receive - lateT.pay - aheadT.pay;
  const periodLabel = (PERIODS.find(p => p[0] === ui.period) || PERIODS[1])[1].toLowerCase();

  const kpi = (label, ic, value, detail, cls = "") => h("div", { class: "kpi " + cls },
    h("span", { class: "k" }, icon(ic), label), h("span", { class: "v", text: value }), detail ? h("span", { class: "d", text: detail }) : null);
  const count = (arr, type) => arr.filter(x => x.type === type).length;
  const kpis = h("div", { class: "kpis four" },
    kpi("A pagar", "down", brl(aheadT.pay), plural(count(ahead, "pagar"), "conta", "contas") + " · " + periodLabel),
    kpi("A receber", "up", brl(aheadT.receive), plural(count(ahead, "receber"), "valor", "valores") + " · " + periodLabel),
    kpi("Vencido", "alert", brl(lateT.pay), lateT.pay || lateT.receive
      ? [lateT.pay ? plural(count(late, "pagar"), "conta atrasada", "contas atrasadas") : null, lateT.receive ? brl(lateT.receive) + " a receber em atraso" : null].filter(Boolean).join(" · ")
      : "nada atrasado", lateT.pay ? "warn" : ""),
    kpi("Saldo depois disso", "wallet", brl(after), "estimativa: saldo de hoje em contas (" + brl(cash) + ") + a receber − a pagar, incluindo atrasados", after < 0 ? "neg-v" : ""));

  // A bill is paid from an account, never as a card purchase: start the form on an account.
  const payFrom = () => {
    const r = app.recall("where", "");
    if (r.startsWith("a:") && activeAccounts(st).some(a => a.id === r.slice(2))) return r.slice(2);
    return (activeAccounts(st).find(a => F.accountGroup(a) === "ativo" && a.type !== "investimento") || {}).id || null;
  };
  const newBill = kind => openTxnForm(app, null, kind === "despesa" ? { kind, status: "previsto", date: t, accountId: payFrom() } : { kind, status: "previsto", date: t });
  const seg = (opts, cur, set, label) => h("div", { class: "seg", role: "group", "aria-label": label },
    opts.map(([k, l]) => h("button", { type: "button", "aria-pressed": cur === k ? "true" : "false", text: l, onclick: () => { set(k); app.render(); } })));
  const toolbar = h("div", { class: "toolbar" },
    seg(TYPES, ui.type, k => { ui.type = k; }, "Tipo"),
    seg(PERIODS, ui.period, k => { ui.period = k; }, "Período"),
    h("span", { style: { flex: "1 1 0" } }),
    h("button", { type: "button", class: "btn", text: "+ Conta a receber", onclick: () => newBill("receita") }),
    h("button", { type: "button", class: "btn primary", text: "+ Conta a pagar", onclick: () => newBill("despesa") }));

  const row = x => {
    const pay = x.type === "pagar";
    const days = Math.round((Date.parse(x.due) - Date.parse(t)) / 86400000);
    const when = x.overdue ? "venceu há " + plural(-days, "dia", "dias") : days === 0 ? "vence hoje" : days === 1 ? "vence amanhã" : "em " + days + " dias";
    let title, meta, actions;
    if (x.invoice) {
      const inv = x.invoice;
      title = "Fatura " + x.card.name;
      meta = [F.INVOICE_STATUS[inv.status], inv.paid ? "já pago " + brl(inv.paid) + " de " + brl(inv.total) : null, inv.status === "aberta" ? "ainda recebe compras até " + fmtDay(inv.closing) : null].filter(Boolean).join(" · ");
      actions = [
        h("button", { type: "button", class: "btn small", text: "Ver fatura", onclick: () => { app.ui.invoice = inv.id; app.go("#/cartoes/" + x.card.id); } }),
        h("button", { type: "button", class: "btn small primary", text: "Pagar fatura", onclick: () => app.openInvoicePayment(x.card, inv.id) })];
    } else {
      const tx = x.txn;
      title = tx.desc || categoryName(st, tx.categoryId) || (pay ? "Conta a pagar" : "A receber");
      meta = [tx.categoryId ? categoryName(st, tx.categoryId) : null, whereLabel(st, tx), tx.recurrence ? "fixa" : null].filter(Boolean).join(" · ");
      actions = [
        h("button", { type: "button", class: "btn small", text: "Editar", onclick: () => openTxnForm(app, tx) }),
        h("button", { type: "button", class: "btn small primary", text: pay ? "Paguei" : "Recebi", onclick: () => settle(app, tx) })];
    }
    return h("div", { class: "bill" + (x.overdue ? " late" : "") },
      h("span", { class: "ico " + (pay ? "neg" : "pos") }, icon(x.invoice ? "card" : pay ? "down" : "up")),
      h("span", { class: "grow desc" }, h("b", { text: title }), h("small", { text: fmtDay(x.due) + " · " + when + (meta ? " · " + meta : "") })),
      h("span", { class: "amt " + (pay ? "" : "pos"), text: (pay ? "" : "+ ") + brl(x.amount) }),
      h("span", { class: "row-actions" }, actions));
  };
  const section = (title, items, sub) => items.length ? h("section", { class: "card" },
    h("div", { class: "card-head" }, h("h2", { text: title }), sub ? h("span", { class: "sub", text: sub }) : null),
    h("div", { class: "rows" }, items.map(row))) : null;

  const lateShown = late.filter(ofType), aheadShown = ahead.filter(ofType);
  const weekEnd = addDaysIso(t, 7);
  const soon = aheadShown.filter(x => x.due <= weekEnd), later = aheadShown.filter(x => x.due > weekEnd);
  const noData = !txns.length && !cards.length;

  return [
    toolbar,
    kpis,
    noData ? h("section", { class: "card" }, emptyState("Cadastre suas contas e lance o que tem para pagar ou receber, marcando como previsto. Contas fixas e faturas aparecem aqui sozinhas.", "Nova conta a pagar", () => newBill("despesa")))
      : !lateShown.length && !aheadShown.length ? h("section", { class: "card" }, h("p", { class: "hint", text: "Nada " + (ui.type === "receber" ? "a receber" : ui.type === "pagar" ? "a pagar" : "a pagar ou a receber") + " em " + periodLabel + ". Use + Conta a pagar para lançar um boleto ou uma conta que ainda vai vencer." })) : null,
    section("Vencidas", lateShown, [lateShown.some(x => x.type === "pagar") ? "a pagar " + brl(lateShown.filter(x => x.type === "pagar").reduce((s, x) => s + x.amount, 0)) : null, lateShown.some(x => x.type === "receber") ? "a receber " + brl(lateShown.filter(x => x.type === "receber").reduce((s, x) => s + x.amount, 0)) : null].filter(Boolean).join(" · ")),
    section(ui.period === "prox" ? "Próximo mês" : "Próximos 7 dias", ui.period === "prox" ? aheadShown : soon, null),
    ui.period === "prox" || ui.period === "7" ? null : section("Depois", later, null),
    h("p", { class: "hint", text: "Aqui aparecem os lançamentos marcados como previsto (a pagar ou a receber), as contas fixas e as faturas de cartão com valor em aberto. Nada é pago sozinho: \"Paguei\" e \"Recebi\" só registram o que você já fez." })
  ];
}
