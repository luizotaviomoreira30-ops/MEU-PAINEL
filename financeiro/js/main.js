// Meu Financeiro: sign-in, routing, layout and the summary shared with Meu Painel.
import * as F from "../../shared/fincore.js";
import { FIREBASE_CONFIG, checkAccess, accessMessage } from "../../shared/firebase-config.js";
import { mountPasswordLogin, renderVerify } from "../../shared/login.js";
import { h, $, icon, monthLabel, today, toast } from "./ui.js";
import { createStore } from "./store.js";
import { live, activeAccounts, activeCards, netWorthAt, alerts, categoryName } from "./domain.js";
import { viewOverview } from "./views/overview.js";
import { viewTransactions } from "./views/transactions.js";
import { viewAccounts } from "./views/accounts.js";
import { viewCards, openInvoicePayment } from "./views/cards.js";
import { viewBudget } from "./views/budget.js";
import { viewReports } from "./views/reports.js";
import { viewSettings } from "./views/settings.js";
import { viewBills } from "./views/bills.js";
import { openTxnForm } from "./views/txnForm.js";

const ROUTES = {
  "visao-geral": { title: "Visão geral", sub: "Seu dinheiro num só lugar", icon: "overview", view: viewOverview },
  "lancamentos": { title: "Lançamentos", sub: "Receitas, despesas, transferências e pendências", icon: "txns", view: viewTransactions },
  "contas": { title: "Contas", sub: "Saldos calculados a partir do saldo inicial e do que foi efetivado", icon: "bank", view: viewAccounts },
  "cartoes": { title: "Cartões", sub: "Limites, faturas e parcelas", icon: "card", view: viewCards },
  "a-pagar-receber": { title: "Contas a pagar e receber", sub: "O que vence, o que está atrasado e o que vai entrar", icon: "calendar", view: viewBills },
  "orcamento": { title: "Orçamento", sub: "Limites mensais por categoria", icon: "budget", view: viewBudget },
  "relatorios": { title: "Relatórios", sub: "Resultados do período e exportação", icon: "report", view: viewReports },
  "configuracoes": { title: "Configurações", sub: "Categorias, integração, backup e auditoria", icon: "settings", view: viewSettings }
};
const NAV = [
  ["Principal", ["visao-geral", "lancamentos", "a-pagar-receber"]],
  ["Contas e cartões", ["contas", "cartoes"]],
  ["Planejamento", ["orcamento"]],
  ["Análise", ["relatorios"]],
  ["Sistema", ["configuracoes"]]
];

const local = {
  get(k, d) { try { const v = localStorage.getItem("fin:" + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("fin:" + k, v); } catch {} }
};

const app = {
  store: null,
  ui: {
    month: today().slice(0, 7),
    txn: { tab: "todos", query: "", where: "", category: "", page: 0, sort: { key: "date", dir: "desc" }, allMonths: false },
    report: {}, invoice: null
  },
  route() {
    const raw = (location.hash || "#/visao-geral").replace(/^#\/?/, "");
    const [path] = raw.split("?");
    const [name, id] = path.split("/");
    return { name: ROUTES[name] ? name : "visao-geral", id: id ? decodeURIComponent(id) : null };
  },
  params() { const q = (location.hash.split("?")[1] || ""); return Object.fromEntries(new URLSearchParams(q)); },
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  render: () => render(),
  recall: (k, d) => local.get(k, d),
  remember: (k, v) => local.set(k, v ?? ""),
  openInvoicePayment: (card, inv, existing) => openInvoicePayment(app, card, inv, existing),
  monthNav() {
    const mk = app.ui.month;
    const move = n => { app.ui.month = F.addMonths(mk, n); app.ui.txn.page = 0; render(); };
    return h("div", { class: "month-nav" },
      h("button", { type: "button", class: "icon-btn sm", "aria-label": "Mês anterior", onclick: () => move(-1) }, icon("back")),
      h("span", { class: "m", text: monthLabel(mk) }),
      h("button", { type: "button", class: "icon-btn sm", "aria-label": "Próximo mês", onclick: () => move(1), style: { transform: "scaleX(-1)" } }, icon("back")),
      mk !== today().slice(0, 7) ? h("button", { type: "button", class: "btn small", text: "Hoje", onclick: () => { app.ui.month = today().slice(0, 7); render(); } }) : null);
  },
  publishSummary(force) { if (app.store) app.store.scheduleShare(buildSummary, force); }
};

/* ---------- summary for Meu Painel ---------- */
function buildSummary(fields) {
  const st = app.store.state, t = today(), mk = t.slice(0, 7), txns = live(st);
  const nw = netWorthAt(st, t), sm = F.monthSummary(txns, mk), bal = F.balances(st.accounts, txns);
  const out = { version: 1, month: mk, fields };
  if (fields.saldo !== false) out.saldo = { cash: nw.cash, invested: nw.invested,
    accounts: activeAccounts(st).filter(a => F.accountGroup(a) === "ativo").map(a => ({ name: a.name, type: a.type, balance: bal[a.id] || 0 })) };
  if (fields.mes !== false) out.mes = { income: sm.income + sm.yields, expense: sm.expense, result: sm.result, plannedIncome: sm.plannedIncome, plannedExpense: sm.plannedExpense,
    top: Object.entries(sm.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => ({ name: categoryName(st, k), value: v })) };
  if (fields.patrimonio !== false) out.patrimonio = { net: nw.net, assets: nw.assets, liabilities: nw.liabilities };
  // Overdue bills come first, then what is due up to the end of next month.
  if (fields.vencimentos !== false) out.vencimentos = F.payables(txns, activeCards(st), t, { to: F.dayIn(F.addMonths(mk, 1), 31) }).slice(0, 6)
    .map(x => ({ date: x.due, amount: x.amount, type: x.type, overdue: x.overdue, label: x.invoice ? "Fatura " + x.card.name : (x.txn.desc || categoryName(st, x.txn.categoryId)) }));
  if (fields.alertas !== false) out.alertas = alerts(st, t).slice(0, 5).map(a => ({ level: a.level, text: a.text }));
  return out;
}

/* ---------- layout ---------- */
function renderNav() {
  const r = app.route().name;
  $("#nav").replaceChildren(...NAV.flatMap(([group, items]) => [
    h("div", { class: "nav-group", text: group }),
    ...items.map(k => h("a", { href: "#/" + k, "aria-current": r === k ? "page" : null }, icon(ROUTES[k].icon), h("span", { text: ROUTES[k].title })))
  ]));
}
function renderSaveState() {
  const st = app.store && app.store.state, el = $("#save-state");
  if (!st) { el.textContent = ""; return; }
  el.className = "save-state" + (st.saveError && !st.pending ? " err" : "");
  el.textContent = st.pending ? "Salvando…" : st.saveError ? "Erro ao salvar" : st.errors.size ? "Sem conexão" : "Tudo salvo";
}
let scheduled = false;
function render() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; paint(); });
}
function paint() {
  if (!app.store) return;
  // An address that does not exist (e.g. #/contas-a-pagar) shows the overview and fixes the address,
  // so the menu highlights the right item and the back button does not return to the broken one.
  const asked = (location.hash || "").replace(/^#\/?/, "").split("?")[0].split("/")[0];
  if (asked && !ROUTES[asked]) { location.replace(location.pathname + location.search + "#/visao-geral"); return; }
  const { name, id } = app.route();
  const r = ROUTES[name];
  document.title = r.title + " · Meu Financeiro";
  $("#page-title").textContent = r.title;
  $("#page-sub").textContent = r.sub;
  renderNav(); renderSaveState();
  // Keep focus and typed text in inputs that survive a repaint (they have ids).
  const ae = document.activeElement, focusId = ae && ae.id;
  let caret = null; try { caret = ae && typeof ae.selectionStart === "number" ? ae.selectionStart : null; } catch {}
  const st = app.store.state;
  const ready = ["finAccounts", "finTxns", "finCategories", "finCards"].every(c => st.loaded.has(c));
  let content;
  if (!ready) content = [h("p", { class: "loading", text: "Carregando seus dados…" })];
  else {
    try { content = r.view(app, id); }
    catch (e) { console.error(e); content = [h("div", { class: "alert neg" }, icon("alert"), h("span", { text: "Algo deu errado ao montar esta tela. Recarregue a página; se continuar, me avise." }))]; }
  }
  const errs = [...st.errors];
  $("#main").replaceChildren(...[errs.length ? h("div", { class: "alert neg" }, icon("alert"), h("span", { text: "Não foi possível atualizar alguns dados (" + errs.join(", ") + "). Verifique a conexão." })) : null, ...content.flat()].filter(Boolean));
  if (focusId) { const el = document.getElementById(focusId); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); try { if (caret != null) el.setSelectionRange(caret, caret); } catch {} } }
}

/* ---------- boot ---------- */
const loginMsg = $("#login-msg"), loginErr = $("#login-err"), loginBtn = $("#login-btn"), logoutBtn = $("#logout-btn");
function showLogin(msg, { err = "", canLogin = true, canLogout = false } = {}) {
  document.body.dataset.auth = "out";
  loginMsg.textContent = msg; loginErr.textContent = err; loginErr.hidden = !err;
  loginBtn.hidden = !canLogin; loginBtn.disabled = false; logoutBtn.hidden = !canLogout;
  $("#pw-box").hidden = !canLogin || !$("#pw-box").childElementCount;
  $("#verify-box").hidden = true;
}
function authErrText(e) {
  const c = (e && e.code) || "";
  if (c === "auth/network-request-failed") return "Sem conexão com a internet. Verifique e tente de novo.";
  if (c === "auth/unauthorized-domain") return "Este endereço ainda não foi autorizado no Firebase (Authentication → Configurações → Domínios autorizados).";
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return "";
  return "Não foi possível entrar. Tente de novo.";
}

async function boot() {
  if (!window.firebase || !firebase.initializeApp) { showLogin("Não foi possível carregar o Meu Financeiro.", { err: "Verifique sua conexão e recarregue a página.", canLogin: false }); return; }
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth(), fdb = firebase.firestore();
  fdb.settings({ ignoreUndefinedProperties: true, merge: true });
  const emu = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emulador");
  if (emu) { auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true }); fdb.useEmulator("127.0.0.1", 8080); }
  try { await fdb.enablePersistence({ synchronizeTabs: true }); } catch {}

  loginBtn.addEventListener("click", async () => {
    loginBtn.disabled = true; loginErr.hidden = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try { await auth.signInWithPopup(provider); }
    catch (e) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e && e.code)) { try { await auth.signInWithRedirect(provider); return; } catch (e2) { e = e2; } }
      const m = authErrText(e); loginErr.textContent = m; loginErr.hidden = !m; loginBtn.disabled = false;
    }
  });
  const signOut = async () => { try { await auth.signOut(); } finally { location.reload(); } };
  logoutBtn.addEventListener("click", signOut);
  $("#signout").addEventListener("click", signOut);
  auth.getRedirectResult().catch(e => { const m = authErrText(e); if (m) { loginErr.textContent = m; loginErr.hidden = false; } });

  mountPasswordLogin(auth, $("#pw-box"));
  const enter = async user => {
    if (!user) { showLogin("Entre com a mesma conta do Meu Painel: Google ou e-mail e senha."); return; }
    if (!user.emailVerified) {
      showLogin("Confirme o seu e-mail para continuar.", { canLogin: false, canLogout: true });
      renderVerify($("#verify-box"), user, { onVerified: () => enter(auth.currentUser) });
      return;
    }
    const access = await checkAccess(fdb, user);
    if (!access.ok) {
      const [msg, err] = accessMessage(user, access.reason);
      showLogin(msg, { err, canLogin: false, canLogout: true });
      return;
    }
    document.body.dataset.auth = "in";
    $("#me-name").textContent = user.displayName || user.email;
    if (app.store) return;
    let firstLoad = true;
    app.store = createStore(fdb, user.uid, {
      onPending: renderSaveState,
      onChange: () => {
        const st = app.store.state;
        if (st.loaded.has("finCategories")) app.store.seedCategories();
        if (firstLoad && st.loaded.has("finTxns") && st.loaded.has("finRecurring")) {
          firstLoad = false;
          app.store.generateRecurring(today().slice(0, 7), 3).then(n => { if (n) toast(n + (n === 1 ? " lançamento fixo previsto criado" : " lançamentos fixos previstos criados")); });
        }
        if (["finAccounts", "finTxns", "finCards", "finSettings", "finCategories"].every(c => st.loaded.has(c))) app.publishSummary();
        render();
      }
    });
    render();
  };
  auth.onAuthStateChanged(enter);
}

window.addEventListener("hashchange", () => { document.body.classList.remove("nav-open"); $("#scrim-nav").hidden = true; window.scrollTo(0, 0); render(); });
$("#menu-btn").addEventListener("click", () => { document.body.classList.add("nav-open"); $("#scrim-nav").hidden = false; });
$("#scrim-nav").addEventListener("click", () => { document.body.classList.remove("nav-open"); $("#scrim-nav").hidden = true; });
$("#new-txn").addEventListener("click", () => openTxnForm(app));
$("#fab").addEventListener("click", () => openTxnForm(app));
setInterval(() => { if (app.store) render(); }, 60000);
boot();
