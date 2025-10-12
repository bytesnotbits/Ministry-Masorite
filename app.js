// Version 1.07.02
// --- REFACTORED FILE: app.js ---
// This file initializes the application and manages its central state and actions.

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. CENTRAL APPLICATION STATE ---
    const AppState = {
        currentView: 'territory-list-view',
        currentTerritoryId: null,
        currentStreetId: null,
        currentHouseId: null,
        territorySort: 'number',
        selectedPersonId: null,
        currentEditTerritoryId: null,
        currentEditStreetId: null,
        territoryListScrollPosition: 0,
        streetListScrollPosition: 0,
        houseListScrollPosition: 0,
        activeHouseFilters: {
            visited: false,
            ni: false,
            nt: false,
            gated: false
        }
    };

    // --- 2. STATE MODIFICATION ACTIONS ---
    // These are the only functions that should modify AppState. They also trigger UI updates.
    const AppActions = {
        // --- Navigation Actions ---
        async navigateToStreets(territoryId) {
            AppState.territoryListScrollPosition = window.scrollY;
            AppState.currentTerritoryId = territoryId;
            AppState.currentView = 'street-list-view';
            const territory = await getFromStore('territories', territoryId);
            renderStreets(territory);
            showView(AppState.currentView);
        },

        async navigateToHouses(streetId) {
            AppState.streetListScrollPosition = window.scrollY;
            AppState.currentStreetId = streetId;
            AppState.activeHouseFilters = { visited: false, ni: false, nt: false, gated: false };
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            AppState.currentView = 'house-list-view';
            const street = await getFromStore('streets', streetId);
            await renderHouses(street, AppState.activeHouseFilters);
            showView(AppState.currentView);
        },

        async navigateToHouseDetails(houseId) {
            AppState.houseListScrollPosition = window.scrollY;
            AppState.currentHouseId = houseId;
            AppState.currentView = 'house-detail-view';
            await renderHouseDetails(AppState.currentHouseId);
            showView(AppState.currentView);
        },
        
        async navigateToRVs() {
            AppState.currentView = 'rv-list-view';
            await renderRVList();
            showView(AppState.currentView);
        },
        
        async navigateBack(targetView) {
            AppState.currentView = targetView;
            if (targetView === 'house-list-view') {
                const street = await getFromStore('streets', AppState.currentStreetId);
                await renderHouses(street, AppState.activeHouseFilters);
                showView(targetView);
                setTimeout(() => window.scrollTo(0, AppState.houseListScrollPosition), 0);
            } else if (targetView === 'street-list-view') {
                const territory = await getFromStore('territories', AppState.currentTerritoryId);
                renderStreets(territory);
                showView(targetView);
                setTimeout(() => window.scrollTo(0, AppState.streetListScrollPosition), 0);
            } else if (targetView === 'territory-list-view') {
                this.refreshTerritories(); // Refresh in case street counts changed
                showView(targetView);
                setTimeout(() => window.scrollTo(0, AppState.territoryListScrollPosition), 0);
            } else {
                showView(targetView);
            }
        },
        
        // --- Data & UI Update Actions ---
        async refreshTerritories() {
            const allTerritories = await getAllFromStore('territories');
            const filter = document.getElementById('search-territory-input').value;
            await renderTerritories(allTerritories, AppState.territorySort, filter);
        },
        
        async refreshStreets() {
            const territory = await getFromStore('territories', AppState.currentTerritoryId);
            await renderStreets(territory);
        },
        
        async refreshHouses() {
            const street = await getFromStore('streets', AppState.currentStreetId);
            await rerenderHousesAndPreserveScroll(street, AppState.activeHouseFilters);
        },
        
        async refreshHouseDetails() {
            await renderHouseDetails(AppState.currentHouseId);
        },

        async updateTerritorySort(sortType) {
            AppState.territorySort = sortType;
            await this.refreshTerritories();
        },
        
        async toggleHouseFilter(filterType) {
            AppState.activeHouseFilters[filterType] = !AppState.activeHouseFilters[filterType];
            await this.refreshHouses();
        }
    };

    // --- 3. INITIALIZATION ---
    try {
        await initDB();
        
        // Pass both the state and the actions to the event listeners module
        initializeEventListeners(AppState, AppActions);
        
        // Perform the initial render
        await AppActions.refreshTerritories();
        
        console.log("Ministry Scribe Initialized Successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        alert("Could not initialize the application's database. Please ensure your browser supports IndexedDB.");
    }
});```

---
### **`database.js`** (Version Updated)
```javascript
// Version 1.06.03

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