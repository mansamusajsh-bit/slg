"""브라우저 종단 테스트 공용 도구 (playwright + 로컬 서버 + Supabase 스텁). 외부 요청은 전부 차단한다."""
import json, subprocess, time, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT=os.environ.get('SLG_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 기본: 프로젝트 루트. dist를 검사하려면 SLG_ROOT=dist
PORT=8765

def start_server(root=ROOT, port=PORT):
    handler=functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    class Q(handler.func):
        def log_message(self,*a): pass
    handler=functools.partial(Q, directory=root)
    socketserver.TCPServer.allow_reuse_address=True
    srv=socketserver.TCPServer(('127.0.0.1',port),handler)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    return srv

STUBS = r"""
window.__saved = [];
window.__templateCalls = [];
window.__cloudLoad = null;
window.__templates = {};
window.saveGameStateToCloud = function(p){ window.__saved.push(JSON.parse(JSON.stringify(p))); return true; };
window.loadGameStateFromCloud = async function(){ return window.__cloudLoad; };
window.__characters = [];
window.getCharactersFromCloud = async function(){ return JSON.parse(JSON.stringify(window.__characters)); };
window.subscribeCharacterList = function(){ return function(){}; };
window.loadGameConfigFromCloud = async function(){ return null; };
window.loadTacticalMapTemplateFromSupabase = async function(id){ window.__templateCalls.push(id); return window.__templates[id] || null; };
window.alert = function(){}; 
window.confirm = function(){ return true; };
"""

def new_page(pw):
    browser=pw.chromium.launch(args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':430,'height':900})
    ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1') else route.abort())
    page=ctx.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append('PAGEERROR: '+str(e)))
    page.on('console', lambda m: errors.append('CONSOLE.'+m.type+': '+m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
    page.add_init_script(STUBS)
    return browser,page,errors

class Check:
    def __init__(self): self.fail=0; self.n=0
    def ok(self,cond,msg):
        self.n+=1
        print(('PASS ' if cond else 'FAIL ')+msg)
        if not cond: self.fail+=1

def enter_region(page, region='liona'):
    """작전지도 → 전략맵. 게임은 작전지도(CAMPAIGN)에서 시작하고, 구역에 들어가려면 부관이 있어야 한다.
    부관이 없으면 첫 생존 대원을 임명한 뒤 구역에 진입한다 (구역의 노드 그래프가 run.mapState가 된다)."""
    ok = page.evaluate("""async (region) => {
      if (!getAdjutantUnit(state.run)) {
        const u = (state.run.party || []).find(x => !x.isDead);
        if (!u || !appointAdjutant(u.id)) return false;
      }
      return await enterRegion(region);
    }""", region)
    page.wait_for_timeout(300)
    return ok
