# Meu Painel + Meu Financeiro

Painel pessoal (tarefas, foco, agenda, metas, hábitos, aniversários, lista de compras) e o Meu Financeiro (contas, cartões, lançamentos, orçamento, relatórios).

- **Site:** GitHub Pages (este repositório, branch `main`, pasta raiz). O Financeiro fica em `/financeiro/`.
- **Dados:** Firebase do projeto `meu-paniel` (Firestore). Cada pessoa tem a própria pasta `users/<uid>/…`.
- **Login:** Google. Quem pode entrar:
  - o dono (e-mail definido em `firestore.rules` e em `shared/firebase-config.js`);
  - as pessoas que o dono liberar no painel, em **Evolução → Pessoas com acesso** (lista guardada em `config/access`).
- Ninguém lê os dados de outra pessoa, nem o dono. Remover alguém tira o acesso, mas não apaga os dados dessa pessoa.

O código é público, mas os dados não: as regras do Firestore conferem o login em cada leitura e gravação.

## Regras do banco
`firestore.rules` precisa estar publicado no console do Firebase: **Firestore Database → Regras**, colar o arquivo inteiro e clicar em **Publicar**. Sempre que esse arquivo mudar, repita.

## Backup
No painel: **Evolução → Exportar backup** baixa um `.json` com os seus dados. **Importar backup** traz de volta o que estiver faltando, sem apagar nada.

## Arquivos
- `index.html`: o Meu Painel inteiro (HTML, CSS e JavaScript).
- `financeiro/`: o Meu Financeiro (módulos em `js/`).
- `shared/`: regras financeiras (`fincore.js`) e configuração do Firebase, usadas pelos dois.
- `tests/`: testes das regras financeiras (`npm test`) e de ponta a ponta (`tests/e2e`).
- `docs/`: arquitetura e roadmap.
