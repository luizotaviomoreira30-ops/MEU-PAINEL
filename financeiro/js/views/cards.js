// Cartões: limit, invoices (current, future, past) and invoice payments.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, fmtDate, fmtDay, monthLabel, openForm, money, moneyField, toast, today, emptyState, dataTable } from "../ui.js";
import { live, activeAccounts, activeCards, categoryName, accountById } from "../domain.js";
import { openTxnForm } from "./txnForm.js";
import { errText } from "../store.js";

const BRANDS = [["visa", "Visa"], ["mastercard", "Mastercard"], ["elo", "Elo"], ["amex", "American Express"], ["hipercard", "Hipercard"], ["outra", "Outra"]];
const COLORS = [["#173B5E", "Azul-marinho"], ["#820AD1", "Roxo"], ["#EC0000", "Vermelho"], ["#111111", "Preto"], ["#00A7E1", "Azul-claro"], ["#FF7A00", "Laranja"], ["#5C6673", "Grafite"]];
const days = Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)]);

export function openCardForm(app, c = null) {
  const st = app.store.state;
  openForm({
    title: c ? "Editar cartão" : "Novo cartão",
    values: c ? { ...c, limit: moneyField(c.limit), closingDay: String(c.closingDay), dueDay: String(c.dueDay) } : { brand: "mastercard", closingDay: "3", dueDay: "10", status: "ativo", color: "#173B5E", payAccountId: (activeAccounts(st)[0] || {}).id || "" },
    fields: [
      { key: "name", label: "Nome", required: true, placeholder: "Ex.: Nubank Roxinho" },
      { key: "institution", label: "Instituição", placeholder: "Ex.: Nubank" },
      { key: "brand", label: "Bandeira", type: "select", options: BRANDS },
      { key: "limit", label: "Limite total (R$)", type: "money", required: true, placeholder: "0,00" },
      { key: "closingDay", label: "Dia de fechamento", type: "select", options: days, hint: "Compras a partir deste dia vão para a fatura seguinte." },
      { key: "dueDay", label: "Dia de vencimento", type: "select", options: days },
      { key: "payAccountId", label: "Conta que paga a fatura", type: "select", options: [["", "—"], ...activeAccounts(st).map(a => [a.id, a.name])] },
      { key: "color", label: "Cor", type: "select", options: COLORS },
      { key: "status", label: "Situação", type: "select", options: [["ativo", "Ativo"], ["cancelado", "Cancelado"]] }
    ],
    onDelete: c ? async () => {
      if (st.txns.some(t => !t.deleted && (t.cardId === c.id || t.toId === c.id))) { toast("Esse cartão tem lançamentos. Para guardar o histórico, mude a situação para Cancelado.", "err"); return false; }
      await app.store.remove("finCards", c.id); toast("Cartão excluído"); app.go("#/cartoes"); return true;
    } : null,
    onSave: async v => {
      const limit = money(v.limit);
      if (!(limit >= 0)) return "Informe o limite, por exemplo 5.000,00.";
      const doc = { name: v.name.trim(), institution: (v.institution || "").trim(), brand: v.brand, limit, closingDay: Number(v.closingDay), dueDay: Number(v.dueDay),
        payAccountId: v.payAccountId || null, color: v.color, status: v.status };
      try { await app.store.save("finCards", c ? { ...c, ...doc } : doc); toast(c ? "Cartão atualizado" : "Cartão criado"); return true; }
      catch (e) { return errText(e); }
    }
  });
}

// Paying an invoice moves money from an account to the card: it is never a second expense.
export function openInvoicePayment(app, card, invoiceId, existing = null) {
  const st = app.store.state, t = today();
  const inv = F.invoiceSummary(card, live(st), invoiceId, t);
  openForm({
    title: existing ? "Editar pagamento de fatura" : "Pagar fatura " + card.name,
    values: existing ? { fromId: existing.fromId, amount: moneyField(existing.amount), date: existing.date }
      : { fromId: card.payAccountId || (activeAccounts(st)[0] || {}).id || "", amount: moneyField(Math.max(0, inv.open)), date: t },
    fields: [
      { type: "node", node: h("p", { class: "hint" }, "Fatura de ", h("b", { text: monthLabel(invoiceId).toLowerCase() }), " · total " + brl(inv.total) + " · já pago " + brl(inv.paid) + " · vence " + fmtDate(inv.due) + ".") },
      { key: "fromId", label: "Pagar com a conta", type: "select", required: true, options: [["", "Escolha…"], ...activeAccounts(st).map(a => [a.id, a.name])] },
      { key: "amount", label: "Valor pago (R$)", type: "money", required: true },
      { key: "date", label: "Data do pagamento", type: "date", required: true },
      { type: "node", node: h("p", { class: "hint", text: "O pagamento sai da conta e abate a dívida do cartão. As compras já foram contadas como despesa quando você comprou." }) }
    ],
    onDelete: existing ? async () => { await app.store.remove("finTxns", existing.id); toast("Pagamento excluído"); return true; } : null,
    onSave: async v => {
      const amount = money(v.amount);
      if (!(amount > 0)) return "Informe o valor pago.";
      const txn = { kind: "pagamento_fatura", fromId: v.fromId, toId: card.id, amount, date: v.date, invoice: invoiceId, status: "efetivado",
        desc: "Fatura " + card.name + " · " + monthLabel(invoiceId, true), categoryId: null };
      const err = F.validateTxn(txn, { accounts: st.accounts, cards: st.cards });
      if (err) return err;
      try { await app.store.save("finTxns", existing ? { ...existing, ...txn } : txn); toast(amount >= inv.open && !existing ? "Fatura paga" : "Pagamento registrado"); return true; }
      catch (e) { return errText(e); }
    }
  });
}

export function viewCards(app, id) {
  const st = app.store.state, t = today(), txns = live(st);
  const cards = st.cards.filter(c => !c.deleted);
  if (!cards.length) return [h("section", { class: "card" }, emptyState("Cadastre seus cartões com limite, dia de fechamento e vencimento. As compras caem sozinhas na fatura certa.", "+ Novo cartão", () => openCardForm(app)))];
  const sel = cards.find(c => c.id === id) || activeCards(st)[0] || cards[0];
  const ccard = c => {
    const l = F.cardLimit(c, txns);
    const cur = F.invoiceSummary(c, txns, F.invoiceFor(t, c.closingDay, c.dueDay), t);
    return h("button", { type: "button", class: "ccard", "aria-pressed": c.id === sel.id ? "true" : "false", style: { "--c": c.color || "#173B5E" }, onclick: () => app.go("#/cartoes/" + c.id) },
      h("span", { class: "row1" }, h("span", { class: "nm", text: c.name }), h("span", { class: "brandn", text: (BRANDS.find(b => b[0] === c.brand) || ["", ""])[1] })),
      h("span", { class: "row1" }, h("span", { style: { display: "grid" } }, h("span", { class: "k", text: "Fatura atual · vence " + fmtDay(cur.due) }), h("span", { class: "v", text: cur.open < 0 ? "Crédito " + brl(-cur.open) : brl(cur.open) })),
        h("span", { style: { display: "grid", justifyItems: "end" } }, h("span", { class: "k", text: "Disponível" }), h("span", { style: { fontWeight: 700 }, text: brl(l.available) }))),
      h("span", { class: "bar" }, h("span", { style: { width: (l.limit ? Math.min(100, l.used / l.limit * 100) : 0) + "%" } })),
      h("span", { class: "k", style: { position: "relative" }, text: "Usado " + brl(l.used) + " de " + brl(l.limit) + (c.status === "cancelado" ? " · cancelado" : "") }));
  };

  const ids = F.cardInvoiceIds(sel, txns, t);
  const curId = F.invoiceFor(t, sel.closingDay, sel.dueDay);
  if (!app.ui.invoice || !ids.includes(app.ui.invoice) || app.ui._invCard !== sel.id) { app.ui.invoice = curId; app.ui._invCard = sel.id; }
  const inv = F.invoiceSummary(sel, txns, app.ui.invoice, t);
  const tabs = h("div", { class: "inv-tabs", role: "tablist", "aria-label": "Faturas" }, ids.map(i => {
    const s = F.invoiceSummary(sel, txns, i, t);
    return h("button", { type: "button", class: "inv-tab", role: "tab", "aria-pressed": i === app.ui.invoice ? "true" : "false", onclick: () => { app.ui.invoice = i; app.render(); } },
      h("span", { class: "m", text: monthLabel(i, true) + (i === curId ? " · atual" : i > curId ? " · futura" : "") }),
      h("span", { class: "v", text: brl(s.total) + " · " + F.INVOICE_STATUS[s.status].toLowerCase() }));
  }));
  const statusCls = { paga: "pos", vencida: "neg", fechada: "warn", parcial: "warn", aberta: "info", sem_valor: "" }[inv.status];
  const items = inv.items.slice().sort((a, b) => a.date.localeCompare(b.date));
  const l = F.cardLimit(sel, txns);
  const future = txns.filter(x => x.cardId === sel.id && x.invoice > curId && x.kind === "despesa").reduce((s, x) => s + x.amount, 0);

  return [
    h("div", { class: "toolbar" },
      h("button", { class: "btn primary", type: "button", text: "+ Compra no cartão", onclick: () => openTxnForm(app, null, { kind: "despesa", where: "c:" + sel.id }) }),
      h("button", { class: "btn", type: "button", text: "+ Novo cartão", onclick: () => openCardForm(app) }),
      h("button", { class: "btn", type: "button", text: "Editar " + sel.name, onclick: () => openCardForm(app, sel) })),
    h("div", { class: "acc-grid" }, cards.map(ccard)),
    h("div", { class: "kpis" },
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("card"), "Limite usado"), h("span", { class: "v", text: brl(l.used) }), h("span", { class: "d", text: "de " + brl(l.limit) + " · " + (l.limit ? Math.round(l.used / l.limit * 100) : 0) + "%" })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("wallet"), "Limite disponível"), h("span", { class: "v", text: brl(l.available) })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("calendar"), "Parcelas futuras"), h("span", { class: "v", text: brl(future) }), h("span", { class: "d", text: "em faturas depois da atual" }))),
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: "Faturas · " + sel.name }), h("span", { class: "sub", text: "fecha dia " + sel.closingDay + " · vence dia " + sel.dueDay })),
      tabs,
      h("div", { class: "toolbar" },
        h("span", { class: "chip " + statusCls, text: F.INVOICE_STATUS[inv.status] }),
        h("span", { class: "hint", text: "Fechamento " + fmtDate(inv.closing) + " · vencimento " + fmtDate(inv.due) }),
        h("span", { class: "spacer" }),
        h("span", { style: { display: "grid", textAlign: "right" } },
          h("span", { class: "hint", text: "Total " + brl(inv.total) + " · pago " + brl(inv.paid) }),
          h("b", { style: { fontSize: "18px" }, text: inv.open < 0 ? "Crédito de " + brl(-inv.open) + " para a próxima" : "Em aberto " + brl(inv.open) })),
        inv.open > 0 ? h("button", { class: "btn gold", type: "button", text: "Pagar fatura", onclick: () => openInvoicePayment(app, sel, inv.id) }) : null),
      dataTable({
        rows: items, onRow: x => openTxnForm(app, x), page: 0, pageSize: 300,
        empty: "Nenhuma compra nesta fatura.",
        columns: [
          { label: "Data", render: x => h("span", { class: "num", text: fmtDate(x.date) }) },
          { label: "Compra", render: x => h("div", { class: "desc" }, h("b", { text: (x.desc || categoryName(st, x.categoryId)) + (x.installment ? " (" + x.installment.n + "/" + x.installment.of + ")" : "") }),
            h("small", { text: (x.kind === "estorno" ? "Estorno · " : "") + categoryName(st, x.categoryId) })) },
          { label: "Valor", align: "right", render: x => h("span", { class: "amt " + (x.kind === "estorno" ? "pos" : ""), text: (x.kind === "estorno" ? "− " : "") + brl(x.amount) }) }
        ]
      }),
      inv.payments.length ? h("div", { style: { display: "grid", gap: "6px" } }, h("div", { class: "hint", style: { fontWeight: 700 }, text: "Pagamentos desta fatura" }),
        h("div", { class: "rows" }, inv.payments.map(p => h("button", { type: "button", class: "r-item", onclick: () => openInvoicePayment(app, sel, inv.id, p) },
          h("span", { class: "ico pos" }, icon("check")), h("span", { class: "grow desc" }, h("b", { text: "Pago com " + ((accountById(st, p.fromId) || {}).name || "conta") }), h("small", { text: fmtDate(p.date) })),
          h("span", { class: "amt", text: brl(p.amount) }))))) : null)
  ];
}
