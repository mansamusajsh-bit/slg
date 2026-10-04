"""일러스트: 외부 그림이 깨지면 대체 그림으로 표시되고, 🖼️ 편집기로 그림을 바꾸거나 내 저장소로 옮길 수 있는지 검증.
(테스트 하네스는 외부 요청을 전부 막으므로, 외부 URL 그림은 '깨진 그림'이 된다.)"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

BROKEN = 'https://image.example.invalid/queen.jpeg'
# 1x1 PNG
PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.add_init_script("""
      window.__uploads = [];
      window.uploadCharacterAvatar = async function(dataUrl, name){ window.__uploads.push(name); return 'https://hinzdviblsjbbpnfsqzp.supabase.co/storage/v1/object/public/slg-assets/character_avatars/test_' + window.__uploads.length + '.jpeg'; };
      window.saveCharacterToCloud = async function(){ return true; };
    """)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    page.evaluate("""(url)=>{
      window.__characters=[{id:'custom_queen', name:'퀸 메리', classType:'MAGE', unitClass:'MAGE', avatar:'👑',
        stats:{hp:100,maxHp:100,atk:40,def:30,mobility:2}, imageUrl:url, portraitFocus:{x:40,y:10,zoom:2}}];
      syncGlobalCharactersFromSupabase(JSON.parse(JSON.stringify(window.__characters)));
      const u = characterRecordToUnit(getStoredCustomCharacters().find(c=>c.id==='custom_queen'), {id:'merc_q1', owner:'PLAYER', x:1, y:1, fullHp:true});
      u.sourceCharacterId='custom_queen'; state.playerUnits.push(u);
      customClassImages = {};
    }""", BROKEN)

    print('\n=== 깨진 외부 그림 → 대체 표시 ===')
    first=page.evaluate("renderPortrait(state.playerUnits.find(u=>u.id==='merc_q1'))")
    page.wait_for_timeout(1500)
    c.ok(page.evaluate("(u)=>isImageUrlBroken(u)", BROKEN), '로드 실패한 그림을 깨짐으로 표시')
    after=page.evaluate("renderPortrait(state.playerUnits.find(u=>u.id==='merc_q1'))")
    c.ok('portrait-emoji' in after and '👑' in after, f'깨진 뒤에는 빈칸 대신 이모지로 대체 (got {after[:80]!r})')
    ill=page.evaluate("getUnitIllustration(state.playerUnits.find(u=>u.id==='merc_q1'))")
    c.ok(ill!=BROKEN and ill.startswith('data:image/svg'), '말풍선 일러스트는 깨진 주소 대신 내장 병과 그림 사용')

    print('\n=== 보관함 표시 ===')
    page.evaluate("renderCustomCharactersList()")
    vault=page.evaluate("document.getElementById('dbg-custom-char-list')?.innerHTML || ''")
    c.ok('그림 깨짐' in vault and 'openCharacterIllustrationEditor' in vault, '보관함에 깨짐 표시와 🖼️ 그림 버튼')

    print('\n=== 🖼️ 편집기: 파일로 교체 ===')
    page.evaluate("openCharacterIllustrationEditor('custom_queen')")
    c.ok(page.locator('#illust-char-modal').count()==1, '편집 창 열림')
    page.evaluate("""async (png)=>{
      const input=document.querySelector('#illust-char-modal [data-file]');
      const blob=await (await fetch(png)).blob();
      const dt=new DataTransfer(); dt.items.add(new File([blob],'new.png',{type:'image/png'}));
      input.files=dt.files; input.dispatchEvent(new Event('change'));
    }""", PNG)
    page.wait_for_timeout(500)
    page.evaluate("document.querySelector('#illust-char-modal [data-save]').click()"); page.wait_for_timeout(800)
    r=page.evaluate("""()=>({rec:getStoredCustomCharacters().find(c=>c.id==='custom_queen'), unit:state.playerUnits.find(u=>u.id==='merc_q1'), uploads:window.__uploads, open:!!document.getElementById('illust-char-modal')})""")
    new=r['rec']['imageUrl']
    c.ok(new.startswith('https://hinzdviblsjbbpnfsqzp.supabase.co/storage/') and r['uploads']==['퀸 메리'], f'파일은 내 저장소에 올라가 영구 주소로 저장 ({new[-40:]})')
    c.ok(r['unit']['imageUrl']==new, '같은 캐릭터의 유닛 그림도 함께 변경')
    c.ok('portraitFocus' not in r['rec'], '새 그림이면 얼굴 위치 초기화')
    c.ok(not r['open'], '저장 후 창 닫힘')

    print('\n=== URL 직접 입력 / 병과 기본 그림 ===')
    page.evaluate("openCharacterIllustrationEditor('custom_queen')")
    page.evaluate("(()=>{const i=document.querySelector('#illust-url-input'); i.value='https://example.org/other.png'; i.dispatchEvent(new Event('input'));})()")
    page.evaluate("document.querySelector('#illust-char-modal [data-save]').click()"); page.wait_for_timeout(500)
    c.ok(page.evaluate("getStoredCustomCharacters().find(c=>c.id==='custom_queen').imageUrl")=='https://example.org/other.png', 'URL 입력은 그 주소를 그대로 사용')
    page.evaluate("openCharacterIllustrationEditor('custom_queen')")
    page.evaluate("document.querySelector('#illust-char-modal [data-clear]').click()"); page.evaluate("document.querySelector('#illust-char-modal [data-save]').click()"); page.wait_for_timeout(500)
    c.ok(page.evaluate("getStoredCustomCharacters().find(c=>c.id==='custom_queen').imageUrl")=='', '병과 기본 그림으로 되돌리기')

    c.ok(not [e for e in errors if 'PAGEERROR' in e], 'JS 오류 없음 ' + str([e for e in errors if 'PAGEERROR' in e][:3]))
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
