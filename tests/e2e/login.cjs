// E-mail and password: create an account, confirm the e-mail, wait for the owner, enter both apps, reset the password.
const { suite, PAINEL, FIN, wait, txt } = require('./_lib.cjs');
const OOB = 'http://127.0.0.1:9099/emulator/v1/projects/meu-paniel/oobCodes';
const oob = async (email, type) => ((await (await fetch(OOB)).json()).oobCodes || []).filter(c => c.email === email && c.requestType === type);

suite('login', async ({ ok, ctx, page, login }) => {
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/meu-paniel/accounts', { method: 'DELETE' });
  const v0 = (await oob('bruno.lima@outlook.com', 'VERIFY_EMAIL')).length, r0 = (await oob('bruno.lima@outlook.com', 'PASSWORD_RESET')).length;
  const cb = await ctx(); const b = await page(cb, PAINEL, 'bruno: ');
  ok('tela tem Google e e-mail e senha', await b.isVisible('#login-btn') && await b.isVisible('#pw-email') && await b.isVisible('#pw-pass'));
  ok('sem texto solto na tela de entrar', !/\bnull\b|undefined/.test(await txt(b, '.login-card')));
  await b.fill('#pw-email', 'ninguem@outlook.com'); await b.fill('#pw-pass', 'qualquer123'); await b.click('#pw-submit'); await wait(1200);
  ok('senha errada / conta inexistente: mensagem clara', (await txt(b, '#pw-box')).includes('E-mail ou senha incorretos'));

  await b.click('button:text("Criar conta com e-mail")'); await wait(200);
  await b.fill('#pw-name', 'Bruno Lima'); await b.fill('#pw-email', 'Bruno.Lima@Outlook.com'); await b.fill('#pw-pass', 'curta'); await b.click('#pw-submit'); await wait(400);
  ok('exige senha com 8 caracteres', (await txt(b, '#pw-box')).includes('pelo menos 8'));
  await b.click('.pw-show'); ok('mostrar senha', (await b.getAttribute('#pw-pass', 'type')) === 'text');
  await b.fill('#pw-pass', 'senhaBoa123'); await b.click('#pw-submit'); await wait(2500);
  ok('depois de criar, pede para confirmar o e-mail', (await txt(b, '#login-msg')).includes('Confirme o seu e-mail') && (await txt(b, '#verify-box')).includes('bruno.lima@outlook.com'));
  ok('e-mail de confirmação enviado', (await oob('bruno.lima@outlook.com', 'VERIFY_EMAIL')).length === v0 + 1);
  const before = await b.evaluate(async () => { try { await firebase.firestore().collection('users/' + firebase.auth().currentUser.uid + '/tasks').get({ source: 'server' }); return 'leu'; } catch (e) { return e.code; } });
  ok('sem confirmar, o banco recusa', /permission/.test(before), before);
  await b.click('#verify-done'); await wait(1200);
  ok('"Já confirmei" sem clicar no link avisa', (await txt(b, '#verify-box')).includes('Ainda não aparece como confirmado'));
  await b.click('#verify-again'); await wait(1200);
  ok('reenviar e-mail (com espera de 60s)', (await oob('bruno.lima@outlook.com', 'VERIFY_EMAIL')).length === v0 + 2 && await b.isDisabled('#verify-again'));
  const code = (await oob('bruno.lima@outlook.com', 'VERIFY_EMAIL')).at(-1);
  await fetch(code.oobLink);
  await b.click('#verify-done'); await wait(2500);
  ok('confirmado mas não liberado: explica', (await txt(b, '#login-msg')).includes('ainda não foi liberada'));

  // the owner lets Bruno in
  const cl = await ctx(); const l = await page(cl, PAINEL); await login(l);
  await l.goto(PAINEL + '#evolucao'); await wait(900);
  await l.fill('#access-email', 'bruno.lima@outlook.com'); await l.click('button:text("Liberar acesso")'); await wait(1200);
  await b.reload(); await wait(2800);
  ok('liberado, entra com e-mail e senha', await b.isVisible('.shell') && (await txt(b, '#greeting')).startsWith('Olá, Bruno'));

  // sign out and back in with the password
  await b.click('#signout'); await wait(2500);
  ok('saiu', await b.isVisible('#pw-email'));
  await b.fill('#pw-email', 'bruno.lima@outlook.com'); await b.fill('#pw-pass', 'senhaBoa123'); await b.click('#pw-submit'); await wait(2800);
  ok('entra de novo com a senha', await b.isVisible('.shell'));

  // Meu Financeiro, in a fresh browser
  const cf = await ctx(); const f = await page(cf, FIN, 'fin: ');
  ok('Financeiro também tem e-mail e senha', await f.isVisible('#pw-email'));
  await f.fill('#pw-email', 'bruno.lima@outlook.com'); await f.fill('#pw-pass', 'senhaBoa123'); await f.click('#pw-submit'); await wait(3000);
  ok('entra no Financeiro', (await txt(f, '#page-title')) === 'Visão geral' && (await txt(f, '#me-name')).includes('Bruno'));

  // forgot the password; account already exists
  const cr = await ctx(390, 844); const r = await page(cr, PAINEL, 'reset: ');
  ok('celular: tela de entrar sem rolagem lateral', await r.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await r.click('button:text("Esqueci a senha")'); await wait(200);
  ok('esqueci a senha esconde o campo de senha', !(await r.$('#pw-pass')));
  await r.fill('#pw-email', 'bruno.lima@outlook.com'); await r.click('#pw-submit'); await wait(1500);
  ok('manda o link para nova senha', (await txt(r, '#pw-box')).includes('link para criar uma nova senha') && (await oob('bruno.lima@outlook.com', 'PASSWORD_RESET')).length === r0 + 1);
  await r.fill('#pw-email', 'nao.existe@outlook.com'); await r.click('#pw-submit'); await wait(1500);
  ok('mesma resposta para e-mail que não existe', (await txt(r, '#pw-box')).includes('Se existir uma conta com nao.existe@outlook.com'));
  await r.click('button:text("Criar conta com e-mail")'); await wait(200);
  await r.fill('#pw-email', 'bruno.lima@outlook.com'); await r.fill('#pw-pass', 'outraSenha99'); await r.click('#pw-submit'); await wait(1500);
  ok('e-mail já cadastrado: mensagem clara', (await txt(r, '#pw-box')).includes('Já existe uma conta com esse e-mail'));
// Wrong password, existing e-mail and unknown e-mail are answered by Firebase with HTTP 400, which the browser logs.
}, { ignoreConsole: /status of 400/ });
