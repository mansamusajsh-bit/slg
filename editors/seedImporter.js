/**
 * editors/seedImporter.js — 기본 보상 데이터(seedData.js)를 DB에 넣는다.
 *
 * - 이미 있는 id는 건너뛴다 (덮어쓰지 않음).
 * - 새로 넣을 레코드를 "기존 데이터 + 새 데이터" 기준으로 전부 검증한 뒤에만 쓴다.
 *   하나라도 실패하면 아무것도 쓰지 않고 에러를 던진다.
 * - 쓰기 순서: 아이템 → 유물 → 보상 풀 (참조 대상이 먼저 존재하도록)
 */

/** DB에 쓰지 않고 무엇을 넣을지만 계산한다 (확인창/테스트용). */
export async function planSeedImport(store, engine, seed) {
  const C = engine.COLLECTIONS;
  const [items, relics, pools, characters] = await Promise.all([
    store.list(C.items), store.list(C.relics), store.list(C.rewardPools), store.list(C.characters)
  ]);
  const existing = {
    items: new Set(items.map(x => String(x.id))),
    relics: new Set(relics.map(x => String(x.id))),
    pools: new Set(pools.map(x => String(x.id)))
  };
  const add = {
    items: seed.SEED_ITEMS.filter(x => !existing.items.has(x.id)).map(engine.normalizeItem),
    relics: seed.SEED_RELICS.filter(x => !existing.relics.has(x.id)).map(engine.normalizeRelic),
    pools: seed.SEED_POOLS.filter(x => !existing.pools.has(x.id)).map(engine.normalizeRewardPool)
  };
  // 같은 id가 이미 있으면 DB 쪽이 기준이다.
  const catalog = {
    items: [...items, ...add.items],
    relics: [...relics, ...add.relics],
    pools: [...pools, ...add.pools],
    characters
  };
  const problems = [];
  for (const it of add.items) engine.validateItem(it).errors.forEach(e => problems.push(`아이템 ${it.id}: ${e.message}`));
  for (const r of add.relics) engine.validateRelic(r).errors.forEach(e => problems.push(`유물 ${r.id}: ${e.message}`));
  for (const p of add.pools) engine.validateRewardPool(p, catalog).errors.forEach(e => problems.push(`풀 ${p.id}${e.entryIndex != null ? ` #${e.entryIndex + 1}` : ''}: ${e.message}`));
  return {
    add,
    catalog,
    problems,
    skipped: {
      items: seed.SEED_ITEMS.length - add.items.length,
      relics: seed.SEED_RELICS.length - add.relics.length,
      pools: seed.SEED_POOLS.length - add.pools.length
    }
  };
}

export async function runSeedImport(store, engine, plan, onProgress = () => {}) {
  if (plan.problems.length) throw new Error(`검증 실패 ${plan.problems.length}건 — 아무것도 저장하지 않았습니다.\n${plan.problems.slice(0, 10).join('\n')}`);
  const C = engine.COLLECTIONS;
  onProgress(`아이템 ${plan.add.items.length}개 저장 중...`);
  await store.saveMany(C.items, plan.add.items, x => engine.validateItem(x));
  onProgress(`유물 ${plan.add.relics.length}개 저장 중...`);
  await store.saveMany(C.relics, plan.add.relics, x => engine.validateRelic(x));
  onProgress(`보상 풀 ${plan.add.pools.length}개 저장 중...`);
  await store.saveMany(C.rewardPools, plan.add.pools, x => engine.validateRewardPool(x, plan.catalog));
  return { items: plan.add.items.length, relics: plan.add.relics.length, pools: plan.add.pools.length };
}
