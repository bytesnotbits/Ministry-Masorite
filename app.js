// --- REFACTORED FILE: app.js ---
// This file initializes the application and manages its central state.

document.addEventListener('DOMContentLoaded', async () => {
    // --- CENTRAL APPLICATION STATE ---
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

    // --- INITIALIZE ---
    try {
        // 1. Initialize the database
        await initDB();
        
        // 2. Perform the initial render
        const initialTerritories = await getAllFromStore('territories');
        await renderTerritories(initialTerritories, AppState.territorySort);
        
        // 3. Set up all event listeners, passing them the state object
        initializeEventListeners(AppState);
        
        console.log("Ministry Scribe Initialized Successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        alert("Could not initialize the application's database. Please ensure your browser supports IndexedDB.");
    }
});