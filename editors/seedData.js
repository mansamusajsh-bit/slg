/**
 * editors/seedData.js — 기본 보상 데이터 (유물 100 · 아이템 100 · 보상 풀)
 *
 * DEV 패널 "📥 기본 데이터 가져오기"를 누를 때만 import()된다. DB에 자동으로 쓰지 않는다.
 *
 * 벤치마킹 (구조·수치 감각만 참고, 이름/설명은 전부 새로 작성)
 *   - Slay the Spire: 유물 희귀도 피라미드(일반 > 희귀 > 영웅 > 전설), 정예/보스에서만 높은 등급,
 *     보스 처치 후 "3개 중 1개" 유물 선택, 상점 진열 유물/아이템.
 *   - Darkest Dungeon: 개인 장신구(=선물 유물)는 장점과 단점이 함께 있는 것이 많다.
 *   - Fire Emblem: 선물로 호감도를 올리는 아이템, 지형 방어/반격 중심 스탯.
 *   - Hades / Into the Breach: 런 전체 경제(골드 %, 할인, 리와인더) 유물은 수가 적고 비싸다.
 *
 * 규칙
 *   - 지휘관 유물(commander): army(군 전체) / battle(전투 규칙) / run(런 전체). 선물 유물(gift): self.
 *   - 등급 분포(종류별 50개): 일반 20 · 희귀 15 · 영웅 10 · 전설 5.
 *   - 섹터 난이도(EASY→NIGHTMARE)가 올라갈수록 높은 등급 하위 풀의 weight가 커진다.
 *   - 골드는 기존 전투 보상(적 수 × 100)과 같은 규모: 일반 전투 80~400 범위.
 *   - 영입(recruit)은 DB의 캐릭터 id를 알 수 없어 기본 데이터에 넣지 않는다. 에디터에서 직접 추가.
 */

// ---------------------------------------------------------------------------
// 1. 유물 (지휘관 50 + 선물 50)
// ---------------------------------------------------------------------------
const C = (id, name, rarity, description, ...effects) => ({ id: `cmd_${id}`, name, kind: 'commander', rarity, description, effects: effects.map(([scope, stat, value]) => ({ scope, stat, value })) });
const G = (id, name, rarity, description, ...effects) => ({ id: `gift_${id}`, name, kind: 'gift', rarity, description, effects: effects.map(([stat, value]) => ({ scope: 'self', stat, value })) });

const COMMANDER_RELICS = [
  // 일반 (20)
  C('field_banner', '들판 군기', 'common', '군의 깃발이 펄럭이는 한 병사들은 물러서지 않는다.', ['army', 'atk', 1]),
  C('oak_shield_rack', '참나무 방패걸이', 'common', '행군 중에도 방패를 손 닿는 곳에 둔다.', ['army', 'def', 1]),
  C('iron_rations', '철제 군량통', 'common', '든든히 먹은 군대는 오래 버틴다.', ['army', 'hp', 5]),
  C('signal_horn', '신호 나팔', 'common', '첫 나팔 소리에 맞춰 전열이 한발 먼저 움직인다.', ['battle', 'firstTurnAp', 1]),
  C('coin_pouch', '군자금 주머니', 'common', '전리품을 꼼꼼히 챙긴다.', ['run', 'goldGain', 10]),
  C('drill_manual', '훈련 교범', 'common', '전투가 끝날 때마다 배운 것을 정리한다.', ['run', 'expGain', 10]),
  C('field_tent', '야전 천막', 'common', '전투가 끝나면 부상병을 천막에서 돌본다.', ['battle', 'healAfterBattle', 8]),
  C('whetstone_kit', '숫돌 세트', 'common', '잘 갈린 칼날은 급소를 놓치지 않는다.', ['army', 'critRate', 3]),
  C('merchant_writ', '상인 통행증', 'common', '이 문서를 보이면 상인들이 값을 조금 깎아 준다.', ['run', 'shopDiscount', 8]),
  C('watch_fire', '경계 봉화', 'common', '기습을 미리 알아채 방패를 세울 시간을 번다.', ['battle', 'shield', 5]),
  C('spare_boots', '예비 군화', 'common', '발이 편해야 몸이 가볍다.', ['army', 'evasion', 3]),
  C('old_compass', '낡은 나침반', 'common', '지형을 읽는 군대는 엄폐물을 먼저 차지한다.', ['army', 'terrainDef', 5]),
  C('tactics_notebook', '전술 수첩', 'common', '맞으면 반드시 되갚는다.', ['army', 'counterDmg', 8]),
  C('camp_kettle', '야영 주전자', 'common', '뜨거운 차 한 잔이 상처를 아물게 한다.', ['army', 'regen', 1]),
  C('recruit_poster', '모병 포스터', 'common', '함께 싸우는 동료에 대한 신뢰가 쌓인다.', ['run', 'affection', 2]),
  C('quartermaster_ledger', '병참 장부', 'common', '새는 돈을 막는다.', ['run', 'goldGain', 5], ['run', 'shopDiscount', 5]),
  C('war_drum', '전쟁 북', 'common', '북소리가 울리면 발걸음이 빨라진다.', ['battle', 'firstTurnAp', 1]),
  C('leather_bracers', '가죽 손목보호대', 'common', '활시위와 칼끝이 흔들리지 않는다.', ['army', 'atk', 1]),
  C('field_surgeon_kit', '야전 의무 키트', 'common', '응급 처치만 잘해도 다음 전투가 달라진다.', ['battle', 'healAfterBattle', 10]),
  C('lucky_coin', '행운의 동전', 'common', '앞면이 나오면 이긴다. 뒷면은 없다.', ['run', 'goldGain', 8]),
  // 희귀 (15)
  C('vanguard_standard', '선봉 군기', 'rare', '선봉대의 깃발. 적이 먼저 겁을 먹는다.', ['army', 'atk', 2]),
  C('tower_shield_wall', '탑방패 벽', 'rare', '방패를 겹쳐 세운 진형.', ['army', 'def', 2]),
  C('surveyor_map', '측량사의 지도', 'rare', '모든 언덕과 숲의 위치가 적혀 있다.', ['army', 'terrainDef', 10]),
  C('relay_riders', '전령 기병대', 'rare', '명령이 빠르게 전달되어 한 부대를 더 이끌 수 있다.', ['run', 'leadership', 1]),
  C('field_chapel', '야전 예배당', 'rare', '매 턴 기도가 병사들의 상처를 덮는다.', ['army', 'regen', 2]),
  C('veteran_sergeant', '고참 하사관', 'rare', '신병도 그의 밑에서는 금방 자란다.', ['run', 'expGain', 20]),
  C('mirror_shields', '거울 방패', 'rare', '받은 공격을 날카롭게 되돌린다.', ['army', 'counterDmg', 15]),
  C('ration_wagon', '보급 마차', 'rare', '부족함 없는 보급.', ['army', 'hp', 10]),
  C('ambush_whistle', '매복 호각', 'rare', '적보다 한발 먼저 움직인다.', ['battle', 'firstTurnAp', 2]),
  C('guild_contract', '길드 계약서', 'rare', '정식 계약 덕분에 어느 상점에서나 할인을 받는다.', ['run', 'shopDiscount', 15]),
  C('blood_pact_banner', '피의 서약기', 'rare', '피를 흘린 만큼 되찾는다.', ['army', 'lifesteal', 5]),
  C('smoke_pots', '연막 항아리', 'rare', '전장을 연기로 덮어 적의 조준을 흐린다.', ['army', 'evasion', 6]),
  C('hourglass_fragment', '모래시계 조각', 'rare', '부서진 시간의 조각. 한 번의 기회를 더 준다.', ['run', 'rewinder', 1]),
  C('bulwark_orders', '방벽 명령서', 'rare', '전투 시작과 동시에 방어 태세.', ['battle', 'shield', 12]),
  C('taxman_seal', '징세관의 인장', 'rare', '전리품의 몫을 확실히 받아 낸다.', ['run', 'goldGain', 20], ['army', 'atk', -1]),
  // 영웅 (10)
  C('kings_warhorn', '왕의 뿔나팔', 'epic', '왕가의 뿔나팔. 모든 병사가 한 박자 빨라진다.', ['army', 'ap', 1], ['army', 'def', -1]),
  C('marshal_baton', '원수의 지휘봉', 'epic', '지휘봉 끝이 가리키는 곳으로 군이 움직인다.', ['run', 'leadership', 2]),
  C('siege_engineer', '공성 기술자', 'epic', '사거리를 계산해 한 칸 더 멀리 쏜다.', ['army', 'range', 1], ['army', 'evasion', -5]),
  C('dragon_scale_banner', '용비늘 군기', 'epic', '불길도 이 깃발 아래서는 약해진다.', ['army', 'def', 3], ['battle', 'shield', 10]),
  C('war_council', '작전 회의', 'epic', '전투 전에 세운 계획이 스킬을 빨리 돌게 한다.', ['army', 'skillCooldown', -1]),
  C('cavalry_charter', '기병 헌장', 'epic', '기동전을 위한 특권.', ['army', 'mobility', 1]),
  C('grand_reserve', '대예비대', 'epic', '한 명을 더 전장에 세울 수 있다.', ['run', 'deploySlots', 1]),
  C('blooded_veterans', '피에 젖은 노병들', 'epic', '수많은 전투가 남긴 감각.', ['army', 'critRate', 8], ['army', 'counterDmg', 10]),
  C('golden_treasury', '황금 금고', 'epic', '전쟁은 돈으로 한다.', ['run', 'goldGain', 35]),
  C('field_hospital', '야전 병원', 'epic', '살아남은 자는 모두 다시 일어선다.', ['battle', 'healAfterBattle', 30]),
  // 전설 (5)
  C('crown_of_conquest', '정복자의 왕관', 'legendary', '모든 군대가 이 왕관의 주인을 따른다.', ['army', 'atk', 3], ['army', 'def', 2]),
  C('eternal_hourglass', '영원의 모래시계', 'legendary', '시간을 되돌리는 힘이 다시 차오른다.', ['run', 'rewinder', 2], ['run', 'leadership', 1]),
  C('banner_of_dawn', '여명의 군기', 'legendary', '첫 햇살과 함께 전군이 움직인다.', ['battle', 'firstTurnAp', 3], ['army', 'regen', 2]),
  C('emperor_ledger', '황제의 장부', 'legendary', '제국의 모든 상점이 그대의 것이다.', ['run', 'shopDiscount', 30], ['run', 'goldGain', 20]),
  C('legion_eagle', '군단의 독수리', 'legendary', '독수리 아래 군단은 결코 무너지지 않는다.', ['run', 'deploySlots', 1], ['army', 'hp', 15])
];

const GIFT_RELICS = [
  // 일반 (20)
  G('old_locket', '낡은 로켓', 'common', '안에 오래된 초상화가 들어 있다.', ['def', 2]),
  G('worn_gloves', '닳은 장갑', 'common', '손에 꼭 맞는다.', ['atk', 2]),
  G('wool_scarf', '털목도리', 'common', '따뜻하면 오래 버틴다.', ['hp', 8]),
  G('pressed_flower', '눌린 꽃', 'common', '책갈피에 끼워 둔 꽃 한 송이.', ['affection', 5]),
  G('pocket_mirror', '손거울', 'common', '등 뒤의 적도 보인다.', ['evasion', 4]),
  G('hunting_knife', '사냥칼', 'common', '급소를 아는 칼.', ['critRate', 5]),
  G('herbal_sachet', '약초 향낭', 'common', '은은한 향이 상처를 달랜다.', ['regen', 2]),
  G('lucky_ribbon', '행운의 리본', 'common', '누군가 묶어 준 리본.', ['evasion', 3], ['affection', 2]),
  G('iron_ring', '철반지', 'common', '투박하지만 단단하다.', ['def', 1], ['hp', 4]),
  G('travel_journal', '여행 일지', 'common', '겪은 일을 적어 두면 더 빨리 배운다.', ['expGain', 15]),
  G('sturdy_boots', '튼튼한 장화', 'common', '진흙길도 문제없다.', ['terrainDef', 6]),
  G('tin_whistle', '양철 피리', 'common', '피리를 불면 마음이 가라앉는다.', ['skillCooldown', -1], ['atk', -1]),
  G('sling_pouch', '돌팔매 주머니', 'common', '맞으면 그대로 돌려준다.', ['counterDmg', 10]),
  G('bone_dice', '뼈 주사위', 'common', '운에 맡기는 자의 부적.', ['critRate', 6], ['def', -1]),
  G('patched_cloak', '기운 망토', 'common', '몇 번이고 기워 입은 망토.', ['hp', 6], ['evasion', 2]),
  G('wooden_charm', '나무 부적', 'common', '고향 마을의 수호목으로 깎았다.', ['shield', 4]),
  G('ration_tin', '비상식량 통', 'common', '전투가 끝나면 한 입.', ['healAfterBattle', 10]),
  G('rusty_spur', '녹슨 박차', 'common', '그래도 말은 알아듣는다.', ['firstTurnAp', 1]),
  G('copper_bracelet', '구리 팔찌', 'common', '손목을 단단히 잡아 준다.', ['atk', 1], ['def', 1]),
  G('candle_stub', '몽당 양초', 'common', '밤샘 공부의 흔적.', ['expGain', 10], ['spGain', 1]),
  // 희귀 (15)
  G('silver_locket', '은 로켓', 'rare', '소중한 사람의 머리카락이 들어 있다.', ['def', 3], ['affection', 3]),
  G('duelist_glove', '결투가의 장갑', 'rare', '한 번의 찌르기로 끝낸다.', ['critRate', 10]),
  G('vampire_fang', '흡혈귀 송곳니', 'rare', '목걸이로 꿴 송곳니. 피 냄새가 난다.', ['lifesteal', 10], ['regen', -1]),
  G('falcon_feather', '매의 깃털', 'rare', '멀리 보는 눈.', ['range', 1], ['def', -2]),
  G('oath_ring', '서약의 반지', 'rare', '지키기로 맹세한 것이 있다.', ['def', 3], ['shield', 6]),
  G('runner_sandals', '전령의 샌들', 'rare', '바람처럼 달린다.', ['mobility', 1], ['hp', -5]),
  G('thorn_bracer', '가시 팔찌', 'rare', '건드리는 자는 다친다.', ['counterDmg', 20]),
  G('scholar_spectacles', '학자의 안경', 'rare', '보이는 만큼 배운다.', ['expGain', 25], ['spGain', 1]),
  G('troll_heart', '트롤의 심장석', 'rare', '쿵쿵 뛰는 돌. 상처가 저절로 아문다.', ['regen', 4], ['mobility', -1]),
  G('warrior_braid', '전사의 땋은 머리끈', 'rare', '전장에 나설 때마다 다시 묶는다.', ['atk', 3]),
  G('saint_medallion', '성자의 메달', 'rare', '빛이 상처를 덮는다.', ['healAfterBattle', 20], ['hp', 5]),
  G('cat_eye_stone', '묘안석', 'rare', '어둠 속에서도 공격을 피한다.', ['evasion', 8]),
  G('heirloom_dagger', '가보 단검', 'rare', '대대로 물려받은 단검. 손에 익는다.', ['atk', 2], ['critRate', 5]),
  G('quick_draw_holster', '속사 권총집', 'rare', '꺼내는 순간이 곧 공격이다.', ['firstTurnAp', 1], ['ap', 1], ['def', -2]),
  G('love_letter', '부치지 못한 편지', 'rare', '언젠가 전하고 싶은 말.', ['affection', 10], ['hp', 5]),
  // 영웅 (10)
  G('berserker_mask', '광전사의 가면', 'epic', '가면을 쓰면 아픔을 잊는다.', ['atk', 5], ['lifesteal', 8], ['def', -3]),
  G('aegis_pendant', '수호의 펜던트', 'epic', '첫 공격을 반드시 막아 낸다.', ['shield', 15], ['def', 2]),
  G('windwalker_boots', '바람걸음 장화', 'epic', '발자국조차 남기지 않는다.', ['mobility', 1], ['evasion', 8]),
  G('sage_quill', '현자의 깃펜', 'epic', '기술을 다시 쓰는 시간이 줄어든다.', ['skillCooldown', -1], ['spGain', 1]),
  G('giant_belt', '거인의 허리띠', 'epic', '거인처럼 버틴다.', ['hp', 20], ['def', 2]),
  G('hawkeye_scope', '매눈 조준경', 'epic', '한 칸 더, 더 정확하게.', ['range', 1], ['critRate', 8]),
  G('phoenix_ash', '불사조의 재', 'epic', '쓰러져도 다시 일어날 기운이 남는다.', ['healAfterBattle', 40], ['regen', 2]),
  G('war_saint_relic', '전쟁 성인의 유골', 'epic', '성인이 함께 싸운다.', ['atk', 3], ['def', 3]),
  G('twin_moon_earrings', '쌍달 귀걸이', 'epic', '한 쌍의 달처럼 서로를 비춘다.', ['affection', 15], ['evasion', 5]),
  G('stormcaller_band', '폭풍부름 팔찌', 'epic', '번개처럼 몰아친다.', ['ap', 1], ['atk', 2]),
  // 전설 (5)
  G('heart_of_the_mountain', '산의 심장', 'legendary', '산처럼 움직이지 않는다.', ['def', 6], ['hp', 25], ['mobility', -1]),
  G('blade_of_the_first_king', '초대 왕의 검', 'legendary', '왕국을 세운 검.', ['atk', 7], ['critRate', 10]),
  G('wings_of_dawn', '여명의 날개', 'legendary', '어디든 닿는다.', ['mobility', 2], ['evasion', 10]),
  G('eternal_vow', '영원의 맹세', 'legendary', '이 맹세는 죽음도 갈라놓지 못한다.', ['affection', 25], ['shield', 20], ['regen', 3]),
  G('chrono_pocketwatch', '시간술사의 회중시계', 'legendary', '남들보다 한 번 더 움직인다.', ['ap', 2], ['skillCooldown', -1], ['hp', -10])
];

export const SEED_RELICS = [...COMMANDER_RELICS, ...GIFT_RELICS];

// ---------------------------------------------------------------------------
// 2. 아이템 (소모품 30 · 재료 25 · 선물 25 · 교본 10 · 열쇠/특수 10 = 100)
//    아이템 사용/지급 로직은 아직 없다. 설명은 기획 의도를 적는다.
// ---------------------------------------------------------------------------
const I = (category) => (id, name, rarity, description) => ({ id, name, category, rarity, description });
const cons = I('consumable'), mat = I('material'), gift = I('gift'), book = I('book'), key = I('key');

export const SEED_ITEMS = [
  // 소모품 30
  cons('potion', '회복약', 'common', '유닛 1명의 HP를 30 회복한다.'),
  cons('potion_plus', '고급 회복약', 'rare', '유닛 1명의 HP를 60 회복한다.'),
  cons('potion_max', '영약', 'epic', '유닛 1명의 HP를 모두 회복한다.'),
  cons('elixir_party', '군단 영약', 'legendary', '출전 중인 모든 아군의 HP를 모두 회복한다.'),
  cons('bandage', '붕대', 'common', 'HP 15 회복. 출혈을 멈춘다.'),
  cons('antidote', '해독제', 'common', '중독·지속 피해를 해제한다.'),
  cons('smelling_salts', '각성제', 'common', '기절·속박을 해제한다.'),
  cons('holy_water', '성수', 'rare', '모든 해로운 상태이상을 해제한다.'),
  cons('stamina_tonic', '강장제', 'common', '이번 턴 AP +1.'),
  cons('adrenaline_draught', '아드레날린 약', 'rare', '이번 턴 AP +2. 다음 턴 AP -1.'),
  cons('swift_tea', '신속의 차', 'rare', '이번 전투 동안 이동력 +1.'),
  cons('strength_brew', '힘의 물약', 'common', '3턴 동안 공격력 +3.'),
  cons('iron_skin_salve', '강철피부 연고', 'common', '3턴 동안 방어력 +3.'),
  cons('focus_incense', '집중의 향', 'rare', '3턴 동안 치명타율 +15%.'),
  cons('shadow_oil', '그림자 기름', 'rare', '2턴 동안 은신.'),
  cons('barrier_scroll', '방벽 두루마리', 'rare', '보호막 25를 얻는다.'),
  cons('mass_barrier_scroll', '대방벽 두루마리', 'epic', '아군 전원이 보호막 15를 얻는다.'),
  cons('fire_bomb', '화염병', 'common', '지정한 칸과 주변 1칸에 피해 20.'),
  cons('frost_bomb', '서리 폭탄', 'rare', '지정한 칸과 주변 1칸에 피해 15 + 둔화 1턴.'),
  cons('thunder_bomb', '뇌명 폭탄', 'epic', '지정한 칸과 주변 1칸에 피해 30 + 기절 1턴.'),
  cons('smoke_bomb', '연막탄', 'common', '주변 1칸 아군의 회피율 +20% (1턴).'),
  cons('caltrops', '마름쇠', 'common', '지정한 칸에 설치. 들어온 적은 이동이 멈춘다.'),
  cons('teleport_scroll', '순간이동 두루마리', 'rare', '유닛 1명을 4칸 안의 빈 칸으로 옮긴다.'),
  cons('recall_scroll', '귀환 두루마리', 'epic', '전투에서 유닛 1명을 안전하게 퇴각시킨다.'),
  cons('cooldown_crystal', '시간 수정', 'epic', '유닛 1명의 모든 스킬 재사용 대기를 초기화한다.'),
  cons('revive_feather', '부활의 깃털', 'legendary', '이번 전투에서 쓰러진 유닛 1명을 HP 50%로 되살린다.'),
  cons('field_ration', '야전 식량', 'common', '전략맵에서 사용: 모든 유닛 HP 20% 회복.'),
  cons('feast_basket', '잔치 바구니', 'rare', '전략맵에서 사용: 모든 유닛 HP 50% 회복 + 호감도 +2.'),
  cons('war_banner_token', '전투 깃발 휘장', 'rare', '이번 전투 동안 아군 전원 공격력 +2.'),
  cons('command_seal', '지휘 인장', 'epic', '즉시 지휘 AP +3.'),
  // 강화 재료 25
  mat('iron_ore', '철광석', 'common', '무기·방어구 강화의 기본 재료.'),
  mat('steel_ingot', '강철 주괴', 'rare', '철광석을 제련한 고급 강화 재료.'),
  mat('mithril_ingot', '미스릴 주괴', 'epic', '가볍고 단단한 전설의 금속.'),
  mat('adamant_core', '아다만트 핵', 'legendary', '최상위 강화 재료.'),
  mat('leather_scrap', '가죽 조각', 'common', '경장비 강화 재료.'),
  mat('hardened_hide', '경화 가죽', 'rare', '무두질한 두꺼운 가죽.'),
  mat('wyvern_hide', '와이번 가죽', 'epic', '불에 타지 않는 가죽.'),
  mat('wood_plank', '목재', 'common', '활·지팡이 강화 재료.'),
  mat('ironwood_branch', '철목 가지', 'rare', '쇠처럼 단단한 나뭇가지.'),
  mat('elder_heartwood', '고목 심재', 'epic', '천 년 묵은 나무의 심재.'),
  mat('mana_shard', '마력 파편', 'common', '마법 강화 재료.'),
  mat('mana_crystal', '마력 결정', 'rare', '응축된 마력.'),
  mat('aether_prism', '에테르 프리즘', 'epic', '에테르니아 왕도에서만 나는 프리즘.'),
  mat('star_fragment', '별의 조각', 'legendary', '하늘에서 떨어진 마력의 결정.'),
  mat('gunpowder', '화약', 'common', '화기 강화 재료.'),
  mat('refined_powder', '정제 화약', 'rare', '연기가 적은 고급 화약.'),
  mat('dragonfire_powder', '용염 화약', 'epic', '흑염 화산지대의 유황으로 만든 화약.'),
  mat('beast_fang', '맹수의 송곳니', 'common', '공격 강화 재료.'),
  mat('troll_bone', '트롤 뼈', 'rare', '방어 강화 재료.'),
  mat('obsidian_shard', '흑요석 조각', 'rare', '화산지대의 날카로운 돌.'),
  mat('volcanic_heart', '화산의 심장', 'epic', '아직도 뜨겁게 맥동하는 돌.'),
  mat('spirit_essence', '정령의 정수', 'epic', '스킬 강화 재료.'),
  mat('promotion_badge', '진급 휘장', 'rare', '유닛의 진급 조건 1개를 대신한다.'),
  mat('master_badge', '명장 휘장', 'epic', '상위 진급에 필요한 휘장.'),
  mat('phoenix_feather', '불사조 깃털', 'legendary', '전설 등급 장비의 핵심 재료.'),
  // 선물 25 (호감도)
  gift('wildflower_bouquet', '들꽃 다발', 'common', '호감도 +3. 누구나 좋아한다.'),
  gift('honey_cake', '꿀 케이크', 'common', '호감도 +3. 단것을 좋아하는 동료에게 +5.'),
  gift('warm_bread', '갓 구운 빵', 'common', '호감도 +2.'),
  gift('herbal_tea', '허브차', 'common', '호감도 +2. 마법사가 좋아한다.'),
  gift('whittled_figure', '나무 조각상', 'common', '호감도 +3. 직접 깎은 정성.'),
  gift('polished_pebble', '반질반질한 조약돌', 'common', '호감도 +1. 의외로 좋아하는 사람이 있다.'),
  gift('ale_keg', '맥주 통', 'common', '호감도 +3. 근접 병과가 특히 좋아한다.'),
  gift('feather_quill', '깃펜', 'common', '호감도 +2. 학자 기질의 동료에게 +4.'),
  gift('fishing_rod', '낚싯대', 'common', '호감도 +3. 궁수가 좋아한다.'),
  gift('silk_ribbon', '비단 리본', 'common', '호감도 +3.'),
  gift('poetry_book', '시집', 'rare', '호감도 +6.'),
  gift('silver_hairpin', '은 머리핀', 'rare', '호감도 +6.'),
  gift('fine_wine', '고급 와인', 'rare', '호감도 +6. 기사가 좋아한다.'),
  gift('music_box', '오르골', 'rare', '호감도 +7.'),
  gift('hunting_trophy', '사냥 트로피', 'rare', '호감도 +6. 화기 병과가 좋아한다.'),
  gift('star_chart', '별자리 지도', 'rare', '호감도 +6. 마법사가 특히 좋아한다.'),
  gift('handmade_scarf', '손뜨개 목도리', 'rare', '호감도 +7.'),
  gift('pet_kitten', '아기 고양이', 'rare', '호감도 +8. 싫어하는 사람이 없다.'),
  gift('gemstone_brooch', '보석 브로치', 'epic', '호감도 +12.'),
  gift('masterwork_lute', '명품 류트', 'epic', '호감도 +12.'),
  gift('ancestral_sword_replica', '선조의 검 복제품', 'epic', '호감도 +12. 기사가 특히 좋아한다.'),
  gift('portrait_commission', '초상화 의뢰서', 'epic', '호감도 +14.'),
  gift('promise_ring', '약속의 반지', 'legendary', '호감도 +25. 특별한 사람에게만.'),
  gift('royal_invitation', '왕실 연회 초대장', 'legendary', '호감도 +20. 출전 중인 모두에게 +5.'),
  gift('star_of_affection', '애정의 별', 'legendary', '호감도를 최대치로 만든다.'),
  // 교본 10 (SP)
  book('tome_novice', '수련생 교본', 'common', 'SP +1.'),
  book('tome_knight', '기사도 교본', 'rare', '기사 병과 SP +2.'),
  book('tome_mage', '마도서 사본', 'rare', '마법사 병과 SP +2.'),
  book('tome_archer', '궁술 교본', 'rare', '궁수 병과 SP +2.'),
  book('tome_melee', '검술 교본', 'rare', '근접 병과 SP +2.'),
  book('tome_firearm', '포술 교본', 'rare', '화기 병과 SP +2.'),
  book('tome_veteran', '고참의 회고록', 'epic', 'SP +3.'),
  book('tome_respec', '망각의 서', 'epic', '유닛 1명의 습득 스킬을 초기화하고 SP를 돌려준다.'),
  book('tome_master', '대가의 비전서', 'legendary', 'SP +5.'),
  book('tome_forbidden', '금서', 'legendary', 'SP +4. 대신 호감도 -5.'),
  // 열쇠·특수 10
  key('bronze_key', '청동 열쇠', 'common', '작은 보물상자를 연다.'),
  key('silver_key', '은 열쇠', 'rare', '큰 보물상자를 연다.'),
  key('golden_key', '황금 열쇠', 'epic', '봉인된 금고를 연다.'),
  key('map_fragment', '지도 조각', 'common', '3개를 모으면 숨겨진 노드가 드러난다.'),
  key('rewinder_shard', '리와인더 파편', 'rare', '3개를 모으면 시공간 리와인더 1개가 된다.'),
  key('merchant_token', '상인 길드 증표', 'rare', '다음 상점 1회 20% 할인.'),
  key('shrine_offering', '제단 공물', 'common', '이벤트 제단에서 더 좋은 축복을 받는다.'),
  key('bounty_notice', '현상금 수배서', 'rare', '다음 정예 전투 골드 +50%.'),
  key('royal_pardon', '왕실 사면장', 'epic', '퇴각/패배 시 노드 실패 페널티를 1회 없앤다.'),
  key('sealed_letter', '봉인된 서신', 'legendary', '특별 영입 이벤트를 연다.')
];

// ---------------------------------------------------------------------------
// 3. 보상 풀
//    하위 풀: 유물(종류 × 등급 8개), 아이템(분류 × 등급)
//    섹터별 풀: 4개 섹터 × 13종 (전투/매복/정예/정예 보물/보스/보스 유물 선택/이벤트 3종/상자 2종/상점 2종)
//    + 런 시작 선택 풀 2개
// ---------------------------------------------------------------------------
const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const RARITY_KO = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };
const CATEGORY_KO = { consumable: '소모품', material: '재료', gift: '선물', book: '교본', key: '열쇠' };

const SECTORS = [
  // tier: 0 EASY ~ 3 NIGHTMARE. gold: 일반 전투 골드 범위 (기존 전투 보상 적 수 × 100과 같은 규모)
  { id: 'A-1', name: '벨른 평원', tier: 0, gold: [80, 140] },
  { id: 'A-2', name: '아이젠 요새', tier: 1, gold: [120, 200] },
  { id: 'B-1', name: '에테르니아 왕도', tier: 2, gold: [180, 280] },
  { id: 'B-2', name: '흑염 화산지대', tier: 3, gold: [260, 400] }
];

// 섹터 난이도별 등급 가중치 (StS식 피라미드가 난이도에 따라 위로 이동)
const RARITY_WEIGHTS = {
  low: [[70, 25, 5, 0], [60, 30, 9, 1], [45, 35, 16, 4], [30, 38, 24, 8]],   // 일반 전투/상자
  high: [[30, 45, 20, 5], [20, 45, 28, 7], [10, 40, 38, 12], [5, 30, 45, 20]], // 정예/보스/큰 상자
  boss: [[0, 50, 40, 10], [0, 35, 50, 15], [0, 20, 55, 25], [0, 10, 55, 35]]   // 보스 유물 선택
};

const relicSubId = (kind, rarity) => `relics-${kind}-${rarity}`;
const itemSubId = (category, rarity) => `items-${category}-${rarity}`;

function buildSubPools() {
  const pools = [];
  for (const kind of ['commander', 'gift']) {
    for (const rarity of RARITIES) {
      const list = SEED_RELICS.filter(r => r.kind === kind && r.rarity === rarity);
      pools.push({
        id: relicSubId(kind, rarity),
        name: `[하위] ${kind === 'commander' ? '지휘관' : '선물'} 유물 · ${RARITY_KO[rarity]}`,
        rolls: 1, allowDuplicates: false,
        entries: list.map(r => ({ type: 'relic', kind, id: r.id, weight: 10 }))
      });
    }
  }
  for (const category of Object.keys(CATEGORY_KO)) {
    for (const rarity of RARITIES) {
      const list = SEED_ITEMS.filter(it => it.category === category && it.rarity === rarity);
      if (!list.length) continue;
      pools.push({
        id: itemSubId(category, rarity),
        name: `[하위] ${CATEGORY_KO[category]} · ${RARITY_KO[rarity]}`,
        rolls: 1, allowDuplicates: false,
        entries: list.map(it => ({ type: 'item', id: it.id, weight: 10 }))
      });
    }
  }
  return pools;
}

const subPoolIds = new Set(buildSubPools().map(p => p.id));

/** total weight를 등급 가중치대로 나눈 하위 풀 entry들. 해당 등급 풀이 없으면 건너뛴다. */
function rarityEntries(type, makeId, total, weights, extra = {}) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [];
  RARITIES.forEach((rarity, i) => {
    const pool = makeId(rarity);
    const w = Math.round((total * weights[i]) / sum * 10) / 10;
    if (w > 0 && subPoolIds.has(pool)) out.push({ type, ...extra, pool, weight: w });
  });
  return out;
}
const relicEntries = (kind, total, weights) => rarityEntries('relic', r => relicSubId(kind, r), total, weights, { kind });
const itemEntries = (category, total, weights) => rarityEntries('item', r => itemSubId(category, r), total, weights);
const goldEntry = ([min, max], mult, weight) => ({ type: 'gold', min: Math.round(min * mult), max: Math.round(max * mult), weight });

function buildSectorPools(s) {
  const low = RARITY_WEIGHTS.low[s.tier];
  const high = RARITY_WEIGHTS.high[s.tier];
  const boss = RARITY_WEIGHTS.boss[s.tier];
  const P = (suffix, name, rolls, entries, allowDuplicates = false) => ({ id: `${s.id}-${suffix}`, name: `${s.name} · ${name}`, rolls, allowDuplicates, entries });
  return [
    P('battle', '일반 전투', 2, [
      goldEntry(s.gold, 1, 55), ...itemEntries('consumable', 20, low), ...itemEntries('material', 12, low),
      ...itemEntries('gift', 5, low), ...relicEntries('gift', 6, low), ...relicEntries('commander', 2, low)
    ]),
    P('battle-ambush', '매복 전투', 2, [
      goldEntry(s.gold, 1.2, 50), ...itemEntries('consumable', 25, low), ...itemEntries('key', 8, low),
      ...relicEntries('gift', 10, low), ...relicEntries('commander', 4, low)
    ]),
    P('elite', '정예 전투', 3, [
      goldEntry(s.gold, 1.5, 40), ...relicEntries('gift', 25, high), ...relicEntries('commander', 15, high),
      ...itemEntries('material', 12, high), ...itemEntries('book', 8, high)
    ]),
    P('elite-hoard', '정예 보물 더미', 3, [
      goldEntry(s.gold, 2, 45), ...relicEntries('gift', 20, high), ...relicEntries('commander', 20, high), ...itemEntries('key', 10, high)
    ]),
    P('boss', '보스 처치', 3, [
      goldEntry(s.gold, 2.5, 50), ...relicEntries('gift', 20, boss), ...itemEntries('book', 15, high),
      ...itemEntries('material', 15, high), ...itemEntries('gift', 10, high)
    ]),
    P('boss-relic', '보스 유물 3택1 후보', 3, [...relicEntries('commander', 70, boss), ...relicEntries('gift', 30, boss)]),
    P('event-shrine', '이벤트: 잊힌 제단', 1, [
      ...relicEntries('gift', 45, low), ...itemEntries('book', 25, low), ...itemEntries('consumable', 30, low)
    ]),
    P('event-ruins', '이벤트: 무너진 유적', 2, [
      goldEntry(s.gold, 0.8, 30), ...itemEntries('key', 25, low), ...itemEntries('material', 25, low), ...relicEntries('commander', 20, low)
    ]),
    P('event-caravan', '이벤트: 떠돌이 상단', 2, [
      goldEntry(s.gold, 0.6, 35), ...itemEntries('consumable', 35, low), ...itemEntries('gift', 30, low)
    ]),
    P('chest-small', '작은 보물상자', 1, [
      goldEntry(s.gold, 0.7, 50), ...itemEntries('consumable', 30, low), ...relicEntries('gift', 20, low)
    ]),
    P('chest-large', '큰 보물상자', 2, [
      goldEntry(s.gold, 1.5, 35), ...relicEntries('gift', 30, high), ...relicEntries('commander', 20, high), ...itemEntries('material', 15, high)
    ]),
    P('shop-relics', '상점 진열 유물', 3, [...relicEntries('commander', 50, high), ...relicEntries('gift', 50, high)]),
    P('shop-items', '상점 진열 아이템', 5, [
      ...itemEntries('consumable', 40, low), ...itemEntries('material', 20, low), ...itemEntries('gift', 20, low),
      ...itemEntries('book', 10, low), ...itemEntries('key', 10, low)
    ])
  ];
}

function buildRunStartPools() {
  return [
    { id: 'run-start-commander', name: '런 시작 · 지휘관 유물 3택1', rolls: 3, allowDuplicates: false,
      // 3개를 서로 다르게 보여 줘야 하므로 하위 풀(2개 entry) 대신 유물을 직접 나열한다. 일반 10 : 희귀 4
      entries: COMMANDER_RELICS.filter(r => r.rarity === 'common' || r.rarity === 'rare')
        .map(r => ({ type: 'relic', kind: 'commander', id: r.id, weight: r.rarity === 'common' ? 10 : 4 })) },
    { id: 'run-start-supplies', name: '런 시작 · 보급품', rolls: 3, allowDuplicates: false,
      entries: [goldEntry([100, 150], 1, 40), ...itemEntries('consumable', 40, [80, 20, 0, 0]), ...relicEntries('gift', 20, [80, 20, 0, 0])] }
  ];
}

/** 하위 풀이 먼저 오도록 정렬된 전체 풀 목록 */
export const SEED_POOLS = [...buildSubPools(), ...SECTORS.flatMap(buildSectorPools), ...buildRunStartPools()];

export const SEED_SUMMARY = {
  relics: SEED_RELICS.length,
  commanderRelics: COMMANDER_RELICS.length,
  giftRelics: GIFT_RELICS.length,
  items: SEED_ITEMS.length,
  pools: SEED_POOLS.length
};
