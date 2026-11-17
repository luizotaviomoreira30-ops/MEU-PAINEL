// Automated checks of the financial rules. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "../shared/fincore.js";

const acc = (id, type = "corrente", opening = 0) => ({ id, type, opening });
const txn = (o) => ({ status: "efetivado", date: "2026-11-10", ...o });
const card = { id: "nu", closingDay: 3, dueDay: 10, limit: 500000 };

test("1. transferência entre contas próprias não é receita nem despesa", () => {
  const accounts = [acc("a", "corrente", 100000), acc("b", "poupanca", 0)];
  const txns = [txn({ kind: "transferencia", fromId: "a", toId: "b", amount: 30000 })];
  const s = F.monthSummary(txns, "2026-11");
  assert.equal(s.income, 0);
  assert.equal(s.expense, 0);
  const bal = F.balances(accounts, txns);
  assert.equal(bal.a, 70000);
  assert.equal(bal.b, 30000);
  assert.equal(F.netWorth(accounts, [], txns).net, 100000, "patrimônio não muda com transferência");
});

test("2. compra no cartão é despesa na data da compra", () => {
  const txns = [txn({ kind: "despesa", cardId: "nu", amount: 12000, date: "2026-11-20", invoice: F.invoiceFor("2026-11-20", 3, 10), categoryId: "lazer" })];
  assert.equal(F.monthSummary(txns, "2026-11").expense, 12000);
  assert.equal(F.monthSummary(txns, "2026-12").expense, 0, "não aparece de novo no mês da fatura");
  assert.equal(F.cardDebt(card, txns), 12000);
});

test("3. pagamento de fatura não gera segunda despesa", () => {
  const accounts = [acc("a", "corrente", 100000)];
  const txns = [
    txn({ kind: "despesa", cardId: "nu", amount: 12000, date: "2026-11-01", invoice: "2026-11" }),
    txn({ kind: "pagamento_fatura", fromId: "a", toId: "nu", amount: 12000, date: "2026-11-10", invoice: "2026-11" })
  ];
  assert.equal(F.monthSummary(txns, "2026-11").expense, 12000, "a despesa conta uma vez só");
  assert.equal(F.balances(accounts, txns).a, 88000, "o dinheiro sai da conta");
  assert.equal(F.cardDebt(card, txns), 0, "o cartão fica quitado");
  const inv = F.invoiceSummary(card, txns, "2026-11", "2026-11-15");
  assert.equal(inv.total, 12000);
  assert.equal(inv.open, 0);
  assert.equal(inv.status, "paga");
  assert.equal(F.netWorth(accounts, [card], txns).net, 88000);
});

test("4. parcelas caem nas faturas futuras certas e somam o valor exato", () => {
  // Compra de R$ 100,00 em 3x no dia 05/11, depois do fechamento (dia 3): primeira fatura vence em dezembro.
  const parts = F.buildInstallments({ kind: "despesa", amount: 10000, date: "2026-11-05", desc: "Tênis", categoryId: "compras" }, 3, card, "g1");
  assert.deepEqual(parts.map(p => p.invoice), ["2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(parts.map(p => p.amount), [3334, 3333, 3333]);
  assert.equal(parts.reduce((s, p) => s + p.amount, 0), 10000);
  assert.ok(parts.every(p => p.date === "2026-11-05" && p.installment.of === 3));
  assert.equal(F.monthSummary(parts, "2026-11").expense, 10000, "despesa reconhecida na compra");
  assert.equal(F.invoiceSummary(card, parts, "2027-01", "2026-11-17").total, 3333);
  assert.equal(F.cardLimit(card, parts).used, 10000, "o limite usado inclui as parcelas futuras");
  // Fechamento: compra no próprio dia do fechamento vai para a próxima fatura.
  assert.equal(F.invoiceFor("2026-11-03", 3, 10), "2026-12");
  assert.equal(F.invoiceFor("2026-11-02", 3, 10), "2026-11");
  // Vencimento antes do fechamento (fecha 28, vence 5): fatura vence no mês seguinte ao fechamento.
  assert.equal(F.invoiceFor("2026-11-10", 28, 5), "2026-12");
  assert.equal(F.invoiceFor("2026-11-29", 28, 5), "2027-01");
  assert.deepEqual(F.invoiceDates("2026-12", 28, 5), { closing: "2026-11-28", due: "2026-12-05" });
});

test("5. lançamentos previstos não somam como realizados", () => {
  const accounts = [acc("a", "corrente", 0)];
  const txns = [
    txn({ kind: "receita", accountId: "a", amount: 500000, categoryId: "salario" }),
    txn({ kind: "despesa", accountId: "a", amount: 150000, status: "previsto", categoryId: "moradia" })
  ];
  const s = F.monthSummary(txns, "2026-11");
  assert.equal(s.income, 500000);
  assert.equal(s.expense, 0);
  assert.equal(s.plannedExpense, 150000, "o previsto aparece separado");
  assert.equal(F.balances(accounts, txns).a, 500000, "saldo só com o que foi efetivado");
  assert.equal(F.monthSummary(txns, "2026-11", { includePlanned: true }).expense, 150000, "na projeção ele entra");
});

test("6. contas recorrentes não são geradas em duplicidade", () => {
  const rule = { id: "aluguel", day: 31, startMonth: "2026-11", template: { kind: "despesa", amount: 120000, accountId: "a", desc: "Aluguel" } };
  const first = F.recurrenceOccurrences(rule, "2026-11", 3);
  assert.deepEqual(first.map(o => o.id), ["aluguel_2026-11", "aluguel_2026-12", "aluguel_2027-01"]);
  assert.deepEqual(first.map(o => o.date), ["2026-11-30", "2026-12-31", "2027-01-31"], "dia 31 vira o último dia do mês");
  assert.ok(first.every(o => o.status === "previsto"));
  const existing = new Set(first.map(o => o.id));
  assert.equal(F.missingOccurrences(rule, existing, "2026-11", 3).length, 0, "gerar de novo não cria nada");
  assert.deepEqual(F.missingOccurrences(rule, existing, "2026-11", 4).map(o => o.id), ["aluguel_2027-02"]);
  // Mesmo uma ocorrência excluída continua com o id ocupado: não é recriada.
  assert.equal(F.missingOccurrences(rule, new Set(["aluguel_2026-11"]), "2026-11", 1).length, 0);
});

test("7. estorno devolve o dinheiro e reduz a despesa da categoria", () => {
  const accounts = [acc("a", "corrente", 100000)];
  const txns = [
    txn({ kind: "despesa", accountId: "a", amount: 20000, categoryId: "compras" }),
    txn({ kind: "estorno", accountId: "a", amount: 5000, categoryId: "compras", refundOf: "x" })
  ];
  const s = F.monthSummary(txns, "2026-11");
  assert.equal(s.expense, 15000);
  assert.equal(s.byCategory.compras, 15000);
  assert.equal(s.income, 0, "estorno não é receita");
  assert.equal(F.balances(accounts, txns).a, 85000);
  // No cartão, o estorno abate da fatura.
  const cardTx = [
    txn({ kind: "despesa", cardId: "nu", amount: 20000, date: "2026-11-01", invoice: "2026-11" }),
    txn({ kind: "estorno", cardId: "nu", amount: 20000, date: "2026-11-02", invoice: "2026-11" })
  ];
  assert.equal(F.cardDebt(card, cardTx), 0);
  assert.equal(F.invoiceSummary(card, cardTx, "2026-11", "2026-11-20").total, 0);
});

test("8. saldo = saldo inicial + operações efetivadas (inclusive ajuste e data de corte)", () => {
  const a = acc("a", "corrente", 10000);
  const txns = [
    txn({ kind: "receita", accountId: "a", amount: 5000, date: "2026-11-01" }),
    txn({ kind: "despesa", accountId: "a", amount: 2000, date: "2026-11-05" }),
    txn({ kind: "despesa", accountId: "a", amount: 999, date: "2026-11-06", status: "previsto" }),
    txn({ kind: "ajuste", accountId: "a", delta: -300, date: "2026-11-07" }),
    txn({ kind: "despesa", accountId: "a", amount: 1000, date: "2026-11-08", deleted: true })
  ];
  assert.equal(F.accountBalance(a, txns), 12700);
  assert.equal(F.accountBalance(a, txns, "2026-11-04"), 15000, "saldo numa data passada");
  // Conta paga com atraso: vale a data de pagamento.
  const late = [txn({ kind: "despesa", accountId: "a", amount: 1000, date: "2026-11-01", paidDate: "2026-11-20" })];
  assert.equal(F.accountBalance(a, late, "2026-11-10"), 10000);
  assert.equal(F.accountBalance(a, late, "2026-11-20"), 9000);
});

test("9. patrimônio líquido desconta dívidas e cartões", () => {
  const accounts = [acc("a", "corrente", 500000), acc("emp", "divida", -1000000), acc("hist", "externo", 0)];
  const txns = [
    txn({ kind: "despesa", cardId: "nu", amount: 30000, invoice: "2026-11" }),
    txn({ kind: "transferencia", fromId: "a", toId: "emp", amount: 100000 }),   // pagou parcela do empréstimo
    txn({ kind: "despesa", accountId: "hist", amount: 99999 })                   // histórico fora do patrimônio
  ];
  const nw = F.netWorth(accounts, [card], txns);
  assert.equal(nw.assets, 400000);
  assert.equal(nw.liabilities, 900000 + 30000);
  assert.equal(nw.net, 400000 - 930000);
});

test("10. aplicar em investimento não é receita nem despesa", () => {
  const accounts = [acc("a", "corrente", 100000), acc("cdb", "investimento", 0)];
  const txns = [txn({ kind: "transferencia", fromId: "a", toId: "cdb", amount: 60000, subtype: "aplicacao" })];
  const s = F.monthSummary(txns, "2026-11");
  assert.equal(s.income + s.expense, 0);
  const nw = F.netWorth(accounts, [], txns);
  assert.equal(nw.invested, 60000);
  assert.equal(nw.cash, 40000);
  assert.equal(nw.net, 100000);
});

test("11. resgate e rendimento têm classificação própria", () => {
  const accounts = [acc("a", "corrente", 0), acc("cdb", "investimento", 60000)];
  const txns = [
    txn({ kind: "rendimento", accountId: "cdb", amount: 800, categoryId: "rendimentos" }),
    txn({ kind: "transferencia", fromId: "cdb", toId: "a", amount: 20000, subtype: "resgate" })
  ];
  const s = F.monthSummary(txns, "2026-11");
  assert.equal(s.income, 0, "resgate não é receita");
  assert.equal(s.yields, 800, "rendimento fica em linha própria");
  assert.equal(s.result, 800);
  const bal = F.balances(accounts, txns);
  assert.equal(bal.cdb, 40800);
  assert.equal(bal.a, 20000);
});

test("12. histórico: exclusão lógica e trilha de auditoria", () => {
  const a = acc("a", "corrente", 0);
  const before = txn({ kind: "despesa", accountId: "a", amount: 1000, desc: "Café" });
  const after = { ...before, amount: 1200 };
  const entry = F.auditEntry("editar", "finTxns", "t1", before, after, 123);
  assert.deepEqual(entry.changed, ["amount"]);
  assert.equal(entry.before.amount, 1000);
  assert.equal(entry.after.amount, 1200);
  const removed = { ...after, deleted: true, deletedAt: 456 };
  assert.equal(F.accountBalance(a, [removed]), 0, "excluído não conta");
  assert.ok(removed.amount === 1200, "mas o registro continua guardado");
  assert.deepEqual(F.auditEntry("excluir", "finTxns", "t1", after, removed, 456).changed.sort(), ["deleted", "deletedAt"]);
});

test("validação de lançamentos", () => {
  const accounts = [acc("a"), acc("b")];
  const ok = { kind: "transferencia", fromId: "a", toId: "b", amount: 100, date: "2026-11-01", status: "efetivado" };
  assert.equal(F.validateTxn(ok, { accounts }), null);
  assert.match(F.validateTxn({ ...ok, toId: "a" }, { accounts }), /diferentes/);
  assert.match(F.validateTxn({ ...ok, amount: 0 }, { accounts }), /maior que zero/);
  assert.match(F.validateTxn({ kind: "despesa", amount: 100, date: "2026-11-01", status: "efetivado" }), /conta ou o cartão/);
  assert.match(F.validateTxn({ kind: "despesa", cardId: "nu", amount: 100, date: "2026-11-01", status: "efetivado" }), /fatura/);
});

test("orçamento e alertas de 50, 75, 90 e 100%", () => {
  assert.equal(F.budgetStatus(70000, 30000).level, 0);
  assert.equal(F.budgetStatus(70000, 35000).level, 50);
  assert.equal(F.budgetStatus(70000, 53000).level, 75);
  assert.equal(F.budgetStatus(70000, 63000).level, 90);
  assert.equal(F.budgetStatus(70000, 71000).level, 100);
  assert.equal(F.budgetStatus(70000, 71000).remaining, -1000);
});

test("valores em reais viram centavos sem erro de arredondamento", () => {
  assert.equal(F.toCents("1.234,56"), 123456);
  assert.equal(F.toCents("0,1"), 10);
  assert.equal(F.toCents("R$ 12"), 1200);
  assert.equal(F.toCents(0.1 + 0.2), 30);
  assert.ok(Number.isNaN(F.toCents("abc")));
});

test("possíveis duplicados", () => {
  const txns = [
    txn({ id: "1", kind: "despesa", accountId: "a", amount: 4590, desc: "Mercado Extra", date: "2026-11-10" }),
    txn({ id: "2", kind: "despesa", accountId: "a", amount: 4590, desc: "mercado", date: "2026-11-11" }),
    txn({ id: "3", kind: "despesa", accountId: "a", amount: 4590, desc: "Farmácia", date: "2026-11-10" })
  ];
  const d = F.possibleDuplicates(txns);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].map(t => t.id), ["1", "2"]);
});
