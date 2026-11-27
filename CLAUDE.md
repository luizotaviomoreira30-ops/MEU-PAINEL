# Regras do projeto (Meu Painel + Meu Financeiro)

Valem para todo trabalho neste repositório. Leia também `docs/ARQUITETURA.md`, `docs/ROADMAP.md` e `LEIA-ME.md`.

## Tecnologia
- Sem build: HTML, CSS e JavaScript publicados como estão no GitHub Pages (branch `main`, pasta raiz). Nada de framework ou dependência nova sem perguntar ao Luiz.
- Meu Painel: `index.html` (arquivo único). Meu Financeiro: `financeiro/` (módulos ES em `js/`). Compartilhado: `shared/` (`fincore.js`, `firebase-config.js`, `login.js`).
- Nenhuma chave secreta no front-end. Não há servidor (plano Spark do Firebase).

## Dinheiro e dados
- Valores sempre em centavos inteiros. Toda regra financeira nova é função pura em `shared/fincore.js`, com teste em `tests/fincore.test.mjs`.
- Toda gravação do Financeiro passa pelo store (`financeiro/js/store.js`) e leva a entrada em `finAudit` no mesmo lote. Exclusão é lógica (`deleted: true`); nunca apagar documento.
- Coleção nova: entra em `COLS` do `store.js` (para ir no backup e no tempo real) e na tabela de dados do `docs/ARQUITETURA.md`.
- As regras do Firestore já cobrem `users/{uid}/**` (e `config/access`, a lista de pessoas liberadas). Se precisar mudar `firestore.rules`, avise o Luiz: ele publica no console do Firebase.
- Cada pessoa só vê os próprios dados (`users/{uid}`); o acesso é decidido pela lista em `config/access`, que só o dono altera.

## Telas
- Textos em português simples. Todo valor previsto ou calculado para o futuro aparece marcado como estimativa.
- Tem que funcionar no celular (testar com 390 px de largura, sem rolagem lateral).
- Nada de botão decorativo nem página vazia só para preencher o menu.

## Antes de dizer que terminou
1. `npm test` passando.
2. Suíte e2e relacionada passando (`tests/e2e/LEIA-ME.md` explica como rodar com os emuladores).
3. Item marcado como `[x]` no `docs/ROADMAP.md` e `docs/ARQUITETURA.md` atualizado.
4. Commit e push no `main`.
