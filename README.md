# Sorvely Acompanhamento

App de acompanhamento da Sorvely (fábrica e loja), publicado em https://sorvelyapp.netlify.app

- `site/`: o que vai para o ar. O Netlify publica esta pasta a cada commit.
- `firestore.rules`: regras de segurança do Firestore (colar no console do Firebase quando mudarem).
- `ferramentas/app-claude.html`: código-fonte do app (mesma base da versão no Claude).
- `ferramentas/fb.js`: ligação com o Firebase (login por nome e PIN, configuração inicial, conferência de PIN).
- `ferramentas/build_fb.py`: gera `site/index.html` a partir do código-fonte.
- `ferramentas/teste/`: Firebase simulado e testes de ponta a ponta.

Para gerar o site: `python3 ferramentas/build_fb.py`
