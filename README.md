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

캐릭터(`characters`), 스킬(`skills`), 게임 설정(`game_configs`), 전술 맵 템플릿(`tacticalMapTemplates`), 게임 세이브(`gameState`)는 모두 `slg_records` 테이블에 `collection_name`으로 구분되어 저장됩니다. 전투 진입(`enterEncounter`)과 맵 에디터는 둘 다 `tacticalMapTemplates`만 사용하며, 템플릿이 없으면 기본맵으로 대체하지 않고 실패합니다. (이전 버전이 `scenarioMaps`와 `game_configs/world_sectors`에 저장해 둔 맵은 읽기 전용 마이그레이션 경로로만 조회됩니다. 에디터에서 한 번 저장하면 `tacticalMapTemplates`로 옮겨집니다.) 캐릭터·스킬 이미지는 `slg-assets` Storage 버킷에 업로드됩니다. 현재 데이터 구조는 전역 공유 운영자용이므로, 공개 읽기/쓰기 정책을 적용합니다. 여러 사용자의 비공개 계정으로 운영할 때는 RLS 정책을 사용자별로 변경해야 합니다.

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

### 세이브 구조 (v2)

```text
{ version: "2.0.0", currentView, guest,
  player: { characters, characterCollection, inventory, gold, rewinders,
            progression: { commander, turn, stackMoveEnabled, strategy, selectedUnitId },
            roguelikeRun: { id, seed, status, currentNodeId, completedNodes,
                            mapState: { layers, nodes }, encounters, encounterSeq } },
  currentBattle: null | { ...Encounter, live: { enemyUnits, deployedUnitIds, defeatedEnemyCount } } }
```

- `currentBattle`은 전투 중일 때만 저장된다. 전투 중 새로고침하면 **일시정지 상태로 복원**되고, 승리 직후라면 승리 모달이 다시 뜬다.
- 이전 버전(v1, 평평한 구조) 세이브도 그대로 불러온다. 이때 런은 새로 만들어진다.
- 손상된 런 데이터는 새 런으로 대체되고 캐릭터/골드는 유지된다.

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
