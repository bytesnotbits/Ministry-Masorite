// Version 1.20.01
// --- REFACTORED FILE: app.js ---
// This file initializes the application and manages its central state and actions.

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. CENTRAL APPLICATION STATE ---
    const AppState = {
        currentView: 'territory-list-view',
        currentTerritoryId: null,
        currentStreetId: null,
        currentHouseId: null,
        hideCompleted: false,
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
        },
        currentStudyId: null,
        studyListScrollPosition: 0,
        currentEditStudyId: null,
        currentSearchQuery: '',
        searchHighlights: { streetIds: new Set(), houseIds: new Set() }
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
            UI.renderStreets(territory);
            UI.showView(AppState.currentView);
        },

        async navigateToHouses(streetId) {
            AppState.streetListScrollPosition = window.scrollY;
            AppState.currentStreetId = streetId;
            AppState.activeHouseFilters = { visited: false, ni: false, nt: false, gated: false };
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            AppState.currentView = 'house-list-view';
            const street = await getFromStore('streets', streetId);
            await UI.renderHouses(street, AppState.activeHouseFilters);
            UI.showView(AppState.currentView);
        },

        async navigateToHouseDetails(houseId) {
            AppState.houseListScrollPosition = window.scrollY;
            AppState.currentHouseId = houseId;
            AppState.currentView = 'house-detail-view';
            await UI.renderHouseDetails(AppState.currentHouseId);
            UI.showView(AppState.currentView);
        },
        
        async navigateToStudyDetails(studyId) {
            AppState.studyListScrollPosition = window.scrollY;
            AppState.currentStudyId = studyId;
            AppState.currentView = 'study-detail-view';
            await UI.renderStudyDetails(AppState.currentStudyId);
            UI.showView(AppState.currentView);
        },

        async navigateToRVs() {
            AppState.currentView = 'rv-list-view';
            await UI.renderRVList();
            UI.showView(AppState.currentView);
        },

        async navigateToStudies() {
            AppState.currentView = 'study-list-view';
            await UI.renderStudyList();
            UI.showView(AppState.currentView);
        },
        
        async navigateBack(targetView) {
            AppState.currentView = targetView;
            if (targetView === 'house-list-view') {
                const street = await getFromStore('streets', AppState.currentStreetId);
                await UI.renderHouses(street, AppState.activeHouseFilters);
                UI.showView(targetView);
                setTimeout(() => window.scrollTo(0, AppState.houseListScrollPosition), 0);
            } else if (targetView === 'street-list-view') {
                const territory = await getFromStore('territories', AppState.currentTerritoryId);
                UI.renderStreets(territory);
                UI.showView(targetView);
                setTimeout(() => window.scrollTo(0, AppState.streetListScrollPosition), 0);
            } else if (targetView === 'territory-list-view') {
                this.refreshTerritories(); // Refresh in case street counts changed
                UI.showView(targetView);
                setTimeout(() => window.scrollTo(0, AppState.territoryListScrollPosition), 0);
            } else {
                UI.showView(targetView);
            }
        },
        
        // --- Data & UI Update Actions ---
        async refreshTerritories() {
            const filter = document.getElementById('search-territory-input').value;
            // Call our "master search" function
            const matchingIds = await searchAllData(filter);
            // Pass the results to the UI to be rendered
            await UI.renderTerritories(matchingIds);
        },

        
        async refreshStreets() {
            const territory = await getFromStore('territories', AppState.currentTerritoryId);
            await UI.renderStreets(territory);
        },
        
        async refreshHouses() {
            const street = await getFromStore('streets', AppState.currentStreetId);
            await UI.rerenderHousesAndPreserveScroll(street, AppState.activeHouseFilters);
        },
        
        async refreshHouseDetails() {
            await UI.renderHouseDetails(AppState.currentHouseId);
        },

        async refreshStudyDetails() {
            await UI.renderStudyDetails(AppState.currentStudyId);
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
});