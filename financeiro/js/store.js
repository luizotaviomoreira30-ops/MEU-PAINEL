// Firestore access for Meu Financeiro. Every write goes with its audit entry in the same batch.
import * as F from "../../shared/fincore.js";

const COLS = ["finAccounts", "finCards", "finTxns", "finCategories", "finRecurring", "finBudgets", "finSettings"];
const codeOf = e => String((e && e.code) || "").replace(/^firestore\//, "").replace(/-/g, "_");

export function errText(e) {
  const c = codeOf(e);
  if (c === "permission_denied" || c === "unauthenticated") return "Sem permissão para salvar. Saia e entre de novo com sua conta do Google.";
  if (c === "resource_exhausted") return "Muitas alterações seguidas. Espere alguns segundos e tente de novo.";
  if (c === "unavailable") return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return "Não foi possível salvar. Tente de novo.";
}

export function createStore(fdb, uid, { onChange, onPending }) {
  const base = "users/" + uid + "/";
  const col = name => fdb.collection(base + name);
  const state = {
    accounts: [], cards: [], txns: [], categories: [], recurring: [], budgets: {}, settings: {},
    loaded: new Set(), errors: new Set(), pending: 0, saveError: false
  };
  const byCol = {
    finAccounts: docs => { state.accounts = docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)); },
    finCards: docs => { state.cards = docs.sort((a, b) => a.name.localeCompare(b.name)); },
    finTxns: docs => { state.txns = docs; },
    finCategories: docs => { state.categories = docs.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name)); },
    finRecurring: docs => { state.recurring = docs; },
    finBudgets: docs => { state.budgets = Object.fromEntries(docs.map(d => [d.id, d])); },
    finSettings: docs => { state.settings = (docs.find(d => d.id === "main")) || {}; }
  };
  const unsubs = [];
  for (const c of COLS) {
    unsubs.push(col(c).onSnapshot(snap => {
      byCol[c](snap.docs.map(d => ({ ...d.data(), id: d.id })));
      state.loaded.add(c); state.errors.delete(c);
      onChange();
    }, err => {
      console.error(c, err);
      state.loaded.add(c); state.errors.add(c);
      onChange();
    }));
  }

  /* ---------- writes ---------- */
  const auditRef = () => col("finAudit").doc();
  async function run(fn) {
    state.pending++; onPending();
    try {
      try { await fn(); }
      catch (e) { if (codeOf(e) !== "unavailable") throw e; await new Promise(r => setTimeout(r, 700)); await fn(); }
      state.saveError = false;
      return true;
    } catch (e) {
      console.error(e);
      state.saveError = true;
      throw e;
    } finally { state.pending--; onPending(); }
  }
  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));
  const current = (c, id) => {
    const list = c === "finAccounts" ? state.accounts : c === "finCards" ? state.cards : c === "finTxns" ? state.txns
      : c === "finCategories" ? state.categories : c === "finRecurring" ? state.recurring : c === "finBudgets" ? Object.values(state.budgets) : [];
    const found = list.find(x => x.id === id);
    if (!found) return null;
    const { id: _, ...rest } = found;
    return rest;
  };
  // Creates or replaces documents; each one gets an audit entry. Returns the ids.
  async function saveMany(c, items, action = "salvar") {
    const ids = [];
    const now = Date.now();
    await run(async () => {
      for (let i = 0; i < items.length; i += 200) {
        const batch = fdb.batch();
        for (const item of items.slice(i, i + 200)) {
          const ref = item.id ? col(c).doc(item.id) : col(c).doc();
          const { id, ...body } = item;
          const before = current(c, ref.id);
          const data = clean({ ...body, createdAt: (before && before.createdAt) || body.createdAt || now, updatedAt: now });
          batch.set(ref, data);
          batch.set(auditRef(), clean(F.auditEntry(before ? (action === "salvar" ? "editar" : action) : "criar", c, ref.id, before, data, now)));
          ids.push(ref.id);
        }
        await batch.commit();
      }
    });
    return ids;
  }
  const save = async (c, item, action) => (await saveMany(c, [item], action))[0];
  async function patch(c, id, changes, action = "editar") {
    const now = Date.now();
    const before = current(c, id);
    const data = clean({ ...changes, updatedAt: now });
    await run(async () => {
      const batch = fdb.batch();
      batch.set(col(c).doc(id), data, { merge: true });
      batch.set(auditRef(), clean(F.auditEntry(action, c, id, before, { ...(before || {}), ...data }, now)));
      await batch.commit();
    });
    return true;
  }
  // Records are never erased: they are marked as deleted and stay in the history.
  const remove = (c, id) => patch(c, id, { deleted: true, deletedAt: Date.now() }, "excluir");
  const restore = (c, id) => patch(c, id, { deleted: false, deletedAt: null }, "restaurar");
  async function removeMany(c, ids) {
    const now = Date.now();
    await run(async () => {
      for (let i = 0; i < ids.length; i += 200) {
        const batch = fdb.batch();
        for (const id of ids.slice(i, i + 200)) {
          const before = current(c, id);
          batch.set(col(c).doc(id), { deleted: true, deletedAt: now, updatedAt: now }, { merge: true });
          batch.set(auditRef(), clean(F.auditEntry("excluir", c, id, before, { ...(before || {}), deleted: true, deletedAt: now }, now)));
        }
        await batch.commit();
      }
    });
    return true;
  }

  /* ---------- first run: default categories ---------- */
  let seeded = false;
  async function seedCategories() {
    if (seeded || !state.loaded.has("finCategories") || state.categories.length) return;
    seeded = true;
    try { await saveMany("finCategories", F.DEFAULT_CATEGORIES.map(c => ({ ...c, archived: false })), "criar"); }
    catch { seeded = false; }
  }

  /* ---------- recurring entries: create only what does not exist ---------- */
  let generating = false;
  async function generateRecurring(fromMk, months = 3) {
    if (generating || !state.loaded.has("finTxns") || !state.loaded.has("finRecurring")) return 0;
    generating = true;
    let created = 0;
    try {
      const have = new Set(state.txns.map(t => t.id));
      for (const rule of state.recurring.filter(r => r.active !== false && !r.deleted)) {
        for (const occ of F.missingOccurrences(rule, have, fromMk, months)) {
          const ref = col("finTxns").doc(occ.id);
          // The transaction re-checks the server: two open tabs never create the same month twice.
          const made = await fdb.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (snap.exists) return false;
            const now = Date.now();
            const { id, ...body } = occ;
            const data = clean({ ...body, createdAt: now, updatedAt: now });
            tx.set(ref, data);
            tx.set(auditRef(), clean(F.auditEntry("gerar_recorrencia", "finTxns", occ.id, null, data, now)));
            return true;
          });
          if (made) { created++; have.add(occ.id); }
        }
      }
    } catch (e) { console.error("recorrência", e); }
    generating = false;
    return created;
  }

  /* ---------- summary shared with Meu Painel ---------- */
  let shareTimer = null, lastShared = "";
  function scheduleShare(build, force) {
    if (force) lastShared = "";
    clearTimeout(shareTimer);
    shareTimer = setTimeout(async () => {
      const cfg = state.settings.share || {};
      const ref = col("finShare").doc("summary");
      try {
        if (!cfg.enabled) return;
        const payload = build(cfg.fields || {});
        const key = JSON.stringify(payload);
        if (key === lastShared) return;
        await ref.set(clean({ ...payload, updatedAt: Date.now() }));
        lastShared = key;
        if (state.settings.shareError) await col("finSettings").doc("main").set({ shareError: null }, { merge: true });
      } catch (e) {
        console.error("compartilhamento", e);
        try { await col("finSettings").doc("main").set({ shareError: { at: Date.now(), message: errText(e) } }, { merge: true }); } catch {}
      }
    }, 1200);
  }
  async function revokeShare() {
    await run(async () => {
      const batch = fdb.batch();
      batch.delete(col("finShare").doc("summary"));
      batch.set(col("finSettings").doc("main"), { share: { ...(state.settings.share || {}), enabled: false }, shareRevokedAt: Date.now() }, { merge: true });
      await batch.commit();
    });
    lastShared = "";
    return true;
  }

  /* ---------- reading what is not kept live ---------- */
  const auditLog = async (n = 60) => (await col("finAudit").orderBy("at", "desc").limit(n).get()).docs.map(d => ({ ...d.data(), id: d.id }));
  async function painelExpenses() {
    const months = (await fdb.collection(base + "expenseMonths").get()).docs.map(d => d.id);
    const out = [];
    for (const mk of months) {
      const snap = await fdb.collection(base + "expenseMonths/" + mk + "/items").get();
      out.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, _mk: mk })));
    }
    return out;
  }
  async function backup() {
    const out = { app: "Meu Financeiro", formato: 1, exportadoEm: new Date().toISOString(), colecoes: {} };
    for (const c of [...COLS, "finAudit", "finShare"]) out.colecoes[c] = (await col(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));
    return out;
  }

  return { state, save, saveMany, patch, remove, removeMany, restore, seedCategories, generateRecurring, scheduleShare, revokeShare,
    auditLog, painelExpenses, backup, newId: c => col(c).doc().id, stop: () => unsubs.forEach(u => u()) };
}
