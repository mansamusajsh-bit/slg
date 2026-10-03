# Remix Web-SLG

Vercel 배포에 맞춘 정적 Web-SLG 프로젝트입니다.

## Vercel 배포

이 저장소를 Vercel에 연결하면 다음 설정이 자동으로 적용됩니다.

- Build Command: `npm run build:vercel`
- Output Directory: `dist`
- Framework: Vite/React와 무관하게 정적 게임 페이지로 배포

### Supabase 연결

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase-schema.sql` 전체를 실행합니다.
3. `supabase-config.js`의 `url`, `anonKey`를 프로젝트 API 설정값으로 교체합니다. 브라우저에는 `anon`/publishable key만 사용하고 `service_role` key는 절대 넣지 않습니다.
4. Vercel에 재배포합니다.

캐릭터(`characters`), 스킬(`skills`), 게임 설정(`game_configs`), 전술 맵 템플릿(`tacticalMapTemplates`), 게임 세이브(`gameState`)는 모두 `slg_records` 테이블에 `collection_name`으로 구분되어 저장됩니다. 전투 진입(`enterEncounter`)과 맵 에디터는 둘 다 `tacticalMapTemplates`만 사용하며, 템플릿이 없으면 기본맵으로 대체하지 않고 실패합니다. (이전 버전이 `scenarioMaps`와 `game_configs/world_sectors`의 `scenarioMap`에 저장해 둔 맵은 더 이상 조회하지 않습니다. 브라우저 콘솔에서 `await migrateScenarioMaps()`로 옮길 대상을 미리 보고, `await migrateScenarioMaps({ dryRun:false })`로 `tacticalMapTemplates`에 복사합니다. 자동 실행되지 않으며 원본은 지우지 않습니다. 개발 모드(localhost 또는 `?dev`)에서는 에디터 저장 직후 다시 불러와 내용이 같은지 확인합니다.) 캐릭터·스킬 이미지는 `slg-assets` Storage 버킷에 업로드됩니다. 현재 데이터 구조는 전역 공유 운영자용이므로, 공개 읽기/쓰기 정책을 적용합니다. 여러 사용자의 비공개 계정으로 운영할 때는 RLS 정책을 사용자별로 변경해야 합니다.

## 로컬 실행

기존 AI Studio 개발 환경을 유지하려면 Node.js 설치 후:

```bash
npm install
npm run dev
```

Vercel용 정적 산출물만 만들려면:

```bash
npm run build:vercel
```

생성된 `dist/` 폴더가 실제 배포 대상입니다.

## 맵/런 구조 (로그라이크 재설계)

```text
Sector (WORLD_SECTORS)  ── 지역 정보만. 타일 없음
   ↓ defaultTemplateId
TacticalMapTemplate     ── 맵 에디터가 저장하는 설계도 (tacticalMapTemplates)
   ↓ + Seed
generateBattleMap()     ── seedEngine.js / mapSchema.js  (같은 template+seed = 항상 같은 맵)
   ↓
Encounter               ── state.currentBattle = { id:"enc-00001", nodeId, sectorId, type, seed,
   ↓                        templateId, map, enemies, rewards, status }
전술 렌더러             ── state.currentBattle.map 만 본다
```

| 파일 | 역할 |
| --- | --- |
| `seedEngine.js` | Mulberry32 난수, `generateBattleMap`, `enterBattleWithSeed` |
| `mapSchema.js` | Sector/Template/Encounter 구조, 정규화·검증, seed 기반 생성기, 보상 생성 |
| `runEngine.js` | **순수 로직**: 노드 그래프 생성, 해금 규칙, 노드 완료, 이벤트/상점 결과 (DOM/state를 모름) |
| `game.js` | `enterEncounter(nodeId)`, `finishEncounter(result)`, 저장/복원, 전략맵 노드 UI |

### 런과 노드

- 노드는 `{ id, type, sectorId, next }` 4개 필드만 가진다. 타일/적 데이터는 들고 있지 않다.
- 타입: `battle` · `elite`(보상 x1.5) · `boss`(보상 x2 + 리와인더 확정) · `event` · `shop`.
- 첫 층은 전투, 마지막 층은 보스(가장 어려운 섹터). 층이 올라갈수록 어려운 섹터가 배정된다.
- 해금 규칙: 시작 전에는 첫 층만 열리고, 이후에는 **마지막으로 완료한 노드의 `next`**만 열린다. (고른 갈래 밖의 노드는 닫힌다.)
- 같은 런 seed는 항상 같은 그래프를 만든다. 콘솔에서 `startNewRun('RUN-123456')`으로 재현할 수 있다.
- 전투는 **노드를 통해서만** 들어갈 수 있다. 섹터 id로 전투를 여는 경로는 없다.
- 새 런은 그 시점의 `WORLD_SECTORS` 기준으로 만들어진다. 에디터에서 섹터를 새로 만들었다면 새 런부터 반영된다.
- 런에 배정될 수 있는 섹터(보스 섹터 포함)마다 전술 맵 템플릿이 저장되어 있어야 한다. 없으면 그 노드의 출격이 실패하고(AP 환불) 노드는 그대로 열려 있다.

### 전투 결과 (`finishEncounter`)

승리/후퇴/패배 모두 이 함수 하나를 지난다: 전투 종료 → 보상 지급 → 노드 완료 → 다음 노드 해금 → 전략맵 복귀 → 저장.

- 보상은 전투 진입 때 seed로 정해 둔 `currentBattle.rewards`이며, **전략맵 복귀 시 1회만** 지급된다.
- 이미 승리(`status: "won"`)한 전투는 어떤 경로로 나가도(복귀 버튼, 일시정지 메뉴의 후퇴 등) 승리로 처리된다.
- 후퇴/패배는 노드를 완료하지 않는다. 같은 노드에 새 seed로 다시 도전할 수 있다.
- 노드를 완료하면 지휘 AP가 최대치로 회복된다 (AP는 전투 사이에 채워져야 런이 이어진다).

### 세이브 구조 (v3)

```text
{ version: "3.0.0", currentView, guest,
  player: { loopCount, memories: { visitedNodesBySeed, deathBattle }, unlockedCharacters,         ← 영구 (회귀해도 유지)
            settings: { muted }, rewinders,                                                       ← 리와인더는 유료 아이템이라 유지
            progression: { turn, stackMoveEnabled, strategy, selectedUnitId } },
  run:    { id, seed, status, currentNodeId, completedNodes, mapState: { layers, nodes },        ← 이번 런 (회귀 시 초기화)
            encounters, encounterSeq, nodeAttempts, party, reserve, gold,
            commander, inventory, characterCollection,
            loopReward, commandBonus, foresight, dejavuEliteFree, echo,
            returnPending?, emergencyRecruit?, lastStanding?, lastDeath? },
  currentBattle: null | { ...Encounter, live: { enemyUnits, deployedUnitIds, defeatedEnemyCount } } }
```

- 코드의 `state.gold` / `playerUnits` / `reserveUnits` / `commander` / `inventory` / `characterCollection`은 `state.run`의 필드를 가리키는 접근자다 (JSON에는 run 쪽에만 저장된다).
- 클라우드 세이브를 다 불러오기 전에는 저장하지 않는다 (불러오기 전 초기 상태로 덮어쓰는 것 방지).
- 런 초기값은 `createInitialRun(seed, commandBonus)` 한 곳에서만 만든다.
- `currentBattle`은 전투 중일 때만 저장된다. 전투 중 새로고침하면 **일시정지 상태로 복원**되고, 승리 직후라면 승리 모달이 다시 뜬다.
- v2(`player.characters / gold / roguelikeRun`)와 v1(평평한 구조) 세이브도 그대로 불러와 run으로 옮긴다. v1은 런이 새로 만들어진다.
- 손상된 런 데이터는 새 런으로 대체되고 캐릭터/골드는 유지된다.

## 사망회귀 (Return by Death)

전투가 끝날 때(`finishEncounter`)만 판정한다. 상점 구매 등으로 골드가 0이 되는 것은 회귀를 일으키지 않는다.

| 상황 | 결과 |
| --- | --- |
| 출전 부대 전멸, 미출전/예비 대원 생존 | 일반 패배 (노드 미완료) |
| 전원 사망 + 골드 0 | 회귀 연출 → 지휘력 보정 선택 → 같은 seed로 런 처음부터 |
| 전원 사망 + 골드 ≥ 최소 모집비 | 긴급 모집 화면 (1명 이상 모집해야 닫힘, 그 전엔 이동 불가) |
| 전원 사망 + 0 < 골드 < 최소 모집비 | "더 이상 싸울 수 없다" 안내 → 골드 0 → 회귀 |

- 최소 모집비는 `TOWN_UNIT_SHOP_CATALOG`의 최저 `cost`. 긴급 모집에서는 쓰러진 대원을 같은 병과 용병 비용으로 재모집할 수도 있다.
- **회귀 시 초기화**: 파티 · 골드 · 노드 진행 · 지휘 AP · 턴 · 지휘관(레벨/스킬) · 인벤토리 · 용병 명부. **유지**: 회귀 횟수, 기억, 리와인더(유료).

### 회귀 보상

자동 (회귀 1회 이상이면 항상):

| 보상 | 내용 |
| --- | --- |
| 예지 | 같은 seed의 이전 런에서 방문한 노드(💭)는 들어가기 전에 적 구성과 보상이 보인다. |
| 기시감 | 지난 런에서 전멸한 바로 그 전투(☠️, 같은 노드·같은 전장 seed)에 다시 들어가면 적 배치를 보고 아군 배치(아래쪽 절반)를 고른다. |
| 최후의 기억 | 전멸 직전 마지막까지 살아남은 캐릭터가 다음 런 첫 전투 첫 턴에 행동을 한 번 더 한다 (AP 2배, 1회). |

회귀 카드 (회귀할 때마다 4장 중 3장이 나오고 1장 선택, 이번 런 한정, 누적 없음. 3장은 런 seed와 회귀 횟수로 정해진다):

| 카드 | 내용 |
| --- | --- |
| 🛡️ 지휘력 | 시작 파티 중 1명 방어 +1 (`calculateEffectiveStrength('def')` 한 곳에서만 가산, 표시 `31 (+1 지휘)`) |
| 🔮 예지 | 원하는 노드 2개를 골라 적 구성과 보상을 미리 본다 (전략맵 상세 패널의 "예지 사용") |
| 💰 비상금 | 시작 골드 +100 |
| 👁️ 기시감 | 이번 런 첫 엘리트 전투에서 아군 배치를 직접 고른다 |

- 미리 보기가 실제와 같도록, 노드의 **이번 런 첫 도전** 전장 seed는 런 seed에서 정해진다 (`getPlannedBattleSeed`). 같은 런에서 재도전하면 예전처럼 새 seed로 새 전장이 열리고, 그 노드는 미리 볼 수 없다.
- 회귀 횟수에 따라 대사가 바뀐다 (0 / 1~2 / 3~5 / 6+회): 전투 시작, 기억나는 장소, 쓰러졌던 장소.
- 회귀 횟수(`player.loopCount`)는 화면 왼쪽 아래에, 이전 런에서 방문한 노드는 전략맵에 💭 "기억나는 장소"로 표시된다 (같은 seed 기준).
- 연출: `audio/returnByDeath.js` — 외부 음원 없이 Web Audio API로 합성 (시계 틱 가속 → 심장 박동 2회 → 정적 → 급상승 드론 → 무음), 화면은 채도 감소 → 흰색 플래시 → 페이드 인. 약 3초. 사용자 입력 전에는 소리를 내지 않고, `player.settings.muted`가 true면 무음.
- 연출/선택 도중 새로고침해도 `run.returnPending`이 남아 있어 회귀 횟수가 두 번 오르지 않고 선택 화면부터 이어진다. 긴급 모집도 `run.emergencyRecruit`로 이어진다.

## 테스트

```bash
npm test          # 순수 로직 (노드 그래프, 해금 규칙, 정규화 멱등성)
npm run test:e2e  # 브라우저 종단 (python3 + playwright + chromium 필요, 외부 요청 차단/Supabase 스텁)
SLG_ROOT=dist python3 tests/e2e_battle.py   # 빌드 산출물(dist)을 대상으로 실행
```

## 적 자동 생성 (아군과 같은 캐릭터 풀)

- 적 후보 = Supabase `characters` 전체(아군과 동일한 풀). 별도 적 데이터는 필요 없고, 캐릭터를 많이 만들수록 전투가 다양해진다.
- `enterEncounter`가 풀을 불러와(`ensureCharacterPoolLoaded`) `buildEnemyPool`로 후보를 만들고, `MapSchema.generateBattleMapWithSeed`가 seed로 어떤 캐릭터를 어느 자리에 세울지 정한다(같은 seed = 같은 전투). 풀이 스폰 수보다 작으면 재사용한다.
- 배율: 섹터 난이도 EASY(Lv1,×0.8) / NORMAL(Lv2,×1.0) / HARD(Lv4,×1.25) / NIGHTMARE(Lv6,×1.6) × 노드 타입 battle(×1) / elite(+1Lv,×1.2) / boss(+2Lv,×1.5).
- 템플릿에 적 스폰 지점이 없으면 플레이어 반대편의 빈 칸에서 seed로 2~4곳을 고른다. 에디터가 적을 직접 배치했다면 그대로 쓴다.
- 풀이 비어 있거나 적을 세울 수 없으면 전투를 시작하지 않고(AP 환불, 노드 유지) 원인을 안내한다.
- 테스트: `python3 tests/e2e_enemy_pool.py`

## 스킬 / 스킬트리

| 파일 | 역할 |
| --- | --- |
| `skillEngine.js` | 스킬 데이터 구조, 효과 처리, 상태이상, 패시브·오라, 적 AI 스킬 선택 (`window.SkillEngine`) |
| `skillEditor.js` | DEV 스킬트리 빌더, 플레이어용 스킬트리(SP 습득) UI (`window.SkillEditor`) |
| `skill-system.css` | 위 UI와 전투 중 대상 선택/상태 아이콘 스타일 |

- 스킬 = 대상 지정(`targeting`: 자신 중심 / 아군 지정 / 적 지정 / 칸 지정 + 사거리 + 범위) + 효과 목록(`effects`). 효과는 여러 개를 조합할 수 있다.
- 효과 종류: 피해·흡혈·지속 피해 / 회복·지속 회복·보호막·정화 / 공격·방어 증감·약점 표식 / 기절·속박·둔화·도발 / 은신·불굴(치명상 1회 버팀)·AP 회복·재사용 대기 감소 / 밀쳐내기·끌어오기·순간이동·위치 교환. 패시브는 상시 스탯, 턴 시작 AP·회복, 주변 아군 오라를 지원한다.
- DEV 패널 → `✨ 캐릭터·스킬 생성`에서 병과 추천 트리를 불러오거나 프리셋/직접 편집으로 트리를 만든다. ★ 노드는 생성 즉시 습득한다. 보관함의 `🌳 트리` 버튼으로 저장된 캐릭터의 트리를 다시 편집할 수 있다.
- 전투 승리 시 생존한 출전 영웅은 SP +1. 풀샷 창의 `🌳 스킬트리`에서 선행 스킬을 만족한 노드를 SP로 습득한다.
- 상태이상 지속시간은 라운드(아군 턴 + 적 턴)가 끝날 때 1씩 줄어든다. 전투가 끝나면 상태이상·재사용 대기가 초기화된다.
- 적은 레벨에 따라 트리의 상위 계층까지 습득한 것으로 간주되며, 점수가 충분한 스킬이 있으면 공격 대신 스킬을 쓴다.
- 구버전 `customSkill`(단일 고유 스킬)은 그대로 동작하며 🌟 고유 스킬로 표시된다. 스킬트리가 없는 기존 캐릭터에는 병과 추천 트리가 자동으로 붙는다.

## 보상 풀 / 유물 / 아이템 (DEV 에디터)

| 파일 | 역할 |
| --- | --- |
| `rewardEngine.js` | **순수 로직**: 보상 풀·유물·아이템 정규화/검증, `rollRewardPool(pool, rng, context)`, 시뮬레이션 집계 |
| `editors/*.js` | DEV 패널 `🎁 보상 풀` · `💎 유물` · `📦 아이템` 탭. 탭을 열 때만 `import()`로 로드되고 게임 state를 모른다 |
| `editors/seedData.js` | 기본 데이터: 유물 100(지휘관 50/선물 50) · 아이템 100 · 보상 풀 82 |

- 저장: Supabase `slg_records`의 `rewardPools` / `relics` / `items` 컬렉션. 공용 저장 계층은 `window.SlgStore`(load는 데이터가 없으면 에러, save는 검증 실패 시 저장하지 않음).
- 뽑기는 `SeedEngine.createRNG(seed)`만 쓴다. 같은 시드 = 같은 결과.
- `📥 기본 데이터 가져오기`: 이미 있는 id는 건너뛰고, 새 데이터를 기존 데이터와 함께 전부 검증한 뒤에만 저장한다.
- 기본 보상 풀 구성: 하위 풀(유물 종류×등급 8개, 아이템 분류×등급 18개) + 섹터 4곳 × 13종
  (`{섹터}-battle`, `-battle-ambush`, `-elite`, `-elite-hoard`, `-boss`, `-boss-relic`(3택1 후보), `-event-shrine`, `-event-ruins`,
  `-event-caravan`, `-chest-small`, `-chest-large`, `-shop-relics`, `-shop-items`) + `run-start-commander`, `run-start-supplies`.
  난이도가 오를수록 높은 등급 하위 풀의 weight가 커진다. 영입(recruit) 항목은 캐릭터 id가 DB마다 달라 기본 데이터에 없다.
- 유물 효과(`effects`)는 아직 데이터일 뿐이며 전투/런에 적용되지 않는다. 스탯 키 목록과 단위는 `RewardEngine.RELIC_STAT_LABELS`.
