# Painel Luiz Otávio

Painel pessoal: tarefas, foco do dia, agenda, gastos, metas, hábitos, contatos e revisão semanal.

- **Site:** GitHub Pages (este repositório, branch `main`, pasta raiz).
- **Dados:** Firebase do projeto `meu-paniel` (Firestore), em `users/<uid>/…`.
- **Login:** Google. As regras em `firestore.rules` só liberam a conta luizotaviomoreira30@gmail.com.

O código é público, mas os dados não: ficam no Firestore e só a conta autorizada lê e grava.

## Backup
No painel: **Evolução → Exportar backup** baixa um `.json` com tudo. **Importar backup** traz de volta o que estiver faltando, sem apagar nada.

## Arquivos
- `index.html`: o painel inteiro (HTML, CSS e JavaScript).
- `firestore.rules`: regras de segurança do banco. Se mudar, cole no console do Firebase (Firestore → Regras) e publique.
- `manifest.webmanifest` e `icon-*.png`: ícone para adicionar à tela inicial do celular.
- `firebase.json` e `.firebaserc`: só usados se um dia publicar pelo Firebase Hosting.
