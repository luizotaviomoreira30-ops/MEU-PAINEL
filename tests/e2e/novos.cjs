// Aniversários, Modo foco, Lista de compras, the phone's "Mais" sheet and hiding Contatos.
const { suite, PAINEL, plus, wait, txt } = require('./_lib.cjs');

suite('novos', async ({ ok, ctx, page, login, dbOf }) => {
  const c = await ctx(); const p = await page(c, PAINEL); await login(p); const db = dbOf(p);
  const T = plus(0);
  const go = async tab => { await p.evaluate(t => { location.hash = '#' + t; }, tab); await wait(700); };

  // ---------- menu ----------
  const menu = await txt(p, '#tabs');
  ok('Vida pessoal tem Compras e Aniversários', menu.includes('Lista de compras') && menu.includes('Aniversários'));
  ok('Modo foco em Organização', menu.includes('Modo foco'));
  ok('Contatos fora do menu', !menu.includes('Contatos'));
  await go('evolucao');
  await p.check('#pref-contacts'); await wait(1200);
  ok('Preferências: mostrar Contatos volta o item', (await txt(p, '#tabs')).includes('Contatos'));
  await p.uncheck('#pref-contacts'); await wait(1200);
  ok('desligar esconde de novo', !(await txt(p, '#tabs')).includes('Contatos'));

  // ---------- aniversários ----------
  const tom = plus(1), [ty, tm, td] = tom.split('-');
  await go('aniversarios');
  ok('página vazia explica', (await txt(p)).includes('Nenhum aniversário cadastrado'));
  const addBday = async (name, day, month, year) => {
    await p.click('button:text("+ Aniversário")'); await wait(300);
    await p.fill('#f-name', name); await p.selectOption('#f-day', String(day)); await p.selectOption('#f-month', String(month));
    if (year) await p.fill('#f-year', String(year));
    await p.click('.modal button[type=submit]'); await wait(900);
  };
  await addBday('Maria', +td, +tm, 1990);
  await addBday('João', +T.slice(8), +T.slice(5, 7));
  await p.click('button:text("+ Aniversário")'); await wait(300);
  await p.fill('#f-name', 'Erro'); await p.selectOption('#f-day', '31'); await p.selectOption('#f-month', '4');
  await p.click('.modal button[type=submit]'); await wait(400);
  ok('valida dia que não existe no mês', (await txt(p, '.modal .form-error')).includes('não tem dia 31'));
  await p.click('.modal button:text("Cancelar")'); await wait(300);
  const bds = await db('return (await db.collection(B+"birthdays").get()).docs.map(d=>d.data())');
  const maria = bds.find(b => b.name === 'Maria');
  ok('salva dia/mês e ano', maria && maria.date === tm + '-' + td && maria.year === 1990 && bds.length === 2, JSON.stringify(bds));
  let m = await txt(p);
  ok('mostra idade e quando', m.includes('amanhã') && m.includes('faz ' + (+ty - 1990) + ' anos'));
  ok('agrupa por mês em Todos', m.includes('Todos'));
  await p.click('.row:has-text("Maria") button:text("Lembrar do presente")'); await wait(1200);
  const gift = await db('return (await db.collection(B+"tasks").get()).docs.map(d=>d.data()).filter(t=>t.bdayRef)');
  ok('lembrete do presente vira tarefa (hoje, faltam menos de 3 dias)', gift.length === 1 && gift[0].due === T && gift[0].title.startsWith('Presente para Maria'), JSON.stringify(gift));
  ok('não cria lembrete duplicado', (await txt(p, '.row:has-text("Maria")')).includes('Lembrete criado') && !(await p.$('.row:has-text("Maria") button:text("Lembrar do presente")')));
  await go('hoje');
  m = await txt(p);
  ok('visão geral avisa o aniversário de hoje', m.includes('Hoje é aniversário de João'));
  ok('bloco Próximos aniversários', m.includes('Próximos aniversários') && m.includes('Maria'));
  await db('await db.doc(B+"birthdays/bissexto").set({ name:"Bia", date:"02-29", year:"", relation:"amigo", note:"", createdAt:1 })');
  await go('aniversarios'); await wait(500);
  ok('29/02 aparece em fevereiro', (await txt(p)).includes('Bia') && (await txt(p)).includes('Fevereiro'));

  // ---------- lista de compras (sem Financeiro: vai para Gastos) ----------
  await go('compras');
  const addItem = async (n, q) => { await p.fill('#shop-name', n); if (q) await p.fill('#shop-qty', q); await p.press('#shop-name', 'Enter'); await wait(800); };
  await addItem('Arroz', '5 kg'); await addItem('Feijão'); await addItem('arroz');
  let shop = await db('return (await db.collection(B+"shopping").get()).docs.map(d=>({id:d.id,...d.data()}))');
  ok('adiciona itens sem duplicar', shop.length === 2 && shop.find(x => x.name === 'Arroz').qty === '5 kg', JSON.stringify(shop));
  ok('campo limpo e pronto para o próximo', (await p.inputValue('#shop-name')) === '' && (await p.evaluate(() => document.activeElement.id)) === 'shop-name');
  await p.click('.shop-row:has-text("Arroz") .check'); await wait(900);
  ok('marcado vai para o carrinho', (await txt(p, 'main')).includes('No carrinho') && !!(await p.$('button:text("Finalizar compra")')));
  await p.click('button:text("Finalizar compra")'); await wait(400);
  await p.click('.modal button[type=submit]'); await wait(400);
  ok('pede o valor total', (await txt(p, '.modal .form-error')).includes('valor total'));
  await p.fill('#f-amount', '50,00'); await p.click('.modal button[type=submit]'); await wait(1500);
  const legacy = await db('const m=(await db.collection(B+"expenseMonths").get()).docs.map(d=>d.id); let out=[]; for (const k of m) out.push(...(await db.collection(B+"expenseMonths/"+k+"/items").get()).docs.map(d=>d.data())); return out;');
  ok('sem Financeiro: gasto lançado na aba Gastos com os itens', legacy.length === 1 && legacy[0].amount === 50 && legacy[0].notes.includes('Arroz (5 kg)'), JSON.stringify(legacy));
  shop = await db('return (await db.collection(B+"shopping").get()).docs.map(d=>({id:d.id,...d.data()}))');
  ok('itens do carrinho ficam como comprados; o resto continua', shop.find(x => x.name === 'Arroz').status === 'comprado' && shop.find(x => x.name === 'Feijão').status === 'pendente');

  // ---------- com Financeiro: vai para lá, uma vez ----------
  await db(`const now=Date.now();
    await db.doc(B+"finAccounts/nubank").set({ name:"Nubank", type:"corrente", opening:0, status:"ativa", order:0, createdAt:now, updatedAt:now });
    await db.doc(B+"finCategories/alimentacao").set({ name:"Alimentação", kind:"despesa", order:1, archived:false, createdAt:now, updatedAt:now });
    await db.doc(B+"finSettings/main").set({ share:{ enabled:false } });`);
  await wait(1200);
  await addItem('Leite');
  await p.click('.shop-row:has-text("Leite") .check'); await wait(800);
  await p.click('button:text("Finalizar compra")'); await wait(400);
  ok('modal mostra a conta do Financeiro', (await p.$$eval('#f-where option', o => o.map(x => x.value))).join() === 'a:nubank');
  await p.fill('#f-amount', '12,90'); await p.click('.modal button[type=submit]'); await wait(1500);
  const ft = await db('return (await db.collection(B+"finTxns").get()).docs.map(d=>d.data())');
  ok('com Financeiro: um lançamento lá, com os itens', ft.length === 1 && ft[0].amount === 1290 && ft[0].categoryId === 'alimentacao' && ft[0].notes.includes('Leite') && ft[0].source === 'painel', JSON.stringify(ft));
  const audit = await db('return (await db.collection(B+"finAudit").get()).size');
  ok('com auditoria', audit === 1);
  await p.click('button.filter-chip:text("+ Arroz")'); await wait(900);
  shop = await db('return (await db.collection(B+"shopping").get()).docs.map(d=>({id:d.id,...d.data()}))');
  ok('"+ Arroz" volta para a lista sem criar cópia', shop.filter(x => x.name === 'Arroz').length === 1 && shop.find(x => x.name === 'Arroz').status === 'pendente');

  // ---------- modo foco ----------
  await db(`await db.doc(B+"tasks/t1").set({ title:"Escrever proposta", area:"trabalho", priority:"alta", status:"afazer", due:"", focusDate:"", createdAt:1 })`);
  await go('tarefas'); await wait(500);
  await p.click('button[aria-label="Focar em Escrever proposta"]'); await wait(900);
  ok('▶ na tarefa abre o modo foco com o cronômetro', (await p.evaluate(() => location.hash)) === '#foco' && (await txt(p)).includes('Escrever proposta') && /\d\d:\d\d/.test(await txt(p, '.focus-clock')));
  const c1 = await txt(p, '.focus-clock'); await wait(2200); const c2 = await txt(p, '.focus-clock');
  ok('cronômetro anda', c1 !== c2, c1 + ' / ' + c2);
  await p.click('.focus-card button:text("Pausar")'); await wait(300);
  const c3 = await txt(p, '.focus-clock'); await wait(2100);
  ok('pausa para o tempo', c3 === await txt(p, '.focus-clock'));
  await p.click('.focus-card button:text("Continuar")'); await wait(300);
  await go('hoje');
  ok('faixa do foco aparece nas outras páginas', !!(await p.$('.focus-strip')) && (await txt(p, '.focus-strip')).includes('Escrever proposta'));
  // jump the timer to the end
  await p.evaluate(() => { const f = JSON.parse(localStorage.getItem('painel:focusTimer')); f.start = Date.now() - f.dur * 60000 - 1000; f.pausedTotal = 0; localStorage.setItem('painel:focusTimer', JSON.stringify(f)); });
  await wait(2500);
  let fs = await db('return (await db.collection(B+"focusSessions").get()).docs.map(d=>d.data())');
  ok('no fim, a sessão é registrada com a duração', fs.length === 1 && fs[0].minutes === 25 && fs[0].taskId === 't1' && fs[0].area === 'trabalho' && fs[0].date === T, JSON.stringify(fs));
  await go('foco');
  ok('tela de concluído oferece marcar a tarefa', (await txt(p)).includes('Sessão concluída') && !!(await p.$('button:text("Marcar tarefa como feita")')));
  await p.click('button:text("Marcar tarefa como feita")'); await wait(1200);
  const t1 = await db('return (await db.doc(B+"tasks/t1").get()).data()');
  ok('tarefa concluída pelo foco', t1.status === 'feito');
  // free focus, 1 minute custom, finish early
  await p.fill('#focus-free', 'Estudar inglês'); await p.fill('#focus-min', '10'); await p.click('#focus-start'); await wait(600);
  await p.evaluate(() => { const f = JSON.parse(localStorage.getItem('painel:focusTimer')); f.start = Date.now() - 3 * 60000 - 5000; localStorage.setItem('painel:focusTimer', JSON.stringify(f)); });
  await wait(1200);
  await p.click('.focus-card button:text("Concluir agora")'); await wait(1300);
  fs = await db('return (await db.collection(B+"focusSessions").get()).docs.map(d=>d.data())');
  const free = fs.find(x => x.title === 'Estudar inglês');
  ok('concluir antes registra só os minutos feitos', free && free.minutes === 3 && free.taskId === '', JSON.stringify(free));
  ok('duração personalizada guardada', (await p.evaluate(() => localStorage.getItem('painel:focusDur'))) === '10');
  await p.click('button:text("Fechar")'); await wait(400);
  m = await txt(p);
  ok('onde foi seu tempo: total da semana', m.includes('28 min') && m.includes('Escrever proposta'));
  await p.click('#focus-start'); await wait(500);
  await p.click('.focus-card button:text("Cancelar")'); await wait(800);
  fs = await db('return (await db.collection(B+"focusSessions").get()).size');
  ok('cancelar não registra nada', fs === 2);
  await go('hoje');
  ok('Evolução da semana mostra o tempo de foco', (await txt(p)).includes('Tempo em modo foco'));

  // ---------- phone ----------
  const pc = await ctx(390, 844); const ph = await page(pc, PAINEL, 'phone: '); await login(ph);
  const items = await ph.$$eval('#bottomnav > *', e => e.map(x => x.getAttribute('href') || 'mais'));
  ok('barra do celular: Início, Tarefas, Agenda, Compras, Finanças, Mais', items.join() === '#hoje,#tarefas,#agenda,#compras,#financeiro,mais', items.join());
  await ph.click('#bottomnav .more-btn'); await wait(400);
  ok('Mais abre a lista de seções', await ph.isVisible('.more-sheet') && (await txt(ph, '.more-sheet')).includes('Aniversários') && (await txt(ph, '.more-sheet')).includes('Modo foco'));
  await ph.click('.more-sheet a[href="#aniversarios"]'); await wait(900);
  ok('escolher fecha a lista e abre a página', !(await ph.isVisible('.more-sheet')) && (await txt(ph)).includes('Aniversários'));
  ok('o botão Mais mostra a página atual', (await txt(ph, '#bottomnav .more-btn')).includes('Aniversários'));
  for (const tab of ['compras', 'foco', 'aniversarios', 'hoje']) {
    await ph.evaluate(t => { location.hash = '#' + t; }, tab); await wait(1000);
    ok('celular sem rolagem lateral em #' + tab, await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ph.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/novos-phone-' + tab + '.png' : '/dev/null' }).catch(() => {});
  }
  if (process.env.SHOTS) for (const tab of ['compras', 'foco', 'aniversarios', 'hoje']) { await go(tab); await wait(600); await p.screenshot({ path: process.env.SHOTS + '/novos-desk-' + tab + '.png', fullPage: true }); }
});
