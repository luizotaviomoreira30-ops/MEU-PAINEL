// Financial rules shared by Meu Financeiro, Meu Painel and the automated tests.
// Pure functions only: no Firebase, no DOM. Every amount is an integer number of cents.

/* ---------------- vocabulary ---------------- */
export const ACCOUNT_TYPES = {
  corrente: { label: "Conta corrente", group: "ativo" },
  poupanca: { label: "Poupança", group: "ativo" },
  dinheiro: { label: "Dinheiro em espécie", group: "ativo" },
  investimento: { label: "Investimentos", group: "ativo" },
  divida: { label: "Empréstimo / financiamento", group: "passivo" },
  externo: { label: "Histórico (fora do saldo)", group: "fora" }
};
export const KINDS = {
  receita: "Receita",
  despesa: "Despesa",
  transferencia: "Transferência",
  pagamento_fatura: "Pagamento de fatura",
  estorno: "Estorno",
  ajuste: "Ajuste de saldo",
  rendimento: "Rendimento"
};
export const STATUS = { efetivado: "Efetivado", previsto: "Previsto" };
export const DEFAULT_CATEGORIES = [
  ["salario", "Salário", "receita"], ["renda_extra", "Renda extra", "receita"], ["servicos", "Serviços", "receita"],
  ["rendimentos", "Rendimentos", "receita"], ["reembolsos", "Reembolsos", "receita"], ["outras_receitas", "Outras receitas", "receita"],
  ["moradia", "Moradia", "despesa"], ["alimentacao", "Alimentação", "despesa"], ["transporte", "Transporte", "despesa"],
  ["saude", "Saúde", "despesa"], ["educacao", "Educação", "despesa"], ["lazer", "Lazer", "despesa"],
  ["compras", "Compras pessoais", "despesa"], ["assinaturas", "Assinaturas", "despesa"], ["contas_casa", "Contas domésticas", "despesa"],
  ["impostos", "Impostos", "despesa"], ["dividas", "Dívidas", "despesa"], ["outros", "Outros", "despesa"]
].map(([id, name, kind], i) => ({ id, name, kind, order: i }));
export const BUDGET_LEVELS = [50, 75, 90, 100];

/* ---------------- money and dates ---------------- */
export const toCents = v => {
  const n = typeof v === "string" ? parseMoney(v) : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export const fromCents = c => (Number(c) || 0) / 100;
// Accepts "45,90", "45.90", "1.234,56", "R$ 12" and "1234.5".
export function parseMoney(s) {
  let t = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!t) return NaN;
  const neg = t.startsWith("-");
  t = t.replace(/^-/, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? (neg ? -1 : 1) * Math.round(n * 100) / 100 : NaN;
}
const pad = n => String(n).padStart(2, "0");
export const monthOf = iso => String(iso).slice(0, 7);
export const daysInMonth = mk => new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0).getDate();
export function addMonths(mk, n) {
  const y = Number(mk.slice(0, 4)), m = Number(mk.slice(5, 7)) - 1 + n;
  const d = new Date(y, m, 1);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}
export const dayIn = (mk, day) => mk + "-" + pad(Math.min(Math.max(1, Number(day) || 1), daysInMonth(mk)));
export function monthsBetween(from, to, max = 120) {
  const out = [];
  for (let m = from; m <= to && out.length < max; m = addMonths(m, 1)) out.push(m);
  return out;
}

/* ---------------- lifecycle ---------------- */
export const isLive = t => !!t && !t.deleted;
export const isRealized = t => isLive(t) && t.status === "efetivado";
// When money actually moved: the payment date if there is one, otherwise the movement date.
export const effectiveDate = t => t.paidDate || t.date;

export function validateTxn(t, { accounts = [], cards = [] } = {}) {
  if (!t || !KINDS[t.kind]) return "Escolha o tipo do lançamento.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || "")) return "Informe a data.";
  if (t.kind === "ajuste") { if (!Number.isInteger(t.delta) || t.delta === 0) return "Informe a diferença do ajuste."; }
  else if (!Number.isInteger(t.amount) || t.amount <= 0) return "O valor precisa ser maior que zero.";
  if (!STATUS[t.status]) return "Escolha se o lançamento já foi efetivado ou é previsto.";
  const acc = id => accounts.some(a => a.id === id), card = id => cards.some(c => c.id === id);
  if (t.kind === "transferencia") {
    if (!t.fromId || !t.toId) return "Escolha as contas de origem e de destino.";
    if (t.fromId === t.toId) return "A origem e o destino precisam ser contas diferentes.";
    if (accounts.length && (!acc(t.fromId) || !acc(t.toId))) return "Conta de origem ou destino não encontrada.";
  } else if (t.kind === "pagamento_fatura") {
    if (!t.fromId || !t.toId) return "Escolha a conta que paga e o cartão.";
    if (!/^\d{4}-\d{2}$/.test(t.invoice || "")) return "Informe a fatura que está sendo paga.";
    if (cards.length && !card(t.toId)) return "Cartão não encontrado.";
  } else if (t.kind === "despesa" || t.kind === "estorno") {
    if (!t.accountId && !t.cardId) return "Escolha a conta ou o cartão.";
    if (t.accountId && t.cardId) return "Escolha conta ou cartão, não os dois.";
    if (t.cardId && !/^\d{4}-\d{2}$/.test(t.invoice || "")) return "Compra no cartão precisa da fatura.";
  } else if (!t.accountId) return "Escolha a conta.";
  return null;
}

/* ---------------- account balances ---------------- */
// What a realized transaction does to each account, in cents ("asset sign": money you have).
export function accountEffects(t) {
  if (!isRealized(t)) return [];
  const a = t.amount;
  switch (t.kind) {
    case "receita": case "rendimento": return t.accountId ? [[t.accountId, a]] : [];
    case "despesa": return t.accountId ? [[t.accountId, -a]] : [];
    case "estorno": return t.accountId ? [[t.accountId, a]] : [];
    case "ajuste": return t.accountId ? [[t.accountId, t.delta]] : [];
    case "transferencia": return [[t.fromId, -a], [t.toId, a]];
    case "pagamento_fatura": return [[t.fromId, -a]];
    default: return [];
  }
}
// Opening balance is stored in asset sign: a loan of R$ 10.000 is opening -1000000.
export function accountBalance(account, txns, upTo = null) {
  let bal = Number(account.opening) || 0;
  for (const t of txns) {
    if (upTo && effectiveDate(t) > upTo) continue;
    for (const [id, d] of accountEffects(t)) if (id === account.id) bal += d;
  }
  return bal;
}
export function balances(accounts, txns, upTo = null) {
  const out = Object.fromEntries(accounts.map(a => [a.id, Number(a.opening) || 0]));
  for (const t of txns) {
    if (upTo && effectiveDate(t) > upTo) continue;
    for (const [id, d] of accountEffects(t)) if (id in out) out[id] += d;
  }
  return out;
}
export const accountGroup = a => (ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.corrente).group;

/* ---------------- credit cards and invoices ---------------- */
// An invoice is named by its due month. A purchase on or after the closing day goes to the next one.
export function invoiceFor(dateIso, closingDay, dueDay) {
  const mk = monthOf(dateIso), day = Number(dateIso.slice(8, 10));
  const closeMonth = day >= Number(closingDay) ? addMonths(mk, 1) : mk;
  return Number(dueDay) > Number(closingDay) ? closeMonth : addMonths(closeMonth, 1);
}
export function invoiceDates(invoiceId, closingDay, dueDay) {
  const due = dayIn(invoiceId, dueDay);
  const closeMonth = Number(dueDay) > Number(closingDay) ? invoiceId : addMonths(invoiceId, -1);
  return { closing: dayIn(closeMonth, closingDay), due };
}
// What a transaction does to a card's debt (positive = you owe more).
export function cardEffect(t, cardId) {
  if (!isRealized(t)) return 0;
  if (t.kind === "despesa" && t.cardId === cardId) return t.amount;
  if (t.kind === "estorno" && t.cardId === cardId) return -t.amount;
  if (t.kind === "pagamento_fatura" && t.toId === cardId) return -t.amount;
  return 0;
}
export function cardDebt(card, txns, upTo = null) {
  let debt = 0;
  for (const t of txns) {
    if (upTo && effectiveDate(t) > upTo) continue;
    debt += cardEffect(t, card.id);
  }
  return debt;
}
export function cardLimit(card, txns) {
  const used = Math.max(0, cardDebt(card, txns));
  const limit = Number(card.limit) || 0;
  return { limit, used, available: limit - used };
}
export function invoiceSummary(card, txns, invoiceId, today) {
  const items = txns.filter(t => isLive(t) && t.cardId === card.id && t.invoice === invoiceId && (t.kind === "despesa" || t.kind === "estorno"));
  const payments = txns.filter(t => isRealized(t) && t.kind === "pagamento_fatura" && t.toId === card.id && t.invoice === invoiceId);
  const total = items.filter(isRealized).reduce((s, t) => s + (t.kind === "estorno" ? -t.amount : t.amount), 0);
  const paid = payments.reduce((s, t) => s + t.amount, 0);
  const open = total - paid;
  const { closing, due } = invoiceDates(invoiceId, card.closingDay, card.dueDay);
  let status;
  if (today < closing) status = "aberta";
  else if (total <= 0 && paid === 0) status = "sem_valor";
  else if (open <= 0) status = "paga";
  else if (today > due) status = "vencida";
  else status = paid > 0 ? "parcial" : "fechada";
  return { id: invoiceId, cardId: card.id, items, payments, total, paid, open, closing, due, status };
}
export const INVOICE_STATUS = { aberta: "Aberta", fechada: "Fechada", parcial: "Paga em parte", paga: "Paga", vencida: "Vencida", sem_valor: "Sem lançamentos" };
// Invoices that have any item or payment, plus the current one.
export function cardInvoiceIds(card, txns, today) {
  const ids = new Set([invoiceFor(today, card.closingDay, card.dueDay)]);
  for (const t of txns) {
    if (!isLive(t)) continue;
    if ((t.cardId === card.id || (t.kind === "pagamento_fatura" && t.toId === card.id)) && t.invoice) ids.add(t.invoice);
  }
  return [...ids].sort();
}

/* ---------------- bills to pay and to receive ---------------- */
// Planned entries and card invoices with something left to pay, by due date.
// Overdue = due before today and still not paid. Transfers between your own accounts are not bills;
// a planned payment to a debt account is.
export function payables(txns, cards, today, { from = "0000-01-01", to = "9999-12-31" } = {}) {
  const out = [];
  for (const t of txns) {
    if (!isLive(t) || t.status !== "previsto" || t.cardId) continue;
    const type = t.kind === "receita" || t.kind === "rendimento" ? "receber"
      : t.kind === "despesa" || (t.kind === "transferencia" && t.subtype === "pagamento_divida") ? "pagar" : null;
    if (!type) continue;
    const due = t.dueDate || t.date;
    if (due < from || due > to) continue;
    out.push({ key: "t:" + t.id, type, due, amount: t.amount, overdue: due < today, txn: t });
  }
  for (const c of cards) {
    for (const id of cardInvoiceIds(c, txns, today)) {
      const inv = invoiceSummary(c, txns, id, today);
      if (inv.open <= 0 || inv.due < from || inv.due > to) continue;
      out.push({ key: "f:" + c.id + ":" + id, type: "pagar", due: inv.due, amount: inv.open, overdue: inv.due < today, invoice: inv, card: c });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.type.localeCompare(b.type));
}
export function payablesTotals(items) {
  const sum = (type, overdue) => items.filter(x => x.type === type && (overdue == null || x.overdue === overdue)).reduce((s, x) => s + x.amount, 0);
  return { pay: sum("pagar"), receive: sum("receber"), payLate: sum("pagar", true), receiveLate: sum("receber", true) };
}

/* ---------------- installments ---------------- */
export function splitInstallments(totalCents, n) {
  const part = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, i) => part + (i === 0 ? totalCents - part * n : 0));
}
// One transaction per installment: all keep the purchase date (expense recognized at purchase),
// each one lands on its own invoice.
export function buildInstallments(base, n, card, group) {
  const first = invoiceFor(base.date, card.closingDay, card.dueDay);
  return splitInstallments(base.amount, n).map((amount, i) => ({
    ...base, amount, cardId: card.id, accountId: null, status: "efetivado",
    invoice: addMonths(first, i),
    installment: n > 1 ? { group, n: i + 1, of: n, total: base.amount } : null
  }));
}

/* ---------------- monthly results ---------------- */
// Income and expenses by movement date. Transfers, invoice payments and adjustments never count.
export function monthSummary(txns, mk, { includePlanned = false } = {}) {
  let income = 0, yields = 0, expense = 0, refunds = 0, plannedIncome = 0, plannedExpense = 0;
  const byCategory = {};
  for (const t of txns) {
    if (!isLive(t) || monthOf(t.date) !== mk) continue;
    const realized = t.status === "efetivado";
    if (!realized && !includePlanned) {
      if (t.kind === "receita") plannedIncome += t.amount;
      if (t.kind === "despesa") plannedExpense += t.amount;
      continue;
    }
    if (t.kind === "receita") income += t.amount;
    else if (t.kind === "rendimento") yields += t.amount;
    else if (t.kind === "despesa") { expense += t.amount; byCategory[t.categoryId || "outros"] = (byCategory[t.categoryId || "outros"] || 0) + t.amount; }
    else if (t.kind === "estorno") { refunds += t.amount; byCategory[t.categoryId || "outros"] = (byCategory[t.categoryId || "outros"] || 0) - t.amount; }
  }
  const netExpense = expense - refunds;
  return { month: mk, income, yields, expense: netExpense, grossExpense: expense, refunds, result: income + yields - netExpense, byCategory, plannedIncome, plannedExpense };
}

/* ---------------- net worth ---------------- */
export function netWorth(accounts, cards, txns, upTo = null, otherAssets = []) {
  const bal = balances(accounts.filter(a => accountGroup(a) !== "fora"), txns, upTo);
  let assets = 0, liabilities = 0, invested = 0, cash = 0;
  for (const a of accounts) {
    const g = accountGroup(a);
    if (g === "fora" || a.status === "encerrada" && !bal[a.id]) continue;
    const b = bal[a.id] || 0;
    if (g === "passivo") liabilities += -b;
    else if (b >= 0) { assets += b; if (a.type === "investimento") invested += b; else cash += b; }
    else liabilities += -b;   // an overdrawn account is money owed
  }
  let cardsDebt = 0;
  for (const c of cards) cardsDebt += Math.max(0, cardDebt(c, txns, upTo));
  liabilities += cardsDebt;
  const other = otherAssets.reduce((s, x) => s + (Number(x.value) || 0), 0);
  assets += other;
  return { assets, liabilities, net: assets - liabilities, invested, cash, cardsDebt, otherAssets: other };
}

/* ---------------- recurring entries ---------------- */
// Deterministic ids make generation idempotent: the same month never produces two entries.
export const occurrenceId = (ruleId, mk) => ruleId + "_" + mk;
export function recurrenceOccurrences(rule, fromMk, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const mk = addMonths(fromMk, i);
    if (rule.startMonth && mk < rule.startMonth) continue;
    if (rule.endMonth && mk > rule.endMonth) break;
    out.push({ ...rule.template, id: occurrenceId(rule.id, mk), date: dayIn(mk, rule.day), status: "previsto",
      recurrence: { ruleId: rule.id, period: mk } });
  }
  return out;
}
export function missingOccurrences(rule, existingIds, fromMk, count) {
  const have = existingIds instanceof Set ? existingIds : new Set(existingIds);
  return recurrenceOccurrences(rule, fromMk, count).filter(o => !have.has(o.id));
}

/* ---------------- budget ---------------- */
export function budgetStatus(limit, spent) {
  const pct = limit > 0 ? Math.round(spent / limit * 100) : 0;
  const level = [...BUDGET_LEVELS].reverse().find(l => pct >= l) || 0;
  return { limit, spent, remaining: limit - spent, pct, level };
}

/* ---------------- planning ---------------- */
// Expected movements in a window: planned entries plus open card invoices, by due date.
export function upcoming(txns, cards, fromIso, toIso, today) {
  const list = [];
  for (const t of txns) {
    if (!isLive(t) || t.status !== "previsto" || t.cardId) continue;
    const when = t.dueDate || t.date;
    if (when >= fromIso && when <= toIso) list.push({ type: t.kind === "receita" || t.kind === "rendimento" ? "receber" : "pagar", date: when, amount: t.amount, txn: t });
  }
  for (const c of cards) {
    for (const id of cardInvoiceIds(c, txns, today)) {
      const inv = invoiceSummary(c, txns, id, today);
      if (inv.open > 0 && inv.due >= fromIso && inv.due <= toIso) list.push({ type: "pagar", date: inv.due, amount: inv.open, invoice: inv, card: c });
    }
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- audit trail ---------------- */
export function auditEntry(action, entity, entityId, before, after, at) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [...keys].filter(k => JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k]));
  return { action, entity, entityId, at, changed, before: before || null, after: after || null };
}

/* ---------------- checks used by the insights ---------------- */
// Same amount, same account or card, dates up to a day apart and the same first word.
export function possibleDuplicates(txns) {
  const live = txns.filter(t => isLive(t) && (t.kind === "despesa" || t.kind === "receita"));
  const key = t => (t.desc || "").trim().toLowerCase().split(/\s+/)[0] || "";
  const out = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.amount !== b.amount || a.kind !== b.kind || (a.accountId || a.cardId) !== (b.accountId || b.cardId)) continue;
    if (a.installment && b.installment && a.installment.group === b.installment.group) continue;
    if (a.recurrence && b.recurrence && a.recurrence.ruleId === b.recurrence.ruleId) continue;
    const gap = Math.abs((Date.parse(a.date) - Date.parse(b.date)) / 86400000);
    if (gap <= 1 && key(a) === key(b)) out.push([a, b]);
  }
  return out;
}
