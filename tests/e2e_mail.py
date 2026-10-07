"""운영 메일 종단 검증: 실제 클라이언트(운영 메일 에디터 · 우편함) + 브라우저 안 PGlite 에 올린 실제 supabase-economy.sql.
운영자가 DEV 탭에서 보내고 → 플레이어가 우편함에서 받으면 골드 · 리와인더 · 유물 · 캐릭터(용병 명부)가 들어오는지 본다."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

srv = start_server(); c = Check()
with sync_playwright() as pw:
    browser, page, errors = new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1500)
    page.evaluate("() => { startNewRun('MAIL-1', { force: true }); }")

    print('\n=== 설치: 실제 SQL + 데이터 ===')
    page.evaluate("""async () => {
      if (!window.SupabaseBridge) window.SupabaseBridge = {};
      const m = await import('/tests/browser/pg-mock.js');
      await m.installPgMock({ users: ['admin', 'a'] });
      await __pg.q('insert into slg_admins (user_id) values ($1)', [__pg.uids.admin]);
      const put = (col, id, data) => __pg.db.query('insert into slg_records (collection_name, record_id, data) values ($1, $2, $3) on conflict (collection_name, record_id) do update set data = excluded.data', [col, id, JSON.stringify(data)]);
      await put('relics', 'g1', { id: 'g1', name: '용맹의 휘장', kind: 'gift', rarity: 'rare', description: '', effects: [{ scope: 'self', stat: 'atk', value: 2 }] });
      await put('characters', 'hero1', { id: 'hero1', name: '발키리', classType: 'KNIGHT' });
      window.__characters = [{ id: 'hero1', name: '발키리', classType: 'KNIGHT' }];
      // 에디터가 읽는 저장 계층 (CDN 이 막힌 테스트 환경이라 PGlite 로 대신한다)
      window.SlgStore = { isReady: true, async list(col) { return (await __pg.q('select data from slg_records where collection_name = $1', [col])).map(r => r.data); } };
      window.__t0 = Date.now();
      await __pg.at(window.__t0);
    }""")

    # 플레이어 a: 계정을 만들고 이름을 정한다 (운영자가 이름으로 보낼 수 있게)
    page.evaluate("""async () => {
      __pg.setUser('a');
      await SupabaseBridge.rpc('slg_bootstrap', { p_name: '알파', p_claimed_gold: 0, p_loop: 0 });
      await SupabaseBridge.rpc('slg_set_name', { p_name: '알파', p_change: false });
      __pg.setUser('admin');
      await SupabaseBridge.rpc('slg_bootstrap', { p_name: '관리팀', p_claimed_gold: 0, p_loop: 0 });
      await SupabaseBridge.rpc('slg_set_name', { p_name: '관리팀', p_change: false });
      state.commander.name = '관리팀';
      return await ServerEconomy.start();
    }""")
    c.ok(page.evaluate("ServerEconomy.enabled && ServerEconomy.isAdmin"), '운영자 계정으로 서버 경제에 연결')

    print('\n=== 운영자: DEV 패널 📮 운영 메일 탭에서 보내기 ===')
    page.evaluate("() => { document.getElementById('modal-debug')?.classList.add('open'); switchDebugTab('mail'); }")
    page.wait_for_selector('#dev-mail-editor-root .slg-ed-mail', timeout=8000)
    root = '#dev-mail-editor-root'
    page.click(f'{root} input[name=mail-target][value=one]')
    page.fill(f'{root} input[placeholder^="지휘관 이름"]', '알파')
    page.fill(f'{root} input[placeholder="예: 점검 보상"]', '점검 보상')
    page.fill(f'{root} textarea', '점검에 협조해 주셔서 감사합니다.\n작은 선물입니다.')
    nums = page.query_selector_all(f'{root} .slg-ed-grid2 input[type=number]')
    nums[0].fill('700'); nums[1].fill('2')
    sels = page.query_selector_all(f'{root} select.slg-ed-input')
    sels[0].select_option('g1'); page.wait_for_timeout(100)
    sels = page.query_selector_all(f'{root} select.slg-ed-input')
    sels[1].select_option('hero1'); page.wait_for_timeout(100)
    summary = page.inner_text(f'{root} .slg-ed-section .slg-ed-toolbar:last-child .slg-ed-muted')
    c.ok('700G' in summary and '용맹의 휘장' in summary and '발키리' in summary, f'첨부 요약이 보인다: {summary}')
    page.click(f'{root} button.slg-ed-btn.primary'); page.wait_for_timeout(1500)
    status = page.inner_text(f'{root} .slg-ed-status')
    c.ok('보냈습니다' in status and '알파' in status, f'발송 성공 표시: {status}')
    sent_rows = page.inner_text(f'{root} .slg-ed-mail-row')
    c.ok('점검 보상' in sent_rows and '받음 0명' in sent_rows, '보낸 메일 목록에 나온다 (받음 0명)')
    page.screenshot(path=os.environ.get('SHOT_DIR', '/tmp') + '/mail_admin.png', full_page=False)
    page.evaluate("() => closeAllModals()")

    print('\n=== 플레이어: 우편함에서 받기 ===')
    page.evaluate("""async () => {
      __pg.setUser('a');
      state.commander.name = '알파';
      await ServerEconomy.sync('now');
    }""")
    badge = page.evaluate("[...document.querySelectorAll('[data-mail-badge]')].map(e => [e.hidden, e.textContent])")
    c.ok(all(not h and t == '1' for h, t in badge), f'우편함 버튼과 메뉴 핸들에 배지 1이 뜬다: {badge}')
    g0 = page.evaluate("state.gold"); r0 = page.evaluate("state.rewinders"); col0 = page.evaluate("(state.characterCollection || []).length")
    page.evaluate("() => openMailbox()"); page.wait_for_timeout(800)
    c.ok('점검 보상' in page.inner_text('#mailbox-body'), '우편함 목록에 메일이 보인다')
    page.click('#mailbox-body [data-mail-open]'); page.wait_for_timeout(500)
    detail = page.inner_text('#mailbox-body')
    c.ok('작은 선물입니다' in detail and '용맹의 휘장' in detail and '발키리' in detail, '열면 본문과 첨부(유물 · 캐릭터 이름)가 보인다')
    page.screenshot(path=os.environ.get('SHOT_DIR', '/tmp') + '/mail_player.png', full_page=False)
    page.click('#mailbox-body [data-mail-claim]'); page.wait_for_timeout(2000)
    c.ok(page.evaluate("state.gold") - g0 == 700, f"골드 +700: {g0} → {page.evaluate('state.gold')}")
    c.ok(page.evaluate("state.rewinders") - r0 == 2, f"리와인더 +2: {r0} → {page.evaluate('state.rewinders')}")
    c.ok(page.evaluate("state.run.relics.map(r => r.id)") == ['g1'], f"유물 지급: {page.evaluate('state.run.relics.map(r => r.id)')}")
    cols = page.evaluate("(state.characterCollection || []).filter(x => x.source === 'mail').map(x => x.characterId)")
    c.ok(cols == ['hero1'] and page.evaluate("(state.characterCollection || []).length") == col0 + 1, f'캐릭터가 용병 명부에 들어온다: {cols}')
    c.ok(page.evaluate("ServerEconomy.snapshot.player.gold") == page.evaluate("state.gold"), '화면 골드 = 서버 골드')
    badge = page.evaluate("[...document.querySelectorAll('[data-mail-badge]')].map(e => e.hidden)")
    c.ok(all(badge), '받은 뒤 배지가 사라진다')
    c.ok('받음' in page.inner_text('#mailbox-body'), '받은 메일은 "받음"으로 표시된다')

    print('\n=== 두 번 받기 · 캐릭터 중복 전달 방지 ===')
    r = page.evaluate("async () => await ServerEconomy.call('slg_mail_claim', { p_id: 1 })")
    c.ok(r.get('error') == 'already_claimed', '같은 메일을 다시 받으면 거절')
    page.evaluate("async () => { await ServerEconomy.sync('now'); await ServerEconomy.sync('now'); }")
    c.ok(page.evaluate("(state.characterCollection || []).filter(x => x.source === 'mail').length") == 1, '동기화를 반복해도 캐릭터는 한 번만 들어온다')
    c.ok(page.evaluate("__pg.q(\"select count(*)::int as n from slg_inbox where kind = 'unit_gift'\").then(r => r[0].n)") == 0, '받은 캐릭터 우편은 서버에서 지워진다 (ack)')

    print('\n=== 일반 플레이어는 보낼 수 없다 ===')
    r = page.evaluate("async () => await ServerEconomy.call('slg_admin_mail_send', { p_target: 'all', p_title: 'x', p_body: '', p_attach: {}, p_days: 30, p_include_new: false })")
    c.ok(r.get('ok') is False, f'플레이어 계정으로 발송 시도는 실패: {r.get("error")}')

    print('\n오류:', [e for e in errors if 'supabase' not in e.lower()][:5])
    c.ok(not [e for e in errors if 'PAGEERROR' in e], '페이지 오류 없음')
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건')
sys.exit(1 if c.fail else 0)
