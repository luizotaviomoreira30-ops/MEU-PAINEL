// Contas a pagar e receber (Meu Financeiro) and what Meu Painel shows of it.
const { suite, PAINEL, FIN, plus, pad, wait, txt } = require('./_lib.cjs');

suite('bills', async ({ ok, ctx, page, login, dbOf }) => {
  const T = plus(0);
  const c = await ctx(); const p = await page(c, FIN); await login(p); const db = dbOf(p);
  await p.goto(FIN + '#/a-pagar-receber'); await wait(900);
  ok('página no menu Principal', (await p.$$eval('#nav a', a => a.map(x => x.getAttribute('href')))).includes('#/a-pagar-receber'));
  ok('sem dados: explica e oferece lançar', (await txt(p)).includes('Cadastre suas contas'));
  const inv = (() => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= 3 ? 1 : 0), 1); return m.getFullYear() + '-' + pad(m.getMonth() + 1); })();
  await db(`
    const now = Date.now();
    await db.doc(B+"finAccounts/nubank").set({ name:"Nubank", type:"corrente", opening:100000, status:"ativa", order:0, createdAt:now, updatedAt:now });
    await db.doc(B+"finCards/roxo").set({ name:"Roxinho", limit:500000, closingDay:3, dueDay:10, status:"ativo", createdAt:now, updatedAt:now });
    await db.doc(B+"finSettings/main").set({ share:{ enabled:true, fields:{ saldo:true, mes:true, patrimonio:true, vencimentos:true, alertas:true } } });
    const t = (id, o) => db.doc(B+"finTxns/"+id).set({ status:"previsto", categoryId:null, createdAt:now, updatedAt:now, ...o });
    await t("luz", { kind:"despesa", desc:"Conta de luz", amount:18000, date:arg.late, accountId:"nubank" });
    await t("agua", { kind:"despesa", desc:"Água", amount:9000, date:arg.in5, accountId:"nubank" });
    await t("sal", { kind:"receita", desc:"Salário", amount:300000, date:arg.in10, accountId:"nubank" });
    await t("poup", { kind:"transferencia", amount:5000, date:arg.in5, fromId:"nubank", toId:"nubank2" });
    await t("tv", { kind:"despesa", desc:"TV", amount:25000, date:arg.T, cardId:"roxo", invoice:arg.inv, status:"efetivado" });
  `, { late: plus(-3), in5: plus(5), in10: plus(10), T, inv });
  await wait(1500);
  let m = await txt(p);
  ok('A pagar (água + fatura), A receber, Vencido', m.includes('R$ 340,00') && m.includes('R$ 3.000,00') && m.includes('R$ 180,00') && m.includes('1 conta atrasada'), m.slice(0, 300));
  ok('Saldo depois disso (estimativa)', m.includes('R$ 3.480,00') && m.includes('estimativa'));
  ok('vencida mostra há quantos dias', m.includes('venceu há 3 dias'));
  ok('fatura em aberto entra; transferência entre contas não', m.includes('Fatura Roxinho') && !m.includes('R$ 50,00'));
  await p.click('.seg button:text("A receber")'); await wait(300); m = await txt(p);
  ok('filtro A receber', m.includes('Salário') && !m.includes('Água'));
  await p.click('.seg button:text("Tudo")'); await wait(300);
  await p.click('.seg button:text("7 dias")'); await wait(300); m = await txt(p);
  ok('período 7 dias', m.includes('Água') && !m.includes('Salário') && m.includes('Conta de luz'));
  await p.click('.seg button:text("30 dias")'); await wait(300);
  await p.click('.bill:has-text("Conta de luz") button:text("Paguei")'); await wait(1200);
  const luz = await db('return (await db.doc(B+"finTxns/luz").get()).data()');
  ok('Paguei efetiva com a data de hoje', luz.status === 'efetivado' && luz.paidDate === T);
  ok('some da lista e do Vencido', !(await txt(p)).includes('Conta de luz') && (await txt(p)).includes('nada atrasado'));
  await p.click('button:text("+ Conta a pagar")'); await wait(400);
  ok('nova conta abre como previsto, na conta', (await p.inputValue('#f-status')) === 'previsto' && (await p.inputValue('#f-where')) === 'a:nubank');
  await p.fill('#f-desc', 'Internet'); await p.fill('#f-amount', '120'); await p.fill('#f-date', plus(2));
  await p.click('.modal button[type=submit]'); await wait(1200);
  ok('nova conta aparece', (await txt(p)).includes('Internet') && (await txt(p)).includes('em 2 dias'));
  await p.click('.bill:has-text("Fatura Roxinho") button:text("Pagar fatura")'); await wait(500);
  ok('Pagar fatura abre o pagamento', await p.isVisible('.modal'));
  await p.keyboard.press('Escape'); await wait(300);

  await db(`await db.doc(B+"finTxns/gas").set({ kind:"despesa", desc:"Gás", amount:7000, date:arg, accountId:"nubank", status:"previsto", createdAt:Date.now(), updatedAt:Date.now() });`, plus(-1));
  await wait(2500);
  const sum = await db('return (await db.doc(B+"finShare/summary").get()).data()');
  ok('resumo do Painel leva as vencidas primeiro', sum && sum.vencimentos && sum.vencimentos[0].label === 'Gás' && sum.vencimentos[0].overdue === true);
  const pp = await page(c, PAINEL + '#financeiro', 'painel: '); await wait(2500);
  ok('Painel mostra "vencida" e o atalho', (await txt(pp)).includes('vencida') && !!(await pp.$('a[href="./financeiro/#/a-pagar-receber"]')));
  const pc = await ctx(390, 844); const ph = await page(pc, FIN, 'phone: '); await login(ph);
  await ph.goto(FIN + '#/a-pagar-receber'); await wait(1500);
  ok('celular sem rolagem lateral', await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});
