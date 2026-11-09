/* Firebase simulado para teste local. Guarda tudo no localStorage e aplica uma cópia das regras do firestore.rules. */
(function(){
const LS="__mockfb";
const st=JSON.parse(localStorage.getItem(LS)||'{"accounts":{},"docs":{},"cur":null}');
const save=()=>localStorage.setItem(LS,JSON.stringify(st));
window.__mockfb=st;
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const err=c=>{const e=new Error(c);e.code=c;return e;};
const later=f=>setTimeout(f,5);

/* ---- Regras (cópia em JS do firestore.rules) ---- */
function rules(authU,op,path,novo){
  const g=p=>st.docs[p];
  const seg=path.split("/");
  const logado=!!(authU&&authU.email);
  const setupFeito=!!g("publico/setup");
  const meuSlug=logado?authU.email.split("--")[0]:null;
  const eu=()=>g("usuarios/"+meuSlug)||{};
  const membro=()=>logado&&setupFeito&&(g("login/"+meuSlug)||{}).authEmail===authU.email&&eu().ativo!==false;
  const lider=()=>membro()&&eu().nivel==="Liderança";
  const emSetup=()=>logado&&!setupFeito;
  const leitura=op==="get"||op==="list";
  const atual=g(path);
  if(seg.length===4&&seg[0]==="data"&&seg[1]==="users"&&seg[3]==="sessao") return !!authU&&authU.uid===seg[2];
  if(seg.length!==2) return false;
  const [col,id]=seg;
  if(col==="publico") return leitura||lider()||emSetup();
  if(col==="login"){
    if(leitura)return true;
    if(op==="create"||op==="delete")return lider()||emSetup();
    return lider()||emSetup()||(membro()&&id===meuSlug&&Object.keys(novo).every(k=>k==="authEmail"));
  }
  if(col==="usuarios"){
    if(leitura)return membro()||emSetup();
    if(op==="create"||op==="delete")return lider()||emSetup();
    const mud=Object.keys({...atual,...novo}).filter(k=>JSON.stringify((atual||{})[k])!==JSON.stringify(novo[k]));
    return lider()||emSetup()||(membro()&&id===meuSlug&&mud.every(k=>["ultimoAcesso","trocarPin","pinMudouEm"].includes(k)));
  }
  if(col==="ponto") return lider()||emSetup();
  if(col==="comunicados") return leitura?(membro()||emSetup()):(lider()||emSetup());
  if(col==="ciencias"){ if(leitura)return membro()||emSetup(); if(op==="create")return emSetup()||lider()||(membro()&&novo.nome===eu().nome); return lider()||emSetup(); }
  if(col==="caixas") return emSetup()||lider()||(membro()&&(eu().rotinas||[]).includes("caixa"));
  if(col==="data") return false;
  return membro()||emSetup();
}

/* ---- Auth ---- */
const apps={};
function mkAuth(nome){
  const a={_nome:nome,currentUser:nome==="[DEFAULT]"&&st.cur?{...st.cur}:null,_ls:[],_persist:nome==="[DEFAULT]"};
  const set=u=>{a.currentUser=u; if(a._persist){st.cur=u;save();} a._ls.forEach(f=>later(()=>f(u)));};
  a.setPersistence=()=>Promise.resolve();
  a.onAuthStateChanged=f=>{a._ls.push(f);later(()=>f(a.currentUser));return()=>{};};
  a.signInWithEmailAndPassword=async(e,p)=>{const c=st.accounts[e];if(!c||c.pw!==p){st.falhas=(st.falhas||0)+1;save();throw err("auth/invalid-credential");}set({uid:c.uid,email:e});return {user:a.currentUser};};
  a.createUserWithEmailAndPassword=async(e,p)=>{if(st.accounts[e])throw err("auth/email-already-in-use");if(p.length<6)throw err("auth/weak-password");st.accounts[e]={pw:p,uid:"uid_"+Math.random().toString(36).slice(2,10)};save();set({uid:st.accounts[e].uid,email:e});return {user:a.currentUser};};
  a.signOut=async()=>set(null);
  return a;
}
function app(nome){ if(!apps[nome])apps[nome]={name:nome,_auth:mkAuth(nome),auth(){return this._auth;}}; return apps[nome]; }

/* ---- Firestore ---- */
const subs=[];
const fire=()=>later(()=>subs.slice().forEach(f=>f()));
const quem=()=>app("[DEFAULT]")._auth.currentUser;
function chk(op,path,novo){ if(!rules(quem(),op,path,novo)) throw err("permission-denied"); }
function snapDoc(path){const d=st.docs[path];const id=path.split("/").pop();return {id,exists:!!d,data:()=>clone(d),metadata:{fromCache:false}};}
function D(path){ const id=path.split("/").pop(); return {
  id,path,
  get:async()=>{chk("get",path);return snapDoc(path);},
  set:async(d)=>{const ruim=(x,l)=>Array.isArray(x)?(l||x.some(v=>ruim(v,true))):(x&&typeof x==="object")?Object.values(x).some(v=>ruim(v,false)):false; if(ruim(d,false))throw err("invalid-argument");chk(st.docs[path]?"update":"create",path,d);st.docs[path]=clone(d);save();fire();},
  update:async(d)=>{if(!st.docs[path])throw err("not-found");const n={...st.docs[path],...clone(d)};chk("update",path,n);st.docs[path]=n;save();fire();},
  delete:async()=>{chk("delete",path);delete st.docs[path];save();fire();},
  onSnapshot(cb,eb){let viva=true;const run=()=>{if(!viva)return;try{chk("get",path);cb(snapDoc(path));}catch(e){viva=false;eb&&eb(e);}};subs.push(run);later(run);return()=>{viva=false;};}
};}
function Q(col,filtros=[]){ return {
  where:(f,op,v)=>Q(col,[...filtros,[f,op,v]]), orderBy:()=>Q(col,filtros), limit:()=>Q(col,filtros),
  doc:(id)=>D(col+"/"+(id||("n"+Math.random().toString(36).slice(2,12)))),
  add:async(d)=>{const r=D(col+"/n"+Math.random().toString(36).slice(2,12));await r.set(d);return r;},
  _docs(){return Object.keys(st.docs).filter(p=>p.startsWith(col+"/")&&p.split("/").length===col.split("/").length+1).map(snapDoc)
    .filter(s=>filtros.every(([f,op,v])=>{const x=s.data()[f];return op===">="?x>=v:op==="=="?x===v:op==="<="?x<=v:true;}));},
  get:async function(){chk("list",col+"/x");return {docs:this._docs(),metadata:{fromCache:false}};},
  onSnapshot(cb,eb){if(cb&&typeof cb==='object'&&!cb.docs){cb=eb;eb=arguments[2];}let viva=true;const self=this;const run=()=>{if(!viva)return;try{chk("list",col+"/x");cb({docs:self._docs(),metadata:{fromCache:false}});}catch(e){viva=false;eb&&eb(e);}};subs.push(run);later(run);return()=>{viva=false;};}
};}
const db={doc:D,collection:c=>Q(c),enablePersistence:()=>Promise.resolve(),
  batch(){const ops=[];return {set(ref,d){ops.push([ref,d]);},async commit(){for(const [r,d] of ops)await r.set(d);}};}};

window.firebase={
  initializeApp:(cfg,nome)=>app(nome||"[DEFAULT]"),
  auth:Object.assign(()=>app("[DEFAULT]")._auth,{Auth:{Persistence:{LOCAL:"local",NONE:"none"}}}),
  firestore:()=>db
};
})();
