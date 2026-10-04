"""국가별 전투 특색: 적 스탯 보정 · 적 인원 상한(통솔력-1) · 포로(몸값) · 부관 브리핑(수치 없이 말로 설명)."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

POOL_JS = """
(n) => {
  window.__characters = Array.from({length:n}, (_,i) => ({
    id: 'rchar_'+i, name: '캐릭터'+i, classType: 'MELEE', unitClass: 'MELEE', avatar: '👤',
    stats: { hp: 100, maxHp: 100, atk: 40, def: 30, mobility: 2 }, favorability: 70, imageUrl: ''
  }));
  syncGlobalCharactersFromSupabase(JSON.parse(JSON.stringify(window.__characters)));
}"""

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    page.evaluate(POOL_JS, 4)
    page.evaluate("()=>{ startNewRun('RUN-REGION',{force:true}); }")

    print('\n=== 국가 보정이 적 스탯에 반영 ===')
    r=page.evaluate("""()=>{
      const sec=WORLD_SECTORS['A-2'];
      const neutral=buildEnemyPool(sec,'battle')[0];
      const torva=buildEnemyPool(sec,'battle','torva')[0];
      const rokan=buildEnemyPool(sec,'battle','rokan')[0];
      return {n:[neutral.atk,neutral.def,neutral.maxHp], t:[torva.atk,torva.def,torva.maxHp], r:[rokan.atk,rokan.def,rokan.maxHp]};
    }""")
    print('   ', r)
    c.ok(r['t'][1]>r['n'][1] and r['t'][0]<=r['n'][0], '토르바: 방어가 높고 공격은 낮다')
    c.ok(r['r'][0]>r['n'][0] and r['r'][1]<=r['n'][1], '로칸: 공격이 높고 방어는 낮다')

    print('\n=== 적 최대 인원 = 통솔력 - 1 ===')
    res=page.evaluate("""()=>{
      const cap=getLeadership()-1; const out=[];
      for (const sid of RunEngine.sortSectorIds(WORLD_SECTORS)) for (const t of ['battle','elite','boss'])
        for (const reg of [undefined,'arca','elda','liona']) out.push(getEnemyCountRange({sectorId:sid,type:t,regionId:reg}));
      return {cap, maxSeen:Math.max(...out.map(r=>r[1])), minSeen:Math.min(...out.map(r=>r[0]))};
    }""")
    print('   ', res)
    c.ok(res['maxSeen']<=res['cap'], f"어떤 경우에도 적 인원 ≤ 통솔력-1 ({res})")
    c.ok(res['minSeen']>=1, '적은 최소 1명')

    print('\n=== 몸값: 기본 300G, 레벨·승급으로 증가 ===')
    g=page.evaluate("""()=>({
      base:getCaptiveRansom({level:1,promotions:{combatRank:0}}),
      lv:getCaptiveRansom({level:5,promotions:{combatRank:0}}),
      rank:getCaptiveRansom({level:1,promotions:{combatRank:2}}),
      both:getCaptiveRansom({level:5,promotions:{combatRank:2}})
    })""")
    print('   ', g)
    c.ok(g['base']==300, '레벨 1 · 승급 0 = 300G')
    c.ok(g['lv']>g['base'] and g['rank']>g['base'] and g['both']>max(g['lv'],g['rank']), '레벨·승급이 높을수록 비싸다')

    print('\n=== 포로 판정 · 몸값 지불 ===')
    f=page.evaluate("""()=>{
      const u=state.playerUnits.find(x=>!x.isDead); u.level=3; u.promotions={combatRank:1};
      state.run.campaign.currentRegionId='naru';
      u.isDead=true; u.hp=0; if(u.stats) u.stats.hp=0;
      const realRandom=Math.random; Math.random=()=>0.0;  // 항상 붙잡힘
      const held=tryCaptureAlly(u,{name:'용병대장'});
      Math.random=realRandom;
      const ransom=u.captive && u.captive.ransom;
      state.gold=ransom-10; const poor=payCaptiveRansom(u.id);
      state.gold=ransom+50; const ok=payCaptiveRansom(u.id);
      return {held, ransom, poor, ok, gold:state.gold, alive:!u.isDead, hp:u.hp, maxHp:u.maxHp, captive:u.captive};
    }""")
    print('   ', f)
    c.ok(f['held'] and f['ransom']>300, '확률 0 굴림에서는 붙잡히고 몸값은 레벨·승급이 반영된다')
    c.ok(f['poor'] is False, '골드가 모자라면 되찾지 못한다')
    c.ok(f['ok'] and f['gold']==50 and f['alive'] and not f['captive'], '몸값을 내면 풀려난다')
    c.ok(0<f['hp']<f['maxHp'], '풀려난 직후에는 반쯤 다친 상태')
    none=page.evaluate("""()=>{
      const u=state.playerUnits.find(x=>!x.isDead); u.isDead=true; state.run.campaign.currentRegionId='mira';
      const rr=Math.random; Math.random=()=>0; const held=tryCaptureAlly(u,{name:'x'}); Math.random=rr; u.isDead=false; return held;
    }""")
    c.ok(none is False, '포로를 잡지 않는 국가(미라)에서는 어떤 굴림이어도 붙잡히지 않는다 (영구 사망)')
    hp=page.evaluate("""()=>Object.fromEntries(Object.keys(REGION_COMBAT).filter(k=>getRegionEnemyProfile(k).hostage>0).map(k=>[k,getRegionEnemyProfile(k).hostage]))""")
    print('   ', hp)
    c.ok(sorted(hp)==['luma','naru','silva'] and all(v>=0.5 for v in hp.values()), '나루·루마·실바만 포로를 잡고, 각각 50% 이상')

    print('\n=== 수치를 드러내지 않는다 ===')
    leak=page.evaluate("""()=>Object.entries(REGION_COMBAT).filter(([k,v])=>/\\d/.test(v.intel||'')||!v.intel).map(([k])=>k)""")
    c.ok(leak==[], f'모든 국가의 intel이 있고 숫자가 없다 (위반: {leak})')
    pool=page.evaluate("""()=>{ const ids=Object.keys(REGION_COMBAT); return ids.map(i=>getRegionEnemyProfile(i).intel); }""")
    c.ok(len(set(pool))==len(pool), '국가마다 서로 다른 설명')

    print('\n=== 콘솔 오류 ===')
    c.ok(not errors, f'페이지 오류 없음 ({errors[:3]})')

print('%d/%d pass' % (c.n-c.fail, c.n)); sys.exit(1 if c.fail else 0)
