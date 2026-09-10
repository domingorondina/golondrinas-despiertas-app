// IndexedDB & LocalStorage Manager for Golondrinas Despiertas

const DB_NAME = 'GolondrinasDB';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio_files';

let dbInstance = null;

export async function initStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB Error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Store custom audio blob in IndexedDB
export async function saveCustomAudio(file) {
  if (!dbInstance) await initStorage();
  return new Promise((resolve, reject) => {
    const id = 'custom_audio_' + Date.now();
    const transaction = dbInstance.transaction([AUDIO_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE);
    
    const record = {
      id,
      name: file.name,
      type: file.type,
      blob: file,
      createdAt: new Date().toISOString()
    };

    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Retrieve custom audio blob by ID
export async function getCustomAudio(id) {
  if (!dbInstance) await initStorage();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([AUDIO_STORE], 'readonly');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Get all custom audio metadata
export async function getAllCustomAudios() {
  if (!dbInstance) await initStorage();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([AUDIO_STORE], 'readonly');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const list = (request.result || []).map(item => ({
        id: item.id,
        name: item.name
      }));
      resolve(list);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

// Delete custom audio from IndexedDB
export async function deleteCustomAudio(id) {
  if (!dbInstance) await initStorage();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([AUDIO_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

// LocalStorage helpers for Alarms
const ALARMS_KEY = 'golondrinas_alarms';

export function getSavedAlarms() {
  try {
    const raw = localStorage.getItem(ALARMS_KEY);
    return raw ? JSON.parse(raw) : getInitialDefaultAlarms();
  } catch (e) {
    console.error('Error reading alarms from localStorage:', e);
    return getInitialDefaultAlarms();
  }
}

export function saveAlarms(alarms) {
  try {
    localStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
  } catch (e) {
    console.error('Error saving alarms to localStorage:', e);
  }
}

function getInitialDefaultAlarms() {
  return [
    {
      id: 'alarm_1',
      time: '07:30',
      active: true,
      label: 'Despertar Matutino',
      vocalMsg: 'Buenos días, es hora de comenzar un gran día.',
      vocalVolume: 80,
      vocalPitch: 1.0,
      vocalRate: 1.0,
      voiceIndex: 0,
      ringtone: 'xylophone',
      date: '',
      repeatDays: [1, 2, 3, 4, 5], // Mon-Fri
      gradualVolume: true,
      vibrate: true,
      mission: 'none'
    }
  ];
}
