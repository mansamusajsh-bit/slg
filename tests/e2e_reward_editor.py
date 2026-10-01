"""DEV 보상 풀 / 유물 / 아이템 에디터 종단 테스트 (SlgStore는 메모리 스텁, 외부 요청 차단)."""
import json, os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

# supabase-bridge.js의 SlgStore와 같은 계약: load는 없으면 throw, save는 validator 실패 시 throw
STORE_STUB = r"""
(() => {
  const db = window.__db = {
    characters: { char_a: { id:'char_a', name:'아델' }, char_b: { id:'char_b', name:'베른' } },
    items: { potion: { id:'potion', name:'회복약', description:'' } },
    relics: {
      iron_banner: { id:'iron_banner', name:'철 깃발', kind:'commander', rarity:'rare', effects:[{scope:'army',stat:'atk',value:2}] },
      war_drum: { id:'war_drum', name:'전쟁 북', kind:'commander', rarity:'common', effects:[{scope:'battle',stat:'ap',value:1}] },
      old_locket: { id:'old_locket', name:'낡은 로켓', kind:'gift', rarity:'common', effects:[{scope:'self',stat:'def',value:3}] }
    },
    rewardPools: {
      'A-commander-relics': { id:'A-commander-relics', name:'A 지휘관 유물', rolls:1, allowDuplicates:false, entries:[
        {type:'relic',kind:'commander',id:'iron_banner',weight:1},{type:'relic',kind:'commander',id:'war_drum',weight:1}] },
      'A-recruits': { id:'A-recruits', name:'A 영입', rolls:1, allowDuplicates:false, entries:[{type:'recruit',id:'char_a',weight:1},{type:'recruit',id:'char_b',weight:1}] },
      'A-battle-normal': { id:'A-battle-normal', name:'A지역 일반 전투', rolls:2, allowDuplicates:false, entries:[
        {type:'gold',min:30,max:60,weight:50},{type:'item',id:'potion',weight:30},{type:'relic',kind:'gift',id:'old_locket',weight:15},
        {type:'relic',kind:'commander',pool:'A-commander-relics',weight:5},{type:'recruit',pool:'A-recruits',weight:5}] },
      'X': { id:'X', name:'X', rolls:1, allowDuplicates:false, entries:[{type:'item',id:'potion',weight:1}] },
      'Y': { id:'Y', name:'Y', rolls:1, allowDuplicates:false, entries:[{type:'item',pool:'X',weight:1}] },
      'BROKEN': { id:'BROKEN', name:'깨진 참조', rolls:1, allowDuplicates:false, entries:[{type:'item',id:'ghost',weight:1}] }
    }
  };
  const copy = x => JSON.parse(JSON.stringify(x));
  const col = c => (db[c] = db[c] || {});
  window.__saves = 0;
  window.SlgStore = {
    isReady: true,
    validate(data, v) { if (!v) return {valid:true}; const r = v(data); if (!r.valid) { const e = new Error('검증 실패: '+r.errors.map(x=>x.message).join(' / ')); e.code='VALIDATION'; throw e; } return r; },
    async load(c, id) { const v = col(c)[id]; if (v == null) { const e = new Error(`[${c}/${id}] 데이터가 없습니다.`); e.code='NOT_FOUND'; throw e; } return copy(v); },
    async exists(c, id) { return col(c)[id] != null; },
    async list(c) { return Object.values(col(c)).map(copy); },
    async save(c, id, data, v) { this.validate(data, v); window.__saves++; col(c)[id] = copy({...data, id}); return true; },
    async saveMany(c, list, v) { list.forEach(x => this.validate(x, v)); list.forEach(x => { col(c)[x.id] = copy(x); }); window.__saves += list.length; return list.length; },
    async remove(c, id) { delete col(c)[id]; return true; }
  };
})();
"""

ROOT_RP = '#dev-reward-pool-editor-root'
ROOT_RL = '#dev-relic-editor-root'
ROOT_IT = '#dev-item-editor-root'

def btn(page, root, text):
    return page.locator(f'{root} button', has_text=text).first

def status(page, root):
    return page.locator(f'{root} .slg-ed-status').first.inner_text()

def open_tab(page, tab, root):
    page.evaluate(f"switchDebugTab('{tab}')")
    page.wait_for_selector(f'{root} .slg-ed-list', timeout=5000)
    page.wait_for_timeout(150)

def load_item(page, root, item_id):
    page.locator(f'{root} .slg-ed-list-item', has=page.locator('.id', has_text=item_id)).filter(has_text=item_id).first.click()
    page.wait_for_timeout(150)

def sim_table(page):
    return page.locator(f'{ROOT_RP} .slg-ed-sim-result').inner_text()

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    requests=[]
    page.on('request', lambda r: requests.append(r.url))
    page.add_init_script(STORE_STUB)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)

    print('\n=== 지연 로딩 ===')
    c.ok(not any('/editors/' in u or 'rewardEngine.js' in u for u in requests), '게임 시작 시 에디터 모듈/rewardEngine.js를 요청하지 않음')
    game_before = page.evaluate("JSON.stringify({gold: state.gold, inv: state.inventory, rew: state.rewinders, chars: (state.characters||[]).length})")
    page.evaluate("openDebugModal('reward-pools')")
    page.wait_for_selector(f'{ROOT_RP} .slg-ed-list-item', timeout=5000)
    c.ok(any('/editors/rewardPoolEditor.js' in u for u in requests) and any('rewardEngine.js' in u for u in requests), '보상 풀 탭 진입 시에만 import()로 로드')
    c.ok(page.locator(f'{ROOT_RP} .slg-ed-list-item').count() == 6, '풀 목록 6개 표시')

    print('\n=== 새 풀: 검증과 저장 ===')
    btn(page, ROOT_RP, '새로 만들기').click(); page.wait_for_timeout(100)
    fields = page.locator(f'{ROOT_RP} .slg-ed-grid2').first.locator('input')
    fields.nth(0).fill('T-pool'); fields.nth(1).fill('테스트 풀')
    saves0 = page.evaluate('window.__saves')
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate('window.__saves') == saves0 and '검증 오류' in status(page, ROOT_RP), 'entries 비어 있으면 저장 차단')
    c.ok('entries가 비어' in page.locator(f'{ROOT_RP} .slg-ed-validation').inner_text(), '빈 entries 오류 메시지 표시')

    btn(page, ROOT_RP, '+ 💰 골드').click(); page.wait_for_timeout(100)
    btn(page, ROOT_RP, '+ 📦 아이템').click(); page.wait_for_timeout(100)
    entries = page.locator(f'{ROOT_RP} .slg-ed-entry')
    # gold: number inputs = min, max, weight
    entries.nth(0).locator('input[type=number]').nth(2).fill('10')
    entries.nth(1).locator('input[type=number]').nth(0).fill('30')
    probs = page.locator(f'{ROOT_RP} .slg-ed-prob').all_inner_texts()
    c.ok(probs == ['25.0%', '75.0%'], f'확률(%) 실시간 표시 (10:30 → 25%/75%): {probs}')
    c.ok('invalid' in (entries.nth(1).get_attribute('class') or ''), '아이템 미선택 entry는 오류 표시')
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate("!window.__db.rewardPools['T-pool']"), '아이템 미선택 → 저장 차단')
    item_sel = entries.nth(1).locator('select').nth(2)
    opts = item_sel.locator('option').all_inner_texts()
    c.ok(any('회복약' in o for o in opts) and page.locator(f'{ROOT_RP} .slg-ed-entry').nth(1).locator('input:not([type=number])').count() == 0, f'아이템 id는 드롭다운으로만 선택 (직접 입력 없음): {opts}')
    item_sel.select_option('potion'); page.wait_for_timeout(100)

    entries.nth(1).locator('input[type=number]').nth(0).fill('0')
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate("!window.__db.rewardPools['T-pool']") and 'weight' in entries.nth(1).inner_text(), 'weight 0 → 저장 차단 + 해당 entry에 이유 표시')
    entries.nth(1).locator('input[type=number]').nth(0).fill('30')
    entries.nth(0).locator('input[type=number]').nth(0).fill('80')  # min 80 > max 50
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate("!window.__db.rewardPools['T-pool']"), 'min > max → 저장 차단')
    entries.nth(0).locator('input[type=number]').nth(0).fill('5')
    page.locator(f'{ROOT_RP} .slg-ed-grid2').first.locator('input[type=number]').fill('0')
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate("!window.__db.rewardPools['T-pool']"), 'rolls 0 → 저장 차단')
    page.locator(f'{ROOT_RP} .slg-ed-grid2').first.locator('input[type=number]').fill('2')
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(300)
    saved = page.evaluate("window.__db.rewardPools['T-pool']")
    c.ok(saved and saved['rolls'] == 2 and saved['entries'] == [{'type':'gold','weight':10,'min':5,'max':50},{'type':'item','weight':30,'id':'potion'}], f'정상 풀 저장: {json.dumps(saved, ensure_ascii=False)}')

    print('\n=== 불러오기 / 존재하지 않는 참조 / 순환 참조 ===')
    load_item(page, ROOT_RP, 'BROKEN')
    c.ok('존재하지 않는 아이템 "ghost"' in page.locator(f'{ROOT_RP} .slg-ed-validation').inner_text(), '깨진 참조 풀 불러오면 오류 표시')
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok('검증 오류' in status(page, ROOT_RP), '존재하지 않는 id 참조 → 저장 차단')

    load_item(page, ROOT_RP, 'X')
    btn(page, ROOT_RP, '+ 📦 아이템').click(); page.wait_for_timeout(100)
    e2 = page.locator(f'{ROOT_RP} .slg-ed-entry').nth(1)
    e2.locator('select').nth(1).select_option('pool'); page.wait_for_timeout(100)
    e2 = page.locator(f'{ROOT_RP} .slg-ed-entry').nth(1)
    e2.locator('select').nth(2).select_option('Y'); page.wait_for_timeout(100)
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(200)
    v = page.locator(f'{ROOT_RP} .slg-ed-validation').inner_text()
    c.ok('순환 참조: X → Y → X' in v and len(page.evaluate("window.__db.rewardPools.X.entries")) == 1, f'순환 참조 X→Y→X → 저장 차단: {v.strip()[:80]}')
    # 다른 type의 풀은 하위 풀 후보에 나오지 않음
    opts = e2.locator('select').nth(2).locator('option').all_inner_texts()
    c.ok(not any('A-recruits' in o or 'A-commander-relics' in o for o in opts), f'하위 풀 드롭다운은 같은 type 풀만: {opts}')

    print('\n=== 시뮬레이션 (시드 결정론) ===')
    page.evaluate("() => { window.confirm = () => true; }")
    load_item(page, ROOT_RP, 'A-battle-normal')
    sim = page.locator(f'{ROOT_RP} .slg-ed-section').filter(has_text='시뮬레이션')
    sim.locator('input').nth(0).fill('SEED-42'); sim.locator('input[type=number]').fill('3000')
    btn(page, ROOT_RP, '시뮬레이션 실행').click(); page.wait_for_timeout(300)
    t1 = sim_table(page)
    btn(page, ROOT_RP, '시뮬레이션 실행').click(); page.wait_for_timeout(300)
    t2 = sim_table(page)
    sim.locator('input').nth(0).fill('SEED-43')
    btn(page, ROOT_RP, '시뮬레이션 실행').click(); page.wait_for_timeout(300)
    t3 = sim_table(page)
    c.ok('보상 6000개' in t1 and '회복약' in t1 and '골드' in t1, '결과 분포 표 표시 (3000회 × 2개)')
    c.ok(t1 == t2, '같은 시드 → 항상 같은 결과')
    c.ok(t1 != t3, '다른 시드 → 다른 결과')
    sim.locator('label.slg-ed-chip', has_text='철 깃발').locator('input').check()
    sim.locator('input').nth(0).fill('SEED-42')
    btn(page, ROOT_RP, '시뮬레이션 실행').click(); page.wait_for_timeout(300)
    t4 = sim_table(page)
    c.ok('철 깃발' in t1 and '철 깃발' not in t4 and '전쟁 북' in t4, '보유 지휘관 유물 제외 필터')

    print('\n=== 복제 / 삭제 ===')
    page.evaluate("() => { window.prompt = () => 'A-battle-copy'; }")
    btn(page, ROOT_RP, '📄 복제').click(); page.wait_for_timeout(100)
    btn(page, ROOT_RP, '💾 저장').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("!!window.__db.rewardPools['A-battle-copy'] && window.__db.rewardPools['A-battle-copy'].entries.length===5"), '복제 후 저장')
    load_item(page, ROOT_RP, 'A-recruits')
    btn(page, ROOT_RP, '🗑️ 삭제').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("!!window.__db.rewardPools['A-recruits']") and '참조 중' in status(page, ROOT_RP), '다른 풀이 참조하는 풀은 삭제 차단')
    page.evaluate("() => { window.__confirmAsked = 0; window.confirm = () => { window.__confirmAsked++; return false; }; }")
    load_item(page, ROOT_RP, 'T-pool')
    btn(page, ROOT_RP, '🗑️ 삭제').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate("window.__confirmAsked===1 && !!window.__db.rewardPools['T-pool']"), '삭제 확인창 취소 → 유지')
    page.evaluate("() => { window.confirm = () => true; }")
    btn(page, ROOT_RP, '🗑️ 삭제').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("!window.__db.rewardPools['T-pool']"), '확인 후 삭제')

    print('\n=== 유물 에디터 ===')
    open_tab(page, 'relics', ROOT_RL)
    btn(page, ROOT_RL, '새로 만들기').click(); page.wait_for_timeout(100)
    f = page.locator(f'{ROOT_RL} .slg-ed-grid2').first.locator('input')
    f.nth(0).fill('lucky_charm'); f.nth(1).fill('행운의 부적')
    scope_sel = page.locator(f'{ROOT_RL} [data-effect-index="0"] select').nth(0)
    c.ok(scope_sel.is_disabled() and scope_sel.input_value() == 'self', 'gift 유물: scope self 고정')
    btn(page, ROOT_RL, '💾 저장').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("window.__db.relics.lucky_charm?.kind==='gift' && window.__db.relics.lucky_charm.effects[0].scope==='self'"), 'gift 유물 저장')
    btn(page, ROOT_RL, '새로 만들기').click(); page.wait_for_timeout(100)
    f = page.locator(f'{ROOT_RL} .slg-ed-grid2').first.locator('input')
    f.nth(0).fill('war_horn'); f.nth(1).fill('전쟁 뿔피리')
    page.locator(f'{ROOT_RL} .slg-ed-grid2').nth(1).locator('select').nth(0).select_option('commander'); page.wait_for_timeout(100)
    scope_sel = page.locator(f'{ROOT_RL} [data-effect-index="0"] select').nth(0)
    c.ok(not scope_sel.is_disabled() and scope_sel.input_value() == 'army', 'commander로 바꾸면 scope 선택 가능 (기본 army)')
    scope_sel.select_option('run')
    page.locator(f'{ROOT_RL} [data-effect-index="0"] input[type=number]').fill('0')
    btn(page, ROOT_RL, '💾 저장').click(); page.wait_for_timeout(200)
    c.ok(page.evaluate("!window.__db.relics.war_horn"), '효과 value 0 → 저장 차단')
    page.locator(f'{ROOT_RL} [data-effect-index="0"] input[type=number]').fill('5')
    btn(page, ROOT_RL, '💾 저장').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("window.__db.relics.war_horn?.kind==='commander' && window.__db.relics.war_horn.effects[0].scope==='run'"), 'commander 유물 저장')
    load_item(page, ROOT_RL, 'old_locket')
    btn(page, ROOT_RL, '🗑️ 삭제').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("!!window.__db.relics.old_locket") and '참조 중' in status(page, ROOT_RL), '보상 풀이 참조하는 유물은 삭제 차단')

    print('\n=== 아이템 에디터 → 보상 풀 드롭다운 반영 ===')
    open_tab(page, 'items', ROOT_IT)
    btn(page, ROOT_IT, '새로 만들기').click(); page.wait_for_timeout(100)
    f = page.locator(f'{ROOT_IT} .slg-ed-grid2').first.locator('input')
    f.nth(0).fill('elixir'); f.nth(1).fill('엘릭서')
    btn(page, ROOT_IT, '💾 저장').click(); page.wait_for_timeout(300)
    c.ok(page.evaluate("window.__db.items.elixir?.name==='엘릭서'"), '아이템 저장')
    open_tab(page, 'reward-pools', ROOT_RP)
    btn(page, ROOT_RP, '새로 만들기').click(); page.wait_for_timeout(100)
    btn(page, ROOT_RP, '+ 📦 아이템').click(); page.wait_for_timeout(100)
    opts = page.locator(f'{ROOT_RP} .slg-ed-entry').nth(0).locator('select').nth(2).locator('option').all_inner_texts()
    c.ok(any('엘릭서' in o for o in opts), '새 아이템이 보상 풀 드롭다운에 나타남')
    btn(page, ROOT_RP, '+ 💎 유물').click(); page.wait_for_timeout(100)
    opts = page.locator(f'{ROOT_RP} .slg-ed-entry').nth(1).locator('select').nth(3).locator('option').all_inner_texts()
    c.ok(any('행운의 부적' in o for o in opts) and not any('전쟁 뿔피리' in o for o in opts), f'유물 드롭다운은 kind(gift) 필터: {opts}')

    print('\n=== 기본 데이터 가져오기 ===')
    page.evaluate("() => { window.confirm = () => true; }")
    page.locator(f'{ROOT_RP} .slg-ed-list-item').first.click(); page.wait_for_timeout(150)  # 편집 중인 draft 정리
    btn(page, ROOT_RP, '기본 데이터 가져오기').click(); page.wait_for_timeout(1500)
    counts = page.evaluate("() => ({ items: Object.keys(__db.items).length, relics: Object.keys(__db.relics).length, pools: Object.keys(__db.rewardPools).length, potion: __db.items.potion.name })")
    c.ok('추가 완료' in status(page, ROOT_RP), '가져오기 완료 메시지: ' + status(page, ROOT_RP))
    c.ok(counts['relics'] >= 100 and counts['items'] >= 100 and counts['pools'] >= 80 and counts['potion'] == '회복약', f'유물/아이템/풀 추가, 기존 id는 유지: {counts}')
    btn(page, ROOT_RP, '기본 데이터 가져오기').click(); page.wait_for_timeout(800)
    c.ok('이미 모두' in status(page, ROOT_RP), '두 번째 가져오기 → 추가할 것 없음')
    load_item(page, ROOT_RP, 'B-2-boss-relic')
    c.ok('검증 통과' in page.locator(f'{ROOT_RP} .slg-ed-validation').inner_text(), '가져온 풀(B-2-boss-relic) 불러오기 + 검증 통과')

    print('\n=== 저장소 오류 시 폴백 금지 ===')
    page.evaluate("() => { window.SlgStore.list = async () => { throw new Error('network down'); }; }")
    btn(page, ROOT_RP, '🔄').click(); page.wait_for_timeout(300)
    c.ok('network down' in page.locator(ROOT_RP).inner_text(), '목록 조회 실패 → 빈 목록 대신 오류 표시')

    print('\n=== 게임 state 불변 / 기존 탭 ===')
    c.ok(page.evaluate("JSON.stringify({gold: state.gold, inv: state.inventory, rew: state.rewinders, chars: (state.characters||[]).length})") == game_before, '에디터 사용 후 게임 state 변화 없음')
    page.evaluate("switchDebugTab('create-char')"); page.wait_for_timeout(200)
    c.ok(page.locator('#tab-content-dbg-create-char').is_visible() and not page.locator('#tab-content-dbg-reward-pools').is_visible(), '기존 캐릭터 생성 탭 전환 정상')
    errors = [e for e in errors if 'network down' not in e]  # 위에서 일부러 낸 오류는 제외
    c.ok(not errors, '콘솔/페이지 오류 없음: ' + ' | '.join(errors[:5]))
    browser.close()
srv.shutdown()
print(f'\n{c.n - c.fail}/{c.n} 통과', '' if not c.fail else f'({c.fail} 실패)')
sys.exit(1 if c.fail else 0)
