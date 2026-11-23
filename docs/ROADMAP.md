# Roadmap do ecossistema

Estado real de cada parte. "Feito" = implementado, testado e publicado. Nada aqui é só desenho marcado como pronto.

## Feito

### Base comum
- [x] Motor financeiro puro `shared/fincore.js` (centavos, saldos, faturas, parcelas, recorrência, patrimônio, auditoria)
- [x] 16 testes automáticos das 12 regras financeiras (`npm test`)
- [x] Mesmo login Google e mesmas regras de acesso nos dois apps

### Meu Financeiro (`/financeiro/`)
- [x] Visão geral (patrimônio, saldos, investido, mês, gráficos, alertas, próximos 30 dias, faturas, orçamento)
- [x] Lançamentos (filtros, busca, paginação, pagar/receber, duplicar, exclusão com histórico)
- [x] Contas (incluindo dívida e externa) e extrato com saldo acumulado
- [x] Cartões, faturas por vencimento, parcelas, pagamento de fatura, estornos
- [x] Orçamento por categoria com níveis 50/75/90/100%
- [x] Contas a pagar e receber: vencidas, próximos dias, faturas em aberto, "Paguei"/"Recebi", saldo estimado depois dos pagamentos
- [x] Relatórios com exportação CSV, Excel e PDF
- [x] Configurações: categorias, integração com o Painel, importação dos gastos do Painel, backup, histórico de alterações

### Meu Painel
- [x] Menu agrupado (Visão geral, Organização, Desenvolvimento, Vida pessoal, Financeiro) e link para o Meu Financeiro
- [x] 6 indicadores na visão geral: tarefas hoje, atrasadas, compromissos, hábitos, metas, financeiro
- [x] Blocos novos: Resumo financeiro, Próximos compromissos (7 dias), Evolução da semana
- [x] Página "Resumo financeiro" (mês ao vivo, saldo, patrimônio, vencimentos, alertas, categorias, últimos lançamentos)
- [x] Gasto anotado no Painel salvo uma única vez no Financeiro, com auditoria
- [x] Aba Gastos antiga só leitura quando o Financeiro está em uso
- [x] Aniversários: lista própria, aviso no dia, próximos 30 dias, idade, lembrete de presente como tarefa
- [x] Modo foco: cronômetro por tarefa (25/50/90 ou personalizado), pausa, registro das sessões, "onde foi seu tempo" e tempo de foco na semana
- [x] Lista de compras: itens, carrinho, finalizar lançando um gasto só (no Financeiro, ou em Gastos se ainda não houver contas)
- [x] Contatos fora do menu por padrão (dados guardados; Evolução → Preferências mostra de novo)
- [x] Celular: barra com Início, Tarefas, Agenda, Compras, Finanças e "Mais" com todas as seções
- [x] Testes ponta a ponta guardados no repositório (`tests/e2e`)

## Pendente (próximas etapas)

### Ideias enviadas em 18/11 (ordem combinada)
- [ ] Categorias em dois níveis (grupo → categoria) com a lista enviada, sem perder os lançamentos atuais
- [ ] Balancete: DRE do mês, balanço patrimonial, balancete por conta e fechamento de mês
- [ ] Projeção de caixa 30/60/90/180 dias e 12 meses (sempre marcada como estimativa)
- [ ] Score de saúde financeira 0–1000 calculado com os seus dados (não é o score do Serasa)
- [ ] Conta do tipo Benefício (VA/VR), se for usada

### Meu Financeiro
- [ ] Planejamento / fluxo de caixa 30, 60, 90 e 180 dias (projeção marcada como estimativa)
- [ ] Dívidas: juros, saldo devedor, simulação de quitação
- [ ] Metas financeiras, compartilhadas com as metas do Painel sem duplicar
- [ ] Investimentos (aplicações, resgates, rendimentos por ativo; sem cotação inventada)
- [ ] Patrimônio com outros bens (imóveis, veículos)
- [ ] Inteligência financeira por regras sobre os dados reais (um assistente com IA exige servidor para guardar a chave)
- [ ] Documentos (exige Firebase Storage)
- [ ] Importação OFX/CSV e conciliação
- [ ] Fotografias mensais para reduzir leituras quando o volume crescer

### Meu Painel
- [ ] Tarefas: subtarefas, recorrência, etiquetas, projetos, favoritas, data de início
- [ ] Metas com etapas e categorias
- [ ] Hábitos: frequência por dias, sequência, pausa
- [ ] Módulos Estudos, Carreira, Projetos, Diário, Arquivo pessoal (anexos exigem Storage)
- [ ] Personalizar os blocos da visão geral
- [ ] Separar `index.html` em módulos aos poucos
