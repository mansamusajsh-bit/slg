"""스킬 시전 대사: 호감도 구간(신뢰/보통/마지못해/광폭화 강제)별 상황 키·말풍선 색·출력 확률이 실제 전투에서 적용되는지 검증.
(거부 규칙 자체는 바꾸지 않았으므로 여기서는 '실제로 시전된 뒤'의 대사만 본다.)"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

TEMPLATE_JS = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id, 8, 14);
  t.spawnPoints = { player: [{x:2,y:12},{x:3,y:12},{x:4,y:12}], enemy: [{x:3,y:2}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [{ id:'e1', name:'고블린', owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', x:3, y:2, hp:50, maxHp:50, atk:30, def:20, baseAP:2, ap:2 }];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}"""

SETUP_JS = """() => {
  window.mk = (id, x, y, extra) => Object.assign({ id, name:id, owner:'PLAYER', classType:'KNIGHT', unitClass:'KNIGHT', level:1, hp:100, maxHp:100, atk:40, def:30, ap:2, baseAP:2, x, y, promotions:{combatRank:0}, isDead:false, isDeployed:true }, extra||{});
  window.DLG = { skill_cast_trust:['TRUST {skill}'], skill_cast_normal:['NORMAL {skill}'], skill_cast_reluctant:['RELUCT {skill}'], skill_forced:['FORCED {skill}'] };
  window.healSkill = () => SkillEngine.normalizeSkill({ id:'t_heal', name:'시험', type:'ACTIVE', costAP:0, coolDown:1, targeting:{mode:'SELF',rangeMin:0,rangeMax:0,radius:0,affects:'ALLY'}, effects:[{type:'HEAL', value:1}] });
  window.hurtSkill = () => SkillEngine.normalizeSkill({ id:'t_hurt', name:'시험', type:'ACTIVE', costAP:0, coolDown:1, targeting:{mode:'SELF',rangeMin:0,rangeMax:0,radius:0,affects:'ALLY'}, effects:[{type:'DAMAGE', value:1}] });
  // 전투 중 유닛을 하나 만들어 실제 performSkillCast 로 시전한다. rnd: Math.random 고정값 (확률 판정용)
  window.castAs = ({ aff, rnd = 0, dialogues = DLG, owner = 'PLAYER', berserk = false, hostile = false, direct = false, openOverlay = false }) => {
    document.getElementById('unit-speech-layer')?.remove();
    closeFullShotOverlay();
    state.commander.unlockedSkills = berserk ? { Berserk: true } : {};
    const extra = { affection: aff, owner };
    if (dialogues) extra.dialogues = dialogues;
    const u = mk('SK' + Math.random().toString(36).slice(2), 5, 5, extra);
    state.playerUnits.push(u);
    if (openOverlay) openFullShotOverlay(u);
    const skill = hostile ? hurtSkill() : healSkill();
    const orig = Math.random; Math.random = () => rnd;
    try {
      // direct: 호감도가 낮은 공격 스킬은 평소엔 useUnitSkill 에서 거부되므로 시전 후 대사 함수만 직접 부른다
      window.__lastResult = direct ? speakSkillCastLine(u, skill, { results: [] }) : performSkillCast(u, skill, 5, 5);
    } finally { Math.random = orig; }
    window.__lastUnit = u;
    return u.id;
  };
  window.speech = () => {
    const l = document.getElementById('unit-speech-layer');
    if (!l) return null;
    return { cls: l.className, text: l.querySelector('.unit-speech-text')?.textContent || '', illust: !!l.querySelector('.unit-speech-illust'), name: l.querySelector('.unit-speech-name')?.textContent || '' };
  };
}"""

srv=start_server(); c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1200)
    assert enter_region(page)
    for t in ('A-1','A-2','B-1'): page.evaluate(TEMPLATE_JS,t)
    page.evaluate("() => { state.run.mapState.nodes.forEach(n => { if (n.type==='event'||n.type==='shop') n.type='battle'; }); }")
    start=page.evaluate("state.run.mapState.layers[0][0]")
    page.evaluate("(id)=>selectNode(id)", start)
    page.click('#btn-open-deploy-modal'); page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main'); page.wait_for_timeout(700)
    c.ok(page.evaluate("state.playerUnits.length")>0, '전투 진입')
    errors.clear()
    page.evaluate(SETUP_JS)

    def cast(wait=1300, **kw):
        ok = page.evaluate("(kw)=>{ castAs(kw); return window.__lastResult; }", kw)
        page.wait_for_timeout(wait)
        return ok, page.evaluate("speech()")

    print('\n=== 호감도 구간별 상황 키 / 말풍선 색 (확률 판정은 항상 통과하도록 고정) ===')
    ok, s = cast(aff=85)
    c.ok(ok is True and s and 'mood-brave' in s['cls'] and s['text']=='TRUST 시험', f'호감도 85 → 신뢰 대사 + 호박색 말풍선 + {{skill}} 치환: {s}')
    ok, s = cast(aff=70)
    c.ok(s and s['text']=='TRUST 시험', '호감도 70 경계 → 신뢰')
    ok, s = cast(aff=69)
    c.ok(s and 'mood-normal' in s['cls'] and s['text']=='NORMAL 시험', f'호감도 69 경계 → 보통: {s}')
    ok, s = cast(aff=50)
    c.ok(s and s['text']=='NORMAL 시험', '호감도 50 경계 → 보통')
    ok, s = cast(aff=49)
    c.ok(s and 'mood-reluctant' in s['cls'] and s['text']=='RELUCT 시험', f'호감도 49 경계 → 마지못해 + 회색 말풍선: {s}')
    ok, s = cast(aff=10)
    c.ok(ok is True and s and s['text']=='RELUCT 시험', '호감도 10이어도 아군 지원 스킬은 거부 없이 시전되고 마지못해 대사')

    print('\n=== 출력 확률 (신뢰 60% / 보통 25% / 마지못해 70%) ===')
    for aff, rnd_pass, rnd_fail, label in [(85, 0.59, 0.6, '신뢰 60%'), (60, 0.24, 0.25, '보통 25%'), (40, 0.69, 0.7, '마지못해 70%')]:
        _, s_pass = cast(aff=aff, rnd=rnd_pass, wait=200)
        _, s_fail = cast(aff=aff, rnd=rnd_fail, wait=200)
        c.ok(s_pass is not None and s_fail is None, f'{label}: random={rnd_pass}이면 말하고 {rnd_fail}이면 침묵')

    print('\n=== 광폭화 강제 시전 (항상) ===')
    ok, s = cast(aff=20, rnd=0.999, berserk=True, hostile=True, direct=True)
    c.ok(ok and s and 'mood-forced' in s['cls'] and s['text']=='FORCED 시험', f'호감도 20 + 광폭화 + 공격 스킬 → 확률 무시하고 항상 강제 시전 대사(보라색): {s}')
    ok, s = cast(aff=20, rnd=0, berserk=True, hostile=False)
    c.ok(s and s['text']=='RELUCT 시험', '광폭화여도 지원 스킬은 강제 대사가 아니라 마지못해 대사')
    ok, s = cast(aff=60, rnd=0, berserk=True, hostile=True, direct=True)
    c.ok(s and s['text']=='NORMAL 시험', '호감도가 높으면 광폭화가 있어도 강제 대사가 아니다')

    print('\n=== 적 유닛은 말하지 않는다 ===')
    ok, s = cast(aff=85, owner='ENEMY', wait=200, direct=True)
    c.ok(s is None, '적 유닛 시전은 대사 없음')

    print('\n=== 고유 대사가 없는 기존 캐릭터: 성격 기본 풀로 대체 ===')
    ok, s = cast(aff=85, dialogues=None)
    exp = page.evaluate("""() => { const u = window.__lastUnit; const tone = DialogueLines.toneOf(u);
      return DialogueLines.DEFAULT_POOL.skill_cast_trust[tone].map(t => t.replace('{skill}', '시험')); }""")
    c.ok(s and s['text'] in exp, f'기본 풀의 신뢰 대사가 나옴: {s and s["text"]!r}')
    c.ok(s and '{' not in s['text'], '치환 안 된 {…} 가 남지 않음')

    print('\n=== 6가지 성격 × 4가지 상황 기본 대사가 모두 채워져 있다 ===')
    miss = page.evaluate("""() => { const out = [];
      ['skill_cast_trust','skill_cast_normal','skill_cast_reluctant','skill_forced'].forEach(k => {
        if (!DialogueLines.SITUATIONS.some(s => s.key === k)) out.push('상황없음:' + k);
        DialogueLines.TONES.forEach(t => { const arr = (DialogueLines.DEFAULT_POOL[k]||{})[t.key] || []; if (arr.length < 3) out.push(k + '/' + t.key + ':' + arr.length); });
      }); return out; }""")
    c.ok(miss == [], f'누락 없음 {miss}')
    sample = page.evaluate("""() => { const bad = []; const vars = { skill:'S', target:'T', win:50, hp:1, maxHp:1, name:'N' };
      ['skill_cast_trust','skill_cast_normal','skill_cast_reluctant','skill_forced'].forEach(k => DialogueLines.TONES.forEach(t => DialogueLines.DEFAULT_POOL[k][t.key].forEach(l => { const r = l.replace(/\\{(\\w+)\\}/g, (m, n) => vars[n] ?? m); if (/\\{\\w+\\}/.test(r)) bad.push(l); })));
      return bad; }""")
    c.ok(sample == [], f'모든 기본 대사의 치환 변수가 유효 {sample}')

    print('\n=== 대사 편집기에 새 상황이 보인다 ===')
    rows = page.evaluate("""() => { const d = document.createElement('div'); document.body.appendChild(d);
      DialogueLines.mountEditor(d, null, 'loyal'); const keys = [...d.querySelectorAll('.dlg-editor-row')].map(r => r.dataset.key);
      const filled = ['skill_cast_trust','skill_cast_normal','skill_cast_reluctant','skill_forced'].map(k => d.querySelector('.dlg-editor-row[data-key=\"' + k + '\"] textarea').value.split('\\n').filter(Boolean).length);
      d.remove(); return { keys, filled }; }""")
    c.ok(all(k in rows['keys'] for k in ['skill_cast_trust','skill_cast_normal','skill_cast_reluctant','skill_forced']), '편집기에 스킬 대사 4행 추가')
    c.ok(all(n == 3 for n in rows['filled']), f'랜덤 부여 시 각 상황에 3줄씩 채워짐 {rows["filled"]}')

    print('\n=== 풀샷 창이 같은 유닛을 보여주는 중이면 일러스트 중복 없이 말풍선만 ===')
    ok, s = cast(aff=85, openOverlay=True)
    c.ok(s and s['text']=='TRUST 시험' and s['illust'] is False, f'창이 열려 있으면 말풍선만(일러스트 없음): {s}')
    ok, s = cast(aff=85, openOverlay=False)
    c.ok(s and s['illust'] is True, '창이 닫혀 있으면 일러스트와 함께 연출')

    print('\n=== 기존 동작 유지 ===')
    c.ok(page.evaluate("isHostileSkill(hurtSkill()) === true && isHostileSkill(healSkill()) === false"), 'isHostileSkill: 피해=적대, 회복=비적대')
    c.ok(page.evaluate("DialogueLines.SITUATIONS.some(s => s.key === 'refuse_skill') && DialogueLines.DEFAULT_POOL.refuse_skill.loyal.length === 3"), '기존 refuse_skill 대사 그대로 존재')
    c.ok(not [e for e in errors if 'PAGEERROR' in e], 'JS 오류 없음 ' + str([e for e in errors if 'PAGEERROR' in e][:3]))
    browser.close()
srv.shutdown()
print(f'\n{c.n-c.fail}/{c.n} PASS'); sys.exit(1 if c.fail else 0)
