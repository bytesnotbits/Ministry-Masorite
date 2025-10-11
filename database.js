// Version 1.06.02
// --- DATABASE INITIALIZATION ---
const DB_NAME = 'MinistryScribeDB';
const DB_VERSION = 3;
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            const transaction = event.target.transaction;
            console.log(`Upgrading database from version ${event.oldVersion} to ${event.newVersion}`);

            if (!db.objectStoreNames.contains('territories')) {
                db.createObjectStore('territories', { keyPath: 'id', autoIncrement: true });
            }

            let streetsStore;
            if (!db.objectStoreNames.contains('streets')) {
                streetsStore = db.createObjectStore('streets', { keyPath: 'id', autoIncrement: true });
                streetsStore.createIndex('territoryId', 'territoryId', { unique: false });
            } else {
                streetsStore = transaction.objectStore('streets');
            }

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

            if (!db.objectStoreNames.contains('visits')) {
                const visitsStore = db.createObjectStore('visits', { keyPath: 'id', autoIncrement: true });
                visitsStore.createIndex('houseId', 'houseId', { unique: false });
            }
            if (!db.objectStoreNames.contains('people')) {
                const peopleStore = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true });
                peopleStore.createIndex('houseId', 'houseId', { unique: false });
            }

            if (event.oldVersion < 3) {
                console.log("Performing data migration for houses...");
                const territoriesStore = transaction.objectStore('territories');
                
                territoriesStore.getAll().onsuccess = (e) => {
                    const territories = e.target.result;
                    const streetPromises = [];
                    const newStreetMap = new Map(); 

                    for (const territory of territories) {
                        const newStreet = {
                            territoryId: territory.id,
                            name: territory.name || `Street for Territory #${territory.number}` 
                        };
                        const addRequest = streetsStore.add(newStreet);
                        const promise = new Promise((res) => {
                            addRequest.onsuccess = (event) => {
                                newStreetMap.set(territory.id, event.target.result);
                                res();
                            };
                        });
                        streetPromises.push(promise);
                    }

                    Promise.all(streetPromises).then(() => {
                        console.log("Default streets created. Updating houses...");
                        const houseCursorRequest = housesStore.openCursor();
                        houseCursorRequest.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const house = cursor.value;
                                if (house.territoryId && newStreetMap.has(house.territoryId)) {
                                    house.streetId = newStreetMap.get(house.territoryId);
                                    delete house.territoryId;
                                    cursor.update(house);
                                }
                                cursor.continue();
                            } else {
                                console.log("House data migration complete.");
                            }
                        };
                    });
                    
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
            console.error('Database error:', event.target.error);
            reject('Database error');
        };
    });
}

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