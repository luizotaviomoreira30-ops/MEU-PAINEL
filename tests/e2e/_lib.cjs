// Shared setup for the end-to-end tests: a browser, the Firebase SDK served locally, sign-in on the emulators.
// Run with the emulators up (firebase emulators:start --only auth,firestore) and a static server on 5055:
//   python3 -m http.server 5055 --bind 127.0.0.1
//   SDK_DIR=<folder with firebase-*-compat.js> node tests/e2e/<suite>.cjs
const path = require('path');
const { chromium } = require('playwright');
const SDK = (process.env.SDK_DIR || path.join(__dirname, '../../node_modules/firebase')) + '/';
const HOST = 'http://127.0.0.1:5055';
const PAINEL = HOST + '/index.html?emulador=1';
const FIN = HOST + '/financeiro/index.html?emulador=1';
const LUIZ = { sub: 'luiz-uid-1', email: 'luizotaviomoreira30@gmail.com', email_verified: true, name: 'Luiz Otávio Moreira' };
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const addM = (mk, n) => { const d = new Date(+mk.slice(0, 4), +mk.slice(5) - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const txt = async (p, sel = 'main') => (await p.textContent(sel)).replace(/ /g, ' ');

async function suite(name, fn) {
  const R = [], errs = [];
  const ok = (n, c, i = '') => R.push((c ? 'PASS ' : 'FAIL ') + n + (i && !c ? '  → ' + i : ''));
  process.on('unhandledRejection', e => { console.log(R.join('\n')); console.log('PAROU:', e.message.split('\n')[0]); process.exit(1); });
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/meu-paniel/databases/(default)/documents', { method: 'DELETE' });
  const b = await chromium.launch();
  const ctx = async (w = 1440, hgt = 1000) => {
    const c = await b.newContext({ viewport: { width: w, height: hgt } });
    await c.route(/gstatic\.com\/firebasejs\/10\.12\.2\/(.+\.js)$/, r => r.fulfill({ path: SDK + r.request().url().split('/').pop(), contentType: 'application/javascript' }));
    await c.route(/fonts\./, r => r.abort());
    await c.route(/cdn\.jsdelivr\.net/, r => r.abort());
    return c;
  };
  const page = async (c, url, label = '') => {
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(label + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_FAILED|net::/.test(m.text())) errs.push(label + 'console: ' + m.text()); });
    await p.goto(url); await wait(700);
    return p;
  };
  const login = async p => { await p.evaluate(u => firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify(u))), LUIZ); await wait(2200); };
  // Runs code against the signed-in user's data: db, B ("users/<uid>/") and arg are in scope.
  const dbOf = p => (fn, arg) => p.evaluate(new Function('arg', 'return (async()=>{const u=firebase.auth().currentUser.uid;const db=firebase.firestore();const B="users/"+u+"/";' + fn + '})()'), arg);
  await fn({ ok, ctx, page, login, dbOf, errs });
  ok('sem erros na página', !errs.length, errs.join(' | '));
  console.log(R.join('\n'));
  const fails = R.filter(x => x.startsWith('FAIL')).length;
  console.log(name + ': ' + fails + ' falhas de ' + R.length);
  await b.close();
  process.exitCode = fails ? 1 : 0;
}
module.exports = { suite, PAINEL, FIN, plus, addM, pad, wait, txt, iso };
