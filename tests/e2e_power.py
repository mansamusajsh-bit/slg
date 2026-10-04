"""전투력(PWR): 아군·적이 같은 공식을 쓰고, 적 전투력이 고정 recPower가 아니라 실제 적 생성 규칙으로 계산되는지,
기억 계승이 공격·방어를 올리는지 검증."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

POOL_JS = """
(n) => {
  window.__characters = Array.from({length:n}, (_,i) => ({
    id: 'pchar_'+i, name: '캐릭터'+i, classType: 'MELEE', unitClass: 'MELEE', avatar: '👤',
    stats: { hp: 100, maxHp: 100, atk: 40, def: 30, mobility: 2 }, favorability: 70, imageUrl: ''
  }));
  syncGlobalCharactersFromSupabase(JSON.parse(JSON.stringify(window.__characters)));
}"""
TPL_JS = """
([id, spawns]) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12}], enemy: spawns.map(([x,y])=>({x,y})) };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}"""

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    page.evaluate(POOL_JS, 4)
    # 전술맵 템플릿은 전략맵이 처음 그려지기 전에 등록해 둔다 (실제로는 Supabase에 이미 있음)
    for sid in page.evaluate("Object.keys(WORLD_SECTORS)"):
        page.evaluate(TPL_JS, [page.evaluate("(s)=>MapSchema.resolveDefaultTemplateId(s)", sid), [[1,1],[2,1],[3,1],[4,1]]])
    page.evaluate("()=>{ startNewRun('RUN-PWR',{force:true}); }")
    start=page.evaluate("state.run.mapState.layers[0][0]")
    node=page.evaluate("(id)=>{ selectNode(id); return RunEngine.getNode(state.run, id) || state.run.mapState.nodes[id]; }", start)
    sector=node['sectorId']

    print('\n=== 공통 공식 ===')
    base=page.evaluate("calculateUnitPower({atk:40, def:30, hp:100, maxHp:100})")
    c.ok(base==140, f'기준 캐릭터 = 140 PWR (got {base})')
    half=page.evaluate("calculateUnitPower({atk:40, def:30, hp:50, maxHp:100})")
    c.ok(half==70, f'HP 절반이면 전투력 절반 (got {half})')
    lv=page.evaluate("calculateUnitPower({atk:40, def:30, hp:100, maxHp:100, level:9})")
    c.ok(lv==140, f'레벨 숫자 자체는 전투력에 더해지지 않음 (got {lv})')

    print('\n=== 적 전투력 = 실제 적 생성 규칙 ===')
    est=page.evaluate("(id)=>{ const n=RunEngine.getNode(state.run,id)||state.run.mapState.nodes[id]; return estimateNodeEnemyPower(n, WORLD_SECTORS[n.sectorId]); }", start)
    pool=page.evaluate("(id)=>{ const n=RunEngine.getNode(state.run,id)||state.run.mapState.nodes[id]; return buildEnemyPool(WORLD_SECTORS[n.sectorId], n.type).map(calculateUnitPower); }", start)
    avg=sum(pool)/len(pool)
    c.ok(est and est['min']==round(avg*2) and est['max']==round(avg*4), f'스폰 4개 → 2~4명 × 평균 {avg:.0f} (got {est})')
    page.evaluate("renderAll()"); page.wait_for_timeout(500)
    txt=page.inner_text('#strat-sector-power')
    c.ok(txt==f"{est['min']}~{est['max']} PWR", f'전략 패널 적 전투력 표시 = 추정치 (got {txt!r})')
    c.ok('320' not in txt, '고정 recPower(320)가 표시되지 않음')

    print('\n=== 아군 전투력 표시 ===')
    u=page.evaluate("(()=>{ const u=state.playerUnits.find(x=>!x.isDead); return {id:u.id, p:calculateUnitPower(u)}; })()")
    roster=page.inner_text('#strat-characters-roster-wrap')
    c.ok(f"{u['p']} PWR" in roster, f"로스터에 공통 공식 전투력 {u['p']} 표시")

    print('\n=== 기억 계승 스탯 상승 ===')
    r=page.evaluate("""(id)=>{
      const u=state.playerUnits.find(x=>x.id===id);
      SkillEngine.ensureUnitSkillState(u);
      const cid=String(u.sourceCharacterId||u.id);
      state.characterCollection = state.characterCollection || [];
      state.characterCollection.push({characterId: cid});
      const before={lv:u.level||1, atk:u.atk, def:u.def, p:calculateUnitPower(u)};
      const res=absorbDuplicateCharacter(id);
      return {res, before, after:{lv:u.level, atk:u.atk, def:u.def, p:calculateUnitPower(u)}};
    }""", u['id'])
    b,a=r['before'],r['after']
    if r['res'].get('resonance'):
        c.ok(a['atk']==b['atk'], '스킬트리 포화(잔향)면 레벨·스탯 그대로')
    else:
        c.ok(r['res']['ok'] and a['lv']==b['lv']+1, f"레벨 +1 ({b['lv']}→{a['lv']})")
        c.ok(a['atk']==b['atk']+8 and a['def']==b['def']+6, f"공격 +8 · 방어 +6 ({b['atk']}/{b['def']} → {a['atk']}/{a['def']})")
        c.ok(a['p']>b['p'], f"전투력 상승 ({b['p']} → {a['p']})")

    c.ok(not [e for e in errors if 'PAGEERROR' in e], 'JS 오류 없음 ' + str([e for e in errors if 'PAGEERROR' in e][:3]))
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
