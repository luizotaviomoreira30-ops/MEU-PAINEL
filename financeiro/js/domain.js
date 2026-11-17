// Helpers that read the store's state through the rules in fincore.
import * as F from "../../shared/fincore.js";

export const METHODS = [["", "—"], ["pix", "Pix"], ["debito", "Débito"], ["credito", "Crédito"], ["dinheiro", "Dinheiro"], ["boleto", "Boleto"], ["transferencia", "Transferência"], ["debito_automatico", "Débito automático"]];
export const METHOD_LABEL = Object.fromEntries(METHODS.filter(([k]) => k));
export const SUBTYPE_LABEL = { aplicacao: "Aplicação", resgate: "Resgate", pagamento_divida: "Pagamento de dívida", emprestimo: "Empréstimo recebido" };

export const live = st => st.txns.filter(F.isLive);
export const accountById = (st, id) => st.accounts.find(a => a.id === id);
export const cardById = (st, id) => st.cards.find(c => c.id === id);
export const categoryById = (st, id) => st.categories.find(c => c.id === id);
export const categoryName = (st, id) => (categoryById(st, id) || {}).name || (id ? "Sem categoria" : "—");
export const activeAccounts = st => st.accounts.filter(a => !a.deleted && a.status !== "encerrada");
export const activeCards = st => st.cards.filter(c => !c.deleted && c.status !== "cancelado");
export const categoriesOf = (st, kind) => st.categories.filter(c => !c.deleted && !c.archived && c.kind === kind);

// Where the money moved, in words.
export function whereLabel(st, t) {
  const a = id => (accountById(st, id) || {}).name || "conta removida";
  const c = id => (cardById(st, id) || {}).name || "cartão removido";
  if (t.kind === "transferencia") return a(t.fromId) + " → " + a(t.toId);
  if (t.kind === "pagamento_fatura") return a(t.fromId) + " → " + c(t.toId);
  if (t.cardId) return c(t.cardId);
  return t.accountId ? a(t.accountId) : "—";
}
// Sign from the point of view of your wealth: in, out or neutral.
export function direction(t) {
  if (t.kind === "receita" || t.kind === "rendimento" || t.kind === "estorno") return 1;
  if (t.kind === "despesa") return -1;
  if (t.kind === "ajuste") return Math.sign(t.delta || 0);
  return 0;
}
export const txnAmount = t => t.kind === "ajuste" ? Math.abs(t.delta || 0) : t.amount;
export function kindLabel(t) {
  if (t.kind === "transferencia" && t.subtype) return SUBTYPE_LABEL[t.subtype] || F.KINDS.transferencia;
  if (t.kind === "despesa" && t.cardId) return "Compra no cartão";
  return F.KINDS[t.kind] || t.kind;
}

// Summaries for the last n months ending at mk.
export function monthSeries(st, mk, n = 6) {
  const txns = live(st);
  return Array.from({ length: n }, (_, i) => F.addMonths(mk, i - n + 1)).map(m => F.monthSummary(txns, m));
}
export function netWorthAt(st, iso) {
  return F.netWorth(st.accounts.filter(a => !a.deleted), st.cards.filter(c => !c.deleted), live(st), iso);
}
export const endOfMonth = mk => F.dayIn(mk, 31);

// Monthly limits: the month's own document, or the latest earlier one.
export function budgetFor(st, mk) {
  if (st.budgets[mk]) return { limits: st.budgets[mk].limits || {}, from: mk };
  const earlier = Object.keys(st.budgets).filter(k => /^\d{4}-\d{2}$/.test(k) && k < mk).sort().pop();
  return earlier ? { limits: st.budgets[earlier].limits || {}, from: earlier } : { limits: {}, from: null };
}
export function budgetRows(st, mk) {
  const { limits, from } = budgetFor(st, mk);
  const spent = F.monthSummary(live(st), mk).byCategory;
  const rows = categoriesOf(st, "despesa").map(c => ({ cat: c, ...F.budgetStatus(limits[c.id] || 0, Math.max(0, spent[c.id] || 0)) }))
    .filter(r => r.limit > 0 || r.spent > 0);
  return { rows, from };
}

// Alerts for the overview and for Meu Painel.
export function alerts(st, today) {
  const out = [];
  const txns = live(st);
  const mk = today.slice(0, 7);
  for (const r of budgetRows(st, mk).rows) if (r.limit > 0 && r.level >= 75)
    out.push({ level: r.level >= 100 ? "neg" : "warn", text: r.cat.name + ": " + r.pct + "% do orçamento usado", to: "#/orcamento" });
  for (const c of activeCards(st)) for (const id of F.cardInvoiceIds(c, txns, today)) {
    const inv = F.invoiceSummary(c, txns, id, today);
    if (inv.status === "vencida") out.push({ level: "neg", text: "Fatura " + c.name + " vencida em " + inv.due.split("-").reverse().join("/"), to: "#/cartoes/" + c.id });
  }
  const late = txns.filter(t => t.status === "previsto" && !t.cardId && (t.dueDate || t.date) < today);
  if (late.length) out.push({ level: "warn", text: late.length + (late.length === 1 ? " lançamento previsto já passou da data" : " lançamentos previstos já passaram da data") + ": confirme ou ajuste", to: "#/lancamentos?status=previsto" });
  const bal = F.balances(st.accounts, txns);
  for (const a of activeAccounts(st)) if (F.accountGroup(a) === "ativo" && bal[a.id] < 0)
    out.push({ level: "neg", text: a.name + " está com saldo negativo", to: "#/contas/" + a.id });
  for (const c of activeCards(st)) {
    const l = F.cardLimit(c, txns);
    if (l.limit > 0 && l.used / l.limit >= .9) out.push({ level: "warn", text: c.name + ": " + Math.round(l.used / l.limit * 100) + "% do limite usado", to: "#/cartoes/" + c.id });
  }
  return out;
}
