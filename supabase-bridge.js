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
  async saveScenarioMapToSupabase(id,data,collection='scenarioMaps'){try{return await putRecord(collection,id,{...data,sectorId:String(id),updatedAt:new Date().toISOString()});}catch(e){warn('save scenario map',e);return false;}},
  async loadScenarioMapFromSupabase(id,collection='scenarioMaps'){try{return await getRecord(collection,id);}catch(e){warn('load scenario map',e);return null;}},
  saveTacticalMapTemplateToSupabase(id,data){return this.saveScenarioMapToSupabase(id,data,'tacticalMapTemplates');},
  async loadWorldSectorsFromSupabase(){
    try {
      const config = await getRecord('game_configs', 'world_sectors');
      return Array.isArray(config?.worldSectors) ? config.worldSectors : [];
    } catch (e) { warn('load world sectors', e); return []; }
  },
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
  async loadTacticalMapTemplateFromSupabase(id){
    try{
      const doc=await getRecord('tacticalMapTemplates',id);
      if(doc) return doc;
      const legacy=await getRecord('scenarioMaps',id);
      if(legacy&&Array.isArray(legacy.tiles)&&legacy.tiles.length) return legacy;
      // 실제 운영 데이터인 game_configs/world_sectors/{worldSectors[].scenarioMap}도 조회한다.
      return await this.loadSectorScenarioMapFromSupabase(id);
    }catch(e){warn('load tactical map template',e);return null;}
  },
  // 에디터 전용: Supabase 오류는 throw, 정말 없을 때만 null 반환 (오류 시 빈 맵으로 덮어쓰는 사고 방지)
  async findTacticalMapTemplateStrict(id){
    const doc=await getRecord('tacticalMapTemplates',id);
    if(doc&&Array.isArray(doc.tiles)&&doc.tiles.length) return doc;
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
  async saveGameStateToCloud(payload){try{const uid=this.currentUser?.uid||payload?.guest?.id||'guest_main';return await putRecord('gameState',uid,{...clean(payload),userId:uid,updatedAt:new Date().toISOString()});}catch(e){warn('save game state',e);return false;}},
  async loadGameStateFromCloud(uid){try{return await getRecord('gameState',uid||this.currentUser?.uid||'guest_main');}catch(e){warn('load game state',e);return null;}},
  subscribeGameState(uid,cb){return subscribeOne('gameState',uid||this.currentUser?.uid||'guest_main',cb);}
};
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
for (const [name,fn] of Object.entries({saveCharacterToCloud:bridge.saveCharacterToCloud,getCharactersFromCloud:bridge.getCharactersFromCloud,subscribeCharacterList:bridge.subscribeCharacterList,deleteCharacterFromCloud:bridge.deleteCharacterFromCloud,uploadCharacterAvatar:bridge.uploadCharacterAvatar,uploadSkillIcon:bridge.uploadSkillIcon,saveSkillToCloud:bridge.saveSkillToCloud,getSkillsFromCloud:bridge.getSkillsFromCloud,subscribeSkillList:bridge.subscribeSkillList,saveGameConfigToCloud:bridge.saveGameConfigToCloud,loadGameConfigFromCloud:bridge.loadGameConfigFromCloud,subscribeGameConfig:bridge.subscribeGameConfig,saveGameStateToCloud:bridge.saveGameStateToCloud,loadGameStateFromCloud:bridge.loadGameStateFromCloud,subscribeGameState:bridge.subscribeGameState,syncMapToSupabase:bridge.syncMapToSupabase,loadMapFromSupabase:bridge.loadMapFromSupabase,saveScenarioMapToSupabase:bridge.saveScenarioMapToSupabase,loadScenarioMapFromSupabase:bridge.loadScenarioMapFromSupabase,saveTacticalMapTemplateToSupabase:bridge.saveTacticalMapTemplateToSupabase,loadTacticalMapTemplateFromSupabase:bridge.loadTacticalMapTemplateFromSupabase,findTacticalMapTemplateStrict:bridge.findTacticalMapTemplateStrict,loadWorldSectorsFromSupabase:bridge.loadWorldSectorsFromSupabase,loadSectorScenarioMapFromSupabase:bridge.loadSectorScenarioMapFromSupabase,saveSectorScenarioMapToSupabase:bridge.saveSectorScenarioMapToSupabase})) window[name]=fn.bind(bridge);
bridge.initAuth();
console.info(client?'Supabase 연결 준비 완료':'Supabase 설정 대기 중: supabase-config.js 확인');
