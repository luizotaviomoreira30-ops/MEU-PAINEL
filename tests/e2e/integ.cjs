// Meu Painel ↔ Meu Financeiro: summary, quick expense written once, legacy Gastos read-only, revoke.
const { suite, PAINEL, FIN, plus, addM, pad, wait, txt } = require('./_lib.cjs');

suite('integ', async ({ ok, ctx, page, login, dbOf }) => {
  const T = plus(0), MK = T.slice(0, 7);
  const c = await ctx(); const p = await page(c, PAINEL); await login(p); const db = dbOf(p);

  ok('menu agrupado em 5 seções', (await p.$$eval('#tabs .grp', e => e.map(x => x.textContent))).join('|') === 'Visão geral|Organização|Desenvolvimento|Vida pessoal|Financeiro');
  ok('link para abrir o Meu Financeiro no menu', !!(await p.$('#tabs a.ext[href="./financeiro/"]')));
  await p.goto(PAINEL + '#financeiro'); await wait(900);
  ok('sem contas no Financeiro: explica o que fazer', (await txt(p)).includes('ainda não cadastrou contas ou cartões'));
  await p.goto(PAINEL + '#gastos'); await wait(900);
  ok('sem contas no Financeiro: Gastos continua editável', !!(await p.$('button:text("+ Gasto")')));

  const updatedAt = Date.now() - 120000;
  await db(`
    const now = Date.now();
    await db.doc(B+"finAccounts/nubank").set({ name:"Nubank", type:"corrente", opening:100000, status:"ativa", order:0, createdAt:now, updatedAt:now });
    await db.doc(B+"finAccounts/cdb").set({ name:"CDB", type:"investimento", opening:0, status:"ativa", order:1, createdAt:now, updatedAt:now });
    await db.doc(B+"finCards/roxo").set({ name:"Roxinho", limit:500000, closingDay:3, dueDay:10, status:"ativo", createdAt:now, updatedAt:now });
    for (const [id,name,kind,order] of [["alimentacao","Alimentação","despesa",1],["transporte","Transporte","despesa",2],["salario","Salário","receita",1]])
      await db.doc(B+"finCategories/"+id).set({ name, kind, order, archived:false, createdAt:now, updatedAt:now });
    await db.doc(B+"finSettings/main").set({ share:{ enabled:true, fields:{ saldo:true, mes:true, patrimonio:true, vencimentos:true, alertas:true } } });
    await db.doc(B+"finTxns/sal").set({ kind:"receita", desc:"Salário", date:arg.T, status:"efetivado", amount:300000, accountId:"nubank", categoryId:"salario", createdAt:now, updatedAt:now });
    await db.doc(B+"finTxns/velho").set({ kind:"despesa", desc:"Fora do mês", date:arg.old, status:"efetivado", amount:999, accountId:"cdb", categoryId:"alimentacao", createdAt:now, updatedAt:now });
    await db.doc(B+"finShare/summary").set({ version:1, month:arg.MK, fields:{}, saldo:{ cash:400000, invested:0, accounts:[] }, patrimonio:{ net:400000, assets:400000, liabilities:0 },
      vencimentos:[{ date:arg.T, amount:12000, type:"pagar", label:"Conta de luz" }], alertas:[{ level:"warn", text:"Alimentação: 80% do orçamento usado" }], updatedAt:arg.updatedAt });
  `, { T, MK, updatedAt, old: addM(MK, -3) + '-15' });
  await p.goto(PAINEL + '#hoje'); await p.reload(); await wait(1800);
  ok('6 indicadores, o último é o financeiro', (await p.$$('.stats4 .stat4')).length === 6 && (await p.textContent('.stats4 .stat4:last-child')).includes('Despesas do mês'));
  const home = await txt(p);
  ok('blocos novos na visão geral', home.includes('Resumo financeiro') && home.includes('Próximos compromissos') && home.includes('Evolução da semana'));
  ok('Gastos vira "Gastos antigos" no menu', (await txt(p, '#tabs')).includes('Gastos antigos'));
  ok('lê só o mês atual e o anterior', !(await p.evaluate(() => document.body.innerHTML)).includes('Fora do mês'));

  await p.click('.types .type-btn:text("Gasto")'); await wait(300);
  ok('captura mostra contas e cartões do Financeiro', (await p.$$eval('#cap-where option', o => o.map(x => x.value))).join() === 'a:nubank,c:roxo');
  await p.fill('#cap-amount', '45,90'); await p.fill('#cap-text', 'Almoço'); await p.selectOption('#cap-where', 'a:nubank'); await p.selectOption('#cap-fcat', 'alimentacao');
  await p.click('.inline-form button[type=submit]'); await wait(1300);
  let tx = await db('return (await db.collection(B+"finTxns").where("source","==","painel").get()).docs.map(d=>({id:d.id,...d.data()}))');
  ok('gasto salvo no Financeiro em centavos', tx.length === 1 && tx[0].amount === 4590 && tx[0].kind === 'despesa' && tx[0].accountId === 'nubank' && tx[0].desc === 'Almoço', JSON.stringify(tx));
  const audit = await db('return (await db.collection(B+"finAudit").get()).docs.map(d=>d.data())');
  ok('auditoria gravada junto', audit.length === 1 && audit[0].entityId === tx[0].id && audit[0].action === 'criar');
  const legacy = await db('const m=(await db.collection(B+"expenseMonths").get()).docs.map(d=>d.id); let n=0; for (const k of m) n+=(await db.collection(B+"expenseMonths/"+k+"/items").get()).size; return n;');
  ok('nada gravado no livro antigo do Painel', legacy === 0);
  await p.fill('#cap-amount', '100'); await p.fill('#cap-text', 'Uber'); await p.selectOption('#cap-where', 'c:roxo'); await p.selectOption('#cap-fcat', 'transporte');
  await p.click('.inline-form button[type=submit]'); await wait(1300);
  tx = await db('return (await db.collection(B+"finTxns").where("source","==","painel").get()).docs.map(d=>({id:d.id,...d.data()}))');
  const card = tx.find(x => x.cardId === 'roxo'), expInv = +T.slice(8) >= 3 ? addM(MK, 1) : MK;
  ok('compra no cartão vai para a fatura certa', card && card.invoice === expInv && card.amount === 10000, card && card.invoice);

  await p.goto(PAINEL + '#financeiro'); await wait(1200);
  let fin = await txt(p);
  ok('mês ao vivo: receitas, despesas, resultado', fin.includes('R$ 3.000,00') && fin.includes('R$ 145,90') && fin.includes('R$ 2.854,10'));
  ok('saldo e patrimônio descontam os gastos anotados depois do resumo', fin.includes('R$ 3.954,10') && fin.includes('R$ 3.854,10') && fin.includes('Já descontados 2 gastos anotados'));
  ok('contas a pagar e alertas do resumo', fin.includes('Conta de luz') && fin.includes('80% do orçamento'));
  await p.goto(PAINEL + '#gastos'); await wait(900);
  ok('Gastos antigos: só leitura', !(await p.$('button:text("+ Gasto")')) && (await txt(p)).includes('Seus gastos agora ficam no Meu Financeiro'));

  const f = await page(c, FIN, 'fin: '); await wait(3000);
  const sum = await db('return (await db.doc(B+"finShare/summary").get()).data()');
  ok('Financeiro republica com os gastos do Painel', sum && sum.saldo && sum.saldo.cash === 395410, sum && JSON.stringify(sum.saldo));
  await p.goto(PAINEL + '#financeiro'); await wait(1200); fin = await txt(p);
  ok('sem desconto em dobro depois de republicar', fin.includes('R$ 3.954,10') && !fin.includes('Já descontados'));
  await f.close();

  await db('await db.doc(B+"finSettings/main").set({ share:{ enabled:true, fields:{ saldo:true, mes:false, patrimonio:true, vencimentos:true, alertas:true } } }, { merge:true })');
  await wait(1200); fin = await txt(p);
  ok('campo "mês" desligado some do Painel', !fin.includes('Despesas do mês') && fin.includes('Saldo em contas'));
  await db('await db.doc(B+"finSettings/main").set({ share:{ enabled:false } }, { merge:true }); await db.doc(B+"finShare/summary").delete();');
  await wait(1200); fin = await txt(p);
  ok('revogado: sem números, captura continua no Financeiro', fin.includes('não está compartilhando') && !fin.includes('R$ 3.954,10') && !!(await p.$('#cap-where')));
});
