// The transaction editor used everywhere (+ Lançamento, accounts, cards, list).
import * as F from "../../../shared/fincore.js";
import { h, openForm, money, moneyField, today, fmtDate, monthLabel, toast, brl } from "../ui.js";
import { METHODS, activeAccounts, activeCards, categoriesOf, accountById, cardById, live } from "../domain.js";
import { errText } from "../store.js";

const KIND_TABS = [["despesa", "Despesa"], ["receita", "Receita"], ["transferencia", "Transferência"], ["estorno", "Estorno"], ["rendimento", "Rendimento"], ["ajuste", "Ajuste de saldo"]];

function whereOptions(st, includeCards) {
  const groups = [{ group: "Contas", items: activeAccounts(st).map(a => ["a:" + a.id, a.name]) }];
  if (includeCards && activeCards(st).length) groups.push({ group: "Cartões de crédito", items: activeCards(st).map(c => ["c:" + c.id, c.name]) });
  return [["", "Escolha…"], ...groups];
}
const accountOptions = (st, filter = () => true) => [["", "Escolha…"], ...activeAccounts(st).filter(filter).map(a => [a.id, a.name])];
const descSuggestions = st => [...new Set(live(st).filter(t => t.desc).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(t => t.desc.trim()))].slice(0, 80);

// Values the form shows for an existing transaction (or a preset).
function toValues(t) {
  const where = t.cardId ? "c:" + t.cardId : t.accountId ? "a:" + t.accountId : "";
  return {
    kind: t.kind || "despesa", desc: t.desc || "", amount: t.kind === "ajuste" ? "" : moneyField(t.amount), date: t.date || today(),
    where, fromId: t.fromId || "", toId: t.toId || "", accountId: t.accountId || "", status: t.status || "efetivado",
    dueDate: t.dueDate || "", paidDate: t.paidDate || "", categoryId: t.categoryId || "", subcategory: t.subcategory || "",
    method: t.method || "", tags: (t.tags || []).join(", "), notes: t.notes || "", parcelas: "1", repeat: false, target: ""
  };
}

export function openTxnForm(app, existing = null, preset = {}) {
  const st = app.store.state;
  const isNew = !existing || preset.duplicate;
  const t0 = existing ? { ...existing, ...(preset.duplicate ? { status: existing.status } : {}) } : { kind: "despesa", date: today(), ...preset };
  const values = toValues(t0);
  if (isNew && !existing) {
    values.method = app.recall("method", "");
    if (!values.where && values.kind === "despesa") values.where = app.recall("where", "");
    if (!values.accountId && (values.kind === "receita" || values.kind === "rendimento")) values.accountId = app.recall("incomeAccount", "");
  }
  if (existing && existing.kind === "pagamento_fatura") return app.openInvoicePayment(cardById(st, existing.toId), existing.invoice, existing);
  const locked = existing && existing.installment;   // one installment of a purchase: kind and card stay
  const isCard = v => (v.kind === "despesa" || v.kind === "estorno") && String(v.where).startsWith("c:");
  const cardOf = v => isCard(v) ? cardById(st, v.where.slice(2)) : null;
  const catKind = v => (v.kind === "receita" || v.kind === "rendimento") ? "receita" : "despesa";

  const invoiceHint = v => {
    const c = cardOf(v);
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return null;
    if (existing && existing.invoice && existing.cardId === c.id) return h("p", { class: "hint" }, "Fatura de ", h("b", { text: monthLabel(existing.invoice).toLowerCase() }), existing.installment ? " · parcela " + existing.installment.n + " de " + existing.installment.of : "");
    const inv = F.invoiceFor(v.date, c.closingDay, c.dueDay);
    const n = Number(v.parcelas) || 1;
    return h("p", { class: "hint" }, "Vai para a fatura de ", h("b", { text: monthLabel(inv).toLowerCase() }),
      n > 1 ? " (" + n + " parcelas até " + monthLabel(F.addMonths(inv, n - 1)).toLowerCase() + ")" : "", " · fecha dia " + c.closingDay + ", vence dia " + c.dueDay + ".");
  };
  const adjustHint = v => {
    const a = accountById(st, v.accountId);
    if (!a) return h("p", { class: "hint", text: "Escolha a conta e informe o saldo que aparece no banco hoje. O painel lança só a diferença." });
    const cur = F.accountBalance(a, live(st));
    const target = money(v.target);
    return h("p", { class: "hint" }, "Saldo no painel: ", h("b", { text: brl(cur) }),
      Number.isFinite(target) ? [" · diferença: ", h("b", { text: (target - cur >= 0 ? "+ " : "− ") + brl(Math.abs(target - cur)) })] : "");
  };

  let form;
  const rebuild = () => { const v = form.state; form.close(); open(v); };
  const open = v => {
    form = openForm({
      title: existing && !preset.duplicate ? "Editar lançamento" : preset.duplicate ? "Duplicar lançamento" : "Novo lançamento",
      values: v,
      saveLabel: isNew ? "Salvar lançamento" : "Salvar",
      onChange: (s, el) => {
        // Fields that depend on the kind or on the card are rebuilt; the rest keeps its value.
        if (s._lastKind !== s.kind || s._lastCard !== String(isCard(s))) { s._lastKind = s.kind; s._lastCard = String(isCard(s)); rebuild(); return; }
        const hint = el.querySelector("[data-hint=inv]"); if (hint) hint.replaceChildren(invoiceHint(s) || "");
        const ah = el.querySelector("[data-hint=adj]"); if (ah) ah.replaceChildren(adjustHint(s));
      },
      fields: [
        locked ? { type: "node", node: h("p", { class: "hint", text: "Parcela " + existing.installment.n + " de " + existing.installment.of + " de uma compra de " + brl(existing.installment.total) + ". Editar aqui muda só esta parcela." }) }
          : { key: "kind", type: "seg", label: "Tipo", options: KIND_TABS },
        { key: "desc", label: "Descrição", full: true, placeholder: "Ex.: Mercado, Salário, Aluguel", suggestions: descSuggestions(st), show: s => s.kind !== "ajuste" },
        { key: "amount", label: "Valor (R$)", type: "money", required: true, placeholder: "0,00", show: s => s.kind !== "ajuste" },
        { key: "date", label: "Data da movimentação", type: "date", required: true },
        // where
        { key: "where", label: "Conta ou cartão", type: "select", options: whereOptions(st, true), required: true, show: s => s.kind === "despesa" || s.kind === "estorno" },
        { key: "accountId", label: v.kind === "rendimento" ? "Conta de investimento" : "Conta", type: "select", required: true,
          options: accountOptions(st), show: s => s.kind === "receita" || s.kind === "rendimento" || s.kind === "ajuste" },
        { key: "fromId", label: "Sai de", type: "select", options: accountOptions(st), required: true, show: s => s.kind === "transferencia" },
        { key: "toId", label: "Vai para", type: "select", options: accountOptions(st), required: true, show: s => s.kind === "transferencia",
          hint: "Aplicar em investimento ou pagar empréstimo também é transferência: não conta como despesa." },
        { key: "target", label: "Saldo correto hoje (R$)", type: "money", required: true, placeholder: "0,00", show: s => s.kind === "ajuste" },
        { type: "node", node: () => h("div", { "data-hint": "adj" }, adjustHint(v)), show: s => s.kind === "ajuste" },
        { type: "node", node: () => h("div", { "data-hint": "inv" }, invoiceHint(v) || ""), show: s => isCard(s) },
        { key: "parcelas", label: "Parcelas", type: "select", show: s => isNew && !locked && s.kind === "despesa" && isCard(s),
          options: Array.from({ length: 24 }, (_, i) => [String(i + 1), i ? (i + 1) + "x" : "À vista"]) },
        // status
        { key: "status", label: "Situação", type: "select", show: s => !isCard(s) && s.kind !== "ajuste",
          options: s => [["efetivado", (s.kind === "receita" || s.kind === "rendimento") ? "Recebido" : s.kind === "transferencia" ? "Feita" : "Pago"],
            ["previsto", (s.kind === "receita" || s.kind === "rendimento") ? "A receber" : s.kind === "transferencia" ? "Agendada" : "A pagar"]] },
        { key: "dueDate", label: "Vencimento", type: "date", show: s => !isCard(s) && s.kind !== "ajuste" && s.status === "previsto" },
        { key: "paidDate", label: "Data do pagamento", type: "date", hint: "Se ficar vazio, vale a data da movimentação.", show: s => !isCard(s) && (s.kind === "despesa" || s.kind === "receita") && s.status === "efetivado" },
        // classification
        { key: "categoryId", label: "Categoria", type: "select", show: s => s.kind !== "transferencia" && s.kind !== "ajuste",
          options: s => [["", "Escolha…"], ...categoriesOf(st, catKind(s)).map(c => [c.id, c.name])] },
        { key: "subcategory", label: "Subcategoria (opcional)", placeholder: "Ex.: Padaria", show: s => s.kind === "despesa" || s.kind === "receita" },
        { key: "method", label: "Forma de pagamento", type: "select", options: METHODS, show: s => (s.kind === "despesa" || s.kind === "receita") && !isCard(s) },
        { key: "repeat", label: "Repetir todo mês", type: "checkbox", hint: "(aluguel, salário, assinatura): o painel cria os próximos meses como previstos, sem duplicar.",
          show: s => isNew && !locked && (s.kind === "despesa" || s.kind === "receita") && (Number(s.parcelas) || 1) === 1 },
        { key: "tags", label: "Etiquetas (separe por vírgula)", full: true, placeholder: "Ex.: viagem, casa" },
        { key: "notes", label: "Observações", type: "textarea", rows: 2, full: true }
      ],
      onDelete: existing && !preset.duplicate ? async () => { await app.store.remove("finTxns", existing.id); toast("Lançamento excluído (fica no histórico)"); return true; } : null,
      extra: existing && !preset.duplicate ? [
        { label: "Duplicar", run: () => { form.close(); setTimeout(() => openTxnForm(app, existing, { duplicate: true }), 0); return false; } },
        ...(existing.installment ? [{ label: "Excluir todas as parcelas", run: async () => {
          const ids = st.txns.filter(t => t.installment && t.installment.group === existing.installment.group && !t.deleted).map(t => t.id);
          try { await app.store.removeMany("finTxns", ids); toast(ids.length + " parcelas excluídas"); return true; } catch (e) { return errText(e); }
        } }] : [])
      ] : null,
      onSave: s => save(s)
    });
    form.state._lastKind = form.state.kind; form.state._lastCard = String(isCard(form.state));
  };

  async function save(s) {
    const kind = locked ? existing.kind : s.kind;
    const txn = {
      kind, desc: (s.desc || "").trim(), date: s.date, status: s.status || "efetivado",
      categoryId: s.categoryId || null, subcategory: (s.subcategory || "").trim(), method: s.method || "",
      tags: (s.tags || "").split(",").map(x => x.trim()).filter(Boolean), notes: (s.notes || "").trim(),
      accountId: null, cardId: null, fromId: null, toId: null, invoice: null, dueDate: null, paidDate: null, subtype: null
    };
    if (kind === "ajuste") {
      const a = accountById(st, s.accountId);
      const target = money(s.target);
      if (!a) return "Escolha a conta.";
      if (!Number.isFinite(target)) return "Informe o saldo correto, por exemplo 1.250,00.";
      txn.accountId = a.id; txn.delta = target - F.accountBalance(a, live(st).filter(t => !existing || t.id !== existing.id));
      txn.status = "efetivado"; txn.desc = txn.desc || "Ajuste de saldo"; txn.categoryId = null;
      if (txn.delta === 0) return "O saldo já está certo: não há diferença para lançar.";
    } else {
      txn.amount = money(s.amount);
      if (!(txn.amount > 0)) return "Digite um valor maior que zero, por exemplo 45,90.";
    }
    if (kind === "despesa" || kind === "estorno") {
      if (String(s.where).startsWith("c:")) {
        const c = cardById(st, s.where.slice(2));
        if (!c) return "Escolha o cartão.";
        txn.cardId = c.id; txn.status = "efetivado"; txn.method = "credito";
        txn.invoice = locked || (existing && existing.cardId === c.id && existing.date === s.date) ? existing.invoice : F.invoiceFor(s.date, c.closingDay, c.dueDay);
      } else txn.accountId = (s.where || "").slice(2) || null;
    } else if (kind === "receita" || kind === "rendimento") txn.accountId = s.accountId || null;
    else if (kind === "transferencia") {
      txn.fromId = s.fromId; txn.toId = s.toId;
      const from = accountById(st, s.fromId), to = accountById(st, s.toId);
      txn.subtype = to && to.type === "investimento" ? "aplicacao" : from && from.type === "investimento" ? "resgate"
        : to && to.type === "divida" ? "pagamento_divida" : from && from.type === "divida" ? "emprestimo" : null;
      txn.categoryId = null;
    }
    if (kind === "rendimento" && !txn.categoryId) txn.categoryId = "rendimentos";
    if (txn.status === "previsto" && s.dueDate) txn.dueDate = s.dueDate;
    if (txn.status === "efetivado" && s.paidDate && s.paidDate !== s.date) txn.paidDate = s.paidDate;
    if (locked) { txn.installment = existing.installment; txn.cardId = existing.cardId; txn.invoice = existing.invoice; txn.status = "efetivado"; }
    if (existing && existing.recurrence && !preset.duplicate) txn.recurrence = existing.recurrence;
    if (existing && existing.importedFrom && !preset.duplicate) txn.importedFrom = existing.importedFrom;

    const err = F.validateTxn(txn, { accounts: st.accounts, cards: st.cards });
    if (err) return err;
    if (!txn.desc && txn.categoryId) txn.desc = (st.categories.find(c => c.id === txn.categoryId) || {}).name || "";

    try {
      app.remember("method", txn.method || "");
      if (kind === "receita" || kind === "rendimento") app.remember("incomeAccount", txn.accountId || "");
      else if (kind === "despesa") app.remember("where", txn.cardId ? "c:" + txn.cardId : "a:" + txn.accountId);
      const n = Number(s.parcelas) || 1;
      if (isNew && txn.cardId && kind === "despesa" && n > 1) {
        const parts = F.buildInstallments(txn, n, cardById(st, txn.cardId), app.store.newId("finTxns"));
        await app.store.saveMany("finTxns", parts, "criar");
        toast(n + " parcelas lançadas: " + brl(parts[0].amount) + " por mês");
        return true;
      }
      if (isNew && s.repeat && (kind === "despesa" || kind === "receita")) {
        const ruleId = app.store.newId("finRecurring");
        const { date, status, dueDate, paidDate, ...template } = txn;
        await app.store.save("finRecurring", { id: ruleId, template, day: Number(s.date.slice(8)), startMonth: s.date.slice(0, 7), active: true }, "criar");
        const mk = s.date.slice(0, 7);
        await app.store.save("finTxns", { ...txn, id: F.occurrenceId(ruleId, mk), recurrence: { ruleId, period: mk } }, "criar");
        const made = await app.store.generateRecurring(mk, 12);
        toast("Lançado e repetido nos próximos meses" + (made ? " (" + made + " previstos criados)" : ""));
        return true;
      }
      await app.store.save("finTxns", existing && !preset.duplicate ? { ...existing, ...txn, id: existing.id } : txn);
      toast(existing && !preset.duplicate ? "Lançamento atualizado" : "Lançamento salvo");
      return true;
    } catch (e) { return errText(e); }
  }

  open(values);
}

// Marks a planned entry as paid or received, today or on the chosen date.
export async function settle(app, t, date = today()) {
  try {
    await app.store.patch("finTxns", t.id, { status: "efetivado", paidDate: date !== t.date ? date : null }, "efetivar");
    toast(t.kind === "receita" ? "Marcado como recebido" : "Marcado como pago");
  } catch (e) { toast(errText(e), "err"); }
}

export { fmtDate };
