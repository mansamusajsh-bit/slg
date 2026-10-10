"""맵 크기: 새 템플릿 10x16 기본 · 옛 8x14 템플릿은 그대로 · 에디터 크기 변경(가운데 정렬) · 전술 화면 가로폭 맞춤 + 세로 스크롤."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

TPL = """
(id) => {
  const t = MapSchema.createBlankTacticalMapTemplate(id);
  t.spawnPoints = { player: [{x:4,y:14},{x:5,y:14}], enemy: [{x:4,y:1}] };
  MapSchema.applySpawnPointsToTiles(t.tiles, t.spawnPoints);
  t.units = [{ id:'e1', name:'고블린', owner:'ENEMY', side:'ENEMY', classType:'MELEE', unitClass:'MELEE', x:4, y:1, hp:50, maxHp:50, atk:30, def:20, baseAP:2, ap:2 }];
  window.__templates[id] = JSON.parse(JSON.stringify(t));
}"""

srv=start_server()
c=Check()
with sync_playwright() as pw:
    browser,page,errors=new_page(pw)
    page.set_viewport_size({'width':393,'height':760})
    page.goto(f'http://127.0.0.1:{PORT}/index.html'); page.wait_for_timeout(1500)

    print('=== [스키마] ===')
    c.ok(page.evaluate("[MapSchema.DEFAULT_TEMPLATE_WIDTH, MapSchema.DEFAULT_TEMPLATE_HEIGHT]")==[10,16],'새 템플릿 기본 크기 10x16')
    c.ok(page.evaluate("""() => { const t = MapSchema.createBlankTacticalMapTemplate('X', 8, 14); const raw = JSON.parse(JSON.stringify(t));
      delete raw.width; delete raw.height; delete raw.cols; delete raw.rows; const n = MapSchema.normalizeTacticalMapTemplate(raw, 'X'); return [n.width, n.height]; }""")==[8,14],
      '크기 필드가 없는 옛 문서는 타일 좌표로 8x14를 읽는다 (10x16으로 오인하지 않음)')

    print('=== [에디터] ===')
    page.evaluate("""() => { const t = MapSchema.createBlankTacticalMapTemplate('A-1', 8, 14);
      t.tiles.forEach(tt => { if (tt.x===0) tt.terrain='forest'; });
      t.spawnPoints = {player:[{x:3,y:12}], enemy:[]};
      window.__templates['A-1'] = JSON.parse(JSON.stringify(t)); }""")
    page.evaluate("MapEditorController.open()"); page.wait_for_timeout(800)
    c.ok(page.evaluate("[MapEditorController.COLS, MapEditorController.ROWS]")==[8,14],'옛 8x14 템플릿은 에디터에서도 8x14로 열린다')
    c.ok(page.evaluate("document.querySelectorAll('#civ4-editor-grid-dom .civ4-tile').length")==112,'에디터 그리드 112칸')
    page.fill('#civ4-editor-width-input','10'); page.fill('#civ4-editor-height-input','16')
    page.click('#btn-civ4-resize-map'); page.wait_for_timeout(300)
    r=page.evaluate("""() => { const d=MapEditorController.currentMapData; const sp=d.find(t=>t.isSpawnPlayer);
      return {size:[MapEditorController.COLS, MapEditorController.ROWS], n:d.length, spawn:[sp.x,sp.y],
        forestCol1:d.filter(t=>t.x===1&&t.terrain==='forest').length, dom:document.querySelectorAll('#civ4-editor-grid-dom .civ4-tile').length,
        fits: document.getElementById('civ4-editor-grid-dom').getBoundingClientRect().right <= innerWidth } }""")
    c.ok(r['size']==[10,16] and r['n']==160 and r['dom']==160,f'크기 변경 8x14 → 10x16 ({r})')
    c.ok(r['spawn']==[4,13] and r['forestCol1']==14,'기존 칸은 가운데 정렬로 옮겨진다 (좌우·위아래 1칸씩 추가)')
    c.ok(r['fits'],'에디터 그리드가 폰 가로폭 안에 들어온다')
    page.evaluate("MapEditorController.loadTemplate('Z-new')"); page.wait_for_timeout(500)
    c.ok(page.evaluate("[MapEditorController.COLS, MapEditorController.ROWS, MapEditorController.currentMapData.length]")==[10,16,160],'저장 안 된 새 템플릿은 10x16으로 시작')
    page.evaluate("MapEditorController.close()")

    print('=== [전술 화면] ===')
    enter_region(page)
    for i in ['A-1','A-2','B-1']: page.evaluate(TPL,i)
    page.evaluate("() => { state.run.mapState.nodes.forEach(n => { if (n.type==='event'||n.type==='shop') n.type='battle'; }); }")
    page.evaluate("(id)=>selectNode(id)", page.evaluate("state.run.mapState.layers[0][0]"))
    page.click('#btn-open-deploy-modal'); page.wait_for_selector('#modal-sector-deploy.open', timeout=3000)
    page.click('#modal-sector-deploy .strat-btn-launch-main'); page.wait_for_timeout(1500)
    g=page.evaluate("""() => { const s=document.getElementById('grid-scroll'); const g=document.getElementById('grid-map').getBoundingClientRect();
      const t=document.querySelector('#grid-map .tile').getBoundingClientRect();
      return {w:g.width, vw:document.getElementById('viewport').clientWidth, tw:t.width, th:t.height, sh:s.scrollHeight, ch:s.clientHeight, top:s.scrollTop} }""")
    c.ok(page.evaluate("[state.currentBattle.map.width, state.currentBattle.map.height]")==[10,16],'전투 맵 10x16')
    c.ok(g['w'] >= g['vw'] - 14,f'맵이 가로폭을 채운다 ({g["w"]:.0f}/{g["vw"]})')
    c.ok(abs(g['tw']-g['th']) < 1.5,'칸은 정사각형')
    c.ok(g['sh'] > g['ch'] and g['top'] > 0,'세로로 넘치면 스크롤되고, 시작 시 아군(아래쪽)이 보이게 내려가 있다')
    page.evaluate("document.getElementById('grid-scroll').scrollTop=9999")
    page.evaluate("processEnemyTurn()"); page.wait_for_timeout(300)
    c.ok(page.evaluate("document.getElementById('grid-scroll').scrollTop")==0,'적 턴: 화면 밖(위쪽) 적이 행동하면 그쪽으로 스크롤')
    page.wait_for_timeout(3000)
    c.ok(not errors, f'콘솔/페이지 오류 없음 {errors[:3]}')
    browser.close()
print(f'\n{c.n-c.fail}/{c.n} 통과')
sys.exit(1 if c.fail else 0)
