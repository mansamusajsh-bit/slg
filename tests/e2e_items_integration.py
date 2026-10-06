"""서버 권위 아이템 종단 검증: 브라우저의 실제 클라이언트 코드 + 브라우저 안의 PGlite 에 올린 실제 supabase-economy.sql.
스텁이 아니라서 클라이언트가 보내는 인자 이름 · 서버 응답 모양이 어긋나면 여기서 잡힌다."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

srv = start_server(); c = Check()
with sync_playwright() as pw:
    browser, page, errors = new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1500)
    page.evaluate("() => { startNewRun('ITEMS-1', { force: true }); }")

    print('\n=== 설치: 실제 SQL + 클라이언트 ===')
    page.evaluate("""async () => {
      if (!window.SupabaseBridge) window.SupabaseBridge = {};   // CDN 이 막힌 테스트 환경: 브리지 껍데기만 둔다 (pg-mock 이 rpc 를 채운다)
      const m = await import('/tests/browser/pg-mock.js');
      await m.installPgMock({ users: ['a', 'b'] });
      const put = (col, id, data) => __pg.db.query('insert into slg_records (collection_name, record_id, data) values ($1, $2, $3) on conflict (collection_name, record_id) do update set data = excluded.data', [col, id, JSON.stringify(data)]);
      for (const [id, kind] of [['g1', 'gift'], ['c1', 'commander'], ['c2', 'commander'], ['c3', 'commander'], ['rn', 'rename']])
        await put('relics', id, { id, name: '유물 ' + id, kind, rarity: 'rare', description: '', effects: kind === 'gift' ? [{ scope: 'self', stat: 'def', value: 2 }] : [] });
      await put('rewardPools', 'A-1-battle', { id: 'A-1-battle', rolls: 1, allowDuplicates: false, entries: [{ type: 'relic', kind: 'gift', id: 'g1', weight: 1 }] });
      await put('rewardPools', 'A-1-boss-relic', { id: 'A-1-boss-relic', rolls: 3, allowDuplicates: false, entries: [1, 2, 3].map(n => ({ type: 'relic', kind: 'commander', id: 'c' + n, weight: 1 })) });
      state.commander.name = '테스터';
      window.__t0 = Date.now();
      await __pg.at(window.__t0);
      return await ServerEconomy.start();
    }""")
    c.ok(page.evaluate("ServerEconomy.enabled && ServerEconomy.itemsActive"), '서버 경제가 켜지고 서버가 아이템 함수를 가지고 있다 (itemsActive)')
    c.ok(page.evaluate("state.rewinders") == 3 and page.evaluate("state.run.relics.length") == 0, '서버 값 반영: 리와인더 3개 · 유물 없음')

    print('\n=== 조작은 다음 동기화에 되돌아온다 ===')
    page.evaluate("() => { state.rewinders = 99; state.run.relics = [{ instanceId: 'x', id: 'c1', name: '가짜', kind: 'commander', rarity: 'legendary', effects: [] }]; }")
    page.evaluate("async () => { await ServerEconomy.sync('now'); }")
    c.ok(page.evaluate("state.rewinders") == 3 and page.evaluate("state.run.relics.length") == 0, '리와인더 99 · 가짜 유물은 동기화 후 서버 값(3 · 없음)으로 돌아온다')
    page.evaluate("async () => await ServerEconomy.call('slg_set_name', { p_name: '테스터', p_change: false })")   # 처음 이름 정하기
    r = page.evaluate("async () => await ServerEconomy.call('slg_set_name', { p_name: '해커', p_change: true })")
    c.ok(r.get('error') == 'no_relic', f"이름을 정한 뒤 개명 유물 없이 p_change=true 로 부르면 거절: {r.get('error')}")
    r = page.evaluate("async () => await ServerEconomy.call('slg_encounter_claim', { p_ref: 'forged-1' })")
    c.ok(r.get('error') == 'no_encounter', '시작하지 않은 전투를 수령하려 하면 거절')
    g0 = page.evaluate("state.gold")
    page.evaluate("() => { Wallet.earn('earn_reward', 500, `${state.player.loopCount}:forged-1`); }")
    page.evaluate("async () => { await Wallet.flush(); await ServerEconomy.sync('now'); }")
    c.ok(page.evaluate("state.gold") == g0, f"수령하지 않은 전투 ref 로 받은 골드는 서버가 거절해 되돌아온다 ({g0} → {page.evaluate('state.gold')})")

    print('\n=== 전투 수령 (실제 클라이언트 흐름) ===')
    battle = "{ id: 'enc-1', nodeId: 'A-1-003', sectorId: 'A-1', type: 'battle', enemies: [{}, {}, {}, {}, {}] }"
    page.evaluate("""async () => {
      await ServerEconomy.call('slg_encounter_start', { p_ref: 'enc-1', p_node_id: 'A-1-003', p_sector: 'A-1', p_type: 'battle', p_enemies: 5 });
      await __pg.at(window.__t0 + 60000);
    }""")
    g1 = page.evaluate("state.gold")
    page.evaluate(f"async () => await claimBattleReward({battle})"); page.wait_for_timeout(500)
    page.evaluate("async () => { await Wallet.flush(); await ServerEconomy.sync('now'); }")
    c.ok(page.evaluate("state.run.relics.map(r => r.id)") == ['g1'], f"서버가 굴린 보상 풀 유물(g1)이 지급된다: {page.evaluate('state.run.relics.map(r => r.id)')}")
    gain = page.evaluate("state.gold") - g1
    c.ok(gain == page.evaluate("scaleIncomeWithRelics(500)"), f'골드는 서버가 정한 기준액(적 5 × 100)으로 받는다: +{gain}')
    server_gold = page.evaluate("ServerEconomy.snapshot.player.gold")
    c.ok(server_gold == page.evaluate("state.gold"), f'클라이언트 골드 = 서버 골드: {server_gold}')
    page.evaluate(f"async () => await claimBattleReward({battle})"); page.wait_for_timeout(300)
    c.ok(page.evaluate("state.run.relics.length") == 1, '같은 전투를 다시 수령해도 유물이 늘지 않는다')

    print('\n=== 선물: 서버가 유물을 소비해야 능력치가 오른다 ===')
    ally = page.evaluate("state.playerUnits.find(u => !u.isDead).id")
    d0 = page.evaluate("(id) => state.playerUnits.find(u => u.id === id).def", ally)
    inst = page.evaluate("state.run.relics[0].instanceId")
    page.evaluate("([i, u]) => giftRelicToUnit(i, u)", [inst, ally]); page.wait_for_timeout(500)
    d1 = page.evaluate("(id) => state.playerUnits.find(u => u.id === id).def", ally)
    used = page.evaluate("async () => (await __pg.q(\"select used_for from slg_relics where used_ms is not null\")).map(r => r.used_for)")
    c.ok(d1 == d0 + 2 and used == ['gift'] and page.evaluate("state.run.relics.length") == 0, f'선물 후 능력치 +2 · 서버 기록 used_for=gift · 보관함에서 빠짐 (방어 {d0} → {d1})')

    print('\n=== 보스: 서버가 후보 3개를 정하고 고른 것만 ===')
    page.evaluate("""async () => {
      await ServerEconomy.call('slg_encounter_start', { p_ref: 'enc-9', p_node_id: 'A-1-boss', p_sector: 'A-1', p_type: 'boss', p_enemies: 4 });
      await __pg.at(window.__t0 + 120000);
    }""")
    rw_before = page.evaluate("state.rewinders")
    page.evaluate("() => claimBattleReward({ id: 'enc-9', nodeId: 'A-1-boss', sectorId: 'A-1', type: 'boss', enemies: [{}, {}, {}, {}] })"); page.wait_for_timeout(800)
    opts = page.evaluate("state.run.pendingRelicChoice && state.run.pendingRelicChoice.options")
    c.ok(opts is not None and sorted(opts) == ['c1', 'c2', 'c3'], f'후보 3개: {opts}')
    rw_boss = page.evaluate("state.rewinders")
    c.ok(page.evaluate("state.run.relics.length") == 0 and rw_boss == rw_before + 1, f'고르기 전에는 유물이 없고, 보스 리와인더(+1)는 확정 지급 ({rw_before} → {rw_boss})')
    page.evaluate("() => chooseRelicReward(1)"); page.wait_for_timeout(800)
    got = page.evaluate("state.run.relics.map(r => r.id)")
    c.ok(got == [opts[1]] and page.evaluate("state.run.pendingRelicChoice") is None, f'고른 번호의 유물({opts[1]}) 하나만 지급: {got}')
    c.ok(page.evaluate("state.run.equippedRelics.length") == 1, '지휘관 유물은 빈 슬롯에 서버가 장착한다')

    print('\n=== 리와인더 구매 (서버가 가격을 정한다) ===')
    g2 = page.evaluate("state.gold")
    page.evaluate("buyVillageItem('REWIND', 120, 0)"); page.wait_for_timeout(700)
    page.evaluate("async () => { await ServerEconomy.sync('now'); }")
    spent = g2 - page.evaluate("state.gold")
    c.ok(page.evaluate("state.rewinders") == rw_boss + 1 and 100 <= spent <= 200 and page.evaluate("ServerEconomy.snapshot.player.gold") == page.evaluate("state.gold"), f'리와인더 +1 ({rw_boss} → {page.evaluate("state.rewinders")}), 골드 -{spent}G 가 서버 기준으로 맞다')

    print('\n=== 회귀하면 유물은 사라지고 리와인더는 남는다 ===')
    page.evaluate("async () => { await __pg.at(window.__t0 + 300000); await ServerEconomy.onReturnByDeath(1); await ServerEconomy.sync('now'); }")
    rw_end = page.evaluate("state.rewinders")
    c.ok(page.evaluate("state.run.relics.length") == 0 and rw_end == rw_boss + 1, f'서버 회귀 처리 후: 유물 없음 · 리와인더 유지 ({rw_end}개) / 유물 {page.evaluate("state.run.relics.length")}개')
    c.ok(errors == [], '콘솔/페이지 오류 없음 ' + str(errors[:3]))
    browser.close()
srv.shutdown()
print(f"\n{c.n-c.fail}/{c.n} 통과", '' if not c.fail else f'— 실패 {c.fail}건')
sys.exit(1 if c.fail else 0)
