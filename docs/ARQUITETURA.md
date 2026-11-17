# Ecossistema pessoal: Meu Painel + Meu Financeiro

Documento vivo. Atualize a cada etapa. O estado de cada funcionalidade está em `docs/ROADMAP.md`.

## 1. Auditoria do que existe (17/11/2026)

### Tecnologia
| Peça | O que é hoje |
|---|---|
| Front-end | Uma página estática (`index.html`, ~3.000 linhas, HTML + CSS + JavaScript sem build) |
| Hospedagem | GitHub Pages, repositório `luizotaviomoreira30-ops/MEU-PAINEL`, branch `main`, pasta raiz |
| Login | Firebase Authentication com Google (projeto `meu-paniel`) |
| Banco | Cloud Firestore (NoSQL), plano gratuito Spark |
| Segurança | `firestore.rules`: cada conta só lê e grava `users/{uid}/**`, e só o e-mail do Luiz é aceito |
| Bibliotecas | Firebase compat 10.12.2; jsPDF, jsPDF-AutoTable e SheetJS carregadas só ao gerar relatório |
| Testes | Scripts Playwright contra o emulador do Firebase (fora do repositório, recriados a cada sessão) |

### Funcionalidades do Meu Painel (preservar)
- Visão geral: 4 cartões, captura rápida, agenda em linha do tempo, tarefas com foco do dia, progresso das metas, hábitos da semana, sua semana, falar com, anotações.
- Tarefas: lista e quadro, status, prioridade, área da vida, prazo, foco do dia (até 3), filtros e busca.
- Agenda, Metas (com histórico e meta parada), Contatos (CRM com funil), Evolução (hábitos, revisão semanal, roda da vida, backup e importação).
- Gastos: entradas e saídas, banco, forma de pagamento, parcelas, fixos, limite do mês, gráficos, categorias próprias, relatório PDF/Excel/CSV.

### Dados no Firestore (todos em `users/{uid}/`)
`tasks`, `events`, `goals`, `habits`, `habitLog/{AAAA-MM}`, `reviews/{AAAA-Www}`, `notes`, `contacts`, `cards` (quadro antigo), `settings/finance`, `expenseMonths/{AAAA-MM}/items` (gastos do Painel).

### Problemas e limites encontrados
1. **Tudo em um arquivo só.** O Painel funciona, mas cresce mal. Código novo vai em módulos; o Painel será dividido aos poucos, sem quebrar.
2. **Gastos do Painel não são contabilidade.** Não há contas com saldo, transferências, faturas de cartão ou separação entre previsto e realizado. Por isso o Meu Financeiro precisa de um modelo próprio, e não de uma adaptação da aba Gastos.
3. **Sem servidor.** GitHub Pages só serve arquivos; o plano Spark não inclui Cloud Functions. Consequências:
   - não há onde guardar chaves secretas (por exemplo, a de uma IA): **nenhuma chave vai para o front-end**;
   - regras financeiras rodam no navegador, num módulo puro e testado (`shared/fincore.js`), e a segurança dos dados fica com as regras do Firestore.
4. **Custo de leitura.** O Firestore grátis permite 50 mil leituras por dia. Carregar todos os lançamentos a cada abertura funciona por um bom tempo, mas precisará de fechamentos mensais (snapshots) quando o volume crescer. Está anotado no roadmap.

## 2. Decisões técnicas

### Banco de dados: continuar no Firestore (não migrar para PostgreSQL agora)
PostgreSQL exigiria um servidor próprio (ou Supabase), uma API autenticada, novo login e a migração de tudo. O Firestore já tem login, regras por usuário, funcionamento offline e backup, e atende bem um uso pessoal. A parte "relacional" fica em identificadores entre documentos e nas regras do módulo `fincore`, que é testado. A migração continua possível no futuro, porque toda a lógica financeira está isolada nesse módulo e não depende do Firestore.

### Dois aplicativos, um login, uma fonte de dados
- **Meu Painel**: `/MEU-PAINEL/` (arquivo `index.html`).
- **Meu Financeiro**: `/MEU-PAINEL/financeiro/`, um aplicativo separado, com identidade própria e código em módulos.
- **Mesmo endereço de origem**: quem entra no Painel já está logado no Financeiro, sem guardar senha em lugar nenhum.
- **Fonte única**: os lançamentos ficam só em `finTxns`. O Painel lê o resumo que o Financeiro publica e grava despesas novas direto em `finTxns`, sem banco paralelo.

### Estrutura de pastas
```
index.html                 Meu Painel (será modularizado aos poucos)
shared/
  firebase-config.js       configuração pública do Firebase e e-mail autorizado
  fincore.js               regras financeiras puras (sem Firebase), usadas pelos dois apps e pelos testes
financeiro/
  index.html               casca do Meu Financeiro
  css/financeiro.css       identidade visual (navy, branco, cinza, dourado)
  js/main.js               login, rotas e inicialização
  js/store.js              acesso ao Firestore com trilha de auditoria
  js/ui.js                 componentes (formulários, toasts, tabelas, formatação)
  js/charts.js             gráficos em SVG
  js/views/*.js            uma tela por módulo
tests/fincore.test.mjs     testes automáticos das regras financeiras (node --test)
docs/                      este documento e o roadmap
```

## 3. Modelo de dados do Meu Financeiro (`users/{uid}/…`)

Todo valor monetário é gravado em **centavos inteiros**, para não haver erro de arredondamento.

| Coleção | Conteúdo |
|---|---|
| `finAccounts` | contas: nome, instituição, tipo (`corrente`, `poupanca`, `dinheiro`, `investimento`, `divida`, `externo`), saldo inicial, data de abertura, cor, status |
| `finCards` | cartões: nome, instituição, bandeira, limite, dia de fechamento, dia de vencimento, conta de pagamento, status |
| `finTxns` | lançamentos (ver tipos abaixo) |
| `finCategories` | categorias de receita e despesa, personalizáveis, com subcategorias |
| `finBudgets/{AAAA-MM}` | limites por categoria no mês |
| `finRecurring` | regras de repetição (lançamentos fixos) |
| `finAudit` | trilha de auditoria: quem, quando, o quê, antes e depois |
| `finSettings/main` | preferências, compartilhamento com o Painel, migração |
| `finShare/summary` | resumo publicado para o Meu Painel (só os campos liberados) |

### Tipos de lançamento e efeito em cada saldo
| Tipo | Conta | Cartão | Receita/Despesa do mês |
|---|---|---|---|
| `receita` | + valor | — | receita |
| `despesa` em conta | − valor | — | despesa |
| `despesa` no cartão | — | + dívida do cartão | despesa **na data da compra** |
| `transferencia` | origem −, destino + | — | **nenhum** |
| `pagamento_fatura` | origem − | − dívida do cartão | **nenhum** |
| `estorno` | + valor (ou − dívida do cartão) | idem | reduz a despesa da categoria |
| `ajuste` | ± diferença | — | nenhum |
| `rendimento` | + valor (normalmente em conta de investimento) | — | classificação própria: rendimentos |

- **Previsto × efetivado:** só lançamentos com `status = efetivado` mexem em saldo e em "realizado". Os previstos aparecem no planejamento.
- **Parcelas:** uma compra em N vezes vira N lançamentos com o mesmo `installment.group`. Todos têm a data da compra (despesa reconhecida na compra) e cada um tem a sua `invoice` (mês da fatura em que cai).
- **Fatura:** é identificada pelo mês de **vencimento**. Compra no dia do fechamento ou depois vai para a fatura seguinte.
- **Investir dinheiro:** aplicação é transferência para uma conta do tipo `investimento`; resgate é transferência de volta (`subtype: resgate`); rendimento é `rendimento`.
- **Dívidas:** contas do tipo `divida` têm saldo negativo, que é o valor devido. Receber o empréstimo é transferência da dívida para a conta; pagar a parcela é transferência da conta para a dívida.
- **Patrimônio líquido:** soma dos saldos das contas (dívidas entram negativas) menos a dívida dos cartões. Contas do tipo `externo` ficam fora.
- **Exclusão:** é lógica (`deleted: true`). O registro continua guardado e a auditoria registra o antes e o depois.
- **Recorrência:** cada ocorrência tem um id determinístico (`<regra>_<AAAA-MM>`), e a criação só acontece se o documento ainda não existir, o que impede lançamentos duplicados.

## 4. Integração Painel ↔ Financeiro
- O Financeiro publica `finShare/summary` com os campos que você liberar (saldo, receitas, despesas, resultado, patrimônio, vencimentos, alertas), mais a data de atualização.
- O Painel lê esse resumo e mostra "atualizado há X". Os números do mês o Painel calcula na hora, a partir dos lançamentos do mês, com o mesmo `fincore`.
- Uma despesa lançada pela captura rápida do Painel é gravada **uma vez**, em `finTxns`.
- Desativar o compartilhamento apaga o resumo publicado e faz o Painel parar de mostrar os dados financeiros.
- Os gastos antigos do Painel (`expenseMonths`) são **copiados** para `finTxns` por um botão no Financeiro. Os originais não são apagados, e cada cópia tem um id fixo (`painel_<mês>_<id>`), então repetir a importação não duplica nada.

### Como ficou implementado (Etapa C)
- `index.html` carrega `shared/fincore.js` como módulo (`window.FinCore`): o Painel usa as mesmas regras do Financeiro para o mês e para a fatura do cartão.
- Leituras do Painel: `finSettings/main`, `finShare/summary`, `finAccounts`, `finCards`, `finCategories` e, só com o campo "mês" liberado, `finTxns` do mês atual e do anterior (consulta por `date`).
- **Modo Financeiro**: liga quando existe ao menos uma conta (corrente, poupança ou dinheiro) ou um cartão ativo no Financeiro. A partir daí:
  - a captura rápida "Gasto" grava em `finTxns` (`source: "painel"`), com a entrada de `finAudit` no mesmo lote;
  - a aba Gastos vira "Gastos antigos", só leitura, com o caminho para importar o histórico;
  - "Gastos na semana" vem de `finTxns`.
- Saldo e patrimônio vêm do resumo publicado. Gastos anotados no Painel **depois** da última publicação são descontados na tela (sabemos exatamente quais são) até o Financeiro republicar.
- Sem contas no Financeiro, o Painel continua com a aba Gastos como antes (nada é perdido nem bloqueado).
