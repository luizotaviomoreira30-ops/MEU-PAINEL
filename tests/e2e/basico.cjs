// Baseline: every page of both apps opens without errors, and the main everyday actions save.
const { suite, PAINEL, FIN, plus, wait, txt } = require('./_lib.cjs');

suite('basico', async ({ ok, ctx, page, login, dbOf }) => {
  const T = plus(0);
  const c = await ctx(); const p = await page(c, PAINEL);
  ok('tela de entrar', await p.isVisible('#login-btn'));
  await login(p); const db = dbOf(p);
  ok('entra e cumprimenta', (await txt(p, '#greeting')).startsWith('Olá, Luiz'));

  // ---------- Painel: every section ----------
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs a[href^="#"]')].map(a => a.getAttribute('href').slice(1)));
  for (const t of [...tabs, 'contatos']) {
    await p.evaluate(x => { location.hash = '#' + x; }, t); await wait(600);
    ok('Painel abre #' + t, (await p.$$('main > *')).length > 0 && !(await txt(p)).includes('undefined'));
  }

  // ---------- quick capture ----------
  await p.evaluate(() => { location.hash = '#hoje'; }); await wait(600);
  const capture = async (type, fill) => { await p.click('.types .type-btn:text("' + type + '")'); await wait(250); await fill(); await p.click('.inline-form button[type=submit]'); await wait(1100); };
  await capture('Tarefa', () => p.fill('#cap-text', 'Ligar para o contador'));
  await capture('Compromisso', async () => { await p.fill('#cap-text', 'Dentista'); await p.fill('#cap-date', plus(2)); await p.fill('#cap-time', '15:00'); });
  await capture('Anotação', () => p.fill('#cap-text', 'Ideia: vender a bicicleta'));
  await capture('Gasto', async () => { await p.fill('#cap-amount', '32,50'); await p.fill('#cap-text', 'Padaria'); });
  const tasks = await db('return (await db.collection(B+"tasks").get()).docs.map(d=>({id:d.id,...d.data()}))');
  const evs = await db('return (await db.collection(B+"events").get()).docs.map(d=>d.data())');
  const notes = await db('return (await db.collection(B+"notes").get()).docs.map(d=>d.data())');
  const exp = await db('const m=(await db.collection(B+"expenseMonths").get()).docs.map(d=>d.id); let out=[]; for (const k of m) out.push(...(await db.collection(B+"expenseMonths/"+k+"/items").get()).docs.map(d=>d.data())); return out;');
  ok('captura: tarefa', tasks.some(t => t.title === 'Ligar para o contador'));
  ok('captura: compromisso com data e hora', evs.some(e => e.title === 'Dentista' && e.date === plus(2) && e.time === '15:00'));
  ok('captura: anotação', notes.some(n => n.text === 'Ideia: vender a bicicleta'));
  ok('captura: gasto (sem Financeiro, vai para Gastos)', exp.some(e => e.desc === 'Padaria' && e.amount === 32.5));
  ok('próximos compromissos mostra o dentista', (await txt(p)).includes('Dentista'));

  // ---------- task done, focus of the day ----------
  await p.click('button[aria-label="Concluir Ligar para o contador"]'); await wait(1100);
  const t1 = await db('return (await db.collection(B+"tasks").get()).docs.map(d=>d.data()).find(t=>t.title==="Ligar para o contador")');
  ok('concluir tarefa', t1.status === 'feito' && t1.doneAt > 0);
  await capture('Tarefa', () => p.fill('#cap-text', 'Revisar contrato'));
  await p.goto(PAINEL + '#tarefas'); await wait(900);
  await p.click('button[aria-label="Colocar no foco de hoje: Revisar contrato"]'); await wait(1100);
  const t2 = await db('return (await db.collection(B+"tasks").get()).docs.map(d=>d.data()).find(t=>t.title==="Revisar contrato")');
  ok('estrela coloca no foco de hoje', t2.focusDate === T);

  // ---------- habits ----------
  await db('await db.doc(B+"habits/h1").set({ name:"Orar", area:"pessoal", targetPerWeek:7, state:"ativo", order:1, createdAt:1 })');
  await p.goto(PAINEL + '#hoje'); await wait(1200);
  await p.click('.hw .hd.is-today'); await wait(1200);
  const log = await db('return (await db.doc(B+"habitLog/"+arg).get()).data()', T.slice(0, 7));
  ok('marcar hábito de hoje', log && log.checks && log.checks.h1 && log.checks.h1[String(+T.slice(8))] === true, JSON.stringify(log));

  // ---------- goals ----------
  await p.goto(PAINEL + '#metas'); await wait(800);
  await p.click('button:text("+ Meta")'); await wait(300);
  await p.fill('#f-title', 'Ler 12 livros'); await p.click('.modal button[type=submit]'); await wait(1100);
  ok('metas: nova meta salva e listada', (await db('return (await db.collection(B+"goals").get()).docs.map(d=>d.data())')).some(g => g.title === 'Ler 12 livros') && (await txt(p)).includes('Ler 12 livros'));

  // ---------- backup ----------
  await p.goto(PAINEL + '#evolucao'); await wait(800);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('#backup-btn')]);
  let bk = null; if (dl) { const fs = require('fs'); bk = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); }
  ok('backup inclui as coleções novas', bk && bk.colecoes && ['tasks', 'birthdays', 'shopping', 'focusSessions'].every(k => Array.isArray(bk.colecoes[k])), bk ? Object.keys(bk.colecoes).join(',') : 'sem download');

  // ---------- Meu Financeiro: every page, account and expense ----------
  const f = await page(c, FIN, 'fin: '); await wait(2500);
  ok('Financeiro entra com o mesmo login', (await txt(f, '#page-title')) === 'Visão geral');
  const cats = await db('return (await db.collection(B+"finCategories").get()).size');
  ok('categorias iniciais criadas', cats === 18, String(cats));
  for (const r of ['visao-geral', 'lancamentos', 'a-pagar-receber', 'contas', 'cartoes', 'orcamento', 'relatorios', 'configuracoes']) {
    await f.goto(FIN + '#/' + r); await wait(700);
    ok('Financeiro abre #/' + r, (await f.$$('main > *')).length > 0);
  }
  await f.goto(FIN + '#/visao-geral'); await wait(800);
  ok('Financeiro: mês zerado com resultado zero', (await txt(f)).includes('mês zerado') && !(await txt(f)).includes('sobrou dinheiro'));
  await f.goto(FIN + '#/contas-a-pagar'); await wait(900);
  ok('Financeiro: endereço inexistente vira #/visao-geral', (await f.evaluate(() => location.hash)) === '#/visao-geral' && (await txt(f, '#page-title')) === 'Visão geral');
  await f.goto(FIN + '#/contas'); await wait(500);
  await f.click('button:text("+ Nova conta")'); await f.fill('#f-name', 'Nubank'); await f.selectOption('#f-type', 'corrente'); await f.fill('#f-opening', '1.000,00');
  await f.click('.modal button[type=submit]'); await wait(1000);
  const acc = (await db('return (await db.collection(B+"finAccounts").get()).docs.map(d=>({id:d.id,...d.data()}))'))[0];
  ok('Financeiro: conta com saldo inicial em centavos', acc && acc.opening === 100000);
  await f.goto(FIN + '#/lancamentos'); await wait(500);
  await f.click('.toolbar button:text("+ Lançamento")'); await wait(300);
  await f.fill('#f-desc', 'Mercado'); await f.fill('#f-amount', '50'); await f.fill('#f-date', T);
  await f.selectOption('#f-where', 'a:' + acc.id); await f.selectOption('#f-categoryId', 'alimentacao');
  await f.click('.modal button[type=submit]'); await wait(1000);
  ok('Financeiro: despesa lançada pelo formulário', (await db('return (await db.collection(B+"finTxns").get()).docs.map(d=>d.data())')).some(t => t.desc === 'Mercado' && t.amount === 5000));
  await f.goto(FIN + '#/contas'); await wait(700);
  ok('Financeiro: saldo da conta atualizado', (await txt(f)).includes('R$ 950,00'));
});
