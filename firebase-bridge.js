import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadString, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

/* ==========================================================================
   Firebase Cloud Integration Configuration
   Database: Cloud Firestore (Collections: characters, skills, game_configs, maps, gameState)
   Storage: Firebase Storage (character_avatars/, skill_icons/)
   Zero LocalStorage: Absolute cloud-native synchronization
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyBg8xP98xbD4O8aK0mU1J-B01I4VzoUnnM",
  authDomain: "turnkey-facility-8lcf1.firebaseapp.com",
  projectId: "turnkey-facility-8lcf1",
  storageBucket: "turnkey-facility-8lcf1.firebasestorage.app",
  messagingSenderId: "901721491051",
  appId: "1:901721491051:web:09f587dcdf7e9ce615d32e"
};

let app = null;
let auth = null;
let db = null;
let storage = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    db = getFirestore(app, "ai-studio-remixwebslg-2fa45006-9c73-4078-ae0b-836bdd0cd7f4");
  } catch (dbErr) {
    db = getFirestore(app);
  }
  storage = getStorage(app);
  console.log("🔥 [Firebase] Cloud Firestore & Cloud Storage Initialized!");
} catch (e) {
  console.warn("Firebase initialization warning:", e);
}

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// Global Firebase Bridge Object
window.FirebaseBridge = {
  isReady: false,
  currentUser: null,
  app,
  auth,
  db,
  storage,

  // 1. Firebase Anonymous Auth Auto Login
  async initAuth() {
    if (!auth) return null;
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          this.currentUser = user;
          this.isReady = true;
          console.log("🔥 [Firebase Auth] 익명 사용자 인증 활성화:", user.uid);
          if (typeof window.onFirebaseUserReady === 'function') {
            window.onFirebaseUserReady(user);
          }
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            this.currentUser = cred.user;
            this.isReady = true;
            console.log("🔥 [Firebase Auth] 익명 로그인 완료:", cred.user.uid);
            if (typeof window.onFirebaseUserReady === 'function') {
              window.onFirebaseUserReady(cred.user);
            }
            resolve(cred.user);
          } catch (err) {
            console.warn("Firebase anonymous signIn error:", err);
            resolve(null);
          }
        }
      });
    });
  },

  // 2. Upload Raw Image / DataURL to Firebase Storage and return HTTPS Download URL
  async uploadRawImage(fileOrDataUrl, folder = 'character_avatars', filename = 'asset') {
    if (!storage) {
      console.warn("Firebase Storage not available");
      return typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '';
    }
    try {
      const timestamp = Date.now();
      const cleanName = (filename || 'asset').replace(/[^a-zA-Z0-9_-]/g, '_');
      const storagePath = `${folder}/${cleanName}_${timestamp}.jpg`;
      const storageRef = ref(storage, storagePath);

      if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
        await uploadString(storageRef, fileOrDataUrl, 'data_url');
        const downloadUrl = await getDownloadURL(storageRef);
        console.log(`☁️ [Firebase Storage] ${folder} 업로드 완료:`, downloadUrl);
        return downloadUrl;
      } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
        await uploadBytes(storageRef, fileOrDataUrl);
        const downloadUrl = await getDownloadURL(storageRef);
        console.log(`☁️ [Firebase Storage] ${folder} 업로드 완료:`, downloadUrl);
        return downloadUrl;
      }
      return fileOrDataUrl;
    } catch (err) {
      console.error(`Firebase Storage upload error in ${folder}:`, err);
      return fileOrDataUrl;
    }
  },

  // Helper: Character Avatar Upload
  async uploadCharacterAvatar(fileOrDataUrl, charName = 'hero') {
    return this.uploadRawImage(fileOrDataUrl, 'character_avatars', charName);
  },

  // Helper: Skill Icon Upload
  async uploadSkillIcon(fileOrDataUrl, skillName = 'skill') {
    return this.uploadRawImage(fileOrDataUrl, 'skill_icons', skillName);
  },

  // 3. Save Character directly to Cloud Firestore 'characters' collection
  async saveCharacterToCloud(charObj) {
    if (!db) {
      console.warn("Firestore not available");
      return false;
    }
    try {
      const docId = charObj.id || `char_${Date.now()}`;
      let finalImageUrl = charObj.imageUrl || '';

      // Base64인 경우 Firebase Storage로 업로드하여 HTTPS URL로 변환
      if (finalImageUrl && finalImageUrl.startsWith('data:')) {
        finalImageUrl = await this.uploadCharacterAvatar(finalImageUrl, charObj.name || docId);
      }

      // 커스텀 스킬 아이콘도 Base64인 경우 Storage로 업로드
      let customSkillData = charObj.customSkill ? { ...charObj.customSkill } : null;
      if (customSkillData && customSkillData.imageUrl && customSkillData.imageUrl.startsWith('data:')) {
        customSkillData.imageUrl = await this.uploadSkillIcon(customSkillData.imageUrl, customSkillData.name || 'skill');
      }

      const charRef = doc(db, 'characters', docId);
      const payload = {
        id: docId,
        userId: 'GLOBAL_OPERATOR',
        ownerId: 'GLOBAL_OPERATOR',
        isGlobal: true,
        name: charObj.name || '영웅',
        unitClass: charObj.unitClass || charObj.classType || 'KNIGHT',
        classType: charObj.classType || charObj.unitClass || 'KNIGHT',
        avatar: charObj.avatar || '👤',
        imageUrl: finalImageUrl,
        stats: charObj.stats || {
          hp: charObj.hp || 100,
          maxHp: charObj.maxHp || 100,
          atk: charObj.atk || 40,
          def: charObj.def || 30,
          mobility: charObj.baseAP || charObj.ap || 3
        },
        favorability: (charObj.favorability !== undefined) ? charObj.favorability : (charObj.affection || 75),
        customSkill: customSkillData,
        skillTree: charObj.skillTree || [],
        createdAt: charObj.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(charRef, payload, { merge: true });
      console.log("💾 [Firestore] 'characters' 컬렉션 문서 저장 완료:", docId);
      return true;
    } catch (err) {
      console.error("Firestore saveCharacterToCloud error:", err);
      return false;
    }
  },

  // 4. Fetch all characters from Firestore 'characters'
  async getCharactersFromCloud() {
    if (!db) return [];
    try {
      const colRef = collection(db, 'characters');
      const snapshot = await getDocs(colRef);
      const list = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          list.push(docSnap.data());
        }
      });
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return list;
    } catch (err) {
      console.warn("Firestore getCharactersFromCloud error:", err);
      return [];
    }
  },

  // 5. Real-time Subscription for Firestore 'characters'
  subscribeCharacterList(onUpdateCallback) {
    if (!db) return () => {};
    try {
      const colRef = collection(db, 'characters');
      return onSnapshot(colRef, (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            list.push(docSnap.data());
          }
        });
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        console.log(`🔄 [Firestore 실시간 동기화] characters 수신: ${list.length}명`);
        if (typeof onUpdateCallback === 'function') {
          onUpdateCallback(list);
        }
      }, (err) => {
        console.warn("Firestore subscribeCharacterList error:", err);
      });
    } catch (err) {
      console.warn("Firestore subscribeCharacterList setup error:", err);
      return () => {};
    }
  },

  // 6. Delete character from Firestore
  async deleteCharacterFromCloud(charId) {
    if (!db || !charId) return false;
    try {
      await deleteDoc(doc(db, 'characters', charId));
      console.log("🗑️ [Firestore] 캐릭터 영구 삭제 완료:", charId);
      return true;
    } catch (err) {
      console.warn("Firestore deleteCharacterFromCloud error:", err);
      return false;
    }
  },

  // 7. Save Skill Tree Node / Ability to Firestore 'skills' collection
  async saveSkillToCloud(skillObj) {
    if (!db || !skillObj) return false;
    try {
      const docId = skillObj.id || `skill_${Date.now()}`;
      let finalImageUrl = skillObj.imageUrl || '';
      if (finalImageUrl && finalImageUrl.startsWith('data:')) {
        finalImageUrl = await this.uploadSkillIcon(finalImageUrl, skillObj.name || docId);
      }

      const docRef = doc(db, 'skills', docId);
      const payload = {
        id: docId,
        name: skillObj.name || '스킬',
        description: skillObj.description || '',
        costAP: skillObj.costAP || 1,
        cooldown: skillObj.cooldown || 2,
        targetType: skillObj.targetType || 'SINGLE_ENEMY',
        type: skillObj.type || 'ACTIVE',
        imageUrl: finalImageUrl,
        tier: skillObj.tier || 1,
        effects: skillObj.effects || {},
        updatedAt: new Date().toISOString()
      };
      await setDoc(docRef, payload, { merge: true });
      console.log("⚡ [Firestore] 'skills' 컬렉션 저장 완료:", docId);
      return true;
    } catch (err) {
      console.warn("Firestore saveSkillToCloud error:", err);
      return false;
    }
  },

  // 8. Fetch skills from Firestore
  async getSkillsFromCloud() {
    if (!db) return [];
    try {
      const colRef = collection(db, 'skills');
      const snapshot = await getDocs(colRef);
      const list = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          list.push(docSnap.data());
        }
      });
      return list;
    } catch (err) {
      console.warn("Firestore getSkillsFromCloud error:", err);
      return [];
    }
  },

  // 9. Real-time Subscription for Firestore 'skills'
  subscribeSkillList(onUpdateCallback) {
    if (!db) return () => {};
    try {
      const colRef = collection(db, 'skills');
      return onSnapshot(colRef, (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            list.push(docSnap.data());
          }
        });
        if (typeof onUpdateCallback === 'function') {
          onUpdateCallback(list);
        }
      }, (err) => {
        console.warn("Firestore subscribeSkillList error:", err);
      });
    } catch (err) {
      console.warn("Firestore subscribeSkillList setup error:", err);
      return () => {};
    }
  },

  // 10. Save game configuration (unit images, balance formulas, world sectors) to 'game_configs'
  async saveGameConfigToCloud(configId, configData) {
    if (!db) return false;
    try {
      const docRef = doc(db, 'game_configs', configId || 'global_config');
      await setDoc(docRef, {
        ...configData,
        id: configId || 'global_config',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log("⚙️ [Firestore] 'game_configs' 저장 완료:", configId);
      return true;
    } catch (err) {
      console.warn("Firestore saveGameConfigToCloud error:", err);
      return false;
    }
  },

  // 11. Load game configuration from 'game_configs'
  async loadGameConfigFromCloud(configId) {
    if (!db) return null;
    try {
      const docRef = doc(db, 'game_configs', configId || 'global_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.warn("Firestore loadGameConfigFromCloud error:", err);
      return null;
    }
  },

  // 12. Real-time Subscription for 'game_configs'
  subscribeGameConfig(configId, onUpdateCallback) {
    if (!db) return () => {};
    try {
      const docRef = doc(db, 'game_configs', configId || 'global_config');
      return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists() && typeof onUpdateCallback === 'function') {
          onUpdateCallback(docSnap.data());
        }
      }, (err) => {
        console.warn("Firestore subscribeGameConfig error:", err);
      });
    } catch (err) {
      console.warn("Firestore subscribeGameConfig setup error:", err);
      return () => {};
    }
  },

  // 13. Map Synchronization in 'maps' collection
  async syncMapToFirestore(mapId, mapTiles, mapName = 'Standard 8x14 Grid Map') {
    if (!db) return false;
    try {
      const docRef = doc(db, 'maps', mapId || 'default_map');
      const cleanTiles = (mapTiles || []).map(t => ({
        x: t.x,
        y: t.y,
        type: t.type,
        name: t.name,
        defBonus: t.defBonus,
        isSafe: !!t.isSafe,
        isCity: !!t.isCity,
        terrainIcon: t.terrainIcon
      }));
      await setDoc(docRef, {
        id: mapId || 'default_map',
        name: mapName,
        cols: 8,
        rows: 14,
        tiles: cleanTiles,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log("🗺️ [Firestore] 'maps' 컬렉션 동기화 완료:", mapId);
      return true;
    } catch (err) {
      console.warn("Firestore syncMapToFirestore error:", err);
      return false;
    }
  },

  // 14. Load Map from 'maps'
  async loadMapFromFirestore(mapId) {
    if (!db) return null;
    try {
      const docRef = doc(db, 'maps', mapId || 'default_map');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.warn("Firestore loadMapFromFirestore error:", err);
      return null;
    }
  },

  // 14-B. Scenario Maps (8x14 Tactical Sector Maps) in 'scenarioMaps' collection
  async saveScenarioMapToFirestore(sectorId, scenarioMapData) {
    if (!db || !sectorId) return false;
    try {
      const docRef = doc(db, 'scenarioMaps', String(sectorId));
      const cleanTiles = Array.isArray(scenarioMapData?.tiles) 
        ? scenarioMapData.tiles.map(t => ({
            x: Number(t.x) || 0,
            y: Number(t.y) || 0,
            terrain: t.terrain || t.type || 'plain',
            type: t.type || t.terrain || 'plain',
            name: t.name || '평야',
            defBonus: Number(t.defBonus) || 0,
            hasRoad: !!t.hasRoad,
            structure: t.structure || null,
            terrainIcon: t.terrainIcon || '🌱',
            isCity: !!t.isCity,
            isSafe: !!t.isSafe,
            units: Array.isArray(t.units) ? t.units.map(u => ({
              side: u.side || 'ALLY',
              unitClass: u.unitClass || u.classType || 'KNIGHT',
              count: Number(u.count) || 1,
              hp: Number(u.hp) || 100,
              maxHp: Number(u.maxHp) || 100
            })) : []
          }))
        : [];

      const cleanUnits = Array.isArray(scenarioMapData?.units)
        ? scenarioMapData.units.map(u => ({
            id: u.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            name: u.name || '유닛',
            owner: u.owner || (u.side === 'ENEMY' ? 'ENEMY' : 'PLAYER'),
            side: u.side || (u.owner === 'ENEMY' ? 'ENEMY' : 'ALLY'),
            unitClass: u.unitClass || u.classType || 'KNIGHT',
            classType: u.classType || u.unitClass || 'KNIGHT',
            avatar: u.avatar || '👤',
            x: Number(u.x) || 0,
            y: Number(u.y) || 0,
            hp: Number(u.hp) || 100,
            maxHp: Number(u.maxHp) || 100,
            atk: Number(u.atk) || 40,
            def: Number(u.def) || 30,
            baseAP: Number(u.baseAP || u.ap) || 2,
            ap: Number(u.ap || u.baseAP) || 2,
            favorability: Number(u.favorability || u.affection) || 75,
            isDead: !!u.isDead
          }))
        : [];

      const payload = {
        sectorId: String(sectorId),
        name: scenarioMapData?.name || `Sector ${sectorId}`,
        cols: Number(scenarioMapData?.cols) || 8,
        rows: Number(scenarioMapData?.rows) || 14,
        tiles: cleanTiles,
        roads: Array.isArray(scenarioMapData?.roads) ? scenarioMapData.roads : [],
        structures: Array.isArray(scenarioMapData?.structures) ? scenarioMapData.structures : [],
        units: cleanUnits,
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload, { merge: true });
      console.log(`🗺️ [Firestore] 'scenarioMaps' [${sectorId}] 동기화 완료 (${cleanTiles.length}개 타일)`);
      return true;
    } catch (err) {
      if (err?.code === 'permission-denied' || String(err?.message || '').includes('insufficient permissions')) {
        handleFirestoreError(err, OperationType.WRITE, `scenarioMaps/${sectorId}`);
      }
      console.warn(`Firestore saveScenarioMapToFirestore error for [${sectorId}]:`, err);
      return false;
    }
  },

  async loadScenarioMapFromFirestore(sectorId) {
    if (!db || !sectorId) return null;
    try {
      const docRef = doc(db, 'scenarioMaps', String(sectorId));
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        console.log(`🗺️ [Firestore] 'scenarioMaps' [${sectorId}] 로드 성공`);
        return data;
      }
      console.log(`ℹ️ [Firestore] 'scenarioMaps' [${sectorId}] 문서가 존재하지 않습니다.`);
      return null;
    } catch (err) {
      if (err?.code === 'permission-denied' || String(err?.message || '').includes('insufficient permissions')) {
        handleFirestoreError(err, OperationType.GET, `scenarioMaps/${sectorId}`);
      }
      console.warn(`Firestore loadScenarioMapFromFirestore error for [${sectorId}]:`, err);
      return null;
    }
  },

  // 15. Game State Save to Firestore 'gameState'
  async saveGameStateToCloud(gameStatePayload) {
    if (!db) return false;
    try {
      const uid = this.currentUser ? this.currentUser.uid : (gameStatePayload.guest?.id || 'guest_main');
      const docRef = doc(db, 'gameState', uid);
      await setDoc(docRef, {
        ...gameStatePayload,
        userId: uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log("💾 [Firestore] 'gameState' 동기화 완료:", uid);
      return true;
    } catch (err) {
      console.warn("Firestore saveGameStateToCloud error:", err);
      return false;
    }
  },

  // 16. Game State Load from Firestore 'gameState'
  async loadGameStateFromCloud(uid) {
    if (!db) return null;
    try {
      const targetUid = uid || (this.currentUser ? this.currentUser.uid : 'guest_main');
      const docRef = doc(db, 'gameState', targetUid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.warn("Firestore loadGameStateFromCloud error:", err);
      return null;
    }
  },

  // 17. Game State Real-time Subscription
  subscribeGameState(uid, onUpdateCallback) {
    if (!db) return () => {};
    try {
      const targetUid = uid || (this.currentUser ? this.currentUser.uid : 'guest_main');
      const docRef = doc(db, 'gameState', targetUid);
      return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists() && typeof onUpdateCallback === 'function') {
          onUpdateCallback(docSnap.data());
        }
      }, (err) => {
        console.warn("Firestore subscribeGameState error:", err);
      });
    } catch (err) {
      console.warn("Firestore subscribeGameState setup error:", err);
      return () => {};
    }
  }
};

// Aliases for compatibility
window.FirebaseBridge.syncCharacterToFirestore = window.FirebaseBridge.saveCharacterToCloud;
window.FirebaseBridge.loadCharacters = window.FirebaseBridge.getCharactersFromCloud;
window.FirebaseBridge.subscribeCharacters = window.FirebaseBridge.subscribeCharacterList;
window.FirebaseBridge.uploadCharacterImage = window.FirebaseBridge.uploadCharacterAvatar;
window.FirebaseBridge.syncGameStateToFirestore = window.FirebaseBridge.saveGameStateToCloud;

// ==========================================================================
// Cross-Module Global Exports for Game Engine & UI (window.*)
// ==========================================================================
window.saveCharacterToCloud = (charObj) => window.FirebaseBridge.saveCharacterToCloud(charObj);
window.getCharactersFromCloud = () => window.FirebaseBridge.getCharactersFromCloud();
window.subscribeCharacterList = (cb) => window.FirebaseBridge.subscribeCharacterList(cb);
window.deleteCharacterFromCloud = (id) => window.FirebaseBridge.deleteCharacterFromCloud(id);

window.uploadCharacterAvatar = (file, name) => window.FirebaseBridge.uploadCharacterAvatar(file, name);
window.uploadSkillIcon = (file, name) => window.FirebaseBridge.uploadSkillIcon(file, name);

window.saveSkillToCloud = (skillObj) => window.FirebaseBridge.saveSkillToCloud(skillObj);
window.getSkillsFromCloud = () => window.FirebaseBridge.getSkillsFromCloud();
window.subscribeSkillList = (cb) => window.FirebaseBridge.subscribeSkillList(cb);

window.saveGameConfigToCloud = (id, data) => window.FirebaseBridge.saveGameConfigToCloud(id, data);
window.loadGameConfigFromCloud = (id) => window.FirebaseBridge.loadGameConfigFromCloud(id);
window.subscribeGameConfig = (id, cb) => window.FirebaseBridge.subscribeGameConfig(id, cb);

window.saveGameStateToCloud = (data) => window.FirebaseBridge.saveGameStateToCloud(data);
window.loadGameStateFromCloud = (uid) => window.FirebaseBridge.loadGameStateFromCloud(uid);
window.subscribeGameState = (uid, cb) => window.FirebaseBridge.subscribeGameState(uid, cb);

window.syncMapToFirestore = (id, tiles, name) => window.FirebaseBridge.syncMapToFirestore(id, tiles, name);
window.loadMapFromFirestore = (id) => window.FirebaseBridge.loadMapFromFirestore(id);

window.saveScenarioMapToFirestore = (sectorId, data) => window.FirebaseBridge.saveScenarioMapToFirestore(sectorId, data);
window.loadScenarioMapFromFirestore = (sectorId) => window.FirebaseBridge.loadScenarioMapFromFirestore(sectorId);

// Automatically initialize auth on load
window.FirebaseBridge.initAuth().catch(e => console.warn(e));
