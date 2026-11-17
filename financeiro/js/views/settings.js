// Configurações: categories, link with Meu Painel, import of the Painel's old expenses, backup and audit trail.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, openForm, toast, emptyState, plural, confirmButton, today } from "../ui.js";
import { errText } from "../store.js";

export const SHARE_FIELDS = [
  ["saldo", "Saldo consolidado das contas"],
  ["mes", "Receitas, despesas e resultado do mês"],
  ["patrimonio", "Patrimônio líquido"],
  ["vencimentos", "Próximos vencimentos"],
  ["alertas", "Alertas importantes"]
];

function editCategory(app, c, kind) {
  openForm({
    title: c ? "Editar categoria" : "Nova categoria de " + (kind === "receita" ? "receita" : "despesa"),
    values: c ? { ...c } : { kind, name: "" },
    fields: [
      { key: "name", label: "Nome", required: true, full: true },
      { key: "kind", label: "Tipo", type: "select", options: [["despesa", "Despesa"], ["receita", "Receita"]] },
      { key: "archived", label: "Arquivada (não aparece para novos lançamentos)", type: "checkbox" }
    ],
    onSave: async v => {
      const name = v.name.trim().replace(/\s+/g, " ").slice(0, 40);
      const st = app.store.state;
      if (st.categories.some(x => !x.deleted && x.id !== (c && c.id) && x.kind === v.kind && x.name.toLowerCase() === name.toLowerCase())) return "Já existe uma categoria com esse nome.";
      try { await app.store.save("finCategories", c ? { ...c, name, kind: v.kind, archived: !!v.archived } : { name, kind: v.kind, archived: false, order: 100 + st.categories.length }); toast("Categoria salva"); return true; }
      catch (e) { return errText(e); }
    }
  });
}

// The Painel's old expenses become entries of an account kept outside the balances.
const OLD_CAT = { mercado: ["alimentacao", "Mercado"], alimentacao: ["alimentacao", "Alimentação fora"], transporte: ["transporte"], moradia: ["moradia"],
  contas: ["contas_casa"], saude: ["saude"], educacao: ["educacao"], lazer: ["lazer"], compras: ["compras"], assinaturas: ["assinaturas"], outros: ["outros"],
  salario: ["salario"], freela: ["renda_extra", "Freela"], vendas: ["renda_extra", "Vendas"], reembolso: ["reembolsos"], rendimentos: ["rendimentos"], outras_entradas: ["outras_receitas"] };
const EXTRA_CAT = { doacoes: ["Dízimo e doações", "despesa"], trabalho: ["Trabalho / negócio", "despesa"] };
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "cat";

export async function importFromPainel(app) {
  const st = app.store.state;
  const old = await app.store.painelExpenses();
  if (!old.length) { toast("Não há gastos no Meu Painel para trazer."); return 0; }
  const have = new Set(st.txns.map(t => t.id));
  const cats = new Map(st.categories.map(c => [c.id, c]));
  const newCats = [];
  const catFor = e => {
    const k = e.category || "outros";
    if (OLD_CAT[k]) return OLD_CAT[k];
    if (EXTRA_CAT[k]) {
      if (!cats.has(k)) { const c = { id: k, name: EXTRA_CAT[k][0], kind: EXTRA_CAT[k][1], archived: false, order: 50 }; cats.set(k, c); newCats.push(c); }
      return [k];
    }
    if (k.startsWith("c:")) {
      const id = "c_" + slug(k.slice(2));
      if (!cats.has(id)) { const c = { id, name: k.slice(2), kind: e.type === "entrada" ? "receita" : "despesa", archived: false, order: 60 }; cats.set(id, c); newCats.push(c); }
      return [id];
    }
    return [e.type === "entrada" ? "outras_receitas" : "outros"];
  };
  const t0 = today();
  const txns = [];
  for (const e of old) {
    const id = "painel_" + e._mk + "_" + e.id;
    if (have.has(id) || !(Number(e.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) continue;
    const [categoryId, sub] = catFor(e);
    const notes = [e.notes, e.bank ? "Banco no Painel: " + e.bank : null, e.installment ? "Parcela " + e.installment.n + "/" + e.installment.of : null].filter(Boolean).join(" · ");
    txns.push({ id, kind: e.type === "entrada" ? "receita" : "despesa", amount: Math.round(Number(e.amount) * 100), date: e.date,
      status: e.date > t0 ? "previsto" : "efetivado", desc: e.desc || "", categoryId, subcategory: sub || "", method: e.method || "",
      accountId: "painel_historico", tags: e.area ? [e.area] : [], notes, importedFrom: { app: "painel", month: e._mk, id: e.id } });
  }
  if (!txns.length) { toast("Tudo já tinha sido trazido antes. Nada duplicado."); return 0; }
  if (!st.accounts.some(a => a.id === "painel_historico"))
    await app.store.save("finAccounts", { id: "painel_historico", name: "Histórico do Meu Painel", institution: "", type: "externo", opening: 0, status: "ativa", color: "#5C6673", order: 99 }, "importar");
  if (newCats.length) await app.store.saveMany("finCategories", newCats, "importar");
  await app.store.saveMany("finTxns", txns, "importar");
  await app.store.save("finSettings", { ...(st.settings || {}), id: "main", painelImport: { at: Date.now(), count: (st.settings.painelImport ? st.settings.painelImport.count : 0) + txns.length } }, "importar");
  toast(plural(txns.length, "lançamento trazido", "lançamentos trazidos") + " do Meu Painel");
  return txns.length;
}

export function viewSettings(app) {
  const st = app.store.state;
  const share = st.settings.share || {};
  const fields = share.fields || Object.fromEntries(SHARE_FIELDS.map(([k]) => [k, true]));
  const saveShare = async patch => {
    try { await app.store.save("finSettings", { ...(st.settings || {}), id: "main", share: { ...share, fields, ...patch } }); app.publishSummary(); return true; }
    catch (e) { toast(errText(e), "err"); return false; }
  };
  const catList = kind => {
    const list = st.categories.filter(c => !c.deleted && c.kind === kind);
    return h("div", { class: "rows" }, list.map(c => h("button", { type: "button", class: "r-item", onclick: () => editCategory(app, c) },
      h("span", { class: "grow", text: c.name }), c.archived ? h("span", { class: "chip", text: "Arquivada" }) : null,
      h("span", { class: "hint", text: plural(st.txns.filter(t => !t.deleted && t.categoryId === c.id).length, "lançamento", "lançamentos") }))));
  };
  const imp = st.settings.painelImport;
  const audit = h("div", { class: "rows" }, h("p", { class: "hint", text: "Carregando…" }));
  app.store.auditLog(40).then(list => {
    const label = { criar: "Criou", editar: "Editou", excluir: "Excluiu", restaurar: "Restaurou", efetivar: "Efetivou", importar: "Importou", gerar_recorrencia: "Gerou (recorrência)", salvar: "Salvou" };
    const ent = { finTxns: "lançamento", finAccounts: "conta", finCards: "cartão", finCategories: "categoria", finBudgets: "orçamento", finRecurring: "recorrência", finSettings: "configuração" };
    audit.replaceChildren(...(list.length ? list.map(a => h("div", { class: "r-item" },
      h("span", { class: "ico" }, icon("shield")),
      h("span", { class: "grow desc" }, h("b", { text: (label[a.action] || a.action) + " " + (ent[a.entity] || a.entity) + ((a.after && a.after.desc) || (a.after && a.after.name) ? ": " + ((a.after.desc || a.after.name)) : "") }),
        h("small", { text: new Date(a.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + (a.changed && a.changed.length && a.action === "editar" ? " · mudou " + a.changed.filter(k => k !== "updatedAt").join(", ") : "") })),
      a.after && Number.isInteger(a.after.amount) ? h("span", { class: "amt", text: brl(a.after.amount) }) : null)) : [h("p", { class: "hint", text: "Nenhum registro ainda." })]));
  }).catch(() => audit.replaceChildren(h("p", { class: "hint", text: "Não foi possível carregar a auditoria." })));

  return [
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: "Integração com o Meu Painel" }),
        h("span", { class: "chip " + (share.enabled ? "pos" : ""), text: share.enabled ? "Compartilhando" : "Desativada" })),
      h("p", { class: "hint", text: "O Meu Financeiro é a fonte oficial. O Painel recebe só um resumo com os itens marcados abaixo e mostra os números do mês na hora. Despesas lançadas pela captura rápida do Painel são gravadas aqui, uma única vez." }),
      h("div", { style: { display: "grid", gap: "8px" } }, SHARE_FIELDS.map(([k, l]) => {
        const cb = h("input", { type: "checkbox", id: "share-" + k, onchange: e => saveShare({ fields: { ...fields, [k]: e.target.checked } }) });
        cb.checked = fields[k] !== false;
        return h("label", { class: "check-label", for: "share-" + k }, cb, h("span", { text: l }));
      })),
      h("div", { class: "toolbar" },
        share.enabled ? h("button", { class: "btn", type: "button", text: "Sincronizar agora", onclick: () => { app.publishSummary(true); toast("Resumo enviado ao Painel"); } })
          : h("button", { class: "btn primary", type: "button", text: "Ativar compartilhamento", onclick: () => saveShare({ enabled: true }) }),
        share.enabled ? confirmButton("Revogar acesso", "Confirmar: apagar resumo", async () => { try { await app.store.revokeShare(); toast("Compartilhamento desativado e resumo apagado"); return true; } catch (e) { toast(errText(e), "err"); return false; } }) : null,
        h("span", { class: "hint", text: st.settings.shareError ? "Último erro: " + st.settings.shareError.message : share.enabled ? "O resumo é atualizado a cada mudança, com o app aberto." : "" }))),

    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: "Trazer gastos do Meu Painel" }), imp ? h("span", { class: "chip pos", text: plural(imp.count, "lançamento trazido", "lançamentos trazidos") }) : null),
      h("p", { class: "hint", text: "Copia os gastos e entradas da aba Gastos do Painel para cá, numa conta chamada \"Histórico do Meu Painel\", que fica fora do saldo (o Painel não sabia de quais contas o dinheiro saiu). Os originais não são apagados, e repetir a importação não duplica nada. Depois, se quiser, edite cada lançamento e escolha a conta ou o cartão certo." }),
      h("div", { class: "toolbar" }, h("button", { class: "btn primary", type: "button", text: imp ? "Trazer o que faltar" : "Trazer gastos do Painel", onclick: async e => {
        const b = e.currentTarget; b.disabled = true; b.textContent = "Trazendo…";
        try { await importFromPainel(app); } catch (err) { toast(errText(err), "err"); }
        b.disabled = false; b.textContent = "Trazer o que faltar";
      } }))),

    h("div", { class: "grid2" },
      h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", { text: "Categorias de despesa" }), h("button", { class: "btn small", type: "button", text: "+ Nova", onclick: () => editCategory(app, null, "despesa") })), catList("despesa")),
      h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", { text: "Categorias de receita" }), h("button", { class: "btn small", type: "button", text: "+ Nova", onclick: () => editCategory(app, null, "receita") })), catList("receita"))),

    h("div", { class: "grid2" },
      h("section", { class: "card" },
        h("div", { class: "card-head" }, h("h2", { text: "Backup" })),
        h("p", { class: "hint", text: "Baixa um arquivo .json com contas, cartões, lançamentos, categorias, orçamentos, recorrências e a trilha de auditoria." }),
        h("button", { class: "btn", type: "button", style: { justifySelf: "start" }, text: "Baixar backup", onclick: async e => {
          const b = e.currentTarget; b.disabled = true;
          try {
            const data = await app.store.backup();
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            const a = h("a", { href: url, download: "financeiro-backup-" + today() + ".json" }); document.body.append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000); toast("Backup baixado");
          } catch (err) { toast(errText(err), "err"); }
          b.disabled = false;
        } })),
      h("section", { class: "card" },
        h("div", { class: "card-head" }, h("h2", { text: "Trilha de auditoria" }), h("span", { class: "sub", text: "últimas 40 alterações" })),
        audit))
  ];
}
