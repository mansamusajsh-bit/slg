"""지휘관 이름: 헤더 표시(왕관 없음 · 레벨이 이름 위 · 좁은 화면에서도 이름이 잘리지 않음) ·
처음에만 정하기(취소 불가) · 개명 유물 · 서버 중복 검사(서버는 스텁) · 사망회귀 후에도 이름 유지."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

srv = start_server(); c = Check()

# 서버 경제 스텁: slg_name_available / slg_set_name 만 흉내 낸다. '중복' 은 다른 플레이어가 쓰는 이름.
SERVER_STUB = r"""
(mode) => {
  window.__nameCalls = [];
  window.ServerEconomy = {
    enabled: true, status: 'ready', snapshot: { player: { nameSet: false } },
    async call(fn, args) {
      window.__nameCalls.push([fn, JSON.parse(JSON.stringify(args))]);
      if (mode === 'network') return { ok: false, network: true, error: 'fetch failed' };
      if (mode === 'missing') return { ok: false, network: true, error: 'Could not find the function public.' + fn + ' in the schema cache' };
      if (fn === 'slg_name_available') return args.p_name === '중복' ? { ok: false, available: false, error: 'taken' } : { ok: true, available: true, name: args.p_name };
      if (fn === 'slg_set_name') return args.p_name === '중복' ? { ok: false, error: 'taken' } : { ok: true, name: args.p_name, changed: !!args.p_change };
      return { ok: false, error: 'unknown' };
    },
    serverNow() { return Date.now(); },
    onReturnByDeath() { return Promise.resolve(null); }
  };
}
"""
modal_open = lambda page: page.locator('#modal-commander-name').count() > 0
cmd_name = lambda page: page.evaluate("() => ({ name: state.commander.name, set: !!state.commander.nameSet })")

def type_name(page, text, wait=0):
    page.fill('#cmd-name-input', text)
    if wait: page.wait_for_timeout(wait)

with sync_playwright() as pw:
    browser, page, errors = new_page(pw, skip_intro=False)
    page.set_viewport_size({'width': 360, 'height': 800})
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)

    print('\n=== 헤더: 왕관 없음 · 레벨이 이름 위 · 이름이 잘리지 않음 (360px) ===')
    page.evaluate("() => { state.commander.name = '아이린블랙'; state.commander.nameSet = true; renderAll(); }")
    page.wait_for_timeout(200)
    info = page.evaluate("""() => {
      const el = document.getElementById('strat-cmd-name'), lv = document.getElementById('strat-cmd-level');
      const box = document.querySelector('.strat-commander-box');
      const r = (e) => e.getBoundingClientRect();
      return { text: el.textContent, sw: el.scrollWidth, cw: el.clientWidth, nameTop: r(el).top, lvTop: r(lv).top, boxW: r(box).width,
               crown: box.textContent.includes('👑'), rename: !!document.getElementById('strat-cmd-rename'), avatar: !!document.getElementById('strat-cmd-avatar') };
    }""")
    c.ok(info['text'] == '아이린블랙' and info['sw'] <= info['cw'] + 1, f"이름 5자가 말줄임 없이 다 보인다 (scrollWidth {info['sw']} / clientWidth {info['cw']})")
    c.ok(info['boxW'] > 200, f"지휘관 영역이 한 줄 폭을 쓴다: {info['boxW']:.0f}px")
    c.ok(info['lvTop'] < info['nameTop'], f"레벨이 이름 위에 있다 (레벨 {info['lvTop']:.0f} < 이름 {info['nameTop']:.0f})")
    c.ok(not info['crown'] and not info['avatar'], '지휘관 영역에 왕관 아이콘이 없다')
    c.ok(not info['rename'], '✏️ 이름 변경 버튼이 없다')
    page.evaluate("() => { state.commander.name = '열두글자이름입니다요'; renderAll(); }")
    info12 = page.evaluate("() => { const e = document.getElementById('strat-cmd-name'); return { sw: e.scrollWidth, cw: e.clientWidth }; }")
    c.ok(info12['sw'] <= info12['cw'] + 1, f"최대 길이(10자) 이름도 360px 에서 다 보인다: {info12}")

    print('\n=== 전술 헤더 ===')
    tac = page.evaluate("""() => { state.commander.name = '전술이름'; renderHeaderAndCard();
      const b = document.querySelector('.commander-badge');
      return { text: document.getElementById('ui-cmd-name-text').textContent, crown: b.textContent.includes('👑'), avatar: !!b.querySelector('.commander-avatar'),
               lvFirst: b.querySelector('.commander-top #ui-cmd-level') !== null }; }""")
    c.ok(tac['text'] == '전술이름', '전술 헤더에 현재 이름이 표시된다 (예전에는 "레오나르도" 고정이었다)')
    c.ok(not tac['crown'] and not tac['avatar'] and tac['lvFirst'], '전술 헤더: 왕관 없음 · 레벨이 이름 위 줄')

    print('\n=== 처음 정하기 (서버 없음: 이 기기에서만) ===')
    page.evaluate("() => { state.commander.name = '레오나르도'; state.commander.nameSet = false; ensureCommanderName(); }")
    page.wait_for_timeout(300)
    c.ok(modal_open(page), '이름을 안 정했으면 입력 창이 열린다')
    c.ok(page.locator('#cmd-name-cancel').count() == 0, '처음 정하기는 취소 버튼이 없다')
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    c.ok(modal_open(page), 'Esc 로도 닫히지 않는다')
    type_name(page, '가'); page.click('#cmd-name-ok')
    c.ok('2자 이상' in page.inner_text('#cmd-name-msg') and modal_open(page), '1자: 오류 메시지, 창은 그대로')
    type_name(page, 'a<b>'); page.click('#cmd-name-ok')
    c.ok('쓸 수 없습니다' in page.inner_text('#cmd-name-msg'), '< > 문자: 오류')
    type_name(page, '가나다라마바사아자차카타파')
    c.ok(len(page.input_value('#cmd-name-input')) <= 12, '13자 입력: 12자로 제한')
    type_name(page, '  아이린   블랙 '); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    st = cmd_name(page)
    c.ok(not modal_open(page) and st == {'name': '아이린 블랙', 'set': True}, f'공백을 정리한 이름으로 정해지고 창이 닫힌다: {st}')
    c.ok(page.inner_text('#strat-cmd-name') == '아이린 블랙', '헤더에 바로 반영된다')
    page.evaluate("() => ensureCommanderName()"); page.wait_for_timeout(200)
    c.ok(not modal_open(page), '이미 정했으면 다시 묻지 않는다')

    print('\n=== 개명 유물 ===')
    page.evaluate("""() => { state.run.relics = [{ instanceId: 'rn1', id: 'name_seal', name: '개명의 인장', kind: 'rename', rarity: 'rare', description: '', effects: [] }];
      renderCommanderRelics(); }""")
    c.ok(page.evaluate("() => document.querySelectorAll('[data-relic-rename=\"rn1\"]').length") == 1, '유물 목록에 "이름 바꾸기" 버튼이 있다')
    c.ok(page.evaluate("() => !document.querySelector('[data-relic-equip=\"rn1\"]')"), '개명 유물은 장착 대상이 아니다')
    page.evaluate("() => useRenameRelic('rn1')"); page.wait_for_timeout(200)
    c.ok(modal_open(page) and page.input_value('#cmd-name-input') == '아이린 블랙', '개명 창이 현재 이름으로 열린다')
    page.click('#cmd-name-ok')
    c.ok('지금 쓰고 있는' in page.inner_text('#cmd-name-msg') and len(page.evaluate("() => state.run.relics")) == 1, '같은 이름은 거절 · 유물은 그대로')
    page.click('#cmd-name-cancel'); page.wait_for_timeout(100)
    c.ok(not modal_open(page) and len(page.evaluate("() => state.run.relics")) == 1 and cmd_name(page)['name'] == '아이린 블랙', '취소하면 유물도 이름도 그대로')
    page.evaluate("() => useRenameRelic('rn1')"); page.wait_for_timeout(200)
    type_name(page, '새이름'); page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    c.ok(cmd_name(page)['name'] == '새이름' and len(page.evaluate("() => state.run.relics")) == 0, '개명하면 이름이 바뀌고 유물은 사라진다')
    c.ok(page.evaluate("() => useRenameRelic('rn1')") is False, '유물이 없으면 개명 창이 열리지 않는다')

    print('\n=== 서버 중복 검사 (스텁) ===')
    page.evaluate(SERVER_STUB, 'ok')
    page.evaluate("() => { state.commander.name = '레오나르도'; state.commander.nameSet = false; ensureCommanderName(); }")
    page.wait_for_timeout(300)
    c.ok(modal_open(page), '서버에 이름이 없다고 하면 입력 창이 열린다')
    type_name(page, '중복', 600)
    c.ok('이미 다른 플레이어' in page.inner_text('#cmd-name-msg'), '입력하는 동안 "이미 쓰는 이름" 이라고 알려 준다')
    page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    c.ok(modal_open(page) and 'taken' not in page.inner_text('#cmd-name-msg') and '이미 다른 플레이어' in page.inner_text('#cmd-name-msg'), '중복 이름은 저장되지 않고 창이 그대로 있다')
    c.ok(not cmd_name(page)['set'], '중복이면 이름을 정한 것으로 치지 않는다')
    type_name(page, '새길동', 600)
    c.ok('사용할 수 있는' in page.inner_text('#cmd-name-msg'), '쓸 수 있는 이름이면 알려 준다')
    page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    calls = page.evaluate("() => window.__nameCalls.filter(x => x[0] === 'slg_set_name')")
    c.ok(not modal_open(page) and cmd_name(page) == {'name': '새길동', 'set': True}, '서버가 받아들이면 이름이 정해진다')
    c.ok(calls and calls[-1][1] == {'p_name': '새길동', 'p_change': False}, f'처음 정할 때는 p_change=false: {calls[-1:]}')

    print('\n=== 서버: 예전에 정한 이름 등록 / 서버 이름이 원본 ===')
    page.evaluate(SERVER_STUB, 'ok')
    page.evaluate("() => { state.commander.name = '기존이름'; state.commander.nameSet = true; ensureCommanderName(); }"); page.wait_for_timeout(300)
    c.ok(not modal_open(page) and page.evaluate("() => window.__nameCalls.some(x => x[0] === 'slg_set_name' && x[1].p_name === '기존이름')"), '예전에 정한 이름은 서버에 등록해 보고, 되면 묻지 않는다')
    page.evaluate("() => { state.commander.name = '중복'; state.commander.nameSet = true; ensureCommanderName(); }"); page.wait_for_timeout(300)
    c.ok(modal_open(page) and '이미 쓰고 있습니다' in page.inner_text('#modal-commander-name'), '예전 이름이 다른 플레이어와 겹치면 안내와 함께 새 이름을 정하게 한다')
    type_name(page, '다른이름', 600); page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    c.ok(cmd_name(page)['name'] == '다른이름', '새 이름으로 정해진다')
    page.evaluate("() => onServerPlayerName({ name: '서버이름', nameSet: true })"); page.wait_for_timeout(200)
    c.ok(cmd_name(page) == {'name': '서버이름', 'set': True} and page.inner_text('#strat-cmd-name') == '서버이름', '서버가 정한 이름이 로컬을 덮어쓴다 (헤더 포함)')
    page.evaluate("() => { state.commander.nameSet = false; onServerPlayerName({ name: 'x', nameSet: false }); }"); page.wait_for_timeout(300)
    c.ok(modal_open(page), '동기화 응답이 "이름 없음" 이면 입력 창이 열린다')
    type_name(page, '정리용'); page.click('#cmd-name-ok'); page.wait_for_timeout(300)

    print('\n=== 서버 오류 ===')
    page.evaluate(SERVER_STUB, 'network')
    page.evaluate("() => { state.commander.nameSet = false; ensureCommanderName(); }"); page.wait_for_timeout(300)
    type_name(page, '네트워크'); page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    c.ok(modal_open(page) and '서버에 연결하지 못했습니다' in page.inner_text('#cmd-name-msg') and not cmd_name(page)['set'], '연결 실패: 오류 안내, 이름은 정해지지 않는다')
    type_name(page, '네트워크'); page.evaluate("() => { window.ServerEconomy.call = async () => ({ ok: true, available: true, name: '재시도' }); }"); page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    page.evaluate(SERVER_STUB, 'missing')
    page.evaluate("() => { state.commander.nameSet = false; ensureCommanderName(); }"); page.wait_for_timeout(300)
    type_name(page, '구버전서버'); page.click('#cmd-name-ok'); page.wait_for_timeout(300)
    c.ok(not modal_open(page) and cmd_name(page) == {'name': '구버전서버', 'set': True}, '서버에 이름 함수가 없으면(SQL 미갱신) 이 기기에서만 정한다 — 게임이 막히지 않는다')

    print('\n=== 사망회귀 후에도 이름 유지 ===')
    page.evaluate("() => { delete window.ServerEconomy; }")  # 서버 없는 상태 (index 의 원래 객체로 되돌릴 필요 없음 — 이 테스트의 마지막 단계)
    page.evaluate("() => { window.ReturnByDeathFX = { play: async () => {} }; state.commander.name = '회귀자'; state.commander.nameSet = true; state.commander.level = 5; }")
    page.evaluate("() => { window.__rbd = returnByDeath(); }")
    page.wait_for_selector('.rbd-reward-card', timeout=5000)
    page.click('.rbd-reward-card >> nth=0'); page.wait_for_timeout(800)
    after = page.evaluate("() => ({ name: state.commander.name, set: !!state.commander.nameSet, level: state.commander.level, loop: state.player.loopCount })")
    c.ok(after['name'] == '회귀자' and after['set'] and after['level'] == 1 and after['loop'] == 1, f'회귀해도 이름은 남고 레벨은 처음으로: {after}')

    c.ok(not errors, '콘솔/페이지 오류 없음: ' + ' | '.join(errors[:5]))
    browser.close()
srv.shutdown()
print(f'\n{c.n - c.fail}/{c.n} 통과')
sys.exit(1 if c.fail else 0)
