document.addEventListener('DOMContentLoaded', () => {
    // --- MOCK DATA ---
    // In the real app, this data would be loaded from IndexedDB.
    const mockData = {
        territories: [
            { id: 1, name: "Maple Street", houseCount: 5 },
            { id: 2, name: "Oak Avenue - Territory 5", houseCount: 12 }
        ]
    };

    // --- DOM ELEMENTS ---
    const territoryListView = document.getElementById('territory-list-view');
    const houseListView = document.getElementById('house-list-view');
    const houseDetailView = document.getElementById('house-detail-view');
    const territoryList = document.getElementById('territory-list');

    // --- INITIALIZATION ---
    function initialize() {
        console.log("Ministry Scribe app started.");
        renderTerritories();
        setupEventListeners();
    }

    // --- RENDERING FUNCTIONS ---

    // This function clears the list and displays all territories
    function renderTerritories() {
        territoryList.innerHTML = ''; // Clear the list first

        if (mockData.territories.length === 0) {
            territoryList.innerHTML = '<li class="placeholder">You haven\'t added any territories yet.</li>';
            return;
        }

        mockData.territories.forEach(territory => {
            const li = document.createElement('li');
            li.textContent = `${territory.name} (${territory.houseCount} houses)`;
            li.dataset.territoryId = territory.id; // Store id for later use
            territoryList.appendChild(li);
        });
    }


    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // When a user clicks on a territory in the list
        territoryList.addEventListener('click', (event) => {
            if (event.target.tagName === 'LI' && !event.target.classList.contains('placeholder')) {
                const territoryId = event.target.dataset.territoryId;
                console.log(`User clicked on territory with ID: ${territoryId}`);
                // In a real app, you would now fetch the houses for this territory
                // and switch to the house list view.
                alert(`Navigating to Territory #${territoryId}`);
            }
        });

        // Add more event listeners for other buttons here...
        // e.g., document.getElementById('add-territory-btn').addEventListener('click', () => { ... });
    }


    // Start the application
    initialize();
});
