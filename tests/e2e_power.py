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
    # A-1은 적 스폰 4개, 나머지 섹터는 스폰 1개뿐 (인원이 모자라면 생성기가 칸을 더 찾아야 한다)
    for sid in page.evaluate("Object.keys(WORLD_SECTORS)"):
        page.evaluate(TPL_JS, [page.evaluate("(s)=>MapSchema.resolveDefaultTemplateId(s)", sid), [[1,1],[2,1],[3,1],[4,1]] if sid=='A-1' else [[3,1]]])
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
    rng=page.evaluate("(id)=>getEnemyCountRange(RunEngine.getNode(state.run,id))", start)
    c.ok(est and est['min']==round(avg*rng[0]) and est['max']==round(avg*rng[1]), f'적 {rng[0]}~{rng[1]}명 × 평균 {avg:.0f} (got {est})')
    page.evaluate("renderAll()"); page.wait_for_timeout(500)
    txt=page.inner_text('#strat-sector-power')
    c.ok(txt==f"{est['min']}~{est['max']} PWR", f'전략 패널 적 전투력 표시 = 추정치 (got {txt!r})')
    c.ok('320' not in txt, '고정 recPower(320)가 표시되지 않음')

    print('\n=== 적 인원: 섹터 진행도에 따라 증가, 오차 1명 ===')
    ranges=page.evaluate("""()=>RunEngine.sortSectorIds(WORLD_SECTORS).map(sid=>[sid, getEnemyCountRange({sectorId:sid,type:'battle'}), getEnemyCountRange({sectorId:sid,type:'elite'})])""")
    print('   ', ranges)
    c.ok(all(r[1][1]-r[1][0]==1 for r in ranges), '모든 섹터에서 인원 오차 1명')
    c.ok(all(ranges[i+1][1][0]==ranges[i][1][0]+1 for i in range(len(ranges)-1)), '다음 섹터마다 1명씩 증가')
    c.ok(all(r[2][0]==r[1][0]+1 for r in ranges), '정예는 +1명')
    gen=page.evaluate("""async ()=>{
      const out=[];
      for (const sid of RunEngine.sortSectorIds(WORLD_SECTORS)) {
        const tpl=await loadTacticalMapTemplate(MapSchema.resolveDefaultTemplateId(sid));
        const range=getEnemyCountRange({sectorId:sid,type:'battle'});
        for (let i=0;i<12;i++) {
          const m=generateBattleMap(tpl, sid+'-T'+i, {enemyPool: buildEnemyPool(WORLD_SECTORS[sid],'battle'), enemyCount: range, sectorId: sid});
          const cells=new Set(m.enemies.map(e=>e.x+','+e.y));
          const bad=m.enemies.filter(e=>{const t=m.tiles.find(t=>t.x===e.x&&t.y===e.y); return !t || !['plain','forest'].includes(t.terrain||t.type||'plain') || t.structure;}).length;
          out.push({sid, n:m.enemies.length, range, unique: cells.size===m.enemies.length, bad});
        }
      }
      return out;
    }""")
    c.ok(all(g['range'][0]<=g['n']<=g['range'][1] for g in gen), f"실제 생성 인원이 범위 안 ({sorted(set((g['sid'],g['n']) for g in gen))})")
    c.ok(all(g['unique'] and g['bad']==0 for g in gen), '적끼리 칸이 겹치지 않고 이동 가능한 칸에만 배치 (스폰 1개 템플릿 포함)')
    same=page.evaluate("""async ()=>{ const tpl=await loadTacticalMapTemplate('B-1'); const o={enemyPool: buildEnemyPool(WORLD_SECTORS['B-1'],'battle'), enemyCount:[4,5], sectorId:'B-1'};
      const a=generateBattleMap(tpl,'SAME-1',o), b=generateBattleMap(tpl,'SAME-1',o); return JSON.stringify(a.enemies.map(e=>[e.x,e.y,e.name]))===JSON.stringify(b.enemies.map(e=>[e.x,e.y,e.name])); }""")
    c.ok(same, '같은 seed면 같은 적 배치 (예지·재현 유지)')

    real=page.evaluate("""async (id)=>{ const ok=await enterEncounter(id); const n=state.enemyUnits.length; const g=(state.currentBattle.rewards||[]).filter(r=>r.type==='gold').reduce((s,r)=>s+r.amount,0);
      executeTacticalRetreat && executeTacticalRetreat(); return {ok, n, g}; }""", start)
    c.ok(real['ok'] and rng[0]<=real['n']<=rng[1] and real['g']==real['n']*100, f"실제 전투 진입: 적 {real['n']}명, 보상 {real['g']}G (범위 {rng})")
    page.wait_for_timeout(400)

    print('\n=== 클리어 보상 = 실제 지급 규칙 ===')
    rew=page.evaluate("(id)=>{ const n=RunEngine.getNode(state.run,id); return describeNodeClearReward(n, WORLD_SECTORS[n.sectorId]); }", start)
    c.ok(rew['text'].startswith(f"{rng[0]*100}~{rng[1]*100}G") and '리와인더 50%' in rew['text'], f"일반 전투 보상 = 적 수 × 100G (got {rew['text']!r})")
    txtr=page.inner_text('#strat-sector-reward')
    c.ok(txtr==rew['text'] and '250G + 장비' not in txtr, f'전략 패널 보상 표시 (got {txtr!r})')

    print('\n=== 아군 전투력 표시 ===')
    u=page.evaluate("(()=>{ const u=state.playerUnits.find(x=>!x.isDead); return {id:u.id, p:calculateUnitPower(u)}; })()")
    roster=page.inner_text('#strat-characters-roster-wrap')
    c.ok(f"{u['p']} PWR" in roster, f"로스터에 공통 공식 전투력 {u['p']} 표시")

    print('\n=== 예상 턴당 유지비 = 출전 편성 유지비 합계 ===')
    exp=page.evaluate("getSelectedDeployUnits().reduce((s,u)=>s+getUnitUpkeep(u),0)")
    up=page.inner_text('#strat-sector-upkeep')
    c.ok(up==f'{exp}G / 턴', f'섹터 패널 유지비 = 편성 합계 {exp}G (got {up!r})')
    c.ok(page.inner_text('#strat-army-upkeep')==up, '부대 유지비 표시와 일치')

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
