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
2-1. 로그인·서버 경제를 쓰려면 이어서 `supabase-economy.sql` 전체를 실행하고 Authentication > Providers 에서 Email 을 켭니다. (아래 "서버 권위 경제" 참고)
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

## 서버 권위 경제 (계정 · 지갑 · 연준 · 지분 · 대출 · 경매)

골드 잔액과 공유 경제는 **Supabase 서버가 원본**이다. 브라우저는 서버 함수(RPC)만 부를 수 있고 테이블을 직접 읽거나 쓸 수 없다. 규칙은 전부 `supabase-economy.sql` 에 있다.

| 파일 | 역할 |
| --- | --- |
| `supabase-economy.sql` | 서버 스키마 · 규칙 · RPC (`slg_*` 함수). 한 번 실행하면 된다 (여러 번 실행해도 데이터는 안 지워진다) |
| `serverEconomy.js` | 브라우저 쪽 연결: 지갑 미러 · 거래 아웃박스 · 동기화(`slg_sync`) |
| `authUI.js` | 로그인 창 (이메일/비밀번호 · Google · 오프라인) |
| `fedEngine.js` · `shareEngine.js` | 같은 식의 순수 JS 구현. 오프라인 모드와 화면 계산에 쓰고, 테스트가 서버 SQL 과 같은 결과인지 대조한다 |

### 설치 순서 (처음 한 번)

1. Supabase **SQL Editor** 에서 `supabase-schema.sql` 을 실행한다 (이미 했다면 건너뛴다).
2. **Authentication → Providers** 에서 *Email* 을 켠다. 개발 중에는 *Confirm email* 을 꺼 두면 가입 즉시 로그인된다. Google 로그인을 쓰려면 *Google* 공급자를 켜고 `supabase-config.js` 의 `google: true` 로 바꾼다.
3. **Authentication → URL Configuration** 의 *Site URL* 과 *Redirect URLs* 에 배포 주소(와 `http://localhost:5178`)를 넣는다.
4. SQL Editor 에서 `supabase-economy.sql` 전체를 실행한다. (`slg_records` 의 접근 정책도 같이 바뀐다 — 아래 참고)
5. 게임에 접속해 계정을 만든다. 서버가 없거나 설치하지 않았으면 게임은 예전처럼 이 탭 안에서만 도는 로컬 모드로 동작한다 (경고 토스트가 뜬다).

운영 중 조정:

```sql
-- 값 조정 (가격 · 금리 · 한도 · 상한 전부 slg_config 의 숫자다)
update public.slg_config set value = 0.5 where key = 'ltv';
-- 기존 세이브를 처음 로그인하는 계정에 붙이기 (예전에는 모두 'guest_main' 한 칸을 썼다)
update public.slg_records set record_id = '<auth.users 의 id>' where collection_name = 'gameState' and record_id = 'guest_main';
-- 이전 세이브의 골드를 그대로 옮기려면 첫 로그인 전에 상한을 올린다 (기본 450 = 시작 골드)
update public.slg_config set value = 100000 where key = 'migrate_cap';
-- 관리자 추가 (DEV 패널은 관리자 계정만 열 수 있다). rooin37@gmail.com 은 supabase-economy.sql 이 기본 등록한다.
-- 이메일로 지정하면 가입 전에도 등록할 수 있지만, 이메일 인증이 끝난 계정만 관리자로 인정한다.
insert into public.slg_admin_emails (email) values ('someone@example.com');
insert into public.slg_admins (user_id) values ('<auth.users 의 id>');  -- user id 로 직접 지정할 수도 있다
```

### 무엇이 서버 권위인가

* **골드 잔액**: 서버가 가진다. 클라이언트의 `state.gold` 는 "서버 잔액 + 아직 서버가 확인하지 않은 내 거래"의 미러일 뿐이다.
  * 쓰면(`state.gold -= …`) 거래가 아웃박스에 쌓여 곧 서버로 간다. 서버가 잔액을 확인하고 소비(수요) 지표에 센다.
  * 벌려면(`Wallet.earn(종류, 금액, ref)`) 종류를 밝혀야 한다. 서버는 **건당 상한 · 같은 ref 1회 청구(전투·노드) · 시간당 상한**으로 부풀리기를 막는다. 종류 없이 늘어난 골드(개발자 도구로 고친 값)는 거절되고 다음 동기화 때 서버 잔액으로 돌아온다.
  * 거래에는 id 가 있어 응답이 유실돼 재전송해도 한 번만 반영된다. 아웃박스는 세이브에 같이 저장된다.
* **물가 · 금리 · 안건 · 위원회**: 서버가 8시간 틱마다 지갑을 직접 합산해 통화량·소비를 집계하고 물가를 민다. 클라이언트 보고가 없다.
* **국가 지분 · 세금 · 구매권**: 지분과 세금 정산은 서버가 한다. 구역 점령 청구는 서버가 **인접성**(시작지 또는 이미 점령한 구역과 맞닿음)과 **간격**(3분마다 하나씩 구매권이 열림)을 검증한다.
* **담보대출 · 경매**: 이자(8시간마다)·연체·몰수·경매 마감·환급·낙찰 모두 서버가 한다. 접속하지 않은 동안의 이자도 접속 때 서버가 정산한다. 대출 한도는 담보가치(레벨 30·승급 4 상한) × 60% 와 계정당 잔액 한도, 몰수 후 72시간 대출 금지로 제한한다.
* **리와인더 · 유물 (아이템)**: 서버가 개수와 보유를 가진다. 브라우저의 `state.rewinders` / `state.run.relics` 는 서버 값의 거울이라서, 개발자 도구로 고쳐도 다음 동기화 때 서버 값으로 되돌아온다.
  * 얻는 길은 서버 함수뿐이다: 전투 승리 수령(`slg_encounter_claim`) · 이벤트(`slg_event_roll`) · 상점/마을 구매(`slg_rewinder_buy`, 가격은 서버가 정한다) · 세금 유물(정산 때 서버가 굴린다). 난수는 서버가 굴리고, 보상 풀(`rewardPools`)과 유물 정의(`relics`)는 운영자만 쓸 수 있다 (RLS).
  * 쓰는 길도 서버 함수뿐이다: 리와인더(`slg_rewinder_use`) · 유물 장착(`slg_relic_equip`) · 선물(`slg_relic_gift`) · 개명(`slg_set_name`, 서버가 개명 유물 보유를 확인하고 하나를 쓴다).
  * 한계(아래 "서버가 검증할 수 없는 것")를 줄이려고 보상을 **전투 시작 기록 + 최소 전투 시간(10초) · 노드당 회차 1회 · 구역당 보스 회차 1회 · 시간당 수령 30회 · 회차당 80회 · 리와인더 보유 상한 10 · 회차당 획득 40 · 24시간 획득 20** 으로 묶는다.
  * 서버에 아이템 함수가 없으면(`supabase-economy.sql` 을 다시 실행하기 전) 예전처럼 브라우저가 가진다. 다시 실행하면 이 버전 이전에 있던 계정은 예전 세이브의 리와인더(최대 5) · 유물(최대 10)을 **한 번만** 이전할 수 있다.
* **캐릭터 전달**: 낙찰·상환된 캐릭터는 서버 우편함(`slg_inbox`)에 들어가고, 클라이언트가 예비 명단에 넣은 뒤 ack 한다 (한 번만 전달).
* **계정**: 세이브(`gameState`)는 본인 것만 읽고 쓴다 (RLS). 예전 공유 컬렉션(`nationShares` · `fedState` · `charAuctions` · `fedLedger`)은 브라우저가 더 이상 쓰지 못한다.

### 서버가 검증할 수 없는 것 (한계)

전투는 브라우저에서 시뮬레이션하므로 서버는 결과를 재현할 수 없다. 그래서 다음은 **상한으로 제한할 뿐 완전히 막지 못한다**.

* 전투·이벤트·매각 수입: 건당 상한(전리품 800 · 보상 6000 · 이벤트 400 · 매각 3000, 기준가) × 물가와 시간당 15000G 상한 안에서는 부풀린 청구도 받아들여진다.
* **전투 승리 자체**: 전투가 브라우저에서 돌아가므로 서버는 이겼는지 알 수 없다. 리와인더·유물 보상은 위의 시간·횟수·노드 제한 안에서만 받을 수 있지만, 가짜 노드로 한도까지 수령하는 것은 막지 못한다 (하루 리와인더 20개가 상한). 완전히 막으려면 서버가 전투를 재현해야 한다.
* 로스터·레벨: 브라우저가 가진다. (유물·리와인더는 위처럼 서버 권위) 서버는 담보로 맡긴 캐릭터의 스냅샷만 보관하고, 레벨·승급 상한과 대출 한도로 영향을 제한한다. 가짜 고레벨 캐릭터를 담보로 맡기고 연체해도 얻는 골드는 한도 안이다.
* `slg_records` 의 에디터 컬렉션 중 유물 · 보상 풀 · 아이템 정의는 운영자만 쓴다. 캐릭터 · 스킬 · 맵 · 설정은 여전히 공개 읽기/쓰기다 (운영자용 에디터를 위한 것).
* 모든 쓰기 RPC 는 하나의 어드바이저리 락으로 직렬 실행된다. 동시 접속이 수백 명 이하인 규모를 가정한 선택이다.

### 오프라인 모드

로그인 창에서 "오프라인으로 시작"을 고르거나 서버 스키마가 없으면 클라우드 저장도 서버 경제도 없이 이 탭 안에서만 돈다 (기존 방식: 연준·경매·지분은 메모리). 서버 경제 코드와 같은 규칙을 JS 로 한 번 더 구현해 둔 것이다.

### 테스트

```bash
npm test                      # 서버 SQL 검증 포함 (tests/verify_server.mjs — PGlite 로 실제 Postgres 에 SQL 을 올려 RPC 를 그대로 호출)
```

`tests/browser/pg-mock.js` 는 브라우저 안에서 PGlite 를 서버로 연결해 클라이언트와 서버가 함께 도는 종단 검증을 할 수 있게 한다 (실제 Supabase 는 건드리지 않는다).

```js
const m = await import('/tests/browser/pg-mock.js');
await m.installPgMock({ users: ['a', 'b'] });
await ServerEconomy.start();
```

## 연방준비기금 (연준) · 인플레이션 · 담보대출 · 캐릭터 경매시장

헤더의 **🪙 골드 칸**(물가 배지 포함)을 눌러 연다. 규칙의 원본은 서버(`supabase-economy.sql`, 위 "서버 권위 경제")이고, `fedEngine.js`(순수 로직)는 같은 식을 JS 로 구현한 것이다. 화면과 게임 연결은 `fedSystem.js`. 서버에 연결되면 이 파일은 서버 스냅샷을 보여 주고 서버 함수를 부르기만 한다. 오프라인 모드에서는 예전처럼 `slg_records`(또는 메모리)에 클라이언트 CAS 로 저장하며 아래 설명은 그 구현 기준이다.

### 인플레이션 · 통화량 · 수요
- 물가 지수는 서버 시각 기준 **8시간(틱)마다** 한 번씩 움직인다. 변동률(%) = **금리 항 + 통화량 항 + 수요 항 ± 잡음(0.1)**. 범위 ×0.5 ~ ×5. 잡음은 틱 번호로 정해져서 어느 클라이언트가 밀어도 결과가 같다.
  - 금리 항: `0.15 − 0.20 × (정책금리 − 중립 1.5%)` — 중립보다 높으면 눌리고 낮으면 더 오른다.
  - 통화량 항: `0.10 × ln(1인당 통화량 / 800G ÷ 현재 물가)` — 1인당 실질 보유 골드가 적정(물가 1.0 기준 800G)보다 많으면 +, 적으면 −. 물가가 이미 올라 있으면 압력이 줄어드는 평형 구조라, 수입이 물가를 따라 오르는 한 물가가 통화량에 맞춰 수렴한다.
  - 수요 항: `0.10 × 0.5 × ln(소비 회전율 / 12%)` — 회전율 = 틱당 소비액 ÷ 통화량. 많이 쓸수록 +, 안 쓰면 −. 통화량+수요 항은 틱당 ±1.0%p로 제한.
- **집계** (오프라인 모드): 플레이어는 접속 중 10분마다 `fedLedger/{id}`에 자기 골드·대출 잔액·틱별 소비를 보고한다. 틱이 지날 때 접속한 클라이언트 하나가 72시간 안에 보고한 플레이어를 합쳐(총 통화량·소비·대출 잔액) `fedState.macro`에 적고, 그 값으로 물가를 민다. 연준 창에 총 통화량 · 소비 회전율 · 대출 잔액과 이번 틱 변동 요인(금리/통화량/수요)이 보인다.
- **소비**는 `state.gold`가 줄어든 양이다 (game.js의 설정자가 `FedSystem.trackSpend`로 알림). 이자·상환·입찰·지분 매입 같은 금융 거래(`FedSystem.financial`)와 세이브 복원·턴 되돌리기·디버그(`setGoldRaw`)는 세지 않는다.
- 물가는 `ECONOMY.getInflation`(config.js)에 연결되어 `getGamePrice`(아카데미·포섭·몸값)와 `scaleGold`(그 밖의 모든 골드 가격)에 곱해진다. **사고파는 값** — 용병 고용, 긴급 모집, 마을 보급소, 보급 상점 노드, 안전지대 유닛 고용, 야생 포섭 금화, 도시 유닛 매각가, 국가 지분 가격 — 과 **유지비**가 대상이다. 새 가격을 추가할 때는 기준가를 `scaleGold(base)`로 감싼다.
- **수입**(전리품·전투/이벤트 보상·세수)은 `scaleIncome(base)`로 같은 물가를 곱해 구매력을 유지한다. 새 골드 수입을 추가할 때는 `scaleIncome`으로 감싼다.
- 한계(오프라인 모드): 보고는 클라이언트가 스스로 올리므로 조작할 수 있다. 서버 모드에서는 서버가 지갑을 직접 합산하므로 해당 없다. 한동안 접속하지 않은 플레이어(72시간)는 집계에서 빠진다.

### 연준 위원 · 금리
- 국가별 지분 1위(더미 제외, 1% 이상)가 위원. 한 사람이 여러 국가 1위여도 **1인 1표**.
- 위원이 금리 인상/인하(±0.25%p, 범위 0.25%~5%) 안건을 발의하면 발의자가 찬성표를 던진 것으로 치고, **전체 위원의 과반**이 찬성하면 즉시 가결, 과반이 불가능해지면 부결, 24시간 안에 결론이 안 나면 만료. 변경 후 8시간은 냉각 기간. 위원 명단이 바뀌면 그 시점 명단으로 다시 센다.
- 가결 직전에 지난 틱을 이전 금리로 먼저 반영한다.

### 담보대출 (`state.run.loans` — 회귀하면 파티·골드와 함께 사라진다)
- 출전 명단/예비의 생존 캐릭터(부관·포로 제외)를 맡기면 **담보가치(몸값 공식) × 60%** 까지 빌린다. (서버 모드) 몰수 때 클라이언트가 담보를 실제로 넘겼다고 확인(`slg_loan_seized`)하지 않거나 "이미 없었다"고 알리면, 서버가 채권액(원금+밀린 이자)을 지갑에서 압류하고 모자란 만큼은 **빚**으로 남긴다. 빚은 회귀해도 남고 이후 수입의 50%씩 먼저 갚이며, 빚이 있으면 새 대출을 받을 수 없다. "몰수했다"는 주장은 10분 뒤 서버에 저장된 세이브(`slg_records` gameState)와 대조해, 세이브에 그 캐릭터가 아직 살아 있으면 거짓으로 보고 압류한다. 확인 회피·거짓 주장·"죽었다"며 담보를 바꾼 기록은 `slg_audit` 에 남고, 관리자는 RPC `slg_audit_list` 로 의심 계정(`suspects`)과 내역을 볼 수 있다. 대출을 받아도 캐릭터는 명단에 그대로 남아 계속 쓸 수 있고(담보로 잡힌 캐릭터는 중복 담보 불가), **연체·만기 미상환으로 몰수가 확정될 때만** 명단에서 빠져 경매에 올라간다. 전투 중에는 대출·상환·이자 정산이 모두 보류된다.
- 대출금리 = 그때의 정책금리 + 0.5%p, **대출 시점에 고정**. 이자는 대출 시점부터 **8시간마다** 원금 × 금리가 골드에서 자동으로 나간다. 상환 기간은 8시간 단위로 최대 168시간(1주일), 동시에 3건까지.
- 만기에 원금을 낼 골드가 있으면 자동 상환, 없으면 **몰수**. 이자를 3회 연속 못 내도 만기 전에 몰수. 접속하지 않은 동안의 이자도 접속 때 빠짐없이 정산한다.
- 몰수된 담보는 경매 id가 `auc_<대출id>`로 정해지므로 네트워크 재시도에도 중복 등록되지 않는다.

### 캐릭터 경매시장
- 몰수된 캐릭터가 감정가의 50%에서 24시간 경매에 오른다. 입찰금은 **즉시 에스크로**(내 골드에서 빠짐)되고, 더 높은 입찰에 밀리면 환급 대기 → 본인이 접속할 때 돌려받는다. 최소 증가폭 `max(10G, 5%)`, 마감 5분 안의 입찰은 마감을 5분 연장.
- 마감 후 낙찰자는 접속 때 캐릭터를 **예비 명단**으로 받는다 (이미 같은 캐릭터를 갖고 있으면 입찰 자체가 막힌다). 입찰이 없으면 시작가 30% 인하로 재등록. 입찰·낙찰 후 회귀한 플레이어의 환급금과 캐릭터는 소멸한다 (회귀하면 골드도 잃으므로).
- 이 시스템은 서버 검증이 없는 클라이언트 CAS 방식이라, 기존 지분 시스템처럼 운영자 신뢰를 전제로 한다.

## 테스트

```bash
npm test          # 순수 로직 (노드 그래프, 해금 규칙, 정규화 멱등성, 지분, 연준·대출·경매)
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

### 아이템 서버 권위 — 운영 메모
- `supabase-economy.sql` 을 **다시 실행**해야 적용된다. 기존 계정은 첫 접속 때 한 번 예전 세이브를 서버로 이전한다(리와인더 최대 5개, 일반·희귀 유물 최대 10개).
- 리와인더 구매는 `spend_item` 으로 기록돼 환불(`earn_rewind`) 대상이 아니며, 하루 구매 10회·획득 20개·보유 10개 상한이 있다.
- `supabase-schema.sql` 을 economy **이후에** 다시 실행하면 `slg_records` 의 공개 쓰기 정책이 되살아난다. 반드시 schema → economy 순서로 실행할 것.
- 유물·보상풀·아이템 정의 편집은 운영자(admin) 계정만 가능하다.
