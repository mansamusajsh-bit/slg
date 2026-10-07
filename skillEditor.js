/**
 * skillEditor.js — 스킬 & 스킬트리 UI
 *
 *  - SkillEditor.mountBuilder(container, opts)   DEV 패널용 스킬/스킬트리 빌더
 *  - SkillEditor.renderLearnTree(container, unit, opts)   플레이어용 스킬트리 (SP로 습득)
 *
 * 스킬 데이터 구조와 효과 처리는 skillEngine.js(window.SkillEngine)가 담당한다.
 */
(function (global) {
  'use strict';

  const SE = () => global.SkillEngine;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TIERS = [1, 2, 3, 4];
  const TIER_LABELS = { 1: '기초', 2: '숙련', 3: '심화', 4: '궁극' };

  function iconHtml(skill, size) {
    if (skill.imageUrl) return `<img src="${esc(skill.imageUrl)}" alt="" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px;">`;
    return `<span style="font-size:${Math.round(size * 0.62)}px;line-height:1;">${esc(skill.icon || '⚡')}</span>`;
  }

  function effectOptions(selected, passive) {
    const E = SE().EFFECTS;
    const groups = {};
    Object.entries(E).forEach(([key, def]) => {
      if (passive ? !def.passive : def.passiveOnly) return;
      (groups[def.cat] = groups[def.cat] || []).push([key, def]);
    });
    return Object.entries(groups).map(([cat, list]) => `
      <optgroup label="${esc(SE().CATEGORY_LABELS[cat] || cat)}">
        ${list.map(([key, def]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${def.icon} ${esc(def.label)}</option>`).join('')}
      </optgroup>`).join('');
  }

  function readImageFile(file, cb) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    if (typeof global.compressImageDataUrl === 'function') {
      global.compressImageDataUrl(file, 128, 128, 0.85).then(url => url && cb(url));
      return;
    }
    const r = new FileReader();
    r.onload = (e) => typeof e.target.result === 'string' && cb(e.target.result);
    r.readAsDataURL(file);
  }

  // ==========================================================================
  // DEV 빌더
  // ==========================================================================
  /**
   * @param {HTMLElement} container
   * @param {{ getTree:()=>Array, setTree:(tree:Array)=>void, getClassType?:()=>string, onChange?:()=>void, compact?:boolean }} opts
   */
  function mountBuilder(container, opts) {
    if (!container || !SE()) return null;
    const ui = { editing: null, editingId: null };

    const tree = () => opts.getTree() || [];
    const commit = (next) => { opts.setTree(next); if (opts.onChange) opts.onChange(next); render(); };

    function blankSkill(type) {
      return SE().normalizeSkill({
        id: SE().newId(), name: type === 'PASSIVE' ? '새 패시브' : '새 스킬', type, tier: 1, costAP: 1, coolDown: 2, spCost: 1,
        targeting: type === 'PASSIVE' ? { mode: 'SELF', radius: 0, affects: 'ALLY' } : { mode: 'ENEMY', rangeMin: 1, rangeMax: 2, radius: 0, affects: 'ENEMY' },
        effects: type === 'PASSIVE' ? [{ type: 'BUFF_ATK', value: 10 }] : [{ type: 'DAMAGE', value: 25 }],
        autoDescription: true
      });
    }

    function startEdit(skill, isNew) {
      ui.editing = clone(skill);
      ui.editingId = isNew ? null : skill.id;
      render();
      const form = container.querySelector('.sk-form');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function nodeCard(n, list) {
      const s = SE().normalizeSkill(n);
      const prereqNames = s.prerequisites.map(id => (list.find(x => x.id === id) || {}).name).filter(Boolean);
      const isEditing = ui.editingId === s.id;
      return `
        <div class="sk-node ${s.type === 'PASSIVE' ? 'passive' : 'active'} ${isEditing ? 'editing' : ''}" data-id="${esc(s.id)}" title="${esc(s.description)}">
          <div class="sk-node-top">
            <div class="sk-node-icon">${iconHtml(s, 26)}</div>
            <div class="sk-node-main">
              <div class="sk-node-name">${s.startsLearned ? '<span class="sk-star" title="시작 시 습득">★</span>' : ''}${esc(s.name)}</div>
              <div class="sk-node-meta">${s.type === 'PASSIVE' ? '패시브' : `AP ${s.costAP} · 대기 ${s.coolDown}`} · SP ${s.spCost}</div>
            </div>
          </div>
          <div class="sk-node-desc">${esc(s.description)}</div>
          ${prereqNames.length ? `<div class="sk-node-prereq">↳ 선행: ${esc(prereqNames.join(', '))}</div>` : ''}
          <div class="sk-node-actions">
            <button type="button" class="sk-mini" data-act="edit" data-id="${esc(s.id)}">✏️ 편집</button>
            <button type="button" class="sk-mini" data-act="star" data-id="${esc(s.id)}" title="시작 시 습득 토글">★</button>
            <button type="button" class="sk-mini danger" data-act="del" data-id="${esc(s.id)}">🗑️</button>
          </div>
        </div>`;
    }

    function treeHtml() {
      const list = tree();
      return `
        <div class="sk-tree">
          ${TIERS.map(t => `
            <div class="sk-tier-col">
              <div class="sk-tier-head">T${t} · ${TIER_LABELS[t]}</div>
              <div class="sk-tier-nodes">${list.filter(n => (Number(n.tier) || 1) === t).map(n => nodeCard(n, list)).join('') || '<div class="sk-empty">비어 있음</div>'}</div>
            </div>`).join('')}
        </div>`;
    }

    function formHtml() {
      const s = ui.editing;
      if (!s) return `<div class="sk-form-empty">노드를 ✏️ 편집하거나 새 스킬을 만들어 보세요.</div>`;
      const passive = s.type === 'PASSIVE';
      const t = s.targeting;
      const E = SE().EFFECTS;
      const others = tree().filter(n => n.id !== s.id && (Number(n.tier) || 1) < s.tier);
      const modeOpts = Object.entries(SE().TARGET_MODES).map(([k, v]) => `<option value="${k}" ${t.mode === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
      const affOpts = Object.entries(SE().AFFECTS).map(([k, v]) => `<option value="${k}" ${t.affects === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
      return `
        <div class="sk-form">
          <div class="sk-form-title" style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span>${ui.editingId ? '✏️ 스킬 노드 편집' : '✨ 새 스킬 노드'}</span>
            <button type="button" class="sk-mini" data-act="random-skill" title="유형·계층·선행·★은 그대로 두고 효과·수치·이름을 무작위로 바꿉니다">🎲 랜덤</button>
          </div>
          <div class="sk-row">
            <div class="sk-icon-drop" data-role="icon-drop" title="클릭 또는 이미지 드래그&드롭">
              ${iconHtml(s, 40)}
              <input type="file" accept="image/*" data-role="icon-file" hidden />
            </div>
            <div class="sk-grow">
              <div class="sk-grid-3">
                <label>이름<input class="dbg-form-control" data-f="name" value="${esc(s.name)}" /></label>
                <label>아이콘(이모지)<input class="dbg-form-control" data-f="icon" value="${esc(s.icon)}" maxlength="4" /></label>
                <label>유형<select class="dbg-form-control" data-f="type">
                  <option value="ACTIVE" ${!passive ? 'selected' : ''}>⚡ 액티브</option>
                  <option value="PASSIVE" ${passive ? 'selected' : ''}>🛡️ 패시브</option>
                </select></label>
              </div>
              ${s.imageUrl ? '<button type="button" class="sk-mini" data-act="clear-img" style="margin-top:4px;">이미지 제거</button>' : ''}
            </div>
          </div>

          <div class="sk-grid-4">
            <label>계층<select class="dbg-form-control" data-f="tier">${TIERS.map(n => `<option value="${n}" ${s.tier === n ? 'selected' : ''}>T${n} ${TIER_LABELS[n]}</option>`).join('')}</select></label>
            <label>습득 SP<input type="number" min="0" max="9" class="dbg-form-control" data-f="spCost" value="${s.spCost}" /></label>
            ${passive ? '<span></span><span></span>' : `
            <label>소모 AP<input type="number" min="0" max="6" class="dbg-form-control" data-f="costAP" value="${s.costAP}" /></label>
            <label>재사용 대기(턴)<input type="number" min="1" max="10" class="dbg-form-control" data-f="coolDown" value="${s.coolDown}" /></label>`}
          </div>
          <label class="sk-check"><input type="checkbox" data-f="startsLearned" ${s.startsLearned ? 'checked' : ''}/> 시작 시 습득 (★ 캐릭터 생성 시 바로 사용 가능)</label>

          <div class="sk-subtitle">🎯 대상 지정</div>
          <div class="sk-grid-4">
            ${passive ? '' : `<label>방식<select class="dbg-form-control" data-t="mode">${modeOpts}</select></label>`}
            ${passive || t.mode === 'SELF' ? '' : `
            <label>최소 사거리<input type="number" min="0" max="8" class="dbg-form-control" data-t="rangeMin" value="${t.rangeMin}" /></label>
            <label>최대 사거리<input type="number" min="0" max="8" class="dbg-form-control" data-t="rangeMax" value="${t.rangeMax}" /></label>`}
            <label>${passive ? '오라 범위(0=자신만)' : '효과 범위(0=단일)'}<input type="number" min="0" max="4" class="dbg-form-control" data-t="radius" value="${t.radius}" /></label>
            ${(t.radius > 0 || t.mode === 'SELF' || t.mode === 'TILE') ? `<label>범위 내 대상<select class="dbg-form-control" data-t="affects">${affOpts}</select></label>` : ''}
          </div>

          <div class="sk-subtitle">🧪 효과 (위에서부터 순서대로 적용)</div>
          <div class="sk-effects">
            ${s.effects.map((e, i) => {
              const def = E[e.type] || {};
              return `
              <div class="sk-effect-row" data-i="${i}">
                <select class="dbg-form-control" data-e="type">${effectOptions(e.type, passive)}</select>
                ${def.value !== undefined && !['CLEANSE', 'TELEPORT', 'SWAP', 'STUN', 'ROOT', 'TAUNT', 'STEALTH', 'PROTECT'].includes(e.type)
                  ? `<label>수치<input type="number" class="dbg-form-control" data-e="value" value="${e.value}" /></label>` : '<span></span>'}
                ${def.status && !passive ? `<label>지속(턴)<input type="number" min="1" max="9" class="dbg-form-control" data-e="duration" value="${e.duration || 1}" /></label>` : '<span></span>'}
                ${def.scalable ? `<label>공격력 계수%<input type="number" min="0" max="300" class="dbg-form-control" data-e="scale" value="${e.scale || 0}" /></label>` : '<span></span>'}
                ${passive || def.selfOnly ? '<span></span>' : `<label>받는 쪽<select class="dbg-form-control" data-e="to">
                  <option value="targets" ${e.to !== 'self' ? 'selected' : ''}>대상</option>
                  <option value="self" ${e.to === 'self' ? 'selected' : ''}>시전자</option></select></label>`}
                <button type="button" class="sk-mini danger" data-act="del-effect" data-i="${i}">✕</button>
              </div>`;
            }).join('') || '<div class="sk-empty">효과가 없습니다.</div>'}
          </div>
          <button type="button" class="sk-mini" data-act="add-effect">➕ 효과 추가</button>

          ${others.length ? `
          <div class="sk-subtitle">🔗 선행 스킬 (하위 계층에서 선택)</div>
          <div class="sk-prereqs">
            ${others.map(o => `<label class="sk-check"><input type="checkbox" data-prereq="${esc(o.id)}" ${s.prerequisites.includes(o.id) ? 'checked' : ''}/> T${o.tier} ${esc(o.name)}</label>`).join('')}
          </div>` : ''}

          <div class="sk-subtitle">📝 설명</div>
          <label class="sk-check"><input type="checkbox" data-f="autoDescription" ${s.autoDescription ? 'checked' : ''}/> 효과로부터 자동 작성</label>
          <textarea class="dbg-form-control" rows="2" data-f="description" ${s.autoDescription ? 'disabled' : ''}>${esc(s.description)}</textarea>

          <div class="sk-form-actions">
            <button type="button" class="btn-cheat purple" data-act="save">💾 ${ui.editingId ? '노드 수정 저장' : '트리에 노드 추가'}</button>
            <button type="button" class="btn-cheat" style="background:#64748b;" data-act="cancel">취소</button>
          </div>
        </div>`;
    }

    function render() {
      const presetOpts = Object.entries(SE().PRESETS).map(([k, p]) => `<option value="${k}">${p.icon} ${esc(p.name)} ${p.type === 'PASSIVE' ? '(패시브)' : ''}</option>`).join('');
      const list = tree();
      container.innerHTML = `
        <div class="sk-builder">
          <div class="sk-toolbar">
            <button type="button" class="sk-mini" data-act="class-tree">🧬 병과 추천 트리 불러오기</button>
            <button type="button" class="sk-mini" data-act="random-tree" title="효과·수치·이름까지 무작위로 스킬트리 전체를 만듭니다">🎲 랜덤 트리</button>
            <button type="button" class="sk-mini" data-act="new-active">⚡ 새 액티브</button>
            <button type="button" class="sk-mini" data-act="new-passive">🛡️ 새 패시브</button>
            <span class="sk-toolbar-sep"></span>
            <select class="dbg-form-control sk-preset-select" data-role="preset">${presetOpts}</select>
            <button type="button" class="sk-mini" data-act="add-preset">➕ 프리셋 추가</button>
            <button type="button" class="sk-mini danger" data-act="clear">🧹 비우기</button>
          </div>
          <div class="sk-summary">총 ${list.length}개 노드 · ★ 시작 습득 ${list.filter(n => n.startsLearned).length}개 · 액티브 ${list.filter(n => String(n.type).toUpperCase() !== 'PASSIVE').length} / 패시브 ${list.filter(n => String(n.type).toUpperCase() === 'PASSIVE').length}</div>
          ${treeHtml()}
          ${formHtml()}
        </div>`;
      bind();
    }

    // 폼 입력값을 ui.editing에 반영 (재렌더 없이)
    function readForm() {
      const s = ui.editing;
      if (!s) return;
      const q = (sel) => container.querySelector(sel);
      const val = (sel) => { const el = q(sel); return el ? el.value : undefined; };
      const numv = (sel, d) => { const v = Number(val(sel)); return Number.isFinite(v) ? v : d; };
      if (q('[data-f="name"]')) s.name = val('[data-f="name"]').trim() || s.name;
      if (q('[data-f="icon"]')) s.icon = val('[data-f="icon"]').trim() || s.icon;
      s.tier = numv('[data-f="tier"]', s.tier);
      s.spCost = numv('[data-f="spCost"]', s.spCost);
      if (q('[data-f="costAP"]')) s.costAP = numv('[data-f="costAP"]', s.costAP);
      if (q('[data-f="coolDown"]')) s.coolDown = numv('[data-f="coolDown"]', s.coolDown);
      s.startsLearned = !!(q('[data-f="startsLearned"]') || {}).checked;
      s.autoDescription = !!(q('[data-f="autoDescription"]') || {}).checked;
      if (!s.autoDescription && q('[data-f="description"]')) s.description = val('[data-f="description"]');
      ['mode', 'rangeMin', 'rangeMax', 'radius', 'affects'].forEach(k => {
        const el = q(`[data-t="${k}"]`);
        if (el) s.targeting[k] = (k === 'mode' || k === 'affects') ? el.value : Number(el.value) || 0;
      });
      container.querySelectorAll('.sk-effect-row').forEach(row => {
        const e = s.effects[Number(row.dataset.i)];
        if (!e) return;
        const g = (k) => row.querySelector(`[data-e="${k}"]`);
        if (g('value')) e.value = Number(g('value').value) || 0;
        if (g('duration')) e.duration = Number(g('duration').value) || 1;
        if (g('scale')) e.scale = Number(g('scale').value) || 0;
        if (g('to')) { if (g('to').value === 'self') e.to = 'self'; else delete e.to; }
      });
      s.prerequisites = [...container.querySelectorAll('[data-prereq]')].filter(c => c.checked).map(c => c.dataset.prereq);
    }

    // 모델(ui.editing)을 정규화하고 다시 그림. 호출 전에 readForm()으로 입력값을 먼저 반영해 둔다.
    function refreshForm() {
      const keepId = ui.editing.id;
      ui.editing = SE().normalizeSkill(ui.editing, keepId);
      const lowerIds = tree().filter(n => (Number(n.tier) || 1) < ui.editing.tier).map(n => n.id);
      ui.editing.prerequisites = ui.editing.prerequisites.filter(id => lowerIds.includes(id));
      render();
    }

    function bind() {
      container.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = (ev) => {
          ev.preventDefault();
          const act = btn.dataset.act;
          const id = btn.dataset.id;
          const list = tree();
          if (act === 'edit') { const n = list.find(x => x.id === id); if (n) startEdit(SE().normalizeSkill(n), false); }
          else if (act === 'star') {
            commit(list.map(n => n.id === id ? Object.assign({}, n, { startsLearned: !n.startsLearned }) : n));
          }
          else if (act === 'del') {
            const n = list.find(x => x.id === id);
            if (!n || !global.confirm(`[${n.name}] 노드를 삭제할까요?`)) return;
            if (ui.editingId === id) { ui.editing = null; ui.editingId = null; }
            commit(list.filter(x => x.id !== id).map(x => Object.assign({}, x, { prerequisites: (x.prerequisites || []).filter(p => p !== id) })));
          }
          else if (act === 'new-active') startEdit(blankSkill('ACTIVE'), true);
          else if (act === 'new-passive') startEdit(blankSkill('PASSIVE'), true);
          else if (act === 'add-preset') {
            const pid = container.querySelector('[data-role="preset"]').value;
            const node = SE().fromPreset(pid);
            if (node) startEdit(node, true);
          }
          else if (act === 'class-tree') {
            const cls = opts.getClassType ? opts.getClassType() : 'DEFAULT';
            if (list.length && !global.confirm('현재 트리를 병과 추천 트리로 교체할까요?')) return;
            ui.editing = null; ui.editingId = null;
            commit(SE().buildClassTree(cls));
          }
          else if (act === 'random-tree') {
            if (list.length && !global.confirm('현재 트리를 무작위 스킬트리로 교체할까요?')) return;
            ui.editing = null; ui.editingId = null;
            commit(SE().buildRandomTree());
          }
          else if (act === 'random-skill') {
            readForm();
            const s = ui.editing;
            ui.editing = SE().randomSkill({ type: s.type, tier: s.tier, id: s.id, startsLearned: s.startsLearned, prerequisites: s.prerequisites, imageUrl: s.imageUrl });
            refreshForm();
          }
          else if (act === 'clear') {
            if (!list.length || !global.confirm('스킬트리의 모든 노드를 삭제할까요?')) return;
            ui.editing = null; ui.editingId = null;
            commit([]);
          }
          else if (act === 'add-effect') {
            readForm();
            ui.editing.effects.push({ type: ui.editing.type === 'PASSIVE' ? 'BUFF_DEF' : 'DAMAGE', value: 10, duration: 1 });
            refreshForm();
          }
          else if (act === 'del-effect') {
            readForm();
            ui.editing.effects.splice(Number(btn.dataset.i), 1);
            refreshForm();
          }
          else if (act === 'clear-img') { readForm(); ui.editing.imageUrl = ''; refreshForm(); }
          else if (act === 'cancel') { ui.editing = null; ui.editingId = null; render(); }
          else if (act === 'save') {
            readForm();
            const s = SE().normalizeSkill(ui.editing, ui.editing.id);
            if (!s.effects.length) { global.alert('효과를 1개 이상 추가해주세요.'); return; }
            const exists = list.some(n => n.id === s.id);
            const next = exists ? list.map(n => n.id === s.id ? s : n) : [...list, s];
            // 계층이 바뀌어 선행 조건이 깨진 노드 정리
            const tierOf = Object.fromEntries(next.map(n => [n.id, Number(n.tier) || 1]));
            next.forEach(n => { n.prerequisites = (n.prerequisites || []).filter(p => tierOf[p] && tierOf[p] < (Number(n.tier) || 1)); });
            ui.editing = null; ui.editingId = null;
            commit(next);
          }
        };
      });

      // 폼 모양이 달라지는 입력
      container.querySelectorAll('[data-f="type"], [data-f="tier"], [data-f="autoDescription"], [data-t="mode"], [data-t="radius"], [data-e="type"]').forEach(el => {
        el.onchange = () => {
          readForm();
          if (el.dataset.e === 'type') {
            const i = Number(el.closest('.sk-effect-row').dataset.i);
            const def = SE().EFFECTS[el.value];
            ui.editing.effects[i] = { type: el.value, value: def.value, duration: def.duration || 1 };
          } else if (el.dataset.f === 'type') {
            ui.editing.type = el.value;
            if (el.value === 'PASSIVE') ui.editing.targeting = { mode: 'SELF', rangeMin: 0, rangeMax: 0, radius: 0, affects: 'ALLY' };
            const ok = ui.editing.effects.filter(e => el.value === 'PASSIVE' ? SE().EFFECTS[e.type].passive : !SE().EFFECTS[e.type].passiveOnly);
            ui.editing.effects = ok.length ? ok : [{ type: el.value === 'PASSIVE' ? 'BUFF_DEF' : 'DAMAGE', value: 15 }];
          }
          refreshForm();
        };
      });
      // 나머지 입력은 설명 미리보기만 갱신
      container.querySelectorAll('.sk-form input, .sk-form select').forEach(el => {
        if (el.onchange) return;
        el.addEventListener('change', () => {
          readForm();
          const ta = container.querySelector('[data-f="description"]');
          if (ta && ui.editing.autoDescription) ta.value = SE().describeSkill(SE().normalizeSkill(ui.editing, ui.editing.id));
        });
      });

      // 아이콘 이미지 드롭존
      const drop = container.querySelector('[data-role="icon-drop"]');
      const file = container.querySelector('[data-role="icon-file"]');
      if (drop && file) {
        const setImg = (url) => { readForm(); ui.editing.imageUrl = url; refreshForm(); };
        drop.onclick = () => file.click();
        file.onchange = () => readImageFile(file.files && file.files[0], setImg);
        ['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach(n => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
        drop.addEventListener('drop', (e) => readImageFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0], setImg));
      }
    }

    render();
    return { render };
  }

  // ==========================================================================
  // 플레이어용 스킬트리 (SP로 습득)
  // ==========================================================================
  /**
   * @param {HTMLElement} container
   * @param {object} unit
   * @param {{ onLearn?:(unit, node)=>void }} opts
   */
  function renderLearnTree(container, unit, opts = {}) {
    if (!container || !unit || !SE()) return;
    SE().ensureUnitSkillState(unit);
    const list = unit.skillTree || [];
    const learnedCount = list.filter(n => unit.learnedSkills.includes(n.id)).length;
    const sig = unit.customSkill ? SE().normalizeSkill(unit.customSkill, unit.customSkill.id || 'signature') : null;

    const absorbCount = typeof global.getAbsorbMaterials === 'function' ? global.getAbsorbMaterials(unit).length : 0;
    const isPlayer = unit.owner !== 'ENEMY';
    // 잔향: 트리를 다 열 해금권이 이미 있으면 기억 계승은 잔향을 남기고, 남는 해금권은 잔향으로 바꿀 수 있다.
    const hasResonance = isPlayer && typeof global.getResonance === 'function';
    const resonance = hasResonance ? global.getResonance() : 0;
    const resonanceCost = global.RESONANCE_PER_SKILL_POINT || 5;
    const saturated = hasResonance && global.isSkillTreeSaturated(unit);
    const surplus = hasResonance ? SE().getSurplusSkillPoints(unit) : 0;
    container.innerHTML = `
      <div class="skl-head">
        <div>Lv.${Number(unit.level) || 1} · 스킬 해금권 <b class="skl-sp">${unit.skillPoints}장</b>${hasResonance ? ` · 🔔 잔향 <b class="skl-sp">${resonance}개</b>` : ''}</div>
        <div class="skl-head-sub">습득 ${learnedCount} / ${list.length} · ${saturated ? '남은 스킬을 다 열 해금권이 있어 기억 계승은 잔향으로 남습니다' : '기억 계승 1회 = 레벨 +1 (공격 +8 · 방어 +6) · 스킬 1개 해금'}</div>
        ${isPlayer && typeof global.absorbDuplicateCharacter === 'function' ? `
          <button type="button" class="skl-learn" data-absorb ${absorbCount ? '' : 'disabled'}>🧬 기억 계승${saturated ? ' → 잔향' : ''} (잔영 ${absorbCount}장)</button>` : ''}
        ${hasResonance && surplus > 0 ? `
          <button type="button" class="skl-learn" data-resonance-convert>🔔 남는 해금권 ${surplus}장 → 잔향 ${surplus}개</button>` : ''}
        ${hasResonance && !saturated ? `
          <button type="button" class="skl-learn" data-resonance-inherit ${resonance >= resonanceCost ? '' : 'disabled'}>🔔 잔향 ${resonanceCost}개 → 해금권 +1</button>` : ''}
      </div>
      ${sig ? `
        <div class="skl-signature">
          <div class="skl-node learned">
            <div class="skl-icon">${iconHtml(sig, 26)}</div>
            <div class="skl-body">
              <div class="skl-name">🌟 고유 스킬 · ${esc(sig.name)}</div>
              <div class="skl-meta">${sig.type === 'PASSIVE' ? '패시브' : `AP ${sig.costAP} · 대기 ${sig.coolDown}턴`}</div>
              <div class="skl-desc">${esc(sig.description)}</div>
            </div>
          </div>
        </div>` : ''}
      ${list.length === 0 ? '<div class="skl-empty">이 캐릭터에는 스킬트리가 없습니다. DEV 패널의 🌳 트리 편집에서 추가할 수 있습니다.</div>' : `
      <div class="skl-tree">
        ${TIERS.filter(t => list.some(n => (Number(n.tier) || 1) === t)).map(t => `
          <div class="skl-tier">
            <div class="skl-tier-head">TIER ${t} · ${TIER_LABELS[t]}</div>
            <div class="skl-tier-nodes">
              ${list.filter(n => (Number(n.tier) || 1) === t).map(n => {
                const s = SE().normalizeSkill(n);
                const ls = SE().getLearnState(unit, n);
                const btn = ls.state === 'learned' ? '<span class="skl-tag ok">✔ 습득</span>'
                  : ls.state === 'learnable' ? `<button type="button" class="skl-learn" data-learn="${esc(s.id)}">해금 (해금권 ${ls.cost})</button>`
                  : `<span class="skl-tag">${ls.state === 'locked' ? '🔒 ' : ''}${esc(ls.reason)}</span>`;
                return `
                  <div class="skl-node ${ls.state}">
                    <div class="skl-icon">${iconHtml(s, 26)}</div>
                    <div class="skl-body">
                      <div class="skl-name">${esc(s.name)} <span class="skl-type ${s.type === 'PASSIVE' ? 'p' : 'a'}">${s.type === 'PASSIVE' ? 'PASSIVE' : 'ACTIVE'}</span></div>
                      <div class="skl-meta">${s.type === 'PASSIVE' ? '상시 발동' : `AP ${s.costAP} · 대기 ${s.coolDown}턴`}</div>
                      <div class="skl-desc">${esc(s.description)}</div>
                      <div class="skl-action">${btn}</div>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>`}`;

    const absorbBtn = container.querySelector('[data-absorb]');
    if (absorbBtn) {
      absorbBtn.onclick = () => {
        const res = global.absorbDuplicateCharacter(unit.id);
        if (!res.ok) { if (global.addLog) global.addLog(`⚠️ ${res.reason}`, 'warning'); return; }
        if (opts.onAbsorb) opts.onAbsorb(unit);
        renderLearnTree(container, unit, opts);
      };
    }

    [['[data-resonance-convert]', 'convertSurplusSkillPoints'], ['[data-resonance-inherit]', 'inheritResonance']].forEach(([sel, fn]) => {
      const btn = container.querySelector(sel);
      if (!btn) return;
      btn.onclick = () => {
        const res = global[fn](unit.id);
        if (!res.ok) { if (global.addLog) global.addLog(`⚠️ ${res.reason}`, 'warning'); return; }
        if (opts.onAbsorb) opts.onAbsorb(unit);
        renderLearnTree(container, unit, opts);
      };
    });

    container.querySelectorAll('[data-learn]').forEach(btn => {
      btn.onclick = () => {
        const res = SE().learnSkill(unit, btn.dataset.learn);
        if (!res.ok) { if (global.addLog) global.addLog(`⚠️ ${res.reason}`, 'warning'); return; }
        const node = unit.skillTree.find(n => n.id === btn.dataset.learn);
        if (opts.onLearn) opts.onLearn(unit, node);
        renderLearnTree(container, unit, opts);
      };
    });
  }

  global.SkillEditor = { mountBuilder, renderLearnTree, iconHtml, esc };
})(typeof window !== 'undefined' ? window : globalThis);
