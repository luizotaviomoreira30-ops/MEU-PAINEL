// Relatórios: monthly results and categories for a period, exported as PDF, Excel or CSV.
import * as F from "../../../shared/fincore.js";
import { h, icon, brl, monthLabel, fmtDate, toast, today } from "../ui.js";
import { live, whereLabel, categoryName, kindLabel, direction, txnAmount, METHOD_LABEL } from "../domain.js";

const LIBS = {
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  autotable: "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
};
const cache = {};
const loadScript = url => cache[url] || (cache[url] = new Promise((ok, fail) => {
  const el = document.createElement("script");
  el.src = url; el.onload = ok; el.onerror = () => { delete cache[url]; el.remove(); fail(new Error("load")); };
  document.head.append(el);
}));
function saveFile(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function periodData(st, from, to) {
  const txns = live(st);
  const months = F.monthsBetween(from, to, 60);
  const perMonth = months.map(m => F.monthSummary(txns, m));
  const rows = txns.filter(t => F.monthOf(t.date) >= from && F.monthOf(t.date) <= to).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const byCat = {};
  for (const s of perMonth) for (const [k, v] of Object.entries(s.byCategory)) byCat[k] = (byCat[k] || 0) + v;
  const sum = k => perMonth.reduce((a, s) => a + s[k], 0);
  return { months, perMonth, rows, byCat: Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    income: sum("income"), yields: sum("yields"), expense: sum("expense"), result: sum("result"), planned: rows.filter(t => t.status === "previsto").length };
}
const periodLabel = (from, to) => from === to ? monthLabel(from) : monthLabel(from) + " a " + monthLabel(to).toLowerCase();
const stamp = (from, to) => from === to ? from : from + "_a_" + to;

function entryRow(st, t) {
  const d = direction(t), v = txnAmount(t);
  return {
    id: t.id, data: t.date, mes: t.date.slice(0, 7), tipo: t.kind, tipoLabel: kindLabel(t), situacao: t.status,
    descricao: t.desc || "", categoria: t.categoryId ? categoryName(st, t.categoryId) : "", categoria_codigo: t.categoryId || "",
    subcategoria: t.subcategory || "", conta_cartao: whereLabel(st, t), forma_pagamento: METHOD_LABEL[t.method] || "",
    parcela: t.installment ? t.installment.n + "/" + t.installment.of : "", fatura: t.invoice || "", etiquetas: (t.tags || []).join("; "),
    valor: v / 100, valor_com_sinal: d * v / 100, data_pagamento: t.paidDate || "", vencimento: t.dueDate || "", observacao: t.notes || ""
  };
}

async function exportCsv(st, p, from, to) {
  const rows = p.rows.map(t => entryRow(st, t));
  const head = ["id", "data", "mes", "tipo", "situacao", "descricao", "categoria", "categoria_codigo", "subcategoria", "conta_cartao", "forma_pagamento", "parcela", "fatura", "etiquetas", "valor", "valor_com_sinal", "data_pagamento", "vencimento", "observacao"];
  const q = v => { const s = typeof v === "number" ? v.toFixed(2) : String(v ?? ""); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  saveFile("financeiro-lancamentos-" + stamp(from, to) + ".csv", "﻿" + [head.join(","), ...rows.map(r => head.map(k => q(r[k])).join(","))].join("\r\n"), "text/csv;charset=utf-8");
}
async function exportXlsx(st, p, from, to) {
  await loadScript(LIBS.xlsx);
  const X = window.XLSX, wb = X.utils.book_new(), money = "#,##0.00";
  const serial = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) - Date.UTC(1899, 11, 30)) / 86400000;
  const sheet = (name, header, body, formats = {}, widths = []) => {
    const ws = X.utils.aoa_to_sheet([header, ...body]);
    for (let r = 1; r <= body.length; r++) for (const [c, z] of Object.entries(formats)) { const cell = ws[X.utils.encode_cell({ r, c: +c })]; if (cell && cell.t === "n") cell.z = z; }
    ws["!cols"] = header.map((x, i) => ({ wch: widths[i] || Math.max(10, x.length + 2) }));
    if (body.length) ws["!autofilter"] = { ref: ws["!ref"] };
    X.utils.book_append_sheet(wb, ws, name);
  };
  const rows = p.rows.map(t => entryRow(st, t));
  sheet("Lançamentos", ["Data", "Tipo", "Situação", "Descrição", "Categoria", "Subcategoria", "Conta / cartão", "Pagamento", "Parcela", "Fatura", "Valor", "Valor com sinal", "Observação", "ID"],
    rows.map(r => [serial(r.data), r.tipoLabel, F.STATUS[r.situacao], r.descricao, r.categoria, r.subcategoria, r.conta_cartao, r.forma_pagamento, r.parcela, r.fatura, r.valor, r.valor_com_sinal, r.observacao, r.id]),
    { 0: "dd/mm/yyyy", 10: money, 11: money }, [12, 18, 11, 30, 20, 16, 24, 14, 8, 9, 12, 14, 30, 22]);
  sheet("Resultado por mês", ["Mês", "Receitas", "Rendimentos", "Despesas", "Resultado"], p.perMonth.map(s => [s.month, s.income / 100, s.yields / 100, s.expense / 100, s.result / 100]),
    { 1: money, 2: money, 3: money, 4: money }, [10, 14, 14, 14, 14]);
  sheet("Por categoria", ["Categoria", "Valor", "%"], p.byCat.map(([k, v]) => [categoryName(st, k), v / 100, p.expense ? Math.round(v / p.expense * 1000) / 10 : 0]), { 1: money }, [26, 14, 8]);
  X.writeFile(wb, "financeiro-" + stamp(from, to) + ".xlsx");
}
async function exportPdf(st, p, from, to) {
  await loadScript(LIBS.jspdf); await loadScript(LIBS.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40, navy = [11, 37, 64], gold = [216, 166, 78];
  doc.setFillColor(...navy); doc.rect(0, 0, W, 92, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Relatório financeiro", M, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...gold);
  doc.text(periodLabel(from, to) + "  ·  gerado em " + new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }), M, 66);
  const table = (title, head, body, opts = {}) => {
    let y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 26 : 122;
    if (y > H - 120) { doc.addPage(); y = 54; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...navy); doc.text(title, M, y);
    doc.autoTable({ startY: y + 8, head: [head], body, margin: { left: M, right: M }, theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: [225, 230, 236], textColor: [15, 30, 46] },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [244, 246, 248] }, ...opts });
  };
  const right = { halign: "right" };
  table("Resumo do período", ["Receitas", "Rendimentos", "Despesas", "Resultado", "Lançamentos"],
    [[brl(p.income), brl(p.yields), brl(p.expense), brl(p.result), String(p.rows.length)]]);
  if (p.months.length > 1) table("Resultado por mês", ["Mês", "Receitas", "Despesas", "Resultado"],
    p.perMonth.map(s => [monthLabel(s.month), brl(s.income + s.yields), brl(s.expense), brl(s.result)]), { columnStyles: { 1: right, 2: right, 3: right } });
  if (p.byCat.length) table("Despesas por categoria", ["Categoria", "Valor", "%"],
    p.byCat.map(([k, v]) => [categoryName(st, k), brl(v), p.expense ? Math.round(v / p.expense * 100) + "%" : ""]), { columnStyles: { 1: right, 2: right } });
  table("Lançamentos", ["Data", "Descrição", "Categoria", "Conta / cartão", "Situação", "Valor"],
    p.rows.map(t => { const d = direction(t); return [fmtDate(t.date), (t.desc || kindLabel(t)) + (t.installment ? " (" + t.installment.n + "/" + t.installment.of + ")" : ""),
      t.categoryId ? categoryName(st, t.categoryId) : kindLabel(t), whereLabel(st, t), F.STATUS[t.status], (d > 0 ? "+ " : d < 0 ? "- " : "") + brl(txnAmount(t))]; }),
    { columnStyles: { 0: { cellWidth: 58 }, 5: { halign: "right", cellWidth: 78 } } });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text("Meu Financeiro · " + periodLabel(from, to), M, H - 20); doc.text("Página " + i + " de " + n, W - M, H - 20, { align: "right" }); }
  doc.save("relatorio-financeiro-" + stamp(from, to) + ".pdf");
}

export function viewReports(app) {
  const st = app.store.state, ui = app.ui.report;
  if (!ui.from) { ui.to = app.ui.month; ui.from = F.addMonths(app.ui.month, -2); }
  const ok = /^\d{4}-\d{2}$/.test(ui.from) && /^\d{4}-\d{2}$/.test(ui.to) && ui.from <= ui.to;
  const p = ok ? periodData(st, ui.from, ui.to) : null;
  const monthInput = (key, label) => {
    const el = h("input", { class: "field", type: "month", id: "rep-" + key, "aria-label": label, onchange: e => { ui[key] = e.target.value; app.render(); } });
    el.value = ui[key];
    return h("label", { style: { display: "grid", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--muted)" } }, label, el);
  };
  const run = async (fn, label) => {
    if (!p || !p.rows.length) { toast("Nenhum lançamento nesse período.", "err"); return; }
    try { await fn(st, p, ui.from, ui.to); toast(label + " gerado"); }
    catch (e) { toast(e && e.message === "load" ? "Não foi possível baixar o gerador. Verifique a internet e tente de novo." : "Não foi possível gerar o arquivo.", "err"); }
  };
  return [
    h("section", { class: "card" },
      h("div", { class: "toolbar" }, monthInput("from", "De"), monthInput("to", "Até"),
        h("div", { class: "seg", style: { alignSelf: "end" } }, [["Este mês", 0, 0], ["3 meses", -2, 0], ["6 meses", -5, 0], ["12 meses", -11, 0]].map(([l, a]) =>
          h("button", { type: "button", text: l, onclick: () => { ui.to = today().slice(0, 7); ui.from = F.addMonths(ui.to, a); app.render(); } }))),
        h("span", { class: "spacer" }),
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignSelf: "end" } },
          h("button", { class: "btn primary", type: "button", onclick: () => run(exportPdf, "PDF") }, icon("report"), "PDF"),
          h("button", { class: "btn", type: "button", onclick: () => run(exportXlsx, "Excel"), text: "Excel" }),
          h("button", { class: "btn", type: "button", onclick: () => run(exportCsv, "CSV"), text: "CSV" }))),
      !ok ? h("p", { class: "form-error", text: "Escolha um período válido: o mês inicial precisa vir antes do final." }) : null),
    p ? h("div", { class: "kpis" },
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("up"), "Receitas"), h("span", { class: "v pos", text: brl(p.income + p.yields) }), h("span", { class: "d", text: p.yields ? "inclui " + brl(p.yields) + " de rendimentos" : periodLabel(ui.from, ui.to) })),
      h("div", { class: "kpi" }, h("span", { class: "k" }, icon("down"), "Despesas"), h("span", { class: "v", text: brl(p.expense) }), h("span", { class: "d", text: "já descontados os estornos" })),
      h("div", { class: "kpi hero" }, h("span", { class: "k" }, icon("chart"), "Resultado"), h("span", { class: "v", text: brl(p.result) }),
        h("span", { class: "d", text: p.planned ? p.planned + " lançamentos previstos não entram no resultado" : "somente o realizado" }))) : null,
    p ? h("div", { class: "grid2" },
      h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", { text: "Resultado por mês" })),
        h("div", { class: "table-wrap" }, h("table", { class: "t" },
          h("thead", {}, h("tr", {}, ["Mês", "Receitas", "Despesas", "Resultado"].map((l, i) => h("th", { class: i ? "r" : null, text: l })))),
          h("tbody", {}, p.perMonth.map(s => h("tr", {}, h("td", { text: monthLabel(s.month) }), h("td", { class: "r amt pos", text: brl(s.income + s.yields) }),
            h("td", { class: "r amt", text: brl(s.expense) }), h("td", { class: "r amt " + (s.result < 0 ? "neg" : ""), text: brl(s.result) }))))))),
      h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", { text: "Despesas por categoria" })),
        p.byCat.length ? h("div", { class: "table-wrap" }, h("table", { class: "t" },
          h("thead", {}, h("tr", {}, ["Categoria", "Valor", "%"].map((l, i) => h("th", { class: i ? "r" : null, text: l })))),
          h("tbody", {}, p.byCat.map(([k, v]) => h("tr", {}, h("td", { text: categoryName(st, k) }), h("td", { class: "r amt", text: brl(v) }), h("td", { class: "r", text: p.expense ? Math.round(v / p.expense * 100) + "%" : "" }))))))
          : h("p", { class: "hint", text: "Nenhuma despesa no período." }))) : null,
    h("p", { class: "hint", text: "O CSV traz um lançamento por linha, com id, datas no formato AAAA-MM-DD e valores com ponto decimal, pronto para importar em outro programa." })
  ];
}
