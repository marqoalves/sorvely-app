/* Sorvely: ligação do app com o Firebase (login por nome e PIN, banco Firestore, downloads). */
(function(){
"use strict";
const CFG = window.FIREBASE_CONFIG;
const DOM = "sorvely.app";
const senha = pin => "Sorvely#" + pin + "#pin";
const slug = n => String(n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const rnd = () => Math.random().toString(36).slice(2,8);
const novoEmail = s => s + "--" + rnd() + "@" + DOM;
const slugDoEmail = e => String(e||"").split("--")[0];
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const COLS = ["config","usuarios","acoes","trilha","indicadores","lancamentos","propostas","solicitacoes","ordens","produtos","caixas","entregas","temperaturas","equipamentos","estoque","estoqueMov","historico","vendasProduto","ponto","comunicados","ciencias","checklists"];

if(!CFG || !CFG.apiKey){ document.addEventListener("DOMContentLoaded",()=>tela(`<h2>Falta configurar</h2><p class="hint">O arquivo firebase-config.js ainda não tem os dados do projeto Firebase.</p>`)); return; }

firebase.initializeApp(CFG);
const auth = firebase.auth();
const fs = firebase.firestore();
/* Sem cache local (IndexedDB trava em alguns iPhones). Long polling automático para redes que bloqueiam streaming. */
try{ fs.settings({experimentalAutoDetectLongPolling:true, merge:true}); }catch(e){}
/* Leitura com prazo: se o servidor não responder, mostra mensagem em vez de travar */
function comPrazo(p,ms){ return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>{const e=new Error("tempo esgotado");e.code="timeout";rej(e);},ms||12000))]); }
function semConexao(){
  tela(`<div class="fb-logo">Sorvely</div><h2>Sem conexão com o servidor</h2>
    <p class="hint">Não consegui falar com o banco de dados. Confira a internet (Wi-Fi ou dados móveis) e tente de novo.</p>
    <p><button class="btn" onclick="location.reload()">Tentar de novo</button></p>`);
}
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

let avisoLogin="", liberar, liberado=false, emProcesso=false, setupConcluido=false;
const pronto = new Promise(r=>liberar=r);

/* Conta secundária: cria login de outra pessoa sem derrubar quem está usando o app */
let sec=null;
function authSec(){ if(!sec){ sec=firebase.initializeApp(CFG,"sec").auth(); sec.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(()=>{}); } return sec; }
async function criarConta(s,pin){
  const a=authSec(), email=novoEmail(s);
  await a.createUserWithEmailAndPassword(email,senha(pin));
  await a.signOut();
  return email;
}

window.claude = { use: async cap => {
  await pronto;
  if(cap==="db") return fs;
  if(cap==="user") return { id: async()=>auth.currentUser&&auth.currentUser.uid, isOwner:()=>false, can: async()=>true };
  if(cap==="downloads") return { save: async({filename,data})=>{
    const url=URL.createObjectURL(new Blob([data])); const a=document.createElement("a");
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  }};
  return null;
}};

window.FB = {
  sair(){ try{localStorage.removeItem("sorvely_sessao");}catch(e){} auth.signOut().finally(()=>location.reload()); },
  /* Confere o PIN de outra pessoa (checklist) sem trocar quem está logado */
  async conferir(slugAlvo,pin){
    const l=await fs.doc("login/"+slugAlvo).get(); if(!l.exists) return false;
    const a=authSec();
    try{ await a.signInWithEmailAndPassword(l.data().authEmail,senha(pin)); await a.signOut(); return true; }
    catch(e){ return false; }
  },
  /* Chamado pelo app sempre que um PIN é criado ou trocado */
  async novoPin(pin,alvo){
    const s=alvo._doc, meu=slugDoEmail(auth.currentUser&&auth.currentUser.email);
    emProcesso=true;
    try{
      const email=await criarConta(s,pin);
      await fs.doc("login/"+s).set({authEmail:email});
      if(s===meu) await auth.signInWithEmailAndPassword(email,senha(pin));
    } finally { emProcesso=false; }
    return {pinMudouEm:Date.now()};
  }
};

/* ---------- Telas antes do app ---------- */
function tela(html){
  let g=document.getElementById("fbGate");
  if(!g){ g=document.createElement("div"); g.id="fbGate"; document.body.appendChild(g); }
  g.innerHTML=`<div class="fb-box card">${html}</div>`;
  g.hidden=false; return g;
}
function fecharTela(){ const g=document.getElementById("fbGate"); if(g)g.remove(); }
const est=document.createElement("style");
est.textContent=`#fbGate{position:fixed;inset:0;z-index:9999;background:var(--bg,#f5f3f7);display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px;overflow:auto}
#fbGate .fb-box{width:100%;max-width:420px}#fbGate h2{margin:0 0 6px}#fbGate .field{margin:12px 0}#fbGate select,#fbGate input{width:100%}
#fbGate .fb-logo{font-weight:700;font-size:1.4rem;margin-bottom:10px}#fbGate table{width:100%;border-collapse:collapse;margin:10px 0}#fbGate td,#fbGate th{border-bottom:1px solid var(--line,#ddd);padding:6px;text-align:left}
#fbGate .fb-pin{font-family:monospace;font-size:1.1rem;font-weight:700}`;
document.head.appendChild(est);

async function telaLogin(){
  let lista=[];
  try{ const d=await comPrazo(fs.doc("publico/login").get()); lista=(d.exists&&d.data().lista)||[]; }catch(e){ if(e.code==="timeout"||e.code==="unavailable") return semConexao(); }
  const g=tela(`<div class="fb-logo">Sorvely</div><h2>Entrar</h2><p class="hint">Selecione seu nome e digite seu PIN.</p>
    <form id="fbLg"><div class="field"><label for="fbU">Usuário</label><select id="fbU" required><option value="">Selecione seu nome</option>${lista.map(p=>`<option value="${esc(p.slug)}">${esc(p.nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="fbP">PIN</label><input id="fbP" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" required></div>
    <p class="err-msg" id="fbE" hidden></p><button class="btn" id="fbB">Entrar</button></form>`);
  const f=g.querySelector("#fbLg"), err=g.querySelector("#fbE"), b=g.querySelector("#fbB");
  const falha=m=>{err.textContent=m;err.hidden=false;b.disabled=false;b.textContent="Entrar";};
  if(avisoLogin){ err.textContent=avisoLogin; err.hidden=false; avisoLogin=""; }
  f.onsubmit=async ev=>{
    ev.preventDefault(); err.hidden=true;
    const s=g.querySelector("#fbU").value, pin=g.querySelector("#fbP").value.trim();
    if(!s)return falha("Escolha seu nome."); if(!/^\d{4,6}$/.test(pin))return falha("O PIN tem de 4 a 6 números.");
    b.disabled=true; b.textContent="Entrando...";
    try{
      const l=await comPrazo(fs.doc("login/"+s).get());
      if(!l.exists)return falha("Esse usuário ainda não tem acesso. Fale com o Marco.");
      await auth.signInWithEmailAndPassword(l.data().authEmail,senha(pin));
    }catch(e){
      g.querySelector("#fbP").value="";
      const c=e&&e.code||"";
      if(c.includes("too-many-requests"))return falha("Muitas tentativas erradas. Espere alguns minutos e tente de novo.");
      if(c.includes("network")||c==="timeout"||c==="unavailable")return falha("Sem conexão com o servidor agora. Confira a internet e tente de novo.");
      return falha("PIN incorreto.");
    }
  };
}

async function entrarNoApp(u){
  const s=slugDoEmail(u.email);
  let ok=false, nome="", trocar=false;
  try{
    const [l,p]=await comPrazo(Promise.all([fs.doc("login/"+s).get(), fs.doc("usuarios/"+s).get()]));
    ok = l.exists && l.data().authEmail===u.email && p.exists && p.data().ativo!==false;
    if(ok){ nome=p.data().nome; trocar=!!p.data().trocarPin; }
    if(ok && p.data().nivel==="Liderança") sincronizarLista();
  }catch(e){ if(e.code==="timeout"||e.code==="unavailable") return semConexao(); ok=false; }
  if(!ok){ avisoLogin="Seu acesso foi trocado ou desativado. Se precisar, fale com o Marco."; await auth.signOut(); return; }
  const horas=(typeof SESSAO_HORAS!=="undefined"?SESSAO_HORAS:12);
  const atual=JSON.parse(localStorage.getItem("sorvely_sessao")||"null");
  if(!(atual&&atual.nome===nome&&atual.exp>Date.now())) localStorage.setItem("sorvely_sessao",JSON.stringify({nome,inicio:Date.now(),exp:Date.now()+horas*3600e3}));
  fecharTela(); liberado=true; liberar();
  if(trocar){ const t=setInterval(()=>{ try{ if(typeof S!=="undefined"&&S.eu===nome&&S.usuarios.length){ clearInterval(t); trocarPin(true); } }catch(e){} },300); setTimeout(()=>clearInterval(t),30000); }
}

/* A Liderança mantém a lista pública de nomes da tela de entrada */
function sincronizarLista(){
  fs.collection("usuarios").onSnapshot(sn=>{
    const lista=sn.docs.map(d=>({slug:d.id,...d.data()})).filter(u=>u.ativo!==false)
      .sort((a,b)=>(a.ordem??99)-(b.ordem??99)||String(a.nome).localeCompare(b.nome)).map(u=>({slug:u.slug,nome:u.nome}));
    fs.doc("publico/login").get().then(d=>{ if(!d.exists||JSON.stringify(d.data().lista)!==JSON.stringify(lista)) fs.doc("publico/login").set({lista}); }).catch(()=>{});
  },()=>{});
}

/* ---------- Configuração inicial: importa o backup do app antigo ---------- */
/* O Firestore não aceita lista dentro de lista: as vendas por produto viram objetos */
function paraFirestore(c,d){
  if(c==="vendasProduto"&&Array.isArray(d.itens)){
    const F=d.fams||[];
    d={...d,itens:d.itens.map(i=>Array.isArray(i)?{nome:i[0],und:i[1],q:i[2],v:i[3],familia:F[i[4]]||"Outros"}:i)};
  }
  const fix=(x,emLista)=>Array.isArray(x)?(emLista?Object.fromEntries(x.map((v,k)=>[String(k),fix(v,false)])):x.map(v=>fix(v,true)))
    :(x&&typeof x==="object")?Object.fromEntries(Object.entries(x).filter(([k])=>k!=="").map(([k,v])=>[k,fix(v,false)])):x;
  return fix(d,false);
}
function pinProvisorio(){
  for(;;){ const p=String(Math.floor(1000+Math.random()*9000));
    if(!/^(\d)\1+$/.test(p)&&!"0123456789".includes(p)&&!"9876543210".includes(p)) return p; }
}
async function telaSetup(){
  const g=tela(`<div class="fb-logo">Sorvely</div><h2>Configuração inicial</h2>
    <p class="hint">Escolha o arquivo de backup baixado do app antigo (Usuários > Baixar backup).</p>
    <div class="field"><input type="file" id="fbF" accept=".json,application/json"></div>
    <div id="fbS2" hidden>
      <p class="hint" id="fbInfo"></p>
      <div class="field"><label for="fbQ">Quem é você?</label><select id="fbQ"></select></div>
      <div class="field"><label for="fbN">Crie seu PIN (6 números recomendado)</label><input id="fbN" type="password" inputmode="numeric" maxlength="6"></div>
      <button class="btn" id="fbI">Importar e criar acessos</button>
    </div>
    <p class="err-msg" id="fbE" hidden></p><p class="hint" id="fbProg"></p>`);
  let bk=null;
  const err=m=>{const e=g.querySelector("#fbE");e.textContent=m;e.hidden=!m;};
  g.querySelector("#fbF").onchange=async ev=>{
    err("");
    try{ bk=JSON.parse(await ev.target.files[0].text()); if(!bk||!bk.dados||!bk.dados.usuarios)throw 0; }
    catch(e){ bk=null; return err("Esse arquivo não é um backup do app Sorvely."); }
    const us=Object.entries(bk.dados.usuarios), lid=us.filter(([,u])=>u.nivel==="Liderança"&&u.ativo!==false);
    const n=Object.values(bk.dados).reduce((s,c)=>s+Object.keys(c).length,0);
    g.querySelector("#fbInfo").textContent=`Backup de ${String(bk.em||"").slice(0,10)}: ${n} registros e ${us.filter(([,u])=>u.ativo!==false).length} usuários ativos.`;
    g.querySelector("#fbQ").innerHTML=lid.map(([id,u])=>`<option value="${esc(id)}">${esc(u.nome)}</option>`).join("");
    g.querySelector("#fbS2").hidden=false;
  };
  g.querySelector("#fbI").onclick=async()=>{
    err(""); const eu=g.querySelector("#fbQ").value, pin=g.querySelector("#fbN").value.trim();
    if(!eu)return err("Escolha seu nome.");
    if(!/^\d{4,6}$/.test(pin)||/^(\d)\1+$/.test(pin)||"0123456789".includes(pin)||"9876543210".includes(pin))return err("Use um PIN de 4 a 6 números, sem sequências ou números repetidos.");
    const btn=g.querySelector("#fbI"); btn.disabled=true;
    const prog=t=>g.querySelector("#fbProg").textContent=t;
    emProcesso=true;
    try{
      prog("Criando seu acesso...");
      const meuEmail=novoEmail(eu);
      await auth.createUserWithEmailAndPassword(meuEmail,senha(pin));
      await fs.doc("login/"+eu).set({authEmail:meuEmail});
      const agora=Date.now(), provis=[];
      const us=bk.dados.usuarios;
      for(const [id,u] of Object.entries(us)){
        delete u.pinHash; delete u.pinSalt;
        if(id===eu){ u.trocarPin=false; u.pinMudouEm=agora; continue; }
        if(u.ativo===false) continue;
        prog("Criando acesso de "+u.nome+"...");
        const p=pinProvisorio(); const email=await criarConta(id,p);
        await fs.doc("login/"+id).set({authEmail:email});
        u.trocarPin=true; u.pinMudouEm=agora; provis.push([u.nome,p]);
      }
      let ops=[]; for(const c of COLS) for(const [id,d] of Object.entries(bk.dados[c]||{})) ops.push([c+"/"+id,paraFirestore(c,d)]);
      for(let i=0;i<ops.length;i+=400){
        const b=fs.batch(); ops.slice(i,i+400).forEach(([p,d])=>b.set(fs.doc(p),d)); await b.commit();
        prog(`Copiando dados... ${Math.min(i+400,ops.length)} de ${ops.length}`);
      }
      const lista=Object.entries(us).filter(([,u])=>u.ativo!==false).sort((a,b)=>(a[1].ordem??99)-(b[1].ordem??99)||String(a[1].nome).localeCompare(b[1].nome)).map(([s,u])=>({slug:s,nome:u.nome}));
      await fs.doc("publico/login").set({lista});
      setupConcluido=true;
      await fs.doc("publico/setup").set({feitoEm:new Date().toISOString(),por:us[eu].nome,registros:ops.length});
      tela(`<div class="fb-logo">Sorvely</div><h2>Pronto</h2><p class="hint">${ops.length} registros copiados. Anote os PINs provisórios abaixo e entregue a cada pessoa. Eles não ficam salvos em lugar nenhum, e cada pessoa cria o próprio PIN no primeiro acesso.</p>
        <table><tr><th>Pessoa</th><th>PIN provisório</th></tr>${provis.map(([n,p])=>`<tr><td>${esc(n)}</td><td class="fb-pin">${p}</td></tr>`).join("")}</table>
        <button class="btn" onclick="location.reload()">Abrir o app</button>`);
    }catch(e){ console.error(e); err("Parou com erro: "+(e&&(e.code||e.message)||e)+". Fale com o Marco antes de tentar de novo."); btn.disabled=false; }
    finally{ emProcesso=false; }
  };
}

if(document.body) tela('<div class="fb-logo">Sorvely</div><p class="hint">Carregando…</p>');
else document.addEventListener("DOMContentLoaded",()=>{ if(!liberado&&!document.getElementById("fbGate")) tela('<div class="fb-logo">Sorvely</div><p class="hint">Carregando…</p>'); });
auth.onAuthStateChanged(async u=>{
  if(emProcesso||setupConcluido) return;
  if(liberado){ if(!u) location.reload(); return; }
  let feito=true;
  try{ feito=(await comPrazo(fs.doc("publico/setup").get())).exists; }catch(e){ if(e.code==="timeout"||e.code==="unavailable") return semConexao(); }
  if(u){ if(!feito){ await auth.signOut(); return; } return entrarNoApp(u); }
  if(feito) telaLogin(); else telaSetup();
});
})();
