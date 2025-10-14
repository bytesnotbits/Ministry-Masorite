// Version 1.16.01

// --- DATABASE INITIALIZATION ---
const DB_NAME = 'MinistryScribeDB';
const DB_VERSION = 4;
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            const transaction = event.target.transaction;
            console.log(`Upgrading database from version ${event.oldVersion} to ${event.newVersion}`);

            // --- SCHEMA MIGRATION ---
            // Create Territories store if it doesn't exist
            if (!db.objectStoreNames.contains('territories')) {
                db.createObjectStore('territories', { keyPath: 'id', autoIncrement: true });
            }

            // Create Streets store if it doesn't exist
            let streetsStore;
            if (!db.objectStoreNames.contains('streets')) {
                streetsStore = db.createObjectStore('streets', { keyPath: 'id', autoIncrement: true });
                streetsStore.createIndex('territoryId', 'territoryId', { unique: false });
            } else {
                streetsStore = transaction.objectStore('streets');
            }

            // Create or modify the Houses store
            let housesStore;
            if (db.objectStoreNames.contains('houses')) {
                housesStore = transaction.objectStore('houses');
            } else {
                housesStore = db.createObjectStore('houses', { keyPath: 'id', autoIncrement: true });
            }
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

            // Track bible Studies
            if (!db.objectStoreNames.contains('studies')) {
                const studiesStore = db.createObjectStore('studies', { keyPath: 'id', autoIncrement: true });
                studiesStore.createIndex('personId', 'personId', { unique: false });
            }
            if (!db.objectStoreNames.contains('studyHistory')) {
                const studyHistoryStore = db.createObjectStore('studyHistory', { keyPath: 'id', autoIncrement: true });
                studyHistoryStore.createIndex('studyId', 'studyId', { unique: false });
            }

            // --- DATA MIGRATION from v2 to v3 ---
            // This block only runs if the user is coming from an older version.
            if (event.oldVersion < 3) {
                console.log("Performing data migration for houses...");
                const territoriesStore = transaction.objectStore('territories');
                
                // We need to wait for territory data before we can migrate houses
                territoriesStore.getAll().onsuccess = (e) => {
                    const territories = e.target.result;
                    const territoryMap = new Map(territories.map(t => [t.id, t]));
                    const streetPromises = [];
                    const newStreetMap = new Map();  // Maps old territoryId to new streetId

                    // 1. Create a default street for each old territory
                    for (const territory of territories) {
                        const newStreet = {
                            territoryId: territory.id,
                            // The old `territory.name` was the street name. We use it to create the new street.
                            name: territory.name || `Street for Territory #${territory.number}` 
                        };
                        const addRequest = streetsStore.add(newStreet);
                        const promise = new Promise((res) => {
                            addRequest.onsuccess = (event) => {
                                // Store the newly created street's ID, linked to the old territory ID
                                newStreetMap.set(territory.id, event.target.result);
                                res();
                            };
                        });
                        streetPromises.push(promise);
                    }

                    // 2. Once all new streets are created, update the houses
                    Promise.all(streetPromises).then(() => {
                        console.log("Default streets created. Updating houses...");
                        const houseCursorRequest = housesStore.openCursor();
                        houseCursorRequest.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const house = cursor.value;
                                // Find the new streetId that corresponds to the house's old territoryId
                                if (house.territoryId && newStreetMap.has(house.territoryId)) {
                                    house.streetId = newStreetMap.get(house.territoryId);
                                    delete house.territoryId;  // Clean up the old property
                                    cursor.update(house);
                                }
                                cursor.continue();
                            } else {
                                console.log("House data migration complete.");
                            }
                        };
                    });
                    
                    // 3. Update the territory object to have a description instead of a name
                    for(const territory of territories){
                        territory.description = territory.name || 'General';
                        delete territory.name;
                        territoriesStore.put(territory);
                    }
                };
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };

        request.onerror = (event) => {
            console.error('Database error', event.target.error);
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
    const storeNames = ['territories', 'streets', 'houses', 'visits', 'people', 'studies', 'studyHistory'];
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
        transaction.objectStore(storeName).clear();
    }
    return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
    });
}
