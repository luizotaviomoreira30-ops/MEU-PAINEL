// Contas: balances computed from the opening balance plus realized movements, and each account's statement.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, fmtDate, monthLabel, openForm, money, moneyField, toast, today, emptyState, dataTable, plural } from "../ui.js";
import { live, activeAccounts, whereLabel, categoryName, kindLabel } from "../domain.js";
import { openTxnForm } from "./txnForm.js";
import { errText } from "../store.js";

const COLORS = [["#173B5E", "Azul-marinho"], ["#820AD1", "Roxo"], ["#EC0000", "Vermelho"], ["#00A7E1", "Azul-claro"], ["#FF7A00", "Laranja"], ["#1D7F55", "Verde"], ["#D8A64E", "Dourado"], ["#5C6673", "Cinza"]];

export function openAccountForm(app, a = null) {
  const st = app.store.state;
  const debt = a && a.type === "divida";
  openForm({
    title: a ? "Editar conta" : "Nova conta",
    // A loan is stored as a negative balance; the form shows the debt as a positive number.
    values: a ? { ...a, opening: debt ? "" : moneyField(a.opening), openingNeg: !debt && a.opening < 0, openingDebt: debt ? moneyField(-a.opening) : "" }
      : { type: "corrente", color: "#173B5E", status: "ativa", openDate: today(), opening: "", openingDebt: "" },
    fields: [
      { key: "name", label: "Nome", required: true, placeholder: "Ex.: Nubank, Santander, Carteira" },
      { key: "institution", label: "Instituição", placeholder: "Ex.: Nu Pagamentos" },
      { key: "type", label: "Tipo de conta", type: "select", options: Object.entries(F.ACCOUNT_TYPES).map(([k, v]) => [k, v.label]),
        hint: "Investimentos entram no patrimônio; empréstimos entram como dívida; Histórico fica fora do saldo." },
      { key: "opening", label: "Saldo inicial (R$)", type: "money", placeholder: "0,00", show: s => s.type !== "divida",
        hint: "O saldo do dia em que você começou a usar o painel. O saldo atual é calculado a partir dele." },
      { key: "openingNeg", label: "Esse saldo inicial é negativo", type: "checkbox", show: s => s.type !== "divida" },
      { key: "openingDebt", label: "Valor devido no início (R$)", type: "money", placeholder: "0,00", show: s => s.type === "divida" },
      { key: "openDate", label: "Data de abertura", type: "date" },
      { key: "color", label: "Cor", type: "select", options: COLORS },
      { key: "status", label: "Situação", type: "select", options: [["ativa", "Ativa"], ["encerrada", "Encerrada"]] }
    ],
    onDelete: a ? async () => {
      const used = st.txns.some(t => !t.deleted && (t.accountId === a.id || t.fromId === a.id || t.toId === a.id));
      if (used) { toast("Essa conta tem lançamentos. Para guardar o histórico, mude a situação para Encerrada.", "err"); return false; }
      await app.store.remove("finAccounts", a.id); toast("Conta excluída"); app.go("#/contas"); return true;
    } : null,
    onSave: async v => {
      let opening;
      if (v.type === "divida") {
        const d = v.openingDebt === "" || v.openingDebt == null ? 0 : money(v.openingDebt);
        if (!Number.isFinite(d) || d < 0) return "Informe o valor devido, por exemplo 15.000,00.";
        opening = -d;
      } else {
        const o = v.opening === "" ? 0 : money(v.opening);
        if (!Number.isFinite(o)) return "Saldo inicial inválido. Use por exemplo 1.250,00.";
        opening = v.openingNeg ? -Math.abs(o) : Math.abs(o);
      }
      const doc = { name: v.name.trim(), institution: (v.institution || "").trim(), type: v.type, opening, openDate: v.openDate || "", color: v.color, status: v.status };
      try { await app.store.save("finAccounts", a ? { ...a, ...doc } : doc); toast(a ? "Conta atualizada" : "Conta criada"); return true; }
      catch (e) { return errText(e); }
    }
  });
}
export function viewAccounts(app, id) {
  const st = app.store.state;
  if (id) return statement(app, id);
  const txns = live(st), t = today();
  const bal = F.balances(st.accounts, txns);
  const nw = F.netWorth(st.accounts.filter(a => !a.deleted), st.cards.filter(c => !c.deleted), txns);
  const accounts = st.accounts.filter(a => !a.deleted);
  const groups = [
    ["Contas e dinheiro", accounts.filter(a => ["corrente", "poupanca", "dinheiro"].includes(a.type))],
    ["Investimentos", accounts.filter(a => a.type === "investimento")],
    ["Empréstimos e financiamentos", accounts.filter(a => a.type === "divida")],
    ["Fora do saldo", accounts.filter(a => a.type === "externo")]
  ];
  if (app.params().nova === "1" && !app.ui._accFormShown) { app.ui._accFormShown = true; setTimeout(() => openAccountForm(app), 0); }
  const accCard = a => {
    const b = bal[a.id] || 0, debt = a.type === "divida";
    return h("a", { class: "acc", href: "#/contas/" + a.id, style: { "--c": a.color || "#173B5E", textDecoration: "none" } },
      h("span", { class: "nm" }, h("span", { text: a.name }), a.status === "encerrada" ? h("span", { class: "chip", text: "Encerrada" }) : null),
      h("span", { class: "bal " + (b < 0 && !debt ? "neg" : ""), text: debt ? brl(-b) : brl(b) }),
      h("span", { class: "meta" }, h("span", { text: (F.ACCOUNT_TYPES[a.type] || {}).label }), a.institution ? h("span", { text: "· " + a.institution }) : null,
        debt ? h("span", { text: "· valor devido" }) : null));
  };
  return [
    h("div", { class: "toolbar" },
      h("button", { class: "btn primary", type: "button", text: "+ Nova conta", onclick: () => openAccountForm(app) }),
      h("button", { class: "btn", type: "button", text: "Transferir", disabled: activeAccounts(st).length < 2, onclick: () => openTxnForm(app, null, { kind: "transferencia" }) }),
      h("button", { class: "btn", type: "button", text: "Ajustar saldo", disabled: !activeAccounts(st).length, onclick: () => openTxnForm(app, null, { kind: "ajuste" }) })),
    h("div", { class: "kpis" },
      h("div", { class: "kpi hero" }, h("span", { class: "k" }, icon("shield"), "Patrimônio líquido"), h("span", { class: "v", text: brl(nw.net) }), h("span", { class: "d", text: "ativos menos dívidas e cartões" })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("bank"), "Saldo consolidado"), h("span", { class: "v", text: brl(nw.cash) }), h("span", { class: "d", text: "contas, poupança e dinheiro" })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("down"), "Dívidas"), h("span", { class: "v", text: brl(nw.liabilities) }), h("span", { class: "d", text: "empréstimos " + brl(nw.liabilities - nw.cardsDebt) + " · cartões " + brl(nw.cardsDebt) }))),
    accounts.length ? groups.filter(([, list]) => list.length).map(([title, list]) => h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: title }), h("span", { class: "sub", text: plural(list.length, "conta", "contas") })),
      h("div", { class: "acc-grid" }, list.map(accCard))))
      : h("section", { class: "card" }, emptyState("Cadastre suas contas: Nubank, Santander, Mercado Pago, dinheiro em espécie. Informe o saldo de hoje e o painel calcula o resto.", "+ Nova conta", () => openAccountForm(app))),
    h("p", { class: "hint", text: "Importação de extratos OFX/CSV e conciliação: próxima etapa (veja o roadmap)." })
  ];
}

function statement(app, id) {
  const st = app.store.state;
  const a = st.accounts.find(x => x.id === id);
  if (!a) return [emptyState("Conta não encontrada.", "Voltar", () => app.go("#/contas"))];
  const txns = live(st);
  const mine = txns.filter(t => t.accountId === id || t.fromId === id || t.toId === id);
  const effect = t => F.accountEffects(t).filter(([k]) => k === id).reduce((s, [, d]) => s + d, 0);
  const plannedEffect = t => {
    if (t.status !== "previsto") return 0;
    return F.accountEffects({ ...t, status: "efetivado" }).filter(([k]) => k === id).reduce((s, [, d]) => s + d, 0);
  };
  // Running balance in date order, then shown newest first.
  const realized = mine.filter(F.isRealized).sort((x, y) => (F.effectiveDate(x) + (x.createdAt || 0)).localeCompare(F.effectiveDate(y) + (y.createdAt || 0)));
  let run = Number(a.opening) || 0;
  const running = new Map();
  for (const t of realized) { run += effect(t); running.set(t.id, run); }
  const mk = app.ui.month;
  const inMonth = mine.filter(t => F.monthOf(F.effectiveDate(t)) === mk).sort((x, y) => (F.effectiveDate(y) + (y.createdAt || 0)).localeCompare(F.effectiveDate(x) + (x.createdAt || 0)));
  let ins = 0, outs = 0;
  for (const t of inMonth) { const e = effect(t); if (e > 0) ins += e; else outs -= e; }
  const debt = a.type === "divida";
  const bal = F.accountBalance(a, txns);
  return [
    h("div", { class: "toolbar" },
      h("button", { class: "btn", type: "button", onclick: () => app.go("#/contas") }, icon("back"), "Contas"),
      app.monthNav(),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", type: "button", text: "Editar conta", onclick: () => openAccountForm(app, a) }),
      h("button", { class: "btn", type: "button", text: "Ajustar saldo", onclick: () => openTxnForm(app, null, { kind: "ajuste", accountId: a.id }) }),
      h("button", { class: "btn primary", type: "button", text: "+ Lançamento", onclick: () => openTxnForm(app, null, { where: "a:" + a.id, accountId: a.id, fromId: a.id }) })),
    h("div", { class: "kpis" },
      h("div", { class: "kpi hero", style: { "--c": a.color } }, h("span", { class: "k" }, icon(debt ? "down" : "bank"), a.name), h("span", { class: "v", text: brl(debt ? -bal : bal) }),
        h("span", { class: "d", text: debt ? "valor devido hoje" : "saldo atual · inicial " + brl(a.opening) })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("up"), "Entradas em " + monthLabel(mk, true)), h("span", { class: "v pos", text: brl(ins) })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("down"), "Saídas em " + monthLabel(mk, true)), h("span", { class: "v", text: brl(outs) }))),
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", { text: "Extrato" }), h("span", { class: "sub", text: "saldo após cada movimento efetivado" })),
      dataTable({
        rows: inMonth, onRow: t => openTxnForm(app, t), page: 0, pageSize: 200,
        empty: "Nenhuma movimentação em " + monthLabel(mk).toLowerCase() + ".",
        columns: [
          { label: "Data", render: t => h("span", { class: "num", text: fmtDate(F.effectiveDate(t)) }) },
          { label: "Descrição", render: t => h("div", { class: "desc" }, h("b", { text: t.desc || categoryName(st, t.categoryId) || kindLabel(t) }), h("small", { text: kindLabel(t) + (t.kind === "transferencia" || t.kind === "pagamento_fatura" ? " · " + whereLabel(st, t) : "") })) },
          { label: "Situação", render: t => t.status === "previsto" ? h("span", { class: "chip warn", text: "Previsto" }) : h("span", { class: "chip pos", text: "Efetivado" }) },
          { label: "Valor", align: "right", render: t => { const e = t.status === "previsto" ? plannedEffect(t) : effect(t); return h("span", { class: "amt " + (e > 0 ? "pos" : ""), text: (e > 0 ? "+ " : e < 0 ? "− " : "") + brl(Math.abs(e)) }); } },
          { label: "Saldo", align: "right", render: t => running.has(t.id) ? h("span", { class: "amt", text: brl(running.get(t.id)) }) : h("span", { class: "hint", text: "—" }) }
        ]
      }))
  ];
}
