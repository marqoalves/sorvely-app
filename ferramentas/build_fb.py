"""Gera site/index.html (versão Firebase) a partir de ferramentas/app-claude.html."""
import os, re, shutil, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(R,'ferramentas','app-claude.html'), encoding='utf8').read()

def troca(velho, novo, n=1):
    global src
    c = src.count(velho)
    if c != n:
        sys.exit(f'Esperava {n} ocorrência(s), achei {c}: {velho[:70]!r}')
    src = src.replace(velho, novo)

# 1. Carrega Firebase e a ligação antes do script do app
import datetime
VERSAO = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
head = ('<meta name="sorvely-versao" content="' + VERSAO + '">'
        '<link rel="manifest" href="manifest.json"><meta name="theme-color" content="#5c2a6e">'
        '<link rel="apple-touch-icon" href="icone-192.png">'
        '<script src="firebase-config.js"></script>'
        '<script src="sdk/firebase-app-compat.js"></script><script src="sdk/firebase-auth-compat.js"></script>'
        '<script src="sdk/firebase-firestore-compat.js"></script><script src="fb.js"></script>\n')
i = src.find('<script>')
src = src[:i] + head + src[i:]

# 2. Entrar e sair passam pela tela do Firebase
troca('function entrar(obrigatorio){', 'function entrar(obrigatorio){ if(window.FB){FB.sair();return;}')
troca('function sair(){', 'function sair(){ if(window.FB){FB.sair();return;}')

# 3. PIN vira senha da conta Firebase (sem guardar hash no banco)
troca('async function dadosPin(pin){', 'async function dadosPin(pin,alvo){ if(window.FB)return FB.novoPin(pin,alvo);')
troca('const dp=await dadosPin(pin); renovarSessao(dp.pinMudouEm);', 'const dp=await dadosPin(pin,p); renovarSessao(dp.pinMudouEm);')
troca('...await dadosPin(pin)}),"Usuário "+nome', '...await dadosPin(pin,{_doc:id,nome})}),"Usuário "+nome')
troca('const dp=await dadosPin(pin); if(u.nome===S.eu)', 'const dp=await dadosPin(pin,u); if(u.nome===S.eu)')
troca("!u.pinHash?'<span class=\"pill p-bad\">sem PIN</span>'", "!(u.pinHash||u.pinMudouEm)?'<span class=\"pill p-bad\">sem PIN</span>'")

# 4. Mensagens que falavam do Claude
troca('if(e&&e.code==="invalid_argument"){', 'if(e&&e.code==="permission-denied"){ toast("Você não tem permissão para fazer isso."); }\n    else if(e&&e.code==="invalid_argument"){')
troca('Não consegui conectar ao banco de dados. Entre na sua conta Claude para ver e lançar os dados.', 'Não consegui conectar ao banco de dados. Confira a internet e abra o app de novo.')


# 6. Firebase só avisa "veio do servidor" se o app pedir as mudanças de metadados
troca('  return S.db.collection(col).onSnapshot(snap=>{', '  return S.db.collection(col).onSnapshot({includeMetadataChanges:true},snap=>{')
troca('un=S.db.collection(c).onSnapshot(sn=>{', 'un=S.db.collection(c).onSnapshot({includeMetadataChanges:true},sn=>{')

# 7. Não mostrar "Não consegui conectar" antes de a conexão terminar de abrir
troca('if(!S.db) top+=`<div class="banner err">', 'if(!S.db&&S.tentouDb) top+=`<div class="banner err">')
troca('  S.db=db; S.user=user;', '  S.db=db; S.user=user; S.tentouDb=true;')

open(os.path.join(R,'site','index.html'), 'w', encoding='utf8').write(src)
shutil.copy(os.path.join(R,'ferramentas','fb.js'), os.path.join(R,'site','fb.js'))
print('ok', len(src))
