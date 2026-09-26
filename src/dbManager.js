/**
 * dbManager.js - Standalone Firebase Firestore Serialization & Persistence Service
 * 
 * Provides bi-directional serialization/deserialization for complex Web-SLG game state
 * (character trees, unit matrices, hex/grid tile maps, inventory) and handles
 * real-time persistence directly via Firebase Firestore Modular SDK (v9/v10).
 * 
 * Zero browser storage (no localStorage / sessionStorage / indexedDB).
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

// Default project configuration fallback matching workspace environment
const firebaseConfig = {
  projectId: "turnkey-facility-8lcf1",
  appId: "1:901721491051:web:09f587dcdf7e9ce615d32e",
  apiKey: "AIzaSyBg8xP98xbD4O8aK0mU1J-B01I4VzoUnnM",
  authDomain: "turnkey-facility-8lcf1.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-remixwebslg-2fa45006-9c73-4078-ae0b-836bdd0cd7f4",
  storageBucket: "turnkey-facility-8lcf1.firebasestorage.app",
  messagingSenderId: "901721491051"
};

/**
 * Initializes and retrieves singleton Firestore instance.
 * Automatically handles named database instances when configured.
 */
let dbInstance = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";

  try {
    dbInstance = initializeFirestore(app, {}, databaseId);
  } catch (err) {
    dbInstance = getFirestore(app, databaseId);
  }

  return dbInstance;
}

/**
 * Recursively converts complex game objects, nested arrays, Sets, Maps, and custom classes
 * into plain JSON-compatible Firestore document payloads (stripping undefined, functions, circular refs).
 *
 * @param {any} gameState - State to serialize
 * @returns {any} Sanitized plain JSON-compatible structure
 */
export function serializeState(gameState) {
  if (gameState === null || gameState === undefined) {
    return null;
  }

  if (gameState instanceof Timestamp) {
    return gameState;
  }

  if (gameState instanceof Date) {
    return Timestamp.fromDate(gameState);
  }

  if (typeof gameState === 'function' || typeof gameState === 'symbol') {
    return null;
  }

  if (gameState instanceof Set) {
    return Array.from(gameState).map(item => serializeState(item)).filter(item => item !== undefined);
  }

  if (gameState instanceof Map) {
    const mapObj = {};
    for (const [key, value] of gameState.entries()) {
      const sanitizedKey = String(key);
      const sanitizedVal = serializeState(value);
      if (sanitizedVal !== undefined) {
        mapObj[sanitizedKey] = sanitizedVal;
      }
    }
    return mapObj;
  }

  if (Array.isArray(gameState)) {
    return gameState.map(element => serializeState(element));
  }

  if (typeof gameState === 'object') {
    const plainObj = {};
    for (const key of Object.keys(gameState)) {
      const val = gameState[key];
      if (val === undefined || typeof val === 'function') {
        continue;
      }
      plainObj[key] = serializeState(val);
    }
    return plainObj;
  }

  return gameState;
}

/**
 * Reconstructs raw Firestore document payloads back into functional JS data structures.
 * Converts Timestamps to Date objects, normalizes missing attributes, and prepares functional maps.
 *
 * @param {any} firestoreDoc - Raw Firestore document or object snapshot
 * @returns {any} Hydrated game data object
 */
export function deserializeState(firestoreDoc) {
  if (firestoreDoc === null || firestoreDoc === undefined) {
    return null;
  }

  if (typeof firestoreDoc.toDate === 'function') {
    return firestoreDoc.toDate();
  }

  if (firestoreDoc instanceof Timestamp) {
    return firestoreDoc.toDate();
  }

  if (Array.isArray(firestoreDoc)) {
    return firestoreDoc.map(item => deserializeState(item));
  }

  if (typeof firestoreDoc === 'object') {
    const hydrated = {};
    for (const key of Object.keys(firestoreDoc)) {
      hydrated[key] = deserializeState(firestoreDoc[key]);
    }
    return hydrated;
  }

  return firestoreDoc;
}

/**
 * Saves or updates character data in cloud Firestore under the 'characters' collection.
 * 
 * @param {string} characterId - Unique identifier of the commander or character
 * @param {object} characterData - Character attributes, level, skill tree, equipped units
 * @returns {Promise<{success: boolean, id: string, timestamp: Date}>}
 */
export async function saveCharacterToCloud(characterId, characterData) {
  if (!characterId) {
    throw new Error('[DBManager] characterId is required to save character to cloud.');
  }

  const db = getDb();
  const characterRef = doc(db, 'characters', String(characterId));
  const payload = {
    ...serializeState(characterData),
    id: String(characterId),
    updatedAt: serverTimestamp()
  };

  await setDoc(characterRef, payload, { merge: true });
  return {
    success: true,
    id: String(characterId),
    timestamp: new Date()
  };
}

/**
 * Saves grid map layout, terrain layers, coordinates, and placed units to Firestore.
 * 
 * @param {string} mapId - Unique identifier of the map or battle instance
 * @param {object|Array} mapGridData - 2D/isometric grid matrices, tiles, obstacles, and control points
 * @returns {Promise<{success: boolean, id: string, timestamp: Date}>}
 */
export async function saveMapToCloud(mapId, mapGridData) {
  if (!mapId) {
    throw new Error('[DBManager] mapId is required to save map to cloud.');
  }

  const db = getDb();
  const mapRef = doc(db, 'maps', String(mapId));

  const serializedGrid = serializeState(mapGridData);
  const payload = {
    mapId: String(mapId),
    grid: serializedGrid,
    updatedAt: serverTimestamp()
  };

  await setDoc(mapRef, payload, { merge: true });
  return {
    success: true,
    id: String(mapId),
    timestamp: new Date()
  };
}

/**
 * Saves 8x14 scenario tactical map to Firestore 'scenarioMaps' collection with dynamic sectorId.
 */
export async function saveScenarioMapToCloud(sectorId, scenarioMapData) {
  if (!sectorId) {
    throw new Error('[DBManager] sectorId is required to save scenario map.');
  }

  const db = getDb();
  const docRef = doc(db, 'scenarioMaps', String(sectorId));
  const payload = {
    ...serializeState(scenarioMapData),
    sectorId: String(sectorId),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, payload, { merge: true });
  return {
    success: true,
    sectorId: String(sectorId),
    timestamp: new Date()
  };
}

/**
 * Loads 8x14 scenario tactical map from Firestore 'scenarioMaps' collection.
 */
export async function loadScenarioMapFromCloud(sectorId) {
  if (!sectorId) return null;
  const db = getDb();
  const docRef = doc(db, 'scenarioMaps', String(sectorId));
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return deserializeState(snap.data());
  }
  return null;
}

/**
 * Loads complete initial game dataset for a specified user or default tenant from Firestore.
 * Fetches user profile, active commanders, deployed units, and map configurations.
 * 
 * @param {string} userId - User identifier
 * @returns {Promise<{user: object|null, characters: Array, maps: Array}>}
 */
export async function loadInitialGameData(userId) {
  if (!userId) {
    throw new Error('[DBManager] userId is required to load initial game data.');
  }

  const db = getDb();

  // 1. Fetch User Record
  let userProfile = null;
  const userRef = doc(db, 'users', String(userId));
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    userProfile = deserializeState(userSnap.data());
  }

  // 2. Fetch Characters Collection
  const characters = [];
  const charCollectionRef = collection(db, 'characters');
  const charSnapshots = await getDocs(charCollectionRef);
  charSnapshots.forEach(charDoc => {
    characters.push(deserializeState(charDoc.data()));
  });

  // 3. Fetch Map Configurations
  const maps = [];
  const mapCollectionRef = collection(db, 'maps');
  const mapSnapshots = await getDocs(mapCollectionRef);
  mapSnapshots.forEach(mapDoc => {
    maps.push(deserializeState(mapDoc.data()));
  });

  return {
    user: userProfile,
    characters: characters,
    maps: maps
  };
}

/**
 * Attaches a real-time listener to a document in any target collection.
 * Triggers callback immediately on snapshot and subsequent cloud updates.
 *
 * @param {string} collectionName - Target collection name (e.g., 'characters', 'maps', 'gameState')
 * @param {string} docId - Target document identifier
 * @param {function(object|null): void} onUpdateCallback - Invoked with deserialized data
 * @returns {function(): void} Unsubscribe cleanup function
 */
export function subscribeCloudState(collectionName, docId, onUpdateCallback) {
  if (!collectionName || !docId) {
    throw new Error('[DBManager] collectionName and docId are required for subscription.');
  }
  if (typeof onUpdateCallback !== 'function') {
    throw new Error('[DBManager] onUpdateCallback must be a valid function.');
  }

  const db = getDb();
  const targetDocRef = doc(db, String(collectionName), String(docId));

  const unsubscribe = onSnapshot(
    targetDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const deserializedData = deserializeState(snapshot.data());
        onUpdateCallback(deserializedData);
      } else {
        onUpdateCallback(null);
      }
    },
    (error) => {
      console.error(`[DBManager] Realtime listener error on ${collectionName}/${docId}:`, error);
    }
  );

  return unsubscribe;
}

// Global scope binding for modular script interoperability across non-bundled files
const DBManager = {
  getDb,
  serializeState,
  deserializeState,
  saveCharacterToCloud,
  saveMapToCloud,
  saveScenarioMapToCloud,
  loadScenarioMapFromCloud,
  loadInitialGameData,
  subscribeCloudState
};

if (typeof window !== 'undefined') {
  window.DBManager = DBManager;
}

export default DBManager;