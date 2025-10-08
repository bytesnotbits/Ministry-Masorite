// --- DATABASE INITIALIZATION ---
const DB_NAME = 'MinistryScribeDB';
const DB_VERSION = 3; // Version is correct
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            const transaction = event.target.transaction;

            // Create Territories store if it doesn't exist
            if (!db.objectStoreNames.contains('territories')) {
                db.createObjectStore('territories', { keyPath: 'id', autoIncrement: true });
            }

            // Create Streets store if it doesn't exist
            if (!db.objectStoreNames.contains('streets')) {
                const streetsStore = db.createObjectStore('streets', { keyPath: 'id', autoIncrement: true });
                streetsStore.createIndex('territoryId', 'territoryId', { unique: false });
            }
            
            // Create or modify the Houses store
            let housesStore;
            if (db.objectStoreNames.contains('houses')) {
                // If it exists, get a reference to it from the upgrade transaction
                housesStore = transaction.objectStore('houses');
            } else {
                // If it doesn't exist, create it
                housesStore = db.createObjectStore('houses', { keyPath: 'id', autoIncrement: true });
            }

            // Safely remove the old index and add the new one
            if (housesStore.indexNames.contains('territoryId')) {
                housesStore.deleteIndex('territoryId');
            }
            if (!housesStore.indexNames.contains('streetId')) {
                housesStore.createIndex('streetId', 'streetId', { unique: false });
            }

            // Create other stores if they don't exist
            if (!db.objectStoreNames.contains('visits')) {
                const visitsStore = db.createObjectStore('visits', { keyPath: 'id', autoIncrement: true });
                visitsStore.createIndex('houseId', 'houseId', { unique: false });
            }
            if (!db.objectStoreNames.contains('people')) {
                const peopleStore = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true });
                peopleStore.createIndex('houseId', 'houseId', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject('Database error');
        };
    });
}

// --- GENERIC CRUD FUNCTIONS (Unchanged) ---
function addToStore(storeName, item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getFromStore(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function updateInStore(storeName, item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function deleteFromStore(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function clearAllStores() {
    const storeNames = ['territories', 'streets', 'houses', 'visits', 'people'];
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
        transaction.objectStore(storeName).clear();
    }
    return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
    });
}