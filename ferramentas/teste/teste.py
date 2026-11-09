import asyncio, json, re
from playwright.async_api import async_playwright
URL = "http://localhost:8765/"
SH = "/home/claude/fb/test/shots/"
log = []
def ok(cond, msg):
    log.append(("OK  " if cond else "FALHOU ") + msg)

async def main():
    import os; os.makedirs(SH, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)))
        await ctx.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.abort())

        # 1. Primeira abertura: configuração inicial
        await pg.goto(URL); await pg.wait_for_selector("#fbGate h2")
        ok("Configuração inicial" in await pg.inner_text("#fbGate"), "primeira abertura mostra a configuração inicial")
        await pg.set_input_files("#fbF", "/home/claude/fb/test/backup_do_app.json")
        await pg.wait_for_selector("#fbS2:not([hidden])")
        await pg.screenshot(path=SH + "1_setup.png")
        await pg.fill("#fbN", "1234")
        await pg.click("#fbI"); await pg.wait_for_timeout(300)
        ok("sequências" in await pg.inner_text("#fbE"), "PIN fraco é recusado na configuração")
        await pg.fill("#fbN", "482915"); await pg.click("#fbI")
        await pg.wait_for_selector("text=PINs provisórios", timeout=20000)
        await pg.screenshot(path=SH + "2_pins.png")
        pins = dict(await pg.eval_on_selector_all("#fbGate tr", "rs=>rs.slice(1).map(r=>[r.cells[0].innerText,r.cells[1].innerText])"))
        ok(set(pins) == {"Lary", "Gustavo"}, f"PINs provisórios gerados para Lary e Gustavo: {sorted(pins)}")
        st = await pg.evaluate("window.__mockfb")
        nd = len([k for k in st["docs"] if k.split("/")[0] not in ("login", "publico")])
        ok(nd >= 160, f"dados copiados para o banco ({nd} registros)")
        ok(not any("pinHash" in json.dumps(v) for k, v in st["docs"].items()), "nenhum PIN ou hash de PIN no banco")

        # 2. Abre como Marco (Liderança)
        await pg.click("text=Abrir o app"); await pg.wait_for_load_state()
        await pg.wait_for_selector("#whoName b", timeout=15000)
        ok((await pg.inner_text("#whoName")).strip() == "Marco", "depois da configuração entra direto como Marco")
        await pg.goto(URL + "#painel"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=SH + "3_marco_painel.png")
        await pg.goto(URL + "#usuarios"); await pg.wait_for_timeout(1000)
        t = await pg.inner_text("main")
        ok("PIN provisório" in t and "Baixar backup" in t, "tela de usuários mostra PIN provisório e botão de backup")
        await pg.screenshot(path=SH + "4_usuarios.png")

        # Sair
        await pg.evaluate("sair()"); await pg.wait_for_selector("#fbGate #fbLg", timeout=10000)
        opts = await pg.eval_on_selector_all("#fbU option", "o=>o.map(x=>x.textContent)")
        ok(opts[1:] == ["Marco", "Lary", "Gustavo"] or set(opts[1:]) == {"Marco", "Lary", "Gustavo"}, f"tela de entrada lista os nomes {opts[1:]}")
        await pg.screenshot(path=SH + "5_login.png")

        async def login(slug, pin):
            await pg.select_option("#fbU", slug); await pg.fill("#fbP", pin); await pg.click("#fbB")

        # 3. PIN errado
        await login("lary", "9999"); await pg.wait_for_selector("#fbE:not([hidden])")
        ok("incorreto" in await pg.inner_text("#fbE"), "PIN errado é recusado")

        # 4. Lary entra com o provisório e cria o PIN dela
        await login("lary", pins["Lary"])
        await pg.wait_for_selector("#np1", timeout=15000)
        ok(True, "Lary com PIN provisório é obrigada a criar PIN próprio")
        await pg.screenshot(path=SH + "6_lary_trocar.png")
        await pg.fill("#np1", "730518"); await pg.fill("#np2", "730518"); await pg.click("#dlg button[value=ok]")
        await pg.wait_for_timeout(1500)
        await pg.reload(); await pg.wait_for_selector("#whoName b", timeout=15000)
        ok((await pg.inner_text("#whoName")).strip() == "Lary", "Lary continua logada depois de trocar o PIN")
        u = await pg.evaluate("window.__mockfb.docs['usuarios/lary']")
        ok(u.get("trocarPin") is False, "PIN da Lary marcado como pessoal")
        # Lary vê caixa e registra retirada de estoque
        r = await pg.evaluate("firebase.firestore().collection('caixas').get().then(s=>s.docs.length).catch(e=>e.code)")
        ok(isinstance(r, int) and r >= 1, f"Lary (rotina de caixa) consegue ler fechamentos ({r})")
        r = await pg.evaluate("firebase.firestore().doc('usuarios/lary').update({nivel:'Liderança'}).then(()=>'gravou').catch(e=>e.code)")
        ok(r == "permission-denied", f"Lary não consegue se promover a Liderança ({r})")
        r = await pg.evaluate("firebase.firestore().doc('login/gustavo').set({authEmail:'x--1@sorvely.app'}).then(()=>'gravou').catch(e=>e.code)")
        ok(r == "permission-denied", f"Lary não consegue trocar o acesso de outra pessoa ({r})")
        r = await pg.evaluate("firebase.firestore().collection('ponto').get().then(s=>s.docs.length).catch(e=>e.code)")
        ok(r == "permission-denied", f"Lary não lê o cartão de ponto ({r})")
        r = await pg.evaluate("firebase.firestore().collection('comunicados').add({titulo:'x',texto:'y',para:'todos'}).then(()=>'gravou').catch(e=>e.code)")
        ok(r == "permission-denied", f"Lary não publica comunicado ({r})")
        r = await pg.evaluate("firebase.firestore().doc('ciencias/c1_gustavo').set({com:'c1',nome:'Gustavo'}).then(()=>'gravou').catch(e=>e.code)")
        ok(r == "permission-denied", f"Lary não registra ciência em nome de outra pessoa ({r})")
        await pg.goto(URL + "#inicio"); await pg.wait_for_timeout(1200)
        await pg.click("[data-act=ciente]"); await pg.wait_for_timeout(800)
        r = await pg.evaluate("Object.keys(window.__mockfb.docs).filter(k=>k.startsWith('ciencias/'))")
        ok(r == ["ciencias/c1_lary"], f"Lary dá ciência no comunicado pela tela inicial ({r})")
        r = await pg.evaluate("FB.conferir('marco','482915')"); ok(r is True, "conferência com PIN certo do Marco funciona")
        r = await pg.evaluate("FB.conferir('marco','000000')"); ok(r is False, "conferência com PIN errado é recusada")
        ok((await pg.inner_text("#whoName")).strip() == "Lary", "conferência não troca quem está logado")
        await pg.goto(URL + "#rotinas"); await pg.wait_for_timeout(1500)
        await pg.evaluate("S.f.rot.sub='estoque';render()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SH + "7_lary_rotinas.png")
        n0 = await pg.evaluate("Object.keys(window.__mockfb.docs).filter(k=>k.startsWith('estoqueMov/')).length")
        btn = await pg.query_selector("[data-act=estRet]")
        if btn:
            await btn.click(); await pg.wait_for_timeout(800)
        n1 = await pg.evaluate("Object.keys(window.__mockfb.docs).filter(k=>k.startsWith('estoqueMov/')).length")
        ok(n1 == n0 + 1, "Lary registra retirada de caixa no estoque")

        # 5. Gustavo: sem caixa
        await pg.evaluate("sair()"); await pg.wait_for_selector("#fbGate #fbLg", timeout=10000)
        await login("gustavo", pins["Gustavo"]); await pg.wait_for_selector("#np1", timeout=15000)
        await pg.fill("#np1", "605183"); await pg.fill("#np2", "605183"); await pg.click("#dlg button[value=ok]"); await pg.wait_for_timeout(1200)
        r = await pg.evaluate("firebase.firestore().collection('caixas').get().then(s=>s.docs.length).catch(e=>e.code)")
        ok(r == "permission-denied", f"Gustavo não lê fechamentos de caixa ({r})")
        r = await pg.evaluate("firebase.firestore().collection('temperaturas').add({data:'2026-11-09',local:'Fábrica',valor:-18}).then(()=>'gravou').catch(e=>e.code)")
        ok(r == "gravou", "Gustavo grava temperatura")
        await pg.goto(URL + "#inicio"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SH + "8_gustavo.png")

        # 6. Marco redefine o PIN da Lary
        await pg.evaluate("sair()"); await pg.wait_for_selector("#fbGate #fbLg", timeout=10000)
        await login("marco", "482915"); await pg.wait_for_selector("#whoName b", timeout=15000)
        await pg.goto(URL + "#usuarios"); await pg.wait_for_timeout(800)
        r = await pg.evaluate("firebase.firestore().collection('ponto').get().then(s=>s.docs.length).catch(e=>e.code)")
        ok(r == 22, f"Marco lê o cartão de ponto ({r})")
        await pg.click("[data-act=pinUsu][data-doc=lary]"); await pg.fill("#rp", "518274"); await pg.click("#dlg button[value=ok]")
        await pg.wait_for_timeout(1500)
        ok((await pg.inner_text("#whoName")).strip() == "Marco", "Marco continua logado depois de redefinir o PIN da Lary")
        await pg.evaluate("sair()"); await pg.wait_for_selector("#fbGate #fbLg", timeout=10000)
        await login("lary", "730518"); await pg.wait_for_selector("#fbE:not([hidden])")
        ok("incorreto" in await pg.inner_text("#fbE"), "PIN antigo da Lary deixa de funcionar")
        await login("lary", "518274"); await pg.wait_for_selector("#np1", timeout=15000)
        ok(True, "Lary entra com o PIN redefinido e precisa criar outro")

        # 7. Usuário desativado perde acesso
        await pg.evaluate("window.__mockfb.docs['usuarios/gustavo'].ativo=false; localStorage.setItem('__mockfb',JSON.stringify(window.__mockfb)); FB.sair()")
        await pg.wait_for_selector("#fbGate #fbLg", timeout=10000)
        await login("gustavo", "605183"); await pg.wait_for_timeout(1500)
        tg = await pg.inner_text("#fbGate"); print("GATE:", tg)
        ok("desativado" in tg, "usuário desativado não entra no app")
        ok(not erros, "sem erros de JavaScript na página: " + "; ".join(erros[:3]))
        await b.close()

asyncio.run(main())
print("\n".join(l for l in log if l.strip() not in ("OK",)))
