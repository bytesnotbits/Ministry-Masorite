// --- DATABASE INITIALIZATION ---
const DB_NAME = 'MinistryScribeDB';
const DB_VERSION = 3; // <-- Increment DB version to trigger schema upgrade
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            const transaction = event.target.transaction;

            // Unchanged Stores
            if (!db.objectStoreNames.contains('territories')) {
                db.createObjectStore('territories', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('visits')) {
                const visitsStore = db.createObjectStore('visits', { keyPath: 'id', autoIncrement: true });
                visitsStore.createIndex('houseId', 'houseId', { unique: false });
            }
            if (!db.objectStoreNames.contains('people')) {
                const peopleStore = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true });
                peopleStore.createIndex('houseId', 'houseId', { unique: false });
            }

            // --- NEW: Add 'streets' object store ---
            if (!db.objectStoreNames.contains('streets')) {
                const streetsStore = db.createObjectStore('streets', { keyPath: 'id', autoIncrement: true });
                streetsStore.createIndex('territoryId', 'territoryId', { unique: false });
            }

            // --- MODIFIED: Update 'houses' store to link to streets instead of territories ---
            if (db.objectStoreNames.contains('houses')) {
                // If the store already exists, we need to update its indexes
                const housesStore = transaction.objectStore('houses');
                if (housesStore.indexNames.contains('territoryId')) {
                    housesStore.deleteIndex('territoryId');
                }
                if (!housesStore.indexNames.contains('streetId')) {
                    housesStore.createIndex('streetId', 'streetId', { unique: false });
                }
            } else {
                // If the store doesn't exist (i.e., a fresh install), create it with the correct index
                const housesStore = db.createObjectStore('houses', { keyPath: 'id', autoIncrement: true });
                housesStore.createIndex('streetId', 'streetId', { unique: false });
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

// --- GENERIC CRUD FUNCTIONS ---
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
    // --- MODIFIED: Added 'streets' to the list of stores to clear ---
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