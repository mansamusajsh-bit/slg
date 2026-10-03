/** Supabase bridge — slg_records(jsonb) + slg-assets Storage. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.SUPABASE_CONFIG || {};
const supabaseUrl = config.url || window.SUPABASE_URL || '';
const supabaseAnonKey = config.anonKey || window.SUPABASE_ANON_KEY || '';
const client = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;
const TABLE = 'slg_records';
const BUCKET = 'slg-assets';
const clean = (v) => {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object' || v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(x => clean(x) ?? null);
  return Object.fromEntries(Object.entries(v).filter(([,x]) => x !== undefined).map(([k,x]) => [k, clean(x)]));
};
let _seq=0;
const uid=()=>`${Date.now().toString(36)}${(++_seq).toString(36)}${Math.random().toString(36).slice(2,6)}`;
const warn = (where, error) => { console.error(`[Supabase] ${where}`, error); };
const requireClient = () => { if (!client) throw new Error('Supabase 설정이 없습니다. supabase-config.js에 URL과 anon key를 입력하세요.'); return client; };
async function getRecord(collection, id) {
  const { data, error } = await requireClient().from(TABLE).select('data').eq('collection_name', collection).eq('record_id', String(id)).maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}
async function putRecord(collection, id, value) {
  const payload = { collection_name: collection, record_id: String(id), data: clean(value), updated_at: new Date().toISOString() };
  const { error } = await requireClient().from(TABLE).upsert(payload, { onConflict: 'collection_name,record_id' });
  if (error) throw error;
  return true;
}
async function listRecords(collection) {
  const { data, error } = await requireClient().from(TABLE).select('data').eq('collection_name', collection).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => row.data).filter(Boolean);
}
async function deleteRecord(collection, id) {
  const { error } = await requireClient().from(TABLE).delete().eq('collection_name', collection).eq('record_id', String(id));
  if (error) throw error;
  return true;
}
// 동시 수정 방지 저장: data.rev가 expectedRev일 때만 덮어쓴다. expectedRev가 null이면 "없을 때만 새로 만들기".
// 다른 사람이 먼저 바꿨으면 false (다시 읽고 다시 시도해야 한다).
async function casRecord(collection, id, expectedRev, value) {
  const now = new Date().toISOString();
  if (expectedRev == null) {
    const payload = { collection_name: collection, record_id: String(id), data: clean(value), updated_at: now };
    const { data, error } = await requireClient().from(TABLE).upsert(payload, { onConflict: 'collection_name,record_id', ignoreDuplicates: true }).select('record_id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }
  const { data, error } = await requireClient().from(TABLE).update({ data: clean(value), updated_at: now })
    .eq('collection_name', collection).eq('record_id', String(id)).eq('data->>rev', String(expectedRev)).select('record_id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}
// 서버 시각(ms). supabase-schema.sql의 slg_server_time()이 있으면 그걸 쓰고, 없으면
// 임시 행을 하나 넣어 DB 기본값 now()로 찍힌 updated_at을 읽은 뒤 지운다.
async function getServerTime() {
  const c = requireClient();
  const rpc = await c.rpc('slg_server_time');
  if (!rpc.error && rpc.data) return Date.parse(rpc.data);
  const rid = `clock_${uid()}`;
  const { data, error } = await c.from(TABLE).insert({ collection_name: 'serverClock', record_id: rid, data: {} }).select('updated_at').single();
  if (error) throw error;
  c.from(TABLE).delete().eq('collection_name', 'serverClock').eq('record_id', rid).then(() => {}, () => {});
  return Date.parse(data.updated_at);
}
async function uploadAsset(input, folder, filename) {
  if (!client) return typeof input === 'string' ? input : '';
  try {
    let blob = input;
    if (typeof input === 'string' && input.startsWith('data:')) {
      const response = await fetch(input); blob = await response.blob();
    }
    if (!(blob instanceof Blob)) return input;
    const safe = String(filename || 'asset').replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `${folder}/${safe}_${Date.now()}.${(blob.type.split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g,'')}`;
    const { error } = await client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) { warn('asset upload failed', e); return input; }
}

const bridge = {
  isReady: !!client,
  currentUser: { uid: 'guest_main', isAnonymous: true },
  app: null, auth: null, db: client, storage: client?.storage || null,
  async initAuth() { this.isReady = !!client; if (typeof window.onSupabaseUserReady === 'function') window.onSupabaseUserReady(this.currentUser); return this.currentUser; },
  uploadRawImage(input, folder='character_avatars', filename='asset') { return uploadAsset(input, folder, filename); },
  uploadCharacterAvatar(input, name='hero') { return uploadAsset(input, 'character_avatars', name); },
  uploadSkillIcon(input, name='skill') { return uploadAsset(input, 'skill_icons', name); },
  async saveCharacterToCloud(obj) {
    try { const id = obj.id || `char_${Date.now()}`; let imageUrl = obj.imageUrl || ''; if (imageUrl.startsWith('data:')) imageUrl = await this.uploadCharacterAvatar(imageUrl, obj.name || id);
      let customSkill = obj.customSkill ? {...obj.customSkill} : null; if (customSkill?.imageUrl?.startsWith('data:')) customSkill.imageUrl = await this.uploadSkillIcon(customSkill.imageUrl, customSkill.name || 'skill');
      return await putRecord('characters', id, { ...obj, id, userId:'GLOBAL_OPERATOR', ownerId:'GLOBAL_OPERATOR', isGlobal:true, name:obj.name || '영웅', unitClass:obj.unitClass || obj.classType || 'KNIGHT', classType:obj.classType || obj.unitClass || 'KNIGHT', avatar:obj.avatar || '👤', imageUrl, customSkill, skillTree:obj.skillTree || [], createdAt:obj.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() });
    } catch(e) { warn('save character',e); return false; }
  },
  async getCharactersFromCloud() { try { return (await listRecords('characters')).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)); } catch(e){warn('list characters',e);return [];} },
  subscribeCharacterList(cb) { return subscribeCollection('characters', cb, true); },
  async deleteCharacterFromCloud(id) { try{return await deleteRecord('characters',id);}catch(e){warn('delete character',e);return false;} },
  async saveSkillToCloud(obj) { try { const id=obj.id||`skill_${Date.now()}`; let imageUrl=obj.imageUrl||''; if(imageUrl.startsWith('data:')) imageUrl=await this.uploadSkillIcon(imageUrl,obj.name||id); return await putRecord('skills',id,{...obj,id,imageUrl,updatedAt:new Date().toISOString()}); }catch(e){warn('save skill',e);return false;} },
  async getSkillsFromCloud(){try{return await listRecords('skills');}catch(e){warn('list skills',e);return []; }},
  subscribeSkillList(cb){return subscribeCollection('skills',cb);},
  async saveGameConfigToCloud(id,data){try{return await putRecord('game_configs',id||'global_config',{...data,id:id||'global_config',updatedAt:new Date().toISOString()});}catch(e){warn('save config',e);return false;}},
  async loadGameConfigFromCloud(id){try{return await getRecord('game_configs',id||'global_config');}catch(e){warn('load config',e);return null;}},
  subscribeGameConfig(id,cb){return subscribeOne('game_configs',id||'global_config',cb);},
  async syncMapToSupabase(id,tiles,name='Standard 8x14 Grid Map'){try{return await putRecord('maps',id||'default_map',{id:id||'default_map',name,cols:8,rows:14,tiles:tiles||[],updatedAt:new Date().toISOString()});}catch(e){warn('save map',e);return false;}},
  async loadMapFromSupabase(id){try{return await getRecord('maps',id||'default_map');}catch(e){warn('load map',e);return null;}},
  // LEGACY: 기본 collection 'scenarioMaps'는 사용 중단. saveTacticalMapTemplateToSupabase(→ tacticalMapTemplates)만 쓴다.
  async saveScenarioMapToSupabase(id,data,collection='scenarioMaps'){try{return await putRecord(collection,id,{...data,sectorId:String(id),updatedAt:new Date().toISOString()});}catch(e){warn('save scenario map',e);return false;}},
  // LEGACY: scenarioMaps 직접 조회. 사용처 없음 (migrateScenarioMaps 참고).
  async loadScenarioMapFromSupabase(id,collection='scenarioMaps'){try{return await getRecord(collection,id);}catch(e){warn('load scenario map',e);return null;}},
  saveTacticalMapTemplateToSupabase(id,data){return this.saveScenarioMapToSupabase(id,data,'tacticalMapTemplates');},
  async loadWorldSectorsFromSupabase(){
    try {
      const config = await getRecord('game_configs', 'world_sectors');
      return Array.isArray(config?.worldSectors) ? config.worldSectors : [];
    } catch (e) { warn('load world sectors', e); return []; }
  },
  // LEGACY: world_sectors.scenarioMap 조회. 전투/에디터 로더에서 더 이상 호출하지 않는다.
  async loadSectorScenarioMapFromSupabase(id){
    try {
      const sectors = await this.loadWorldSectorsFromSupabase();
      const sector = sectors.find(item => String(item?.id) === String(id));
      const raw = sector?.scenarioMap;
      if (Array.isArray(raw)) return { id:String(id), sectorId:String(id), cols:8, rows:14, tiles:raw, name:sector.name || String(id) };
      if (raw && Array.isArray(raw.tiles)) return { ...raw, id:String(id), sectorId:String(id), tiles:raw.tiles };
      return null;
    } catch (e) { warn(`load sector map ${id}`, e); return null; }
  },
  // LEGACY: world_sectors.scenarioMap 미러 저장. 에디터 저장에서 더 이상 호출하지 않는다.
  async saveSectorScenarioMapToSupabase(id, mapData){
    try {
      const current = await getRecord('game_configs', 'world_sectors') || {};
      const sectors = Array.isArray(current.worldSectors) ? [...current.worldSectors] : [];
      const index = sectors.findIndex(item => String(item?.id) === String(id));
      // world_sectors에 이 섹터가 없으면(예: 아직 등록 전인 A-1) 미러 저장은 건너뛴다. 실패가 아니다.
      // 전술맵의 기준 저장소는 tacticalMapTemplates이고, 이건 구버전 호환용 사본일 뿐이다.
      if (index < 0) { console.info(`[Supabase] world_sectors에 ${id} 섹터가 없어 구버전 미러 저장은 건너뜁니다.`); return 'skipped'; }
      const oldSector = sectors[index];
      sectors[index] = { ...oldSector, scenarioMap: mapData, updatedAt:new Date().toISOString() };
      const ok = await putRecord('game_configs', 'world_sectors', { ...current, id:'world_sectors', worldSectors:sectors, updatedAt:new Date().toISOString() });
      return ok;
    } catch (e) { warn(`save sector map ${id}`, e); return false; }
  },
  // 전술 맵 템플릿의 유일한 저장소는 tacticalMapTemplates다 (전투 진입·에디터 공용).
  // Supabase 오류는 throw하고, 문서가 정말 없을 때만 null을 돌려준다. 구버전 위치(scenarioMaps,
  // world_sectors.scenarioMap)는 더 이상 조회하지 않는다 — 옮기려면 콘솔에서 migrateScenarioMaps()를 호출한다.
  async loadTacticalMapTemplateFromSupabase(id){
    const doc=await getRecord('tacticalMapTemplates',id);
    return (doc&&Array.isArray(doc.tiles)&&doc.tiles.length) ? doc : null;
  },
  // 에디터 전용 이름. 동작은 위와 같다 (오류 시 throw → 에디터가 빈 맵으로 덮어쓰는 사고 방지).
  async findTacticalMapTemplateStrict(id){
    return this.loadTacticalMapTemplateFromSupabase(id);
  },
  // LEGACY: 1차 검증 전까지 남겨 두는 구버전 조회. migrateScenarioMaps()만 사용한다.
  async findLegacyScenarioMapStrict(id){
    const legacy=await getRecord('scenarioMaps',id);
    if(legacy&&Array.isArray(legacy.tiles)&&legacy.tiles.length) return legacy;
    const config=await getRecord('game_configs','world_sectors');
    const sectors=Array.isArray(config?.worldSectors)?config.worldSectors:[];
    const sector=sectors.find(item=>String(item?.id)===String(id));
    const raw=sector?.scenarioMap;
    if(Array.isArray(raw)&&raw.length) return {id:String(id),sectorId:String(id),cols:8,rows:14,tiles:raw,name:sector.name||String(id)};
    if(raw&&Array.isArray(raw.tiles)&&raw.tiles.length) return {...raw,id:String(id),sectorId:String(id)};
    return null;
  },
  /**
   * 일회성 마이그레이션: scenarioMaps 컬렉션과 game_configs/world_sectors의 scenarioMap을
   * tacticalMapTemplates로 복사한다. 자동 실행하지 않는다 — 개발자 도구 콘솔에서 직접 호출한다.
   *   await migrateScenarioMaps()                  // 미리보기(dryRun): 무엇을 옮길지만 출력
   *   await migrateScenarioMaps({ dryRun:false })  // 실제 저장
   * 이미 tacticalMapTemplates에 있는 id는 건너뛴다(overwrite:true로 덮어쓰기). 검증에 실패한 맵은 저장하지 않는다.
   * 원본(scenarioMaps / world_sectors)은 지우지 않는다.
   */
  async migrateScenarioMaps({ dryRun=true, overwrite=false }={}){
    const MapSchema=window.MapSchema;
    if(!MapSchema) throw new Error('MapSchema 모듈이 없습니다.');
    const sources=new Map();
    (await listRecords('scenarioMaps')).forEach(doc=>{ const id=String(doc?.sectorId||doc?.id||''); if(id) sources.set(id,{from:'scenarioMaps',doc}); });
    const ids=new Set(sources.keys());
    (await this.loadWorldSectorsFromSupabase()).forEach(s=>{ if(s?.id&&s.scenarioMap) ids.add(String(s.id)); });
    const report=[];
    for(const id of ids){
      const raw=sources.has(id) ? sources.get(id).doc : await this.findLegacyScenarioMapStrict(id);
      const from=sources.has(id) ? 'scenarioMaps' : 'world_sectors';
      if(!overwrite && await getRecord('tacticalMapTemplates',id)){ report.push({id,from,result:'skip(이미 있음)'}); continue; }
      const tpl=MapSchema.normalizeTacticalMapTemplate(raw,id);
      const check=tpl?MapSchema.validateTacticalMapTemplate(tpl):{valid:false,errors:['정규화 실패']};
      if(!check.valid){ report.push({id,from,result:'invalid: '+check.errors.join(', ')}); continue; }
      if(!dryRun){
        await putRecord('tacticalMapTemplates',id,{sectorId:tpl.sectorId||id,name:tpl.metadata?.name||id,cols:tpl.width,rows:tpl.height,
          tiles:tpl.tiles,spawnPoints:tpl.spawnPoints,roads:tpl.metadata?.roads,structures:tpl.metadata?.structures,units:tpl.metadata?.units,
          migratedFrom:from,updatedAt:new Date().toISOString()});
      }
      report.push({id,from,result:dryRun?'would migrate':'migrated'});
    }
    console.table(report);
    if(dryRun) console.info('[migrateScenarioMaps] 미리보기입니다. 실제로 옮기려면 migrateScenarioMaps({ dryRun:false })');
    return report;
  },
  // 국가 지분 (nationShares/{regionId}, 전 플레이어 공유). 오류는 던진다 — nationShares.js가 처리.
  listNationShares(){return listRecords('nationShares');},
  getNationShare(id){return getRecord('nationShares',id);},
  casNationShare(id,expectedRev,value){return casRecord('nationShares',id,expectedRev,value);},
  getServerTime(){return getServerTime();},
  async saveGameStateToCloud(payload){try{const uid=this.currentUser?.uid||payload?.guest?.id||'guest_main';return await putRecord('gameState',uid,{...clean(payload),userId:uid,updatedAt:new Date().toISOString()});}catch(e){warn('save game state',e);return false;}},
  async loadGameStateFromCloud(uid){try{return await getRecord('gameState',uid||this.currentUser?.uid||'guest_main');}catch(e){warn('load game state',e);return null;}},
  subscribeGameState(uid,cb){return subscribeOne('gameState',uid||this.currentUser?.uid||'guest_main',cb);}
};
/**
 * SlgStore — 에디터 공용 저장 계층 (보상 풀/유물/아이템 에디터가 사용).
 * 위의 기존 함수들과 달리 오류를 삼키지 않는다:
 *   - load: 레코드가 없으면 NOT_FOUND 에러를 던진다. 기본값으로 대체하지 않는다.
 *   - save: validator가 있으면 먼저 검증하고, 실패하면 VALIDATION 에러를 던진다(저장하지 않음).
 *   - Supabase 오류는 그대로 던진다.
 */
class SlgStoreError extends Error {
  constructor(code, message, details) { super(message); this.name = 'SlgStoreError'; this.code = code; this.details = details; }
}
const SlgStore = {
  Error: SlgStoreError,
  get isReady() { return !!client; },
  /** validator(data) → { valid, errors } 를 실행하고 실패하면 throw */
  validate(data, validator) {
    if (typeof validator !== 'function') return { valid: true, errors: [], warnings: [] };
    const report = validator(data);
    if (!report || report.valid !== true) {
      const msgs = (report?.errors || []).map(e => (e && e.message) || String(e));
      throw new SlgStoreError('VALIDATION', `검증 실패: ${msgs.join(' / ') || '알 수 없는 오류'}`, report);
    }
    return report;
  },
  async load(collection, id) {
    const value = await getRecord(collection, id);
    if (value == null) throw new SlgStoreError('NOT_FOUND', `[${collection}/${id}] 데이터가 없습니다.`);
    return value;
  },
  async exists(collection, id) { return (await getRecord(collection, id)) != null; },
  async list(collection) { return listRecords(collection); },
  async save(collection, id, data, validator) {
    if (!id) throw new SlgStoreError('VALIDATION', `[${collection}] id가 비어 있어 저장할 수 없습니다.`);
    this.validate(data, validator);
    await putRecord(collection, id, { ...data, id: String(id), updatedAt: new Date().toISOString() });
    return true;
  },
  /**
   * 에디터용 이미지 업로드 (slg-assets 버킷). 실패하면 throw — 기존 uploadAsset처럼 base64로 대체하지 않는다.
   * @param {Blob} blob 이미지
   * @param {string} folder 예: 'item_icons'
   * @param {string} name 파일명 접두어 (레코드 id)
   * @returns {Promise<string>} 공개 URL
   */
  async uploadImage(blob, folder, name) {
    if (!(blob instanceof Blob) || !/^image\//.test(blob.type)) throw new SlgStoreError('VALIDATION', '이미지 파일만 올릴 수 있습니다.');
    const safeFolder = String(folder || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safe = String(name || 'image').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-zA-Z0-9]/g, '');
    const path = `${safeFolder}/${safe}_${Date.now()}.${ext}`;
    const { error } = await requireClient().storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    const { data } = requireClient().storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new SlgStoreError('UPLOAD', '업로드는 됐지만 공개 URL을 받지 못했습니다.');
    return data.publicUrl;
  },
  /** 여러 레코드를 한 번에 저장. 전부 검증한 뒤에만 쓴다 (하나라도 실패하면 아무것도 쓰지 않음). */
  async saveMany(collection, records, validator) {
    const list = Array.isArray(records) ? records : [];
    for (const rec of list) {
      if (!rec || !rec.id) throw new SlgStoreError('VALIDATION', `[${collection}] id가 없는 레코드가 있어 저장하지 않았습니다.`);
      try { this.validate(rec, validator); }
      catch (e) { throw new SlgStoreError('VALIDATION', `[${collection}/${rec.id}] ${e.message}`, e.details); }
    }
    const now = new Date().toISOString();
    for (let i = 0; i < list.length; i += 100) {
      const rows = list.slice(i, i + 100).map(rec => ({ collection_name: collection, record_id: String(rec.id), data: clean({ ...rec, id: String(rec.id), updatedAt: now }), updated_at: now }));
      const { error } = await requireClient().from(TABLE).upsert(rows, { onConflict: 'collection_name,record_id' });
      if (error) throw error;
    }
    return list.length;
  },
  async remove(collection, id) { await deleteRecord(collection, id); return true; }
};
window.SlgStore = SlgStore;

function subscribeCollection(collection, callback, sortCharacters=false){
  if(!client)return ()=>{}; let active=true;
  const refresh=async()=>{const rows=await listRecords(collection); if(sortCharacters)rows.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)); if(active&&typeof callback==='function')callback(rows);};
  refresh().catch(e=>warn(`initial ${collection} subscription`,e));
  const channel=client.channel(`slg-${collection}-${uid()}`).on('postgres_changes',{event:'*',schema:'public',table:TABLE,filter:`collection_name=eq.${collection}`},()=>refresh().catch(e=>warn('realtime refresh',e))).subscribe();
  return ()=>{active=false;client.removeChannel(channel);};
}
function subscribeOne(collection,id,callback){
  if(!client)return ()=>{}; let active=true;
  const refresh=async()=>{const value=await getRecord(collection,id);if(active&&value&&typeof callback==='function')callback(value);};
  refresh().catch(e=>warn('initial record subscription',e));
  const channel=client.channel(`slg-${collection}-${id}-${uid()}`).on('postgres_changes',{event:'*',schema:'public',table:TABLE,filter:`collection_name=eq.${collection}`},payload=>{if(payload.new?.record_id===String(id))refresh().catch(e=>warn('realtime record',e));}).subscribe();
  return ()=>{active=false;client.removeChannel(channel);};
}
window.SupabaseBridge=bridge;
window.SupabaseBridge.syncCharacterToSupabase=bridge.saveCharacterToCloud.bind(bridge);
window.SupabaseBridge.loadCharacters=bridge.getCharactersFromCloud.bind(bridge);
window.SupabaseBridge.subscribeCharacters=bridge.subscribeCharacterList.bind(bridge);
window.SupabaseBridge.uploadCharacterImage=bridge.uploadCharacterAvatar.bind(bridge);
window.SupabaseBridge.syncGameStateToSupabase=bridge.saveGameStateToCloud.bind(bridge);
for (const [name,fn] of Object.entries({saveCharacterToCloud:bridge.saveCharacterToCloud,getCharactersFromCloud:bridge.getCharactersFromCloud,subscribeCharacterList:bridge.subscribeCharacterList,deleteCharacterFromCloud:bridge.deleteCharacterFromCloud,uploadCharacterAvatar:bridge.uploadCharacterAvatar,uploadSkillIcon:bridge.uploadSkillIcon,saveSkillToCloud:bridge.saveSkillToCloud,getSkillsFromCloud:bridge.getSkillsFromCloud,subscribeSkillList:bridge.subscribeSkillList,saveGameConfigToCloud:bridge.saveGameConfigToCloud,loadGameConfigFromCloud:bridge.loadGameConfigFromCloud,subscribeGameConfig:bridge.subscribeGameConfig,saveGameStateToCloud:bridge.saveGameStateToCloud,loadGameStateFromCloud:bridge.loadGameStateFromCloud,subscribeGameState:bridge.subscribeGameState,syncMapToSupabase:bridge.syncMapToSupabase,loadMapFromSupabase:bridge.loadMapFromSupabase,saveScenarioMapToSupabase:bridge.saveScenarioMapToSupabase,loadScenarioMapFromSupabase:bridge.loadScenarioMapFromSupabase,saveTacticalMapTemplateToSupabase:bridge.saveTacticalMapTemplateToSupabase,loadTacticalMapTemplateFromSupabase:bridge.loadTacticalMapTemplateFromSupabase,findTacticalMapTemplateStrict:bridge.findTacticalMapTemplateStrict,migrateScenarioMaps:bridge.migrateScenarioMaps,loadWorldSectorsFromSupabase:bridge.loadWorldSectorsFromSupabase,loadSectorScenarioMapFromSupabase:bridge.loadSectorScenarioMapFromSupabase,saveSectorScenarioMapToSupabase:bridge.saveSectorScenarioMapToSupabase})) window[name]=fn.bind(bridge);
bridge.initAuth();
console.info(client?'Supabase 연결 준비 완료':'Supabase 설정 대기 중: supabase-config.js 확인');
