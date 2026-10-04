"""선물 유물: 등급에 따라 호감도가 일괄 상승하는지 (+ 유물 자체 효과, 호감도 기본값, 상한 100)."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

RELICS = [
    {'instanceId': 'g-common', 'id': 'gift_old_locket', 'name': '낡은 로켓', 'kind': 'gift', 'rarity': 'common', 'effects': [{'scope': 'self', 'stat': 'def', 'value': 2}]},
    {'instanceId': 'g-rare', 'id': 'gift_duelist_glove', 'name': '결투가의 장갑', 'kind': 'gift', 'rarity': 'rare', 'effects': [{'scope': 'self', 'stat': 'critRate', 'value': 10}]},
    {'instanceId': 'g-epic', 'id': 'gift_giant_belt', 'name': '거인의 허리띠', 'kind': 'gift', 'rarity': 'epic', 'effects': [{'scope': 'self', 'stat': 'hp', 'value': 20}]},
    {'instanceId': 'g-leg', 'id': 'gift_eternal_vow', 'name': '영원의 맹세', 'kind': 'gift', 'rarity': 'legendary', 'effects': [{'scope': 'self', 'stat': 'affection', 'value': 25}]},
    {'instanceId': 'g-c2', 'id': 'gift_wool_scarf', 'name': '털목도리', 'kind': 'gift', 'rarity': 'common', 'effects': [{'scope': 'self', 'stat': 'hp', 'value': 8}]},
    {'instanceId': 'g-c3', 'id': 'gift_iron_ring', 'name': '철반지', 'kind': 'gift', 'rarity': 'common', 'effects': [{'scope': 'self', 'stat': 'def', 'value': 1}]},
    {'instanceId': 'g-norarity', 'id': 'gift_x', 'name': '이름 없는 선물', 'kind': 'gift', 'effects': []},
]

srv = start_server(); c = Check()
with sync_playwright() as pw:
    browser, page, errors = new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    page.evaluate("() => { startNewRun('RUN-GIFT', { force: true }); }")
    units = page.evaluate("() => (state.playerUnits || []).filter(u => !u.isDead).map(u => u.id)")
    c.ok(len(units) >= 3, f'선물 받을 아군 3명 이상: {units}')
    a, b, d = units[0], units[1], units[2]
    page.evaluate("(r) => { state.run.relics = JSON.parse(JSON.stringify(r)); }", RELICS)
    get = lambda uid: page.evaluate("(id) => { const u = [...state.playerUnits, ...(state.reserveUnits||[])].find(x => x.id === id); return { aff: u.affection, fav: u.favorability, def: u.def, maxHp: u.maxHp }; }", uid)
    give = lambda inst, uid: page.evaluate("([i, u]) => window.giftRelicToUnit(i, u)", [inst, uid])

    print('\n=== 등급별 호감도 보너스 ===')
    page.evaluate("(id) => { const u = state.playerUnits.find(x => x.id === id); u.affection = 40; u.favorability = 40; }", a)
    before = get(a)
    c.ok(give('g-common', a) is True, '일반 선물 성공')
    after = get(a)
    c.ok(after['aff'] == 45 and after['fav'] == 45, f'일반: 호감도 40 → 45 (효과에 호감도가 없어도 오름): {after}')
    c.ok(after['def'] == before['def'] + 2, '유물 자체 효과(방어 +2)도 적용')
    give('g-rare', a); c.ok(get(a)['aff'] == 55, f"희귀: +10 → {get(a)['aff']}")
    give('g-epic', a); c.ok(get(a)['aff'] == 70, f"영웅: +15 → {get(a)['aff']}")
    give('g-leg', a); c.ok(get(a)['aff'] == 100, f"전설: +25 + 유물 효과 +25 → 상한 100: {get(a)['aff']}")
    c.ok(page.evaluate("() => state.run.relics.every(r => !['g-common','g-rare','g-epic','g-leg'].includes(r.instanceId))"), '선물한 유물은 보관함에서 빠짐')

    print('\n=== 호감도 값이 없는 캐릭터 (기본값) ===')
    page.evaluate("(id) => { const u = state.playerUnits.find(x => x.id === id); delete u.affection; u.favorability = 40; }", b)
    give('g-c2', b)
    c.ok(get(b)['aff'] == 45, f"affection 없음 + favorability 40 → 45 (0으로 떨어지지 않음): {get(b)}")
    page.evaluate("(id) => { const u = state.playerUnits.find(x => x.id === id); delete u.affection; delete u.favorability; }", d)
    give('g-c3', d)
    c.ok(get(d)['aff'] == 55, f"둘 다 없음 → 기본 50 + 5 = 55: {get(d)}")
    page.evaluate("(id) => { const u = state.playerUnits.find(x => x.id === id); u.affection = 10; }", d)
    give('g-norarity', d)
    c.ok(get(d)['aff'] == 15, f"등급 없는 선물 → 일반(+5) 취급: {get(d)['aff']}")

    print('\n=== 표시 ===')
    page.evaluate("(r) => { state.run.relics.push(...JSON.parse(JSON.stringify(r))); }", [dict(RELICS[1], instanceId='g-rare2')])
    page.evaluate("() => window.openRelicGiftPicker({ relicInstanceId: 'g-rare2' })"); page.wait_for_timeout(300)
    txt = page.locator('#modal-relic-gift').inner_text() if page.locator('#modal-relic-gift').count() else ''
    c.ok('호감도 +10' in txt, f'선물 창 미리보기에 등급 보너스 표시: {txt[:80]!r}')
    page.evaluate("() => window.closeRelicGiftPicker()")
    logs = page.locator('#console-wrap').inner_text()
    c.ok('호감도 +5 (일반 선물)' in logs and '호감도 40 → 45' in logs, '로그에 등급 보너스와 호감도 변화 표시')
    c.ok(not errors, '콘솔/페이지 오류 없음: ' + ' | '.join(errors[:5]))
    browser.close()
srv.shutdown()
print(f'\n{c.n - c.fail}/{c.n} 통과', '' if not c.fail else f'({c.fail} 실패)')
sys.exit(1 if c.fail else 0)
