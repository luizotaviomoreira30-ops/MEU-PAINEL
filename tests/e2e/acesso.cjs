// More than one person: the owner's access list, private data per person, revoking access.
const { suite, PAINEL, FIN, LUIZ, wait, txt } = require('./_lib.cjs');
const ANA = { sub: 'ana-uid-2', email: 'ana.teste@gmail.com', email_verified: true, name: 'Ana Souza' };
const EMU = 'http://127.0.0.1:8080/v1/projects/meu-paniel/databases/(default)/documents/';

suite('acesso', async ({ ok, ctx, page, login, dbOf }) => {
  // ---------- owner ----------
  const cl = await ctx(); const p = await page(cl, PAINEL); await login(p); const db = dbOf(p);
  await db('await db.doc(B+"tasks/segredo").set({ title:"Tarefa do Luiz", area:"pessoal", status:"afazer", priority:"media", createdAt:1 })');
  ok('nome fixo saiu do título', (await p.title()) === 'Meu Painel');
  ok('marca mostra o primeiro nome de quem entrou', (await txt(p, '#brand-who')) === 'Luiz');
  await p.goto(PAINEL + '#evolucao'); await wait(900);
  ok('dono vê Pessoas com acesso', (await txt(p)).includes('Pessoas com acesso') && (await txt(p)).includes('Você (administra)'));

  // ---------- someone not on the list ----------
  const ca = await ctx(); const a = await page(ca, PAINEL, 'ana: '); await login(a, ANA);
  ok('pessoa não liberada não entra', (await txt(a, '#login-msg')).includes('ainda não foi liberada') && !(await a.isVisible('.shell')));
  const denied = await a.evaluate(async () => { try { await firebase.firestore().collection('users/' + firebase.auth().currentUser.uid + '/tasks').get({ source: 'server' }); return 'leu'; } catch (e) { return e.code; } });
  ok('as regras também barram a leitura direta', /permission/.test(denied), denied);

  // ---------- owner grants access ----------
  await p.fill('#access-email', 'nao-e-email'); await p.click('button:text("Liberar acesso")'); await wait(400);
  ok('valida o e-mail', ((await db('return (await db.doc("config/access").get()).exists').catch(() => false)) === false));
  await p.fill('#access-email', '  ANA.Teste@gmail.com '); await p.click('button:text("Liberar acesso")'); await wait(1200);
  const acc = await p.evaluate(async () => (await firebase.firestore().doc('config/access').get()).data());
  ok('libera o e-mail (minúsculo, sem espaços)', acc && acc.emails.join() === 'ana.teste@gmail.com', JSON.stringify(acc));
  ok('lista mostra a pessoa', (await txt(p)).includes('ana.teste@gmail.com'));
  ok('campo fica limpo depois de liberar', (await p.inputValue('#access-email')) === '');
  await p.fill('#access-email', 'ana.teste@gmail.com'); await p.click('button:text("Liberar acesso")'); await wait(500);
  ok('não duplica', (await p.evaluate(async () => (await firebase.firestore().doc('config/access').get()).data().emails.length)) === 1);

  // ---------- the new person ----------
  await a.reload(); await wait(2600);
  ok('pessoa liberada entra', await a.isVisible('.shell') && (await txt(a, '#greeting')).startsWith('Olá, Ana'));
  ok('marca com o nome dela', (await txt(a, '#brand-who')) === 'Ana');
  ok('painel dela começa vazio (não vê o do Luiz)', !(await txt(a)).includes('Tarefa do Luiz'));
  const luizUid = await p.evaluate(() => firebase.auth().currentUser.uid);
  const steal = await a.evaluate(async uid => { try { await firebase.firestore().collection('users/' + uid + '/tasks').get({ source: 'server' }); return 'leu'; } catch (e) { return e.code; } }, luizUid);
  ok('não consegue ler os dados do Luiz nem pelo banco', /permission/.test(steal), steal);
  await a.click('.types .type-btn:text("Tarefa")'); await a.fill('#cap-text', 'Tarefa da Ana'); await a.click('.inline-form button[type=submit]'); await wait(1200);
  const anaUid = await a.evaluate(() => firebase.auth().currentUser.uid);
  const anaTasks = await a.evaluate(async uid => (await firebase.firestore().collection('users/' + uid + '/tasks').get()).docs.map(d => d.data().title), anaUid);
  ok('ela grava na pasta dela', anaTasks.includes('Tarefa da Ana'));
  ok('o Luiz não vê a tarefa dela', !(await txt(p)).includes('Tarefa da Ana'));
  await a.goto(PAINEL + '#evolucao'); await wait(900);
  ok('ela não vê Pessoas com acesso', !(await txt(a)).includes('Pessoas com acesso'));
  const hack = await a.evaluate(async () => { try { await firebase.firestore().doc('config/access').set({ emails: ['ana.teste@gmail.com', 'intruso@gmail.com'] }); return 'gravou'; } catch (e) { return e.code; } });
  ok('ela não consegue mudar a lista', /permission/.test(hack), hack);
  const fa = await page(ca, FIN, 'ana fin: '); await wait(2800);
  ok('ela entra no Meu Financeiro também', (await txt(fa, '#page-title')) === 'Visão geral' && (await txt(fa, '#me-name')).includes('Ana'));
  const anaCats = await fa.evaluate(async uid => (await firebase.firestore().collection('users/' + uid + '/finCategories').get()).size, anaUid);
  ok('com categorias próprias', anaCats === 18, String(anaCats));
  await fa.close();

  // ---------- revoke ----------
  await p.goto(PAINEL + '#evolucao'); await wait(800);
  await p.click('.row:has-text("ana.teste@gmail.com") button:text("Remover")'); await wait(200);
  await p.click('.row:has-text("ana.teste@gmail.com") button:text("Confirmar remoção")'); await wait(1200);
  ok('remover tira da lista', (await p.evaluate(async () => (await firebase.firestore().doc('config/access').get()).data().emails.length)) === 0);
  await a.reload(); await wait(2600);
  ok('depois de removida, não entra mais', (await txt(a, '#login-msg')).includes('ainda não foi liberada'));
  const kept = await (await fetch(EMU + 'users/' + anaUid + '/tasks', { headers: { Authorization: 'Bearer owner' } })).json();
  ok('os dados dela continuam guardados', (kept.documents || []).length === 1);
  const fa2 = await page(ca, FIN, 'ana fin2: '); await wait(2500);
  const pc = await ctx(390, 844); const ph = await page(pc, PAINEL + '#evolucao', 'phone: '); await login(ph); await ph.goto(PAINEL + '#evolucao'); await wait(1200);
  ok('celular: Pessoas com acesso sem rolagem lateral', (await txt(ph)).includes('Pessoas com acesso') && await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await ph.click('#bottomnav .more-btn'); await wait(400);
  ok('celular: Sair da conta na lista do Mais', (await txt(ph, '.more-sheet')).includes('Sair da conta'));
  await ph.click('.more-sheet .more-out'); await wait(2500);
  ok('celular: Sair volta para a tela de entrar', await ph.isVisible('#login-btn'));
  ok('Financeiro também barra', (await txt(fa2, '#login-msg')).includes('ainda não foi liberada'));
});
