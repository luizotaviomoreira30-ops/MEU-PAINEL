# Testes ponta a ponta

Rodam os dois apps num navegador de verdade contra os emuladores do Firebase (nada toca no banco real).

1. Emuladores: `npx firebase-tools emulators:start --only auth,firestore --project meu-paniel`
2. Servidor estático na raiz do projeto: `python3 -m http.server 5055 --bind 127.0.0.1`
3. SDK do Firebase local: `npm i --no-save firebase@10.12.2 playwright`
4. `npm run test:e2e` (ou uma suíte: `node tests/e2e/novos.cjs`)

Suítes: `basico` (todas as páginas e ações do dia a dia), `integ` (Painel ↔ Financeiro), `bills` (contas a pagar e receber), `novos` (aniversários, modo foco, lista de compras, menu do celular), `acesso` (mais de uma pessoa, lista de acesso e regras do banco).
As regras financeiras têm testes próprios, sem navegador: `npm test`.
