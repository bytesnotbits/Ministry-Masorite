// 1.01.02

const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', async () => {
    // --- STATE MANAGEMENT ---
    let currentView = 'territory-list-view';
    let currentTerritoryId = null;
    let currentStreetId = null; // <-- Track the current street
    let currentHouseId = null;
    let territorySort = 'number'; // <-- CHANGEED 'name' to 'number' to match new sort buttons
    let selectedPersonId = null;
    let currentEditTerritoryId = null;
    let currentEditStreetId = null; // <-- For editing a street's name
    let territoryListScrollPosition = 0;
    let streetListScrollPosition = 0; // <-- Save scroll position on the new street list view
    let houseListScrollPosition = 0;
    let activeHouseFilters = {
        visited: false,
        ni: false,
        nt: false,
        gated: false
    };

// --- DOM ELEMENTS ---
const views = document.querySelectorAll('.view');
const territoryList = document.getElementById('territory-list');
const streetList = document.getElementById('street-list'); // <-- To reference the street list ul
const houseList = document.getElementById('house-list');
const visitList = document.getElementById('visit-notes-list');

    // --- INITIALIZE ---
    try {
        await initDB();
        await renderTerritories();
        setupEventListeners();
        console.log("Ministry Scribe Initialized Successfully.");
    } catch (error) {
        console.error("Initialization failed:", error);
        alert("Could not initialize the application's database. Please ensure your browser supports IndexedDB.");
    }

    // --- NAVIGATION ---
    function showView(viewId) {
        currentView = viewId;
        views.forEach(view => {
            view.classList.toggle('active', view.id === viewId);
        });
    }

    // --- RENDERING ---
    /*
    The helper function rerenderHousesAndPreserveScroll needs to use currentStreetId.
    The main renderHouses function needs to accept a streetId and fetch data accordingly. 
    */
    async function rerenderHousesAndPreserveScroll() {
        const scrollPos = window.scrollY;
        await renderHouses(currentStreetId); // Now uses streetId
        // Use setTimeout to ensure the DOM has been painted before scrolling.
        setTimeout(() => window.scrollTo(0, scrollPos), 0);
    }

    // --- Renders Level 1: Territories ---
    /*
    Summary of changes in this step:
    Search and Sort: We changed `territory.name` to `territory.description` in the filtering and sorting logic to match our new data model and the updated sort buttons.
    Data Fetching: Inside the loop, instead of getting all houses for a territory, we now get all streets using `getByIndex('streets', 'territoryId', territory.id)`.
    Display Logic: The `innerHTML` for each list item was updated to display the territory's `description` and the count of `streets.length`.
    */
    async function renderTerritories(filter = '') {
        territoryList.innerHTML = '';
        let territories = await getAllFromStore('territories');

        if (filter) {
            const searchTerm = filter.toLowerCase();
            territories = territories.filter(territory => {
                // <-- Search `description` instead of `name`
                const nameMatch = territory.description.toLowerCase().includes(searchTerm);
                const numberMatch = String(territory.number || '').toLowerCase().includes(searchTerm);
                return nameMatch || numberMatch;
            });
        }

        territories.sort((a, b) => {
            // <-- Sort by `description` instead of `name`
            if (territorySort === 'description') {
                return a.description.localeCompare(b.description);
            } else if (territorySort === 'number') {
                const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                return naturalSort(a.number || '', b.number || '');
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        if (territories.length === 0) {
            if (filter) {
                territoryList.innerHTML = `<li class="placeholder">No territories match "${filter}".</li>`;
            } else {
                territoryList.innerHTML = '<li class="placeholder">Click "+ Add New Territory" to begin.</li>';
            }
        } else {
            for (const territory of territories) {
                // <-- Get streets for the territory, not houses
                const streets = await getByIndex('streets', 'territoryId', territory.id);
                const li = document.createElement('li');
                li.dataset.id = territory.id;
                
                // <-- Update the HTML to show description and street count
                const numberDisplay = territory.number ? `<strong>#${territory.number}</strong> -` : 'No # -';
                li.innerHTML = `
                    <span>${numberDisplay} ${territory.description} (${streets.length} streets)</span>
                    <div class="territory-actions">
                        <button class="icon-btn edit-territory-btn" data-id="${territory.id}" title="Edit Territory">✏️</button>
                        <button class="delete-btn" data-id="${territory.id}" data-type="territory">X</button>
                    </div>
                `;
                territoryList.appendChild(li);
            }
        }

        // This part at the end for showing/hiding the search bar
        const searchInput = document.getElementById('search-territory-input');
        const totalTerritories = (await getAllFromStore('territories')).length;
        const SEARCH_VISIBILITY_THRESHOLD = 10; 
        const shouldShowSearch = totalTerritories > SEARCH_VISIBILITY_THRESHOLD;
        searchInput.classList.toggle('hidden', !shouldShowSearch);
    }

    // --- NEW: Renders Level 2: Streets ---
    /* This function, renderStreets, will be responsible for populating the "Street List" view. 
    Its job is very similar to the renderTerritories function: it will take a territoryId, find all the streets associated with it in the database, 
    and display them as a list. For each street, it will also show a count of how many houses are on it.
    Summary of what this new function does:
    Takes territoryId: It knows which territory it needs to display the streets for.
    Sets the Header: It finds the territory's number and description to display as the title of the page (e.g., "Territory #12: Walking").
    Fetches and Sorts Streets: It gets all streets from the database that belong to the given territory and sorts them alphabetically.
    Handles Empty State: If no streets exist, it shows a helpful placeholder message.
    Renders List Items: It loops through each street, counts its associated houses, and generates the HTML for the list item, 
    including the street name, house count, and the new edit/delete buttons.
    */
    async function renderStreets(territoryId) {
        streetList.innerHTML = '';
        const territory = await getFromStore('territories', territoryId);
        document.getElementById('street-list-title').textContent = `Territory #${territory.number}: ${territory.description}`;

        const streets = (await getByIndex('streets', 'territoryId', territoryId)).sort((a,b) => a.name.localeCompare(b.name));

        if (streets.length === 0) {
            streetList.innerHTML = '<li class="placeholder">No streets added to this territory yet.</li>';
            return;
        }

        for (const street of streets) {
            // For each street, we count how many houses it has
            const houses = await getByIndex('houses', 'streetId', street.id);
            const li = document.createElement('li');
            li.dataset.id = street.id;
            li.innerHTML = `
                <span>${street.name} (${houses.length} houses)</span>
                <div class="street-actions">
                    <button class="icon-btn edit-street-btn" data-id="${street.id}" title="Edit Street Name">✏️</button>
                    <button class="delete-btn" data-id="${street.id}" data-type="street">X</button>
                </div>
            `;
            streetList.appendChild(li);
        }
    }


    
    // --- Renders Level 3: Houses. Accepts streetId. ---
    /*
    The renderHouses function signature accepts streetId.
    It fetches the street object to set the page title.
    Crucially, it calls getByIndex('houses', 'streetId', streetId) to get the correct list of houses.
    The helper function was updated to pass the correct ID (currentStreetId).
    */
    async function renderHouses(streetId) {
        houseList.innerHTML = '';
        const street = await getFromStore('streets', streetId);
        document.getElementById('house-list-title').textContent = street.name;

        const allHouses = (await getByIndex('houses', 'streetId', streetId)).sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true, sensitivity: 'base' }));
        
        // Fetches visits and people based on house IDs.
        const houseVisitPromises = allHouses.map(house => getByIndex('visits', 'houseId', house.id));
        const allVisitsArrays = await Promise.all(houseVisitPromises);
        const visitsByHouseId = allHouses.reduce((acc, house, index) => {
            acc[house.id] = allVisitsArrays[index] || [];
            return acc;
        }, {});

        let housesToRender = [];

        for (const house of allHouses) {
            let shouldBeHidden = false;
            const visits = visitsByHouseId[house.id];

            if (activeHouseFilters.ni && house.isNotInterested) shouldBeHidden = true;
            if (!shouldBeHidden && activeHouseFilters.nt && house.noTrespassing) shouldBeHidden = true;
            if (!shouldBeHidden && activeHouseFilters.gated && house.hasGate) shouldBeHidden = true;

            if (!shouldBeHidden && activeHouseFilters.visited) {
                // Only hide if an actual visit attempt was made
                const hasActualVisit = visits.some(visit => (visit.isVisitAttempt !== false) && !visit.isNotAtHome);
                if (hasActualVisit && !house.isCurrentlyNH) {
                    shouldBeHidden = true;
                }
            }

            if (!shouldBeHidden) {
                housesToRender.push(house);
            }
        }

        if (housesToRender.length === 0) {
            const hasActiveFilters = Object.values(activeHouseFilters).some(v => v);
            if (hasActiveFilters) {
                houseList.innerHTML = '<li class="placeholder">No houses match the current filters.</li>';
            } else if (allHouses.length === 0) {
                houseList.innerHTML = '<li class="placeholder">No houses added to this territory yet.</li>';
            } else {
                houseList.innerHTML = '<li class="placeholder">All houses are currently hidden by filters.</li>';
            }
            return;
        }

        for (const house of housesToRender) {
            const visits = visitsByHouseId[house.id].sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastVisit = visits[0];
            // Only count records marked as a visit attempt.
            // Using `!== false` provides backward compatibility for old records.
            const visitCount = visits.filter(v => v.isVisitAttempt !== false).length;

            let iconsHTML = '';
            if (house.hasMailbox) iconsHTML += `<span title="Mailbox Available">📭</span>`;
            if (house.noTrespassing) iconsHTML += `<span title="No Trespassing Sign">🚫</span>`;
            if (house.hasGate) iconsHTML += `<span title="Gated Property">🚧</span>`;
            if (house.isCurrentlyNH) iconsHTML += `<span title="Status: Not at Home">⏰</span>`;

            const lastActivityDate = lastVisit ? `Last Visit: <strong>${new Date(lastVisit.date).toLocaleDateString()}</strong>` : 'No activity yet';
            const personMet = lastVisit && !lastVisit.isNotAtHome && lastVisit.personName ? `Met: <strong>${lastVisit.personName}</strong>` : '';

            const li = document.createElement('li');
            li.className = 'house-card';
            li.dataset.id = house.id;

            const niBadge = house.isNotInterested ? '<span class="ni-badge">NI</span>' : '';
            
            if (house.isNotInterested) {
                li.classList.add('is-ni');
            }

            const hasSentLetter = visits.some(v => v.visitType === 'letter');
            const letterButtonClass = hasSentLetter ? 'sent-letter-btn letter-sent' : 'sent-letter-btn';
            const letterButtonText = hasSentLetter ? 'Letter Sent' : 'Send Letter';

            li.innerHTML = `
                <div class="card-header">
                    <div class="card-title">
                        <strong>${house.address}</strong> ${niBadge}
                    </div>
                    <div class="card-controls">
                        <div class="icons">${iconsHTML}</div>
                        <button class="delete-btn" data-id="${house.id}" data-type="house">X</button>
                    </div>
                </div>
                <div class="house-card-details">
                    ${lastActivityDate}<br>
                    Attempts: <strong>${visitCount}</strong> | ${personMet}
                </div>
                <div class="card-actions">
                    <button class="log-nh-btn" data-id="${house.id}">Log 'NH'</button>
                    <button class="${letterButtonClass}" data-id="${house.id}">${letterButtonText}</button>
                    <button class="phone-call-btn" data-id="${house.id}">Phone Call</button>
                </div>
            `;
            houseList.appendChild(li);
        }
    }
    async function renderHouseDetails(houseId) {
        const house = await getFromStore('houses', houseId);
        document.getElementById('house-detail-address').textContent = house.address;
        document.getElementById('mailbox-check').checked = house.hasMailbox;
        document.getElementById('notrespass-check').checked = house.noTrespassing;
        document.getElementById('gate-check').checked = house.hasGate || false;
        document.getElementById('not-at-home-check').checked = house.isCurrentlyNH || false;
        document.getElementById('not-interested-check').checked = house.isNotInterested || false;

        const peopleList = document.getElementById('people-list');
        peopleList.innerHTML = '';
        const people = await getByIndex('people', 'houseId', houseId);

        if (people.length > 0) {
            for (const person of people) {
                const li = document.createElement('li');
                const rvBadge = person.isRV ? '<span class="rv-badge">RV</span>' : '';
                li.innerHTML = `
                    <span class="person-name">${person.name}${rvBadge}</span>
                    <div class="person-actions">
                        <button class="icon-btn edit-person-btn" data-id="${person.id}" title="Edit Name">✏️</button>
                        <button class="icon-btn delete-person-btn" data-id="${person.id}" title="Delete Person">X</button>
                    </div>
                `;
                peopleList.appendChild(li);
            }
        }
            else {
            peopleList.innerHTML = '<li class="placeholder">No individuals recorded yet.</li>';
        }

        visitList.innerHTML = '';
        const visits = (await getByIndex('visits', 'houseId', houseId)).sort((a, b) => new Date(b.date) - new Date(a.date));

        for (const visit of visits) {
            const li = document.createElement('li');
            let personInfo = '';
            if (visit.personId) {
                const person = people.find(p => p.id === visit.personId);
                if (person) personInfo = `Spoke with: <strong>${person.name}</strong><br>`;
            } else if (visit.personName) {
                personInfo = `Spoke with: <strong>${visit.personName}</strong><br>`;
            }

            
            const visitDate = new Date(visit.date);
            const formattedDateTime = visitDate.toLocaleString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });

            li.innerHTML = `
                <div>
                    <span>${formattedDateTime}</span>
                    <span class="edit-date-btn" data-id="${visit.id}">✏️ Change</span>
                </div>
                ${personInfo}
                <p>${visit.notes}</p>
                <button class="delete-btn" data-id="${visit.id}" data-type="visit">X</button>
            `;

            visitList.appendChild(li);
        }
    }

    // --- RV List now needs more lookups to display full path ---
    /*
    Fetch Street Data: We added a line at the top to await getAllFromStore('streets') so we have access to all street data.
    Updated Data Chain: Inside the loop, we now find the street using the house.streetId, and then find the territory using the street.territoryId.
    Updated Display: The innerHTML was changed to show the territory number and the street name (e.g., Territory: #12 (Maple Street)), which is more informative for the user.
    */
    async function renderRVList() {
        const rvList = document.getElementById('rv-list');
        rvList.innerHTML = '';

        const allPeople = await getAllFromStore('people');
        const allHouses = await getAllFromStore('houses');
        const allStreets = await getAllFromStore('streets'); // <-- ADD fetching streets
        const allTerritories = await getAllFromStore('territories');
        const allVisits = await getAllFromStore('visits');

        const rvs = allPeople.filter(p => p.isRV);

        if (rvs.length === 0) {
            rvList.innerHTML = '<li class="placeholder">No individuals are marked as an RV yet.</li>';
            return;
        }

        for (const person of rvs) {
            const house = allHouses.find(h => h.id === person.houseId);
            if (!house) continue;

            // <-- CHANGE: Find the street first, then the territory
            const street = allStreets.find(s => s.id === house.streetId);
            if (!street) continue;

            const territory = allTerritories.find(t => t.id === street.territoryId);
            if (!territory) continue;

            const personVisits = allVisits
                .filter(v => v.personId === person.id)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            const lastVisit = personVisits[0];
            const lastVisitDate = lastVisit ? new Date(lastVisit.date).toLocaleDateString() : 'No visits recorded';

            const li = document.createElement('li');
            li.dataset.houseId = house.id;

            // <-- CHANGE: Update the HTML to show the new data structure
            li.innerHTML = `
                <strong>${person.name}</strong>
                <div class="rv-details">
                    Last Visited: <strong>${lastVisitDate}</strong><br>
                    Territory: #${territory.number} (${street.name})<br>
                    Address: ${house.address}
                </div>
            `;
            rvList.appendChild(li);
        }
    }

    function setupEventListeners() {
    const noteModal = document.getElementById('note-modal');
    const modalVisitNotes = document.getElementById('modal-visit-notes');
    const personInput = document.getElementById('modal-person-input');
    
    // --- ADD THESE MISSING LINES BACK ---
    const suggestionsList = document.getElementById('modal-suggestions-list');
    const rvToggle = document.getElementById('modal-rv-toggle');
    const isRvCheck = document.getElementById('modal-is-rv-check');
    // --- END OF MISSING LINES ---

    const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');

    const territoryModal = document.getElementById('territory-modal');
    const modalTerritoryNumber = document.getElementById('modal-territory-number');
    const modalTerritoryDescription = document.getElementById('modal-territory-description');

    const streetModal = document.getElementById('street-modal');
    const modalStreetName = document.getElementById('modal-street-name');

    const houseModal = document.getElementById('house-modal');
    const modalHouseNumber = document.getElementById('modal-house-number');
    const modalHouseNotes = document.getElementById('modal-house-notes');
    const houseModalToggles = document.querySelector('#house-modal .modal-toggles');
    
        const showNoteModal = async (title = 'Add Visit Note') => {
            document.querySelector('#note-modal h3').textContent = title;
            personInput.value = '';
            selectedPersonId = null;
            rvToggle.style.display = 'none'; 
            isRvCheck.checked = false;
            
            noteModal.classList.remove('hidden');
        };


        const hideNoteModal = () => {
            noteModal.classList.add('hidden');
            modalVisitNotes.value = '';
            personInput.value = '';
            modalRemoveNHCheck.checked = false;
            isRvCheck.checked = false;
            rvToggle.style.display = 'none';
            suggestionsList.classList.add('hidden');
            selectedPersonId = null;
        };

        let allPeople = []; 

        async function populateAndShowSuggestions() {
            suggestionsList.innerHTML = '';
            allPeople = await getByIndex('people', 'houseId', currentHouseId);
            
            const filter = personInput.value.toLowerCase();
            const filteredPeople = allPeople.filter(p => p.name.toLowerCase().includes(filter));

            for (const person of filteredPeople) {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.textContent = person.name + (person.isRV ? ' (RV)' : '');
                item.dataset.id = person.id;
                item.dataset.name = person.name;
                suggestionsList.appendChild(item);
            }

            if (personInput.value.trim() !== '' && !filteredPeople.some(p => p.name.toLowerCase() === filter)) {
                const newItem = document.createElement('div');
                newItem.className = 'suggestion-item is-new';
                newItem.textContent = `+ Create "${personInput.value}"`;
                newItem.dataset.id = 'new';
                suggestionsList.appendChild(newItem);
            }

            suggestionsList.classList.remove('hidden');
        }

        suggestionsList.addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (!item) return;

            const personId = item.dataset.id;
            
            if (personId === 'new') {
                selectedPersonId = null; 
            } else {
                selectedPersonId = Number(personId);
                personInput.value = item.dataset.name;
                rvToggle.style.display = 'none';
            }
            suggestionsList.classList.add('hidden');
        });

        noteModal.querySelector('.close-modal-btn').addEventListener('click', hideNoteModal);
        document.getElementById('modal-cancel-btn').addEventListener('click', hideNoteModal);

        const showTerritoryModal = (territoryToEdit = null) => {
            const modalTitle = territoryModal.querySelector('h3');
            const saveAndNewBtn = document.getElementById('modal-territory-save-new-btn');

            if (territoryToEdit) {
                modalTitle.textContent = 'Edit Territory';
                modalTerritoryNumber.value = territoryToEdit.number;
                // <-- CHANGE: Use the correct variable and field
                modalTerritoryDescription.value = territoryToEdit.description;
                currentEditTerritoryId = territoryToEdit.id;
                saveAndNewBtn.classList.add('hidden');
            } else {
                modalTitle.textContent = 'Add New Territory';
                modalTerritoryNumber.value = '';
                // <-- CHANGE: Use the correct variable and field
                modalTerritoryDescription.value = '';
                currentEditTerritoryId = null;
                saveAndNewBtn.classList.remove('hidden');
            }

            territoryModal.classList.remove('hidden');
            modalTerritoryNumber.focus();
        };

        const hideTerritoryModal = () => {
            territoryModal.classList.add('hidden');
            currentEditTerritoryId = null;
        };

        const showStreetModal = (streetToEdit = null) => {
            const modalTitle = streetModal.querySelector('h3');
            const saveAndNewBtn = document.getElementById('modal-street-save-new-btn');
            if (streetToEdit) {
                modalTitle.textContent = 'Edit Street';
                modalStreetName.value = streetToEdit.name;
                currentEditStreetId = streetToEdit.id;
                saveAndNewBtn.classList.add('hidden');
            } else {
                modalTitle.textContent = 'Add New Street';
                modalStreetName.value = '';
                currentEditStreetId = null;
                saveAndNewBtn.classList.remove('hidden');
            }
            streetModal.classList.remove('hidden');
            modalStreetName.focus();
        };
        const hideStreetModal = () => { streetModal.classList.add('hidden'); currentEditStreetId = null; };

            
        const showHouseModal = () => {
            houseModal.classList.remove('hidden');
            modalHouseNumber.focus();
            // Clear previous entries and set defaults
            modalHouseNumber.value = '';
            modalHouseNotes.value = '';
            houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
            // Set NH to true by default
            houseModalToggles.querySelector('[data-prop="isCurrentlyNH"]').classList.add('active');
        };

        const hideHouseModal = () => {
            houseModal.classList.add('hidden');
            modalHouseNumber.value = '';
            modalHouseNotes.value = '';
            houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        };
    
        /*
        handleSaveTerritory: Updated to use the modalTerritoryDescription input and save a description property to the database. It also now calls renderTerritories() to refresh the view immediately.
        handleSaveStreet (New): This function gets the name from the street modal, links it with the currentTerritoryId, saves it to the streets store, and refreshes the street list.
        handleSaveHouse: Now gets the street name to build the full address and, most importantly, saves the streetId (instead of territoryId) with the new house record.*/
        async function handleSaveTerritory() {
            const number = modalTerritoryNumber.value.trim();
            // <-- CHANGE: Use description
            const description = modalTerritoryDescription.value.trim();
            if (!number || !description) {
                alert('Please fill out both territory number and description.');
                return false;
            }
            // <-- CHANGE: Save description
            await addToStore('territories', {
                number,
                description,
                createdAt: new Date().toISOString()
            });
            await renderTerritories(); // <-- ADD: Re-render the list after saving
            return true;
        }

        // <-- ADD: New function for saving streets
        async function handleSaveStreet() {
            const name = modalStreetName.value.trim();
            if (!name) {
                alert('Please enter a street name.');
                return false;
            }
            // Links the new street to the currently selected territory
            await addToStore('streets', { territoryId: currentTerritoryId, name });
            await renderStreets(currentTerritoryId); // Re-render the street list
            return true;
        }

        async function handleSaveHouse() {
            const houseNumber = modalHouseNumber.value.trim();
            if (!houseNumber) {
                alert('Please enter a house number.');
                return false;
            }
            // <-- CHANGE: Get the street, not the territory
            const street = await getFromStore('streets', currentStreetId);
            const fullAddress = `${houseNumber} ${street.name}`;
            const initialNotes = modalHouseNotes.value.trim();

            const newHouse = {
                // <-- CHANGE: Link to streetId instead of territoryId
                streetId: currentStreetId,
                address: fullAddress,
                hasMailbox: document.querySelector('.toggle-btn[data-prop="hasMailbox"]').classList.contains('active'),
                noTrespassing: document.querySelector('.toggle-btn[data-prop="noTrespassing"]').classList.contains('active'),
                isCurrentlyNH: document.querySelector('.toggle-btn[data-prop="isCurrentlyNH"]').classList.contains('active'),
                hasGate: document.querySelector('.toggle-btn[data-prop="hasGate"]').classList.contains('active')
            };

            const newHouseId = await addToStore('houses', newHouse);

            // Add the "House Created" note, marked as not a visit attempt
            await addToStore('visits', {
                houseId: newHouseId,
                date: new Date().toISOString(),
                notes: 'House record created.',
                isNotAtHome: false,
                isVisitAttempt: false
            });

            // Add the initial user notes if they exist, not a visit attempt
            if (initialNotes) {
                await addToStore('visits', {
                    houseId: newHouseId,
                    date: new Date().toISOString(),
                    notes: initialNotes,
                    isNotAtHome: false,
                    isVisitAttempt: false
                });
            }

            await rerenderHousesAndPreserveScroll();
            return true;
        }
    
         document.addEventListener('click', async (e) => {
            const target = e.target;

            // --- LEVEL 1 to 2: Territory List -> Street List ---
            const territoryLi = target.closest('#territory-list li:not(.placeholder)');
            if (territoryLi && !target.closest('.delete-btn, .edit-territory-btn')) {
                territoryListScrollPosition = window.scrollY;
                currentTerritoryId = Number(territoryLi.dataset.id);
                await renderStreets(currentTerritoryId);
                showView('street-list-view');
                return;
            }

            // --- LEVEL 2 to 3: Street List -> House List ---
            const streetLi = target.closest('#street-list li:not(.placeholder)');
            if (streetLi && !target.closest('.delete-btn, .edit-street-btn')) {
                streetListScrollPosition = window.scrollY;
                currentStreetId = Number(streetLi.dataset.id);
                // Reset house filters when entering a new street
                activeHouseFilters = { visited: false, ni: false, nt: false, gated: false };
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                await renderHouses(currentStreetId);
                showView('house-list-view');
                return;
            }

            // --- LEVEL 3 to DETAIL: House List -> House Detail ---
            const houseLi = target.closest('#house-list li:not(.placeholder)');
            if (houseLi && !target.closest('.delete-btn') && !target.closest('.card-actions')) {
                houseListScrollPosition = window.scrollY;
                currentHouseId = Number(houseLi.dataset.id);
                await renderHouseDetails(currentHouseId);
                showView('house-detail-view');
                return;
            }

            // --- RV List Navigation ---
            const rvLi = target.closest('#rv-list li');
            if (rvLi && !rvLi.classList.contains('placeholder')) {
                currentHouseId = Number(rvLi.dataset.houseId);
                const house = await getFromStore('houses', currentHouseId);
                if (house) {
                    // Set all necessary IDs for the back button to work correctly
                    const street = await getFromStore('streets', house.streetId);
                    currentStreetId = street.id;
                    currentTerritoryId = street.territoryId;
                    await renderHouseDetails(currentHouseId);
                    showView('house-detail-view');
                }
                return;
            }
    
            // --- Edit Buttons ---
            const editTerritoryBtn = target.closest('.edit-territory-btn');
            if (editTerritoryBtn) {
                const territoryId = Number(editTerritoryBtn.dataset.id); // <-- Fixed
                const territory = await getFromStore('territories', territoryId); // <-- Fixed
                showTerritoryModal(territory); // <-- Fixed
                return; 
            }

            // This is the new button from the street list view
            const editStreetBtn = target.closest('.edit-street-btn');
            if (editStreetBtn) {
                const streetId = Number(editStreetBtn.dataset.id);
                const street = await getFromStore('streets', streetId);
                showStreetModal(street);
                return;
            }


            // --- Back Buttons (Updated Hierarchy) ---
            if (target.classList.contains('back-btn')) {
                const targetView = target.dataset.target;

                if (targetView === 'house-list-view') {
                    await renderHouses(currentStreetId); // Re-render the list you are going back to
                    showView(targetView);
                    setTimeout(() => window.scrollTo(0, houseListScrollPosition), 0);
                } else if (targetView === 'street-list-view') {
                    await renderStreets(currentTerritoryId); // Re-render before showing
                    showView(targetView);
                    setTimeout(() => window.scrollTo(0, streetListScrollPosition), 0);
                } else if (targetView === 'territory-list-view') {
                    showView(targetView);
                    setTimeout(() => window.scrollTo(0, territoryListScrollPosition), 0);
                } else {
                    showView(targetView);
                }
                return;
            }
    
            if (target.classList.contains('sort-btn')) {
                territorySort = target.dataset.sort;
                await renderTerritories();
            }
    
            /*Territory Delete: This logic fetches all streets for the territory first, and then for each street, it fetches and deletes the houses and their related data 
            before finally deleting the territory itself.
            Street Delete: We added a new else if (type === 'street') block. This handles deleting a street, first finding all its houses and deleting their related visits and people, 
            and then deleting the street itself.
            */
            if (target.classList.contains('delete-btn')) {
                const id = Number(target.dataset.id);
                const type = target.dataset.type;

                if (type === 'territory' && confirm('DELETE this territory and ALL its streets and houses? This cannot be undone.')) {
                    const streets = await getByIndex('streets', 'territoryId', id);
                    for (const street of streets) {
                        const houses = await getByIndex('houses', 'streetId', street.id);
                        for (const house of houses) {
                            const visits = await getByIndex('visits', 'houseId', house.id);
                            for (const visit of visits) await deleteFromStore('visits', visit.id);
                            const people = await getByIndex('people', 'houseId', house.id);
                            for (const person of people) await deleteFromStore('people', person.id);
                            await deleteFromStore('houses', house.id);
                        }
                        await deleteFromStore('streets', street.id);
                    }
                    await deleteFromStore('territories', id);
                    await renderTerritories();

                } else if (type === 'street' && confirm('DELETE this street and ALL its houses?')) {
                    const houses = await getByIndex('houses', 'streetId', id);
                    for (const house of houses) {
                        const visits = await getByIndex('visits', 'houseId', house.id);
                        for (const visit of visits) await deleteFromStore('visits', visit.id);
                        const people = await getByIndex('people', 'houseId', house.id);
                        for (const person of people) await deleteFromStore('people', person.id);
                        await deleteFromStore('houses', house.id);
                    }
                    await deleteFromStore('streets', id);
                    await renderStreets(currentTerritoryId);

                } else if (type === 'house' && confirm('Delete this house and its history?')) {
                    const visits = await getByIndex('visits', 'houseId', id);
                    for (const visit of visits) await deleteFromStore('visits', visit.id);
                    const people = await getByIndex('people', 'houseId', id);
                    for (const person of people) await deleteFromStore('people', person.id);
                    await deleteFromStore('houses', id);
                    await rerenderHousesAndPreserveScroll();

                } else if (type === 'visit' && confirm('Delete this visit note?')) {
                    await deleteFromStore('visits', id);
                    await renderHouseDetails(currentHouseId);
                }
            }

            if (target.id === 'data-menu-toggle-btn') {
                document.getElementById('territory-data-management').classList.toggle('hidden');
            }

            if (target.id === 'export-territory-menu-toggle-btn') {
                document.getElementById('territory-export-management').classList.toggle('hidden');
            }

            if (target.id === 'export-street-menu-toggle-btn') {
                document.getElementById('street-data-management').classList.toggle('hidden');
            }
            if (target.id === 'about-menu-toggle-btn') {
                document.getElementById('about-section').classList.toggle('hidden');
            }
    
            if (target.classList.contains('edit-date-btn')) {
                const visitId = Number(target.dataset.id);
                const visit = await getFromStore('visits', visitId);

                const d = new Date(visit.date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                const currentDateTime = `${year}-${month}-${day} ${hours}:${minutes}`;

                const newDateTimeStr = prompt('Enter new date and time (YYYY-MM-DD HH:MM):', currentDateTime);

                if (newDateTimeStr && !isNaN(new Date(newDateTimeStr))) {
                    visit.date = new Date(newDateTimeStr).toISOString();
                    await updateInStore('visits', visit);
                    await renderHouseDetails(currentHouseId);
                } else if (newDateTimeStr) {
                    alert('Invalid date/time format. Please use YYYY-MM-DD HH:MM.');
                }
            }
        });

        personInput.addEventListener('focus', populateAndShowSuggestions);
        personInput.addEventListener('input', () => {
            selectedPersonId = null; 
            rvToggle.style.display = 'block';
            populateAndShowSuggestions();
        });

        const searchInput = document.getElementById('search-territory-input');
        searchInput.addEventListener('input', (e) => {
            renderTerritories(e.target.value.trim());
        });
    
        document.getElementById('add-territory-btn').addEventListener('click', () => showTerritoryModal());
        
        // Territory Modal Listeners
        /*
        Summary of changes in this part:
        1.  **Territory Modal Listeners (Updated):** We replaced every instance of `name` and `modalTerritoryName` with `description`
        and `modalTerritoryDescription` to match our new data structure.
        2.  **Street Modal Listeners (New):** We added a complete set of event listeners for the new street modal:
        *   The `add-street-btn` now opens the modal.
        *   The save button (`modal-street-save-btn`) handles both creating a new street and updating an existing one.
        *   The "Save & New" and "Cancel" buttons are also fully wired up.
        * */
        document.getElementById('modal-territory-save-btn').addEventListener('click', async () => {
            const number = modalTerritoryNumber.value.trim();
            const description = modalTerritoryDescription.value.trim(); // <-- CHANGE

            if (!number || !description) { // <-- CHANGE
                alert('Please fill out both the territory number and description.');
                return;
            }

            if (currentEditTerritoryId) {
                const territory = await getFromStore('territories', currentEditTerritoryId);
                territory.number = number;
                territory.description = description; // <-- CHANGE
                await updateInStore('territories', territory);
            } else {
                await addToStore('territories', {
                    description, // <-- CHANGE
                    number,
                    createdAt: new Date().toISOString()
                });
            }

            hideTerritoryModal();
            await renderTerritories();
        });
        document.getElementById('modal-territory-save-new-btn').addEventListener('click', async () => {
            if (await handleSaveTerritory()) {
                modalTerritoryDescription.value = ''; // <-- CHANGE
                modalTerritoryDescription.focus(); // <-- CHANGE
            }
        });
        document.getElementById('modal-territory-cancel-btn').addEventListener('click', hideTerritoryModal);
        territoryModal.querySelector('.close-modal-btn').addEventListener('click', hideTerritoryModal);
    
        // --- ADD: Street Modal Listeners ---
        document.getElementById('add-street-btn').addEventListener('click', () => showStreetModal());
        document.getElementById('modal-street-save-btn').addEventListener('click', async () => {
            const name = modalStreetName.value.trim();
            if (!name) return alert('Street name is required.');

            if (currentEditStreetId) {
                const street = await getFromStore('streets', currentEditStreetId);
                street.name = name;
                await updateInStore('streets', street);
            } else {
                await addToStore('streets', { territoryId: currentTerritoryId, name });
            }
            hideStreetModal();
            await renderStreets(currentTerritoryId);
        });
        document.getElementById('modal-street-save-new-btn').addEventListener('click', async () => {
            if (await handleSaveStreet()) {
                modalStreetName.value = '';
                modalStreetName.focus();
            }
        });
        document.getElementById('modal-street-cancel-btn').addEventListener('click', hideStreetModal);
        streetModal.querySelector('.close-modal-btn').addEventListener('click', hideStreetModal);

        houseModalToggles.addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn');
            if (btn) btn.classList.toggle('active');
        });
        document.getElementById('modal-house-save-btn').addEventListener('click', async () => {
            if (await handleSaveHouse()) hideHouseModal();
        });
        document.getElementById('modal-house-save-new-btn').addEventListener('click', async () => {
            if (await handleSaveHouse()) {
                modalHouseNumber.value = '';
                modalHouseNumber.focus();
            }
        });
        document.getElementById('modal-house-cancel-btn').addEventListener('click', hideHouseModal);
        houseModal.querySelector('.close-modal-btn').addEventListener('click', hideHouseModal);
    
        document.getElementById('add-house-btn').addEventListener('click', showHouseModal);
        document.getElementById('add-visit-btn').addEventListener('click', () => showNoteModal('Add New Visit Note'));
    
        document.querySelector('.filter-controls').addEventListener('click', async (e) => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;

            const filterType = btn.dataset.filter;
            activeHouseFilters[filterType] = !activeHouseFilters[filterType];
            btn.classList.toggle('active');
            
            await rerenderHousesAndPreserveScroll();
        });

        document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
            const notes = modalVisitNotes.value.trim();

            let personIdToSave = selectedPersonId;

            if (!personIdToSave && personInput.value.trim() !== '') {
                const newName = personInput.value.trim();
                const newPerson = { houseId: currentHouseId, name: newName, isRV: isRvCheck.checked };
                personIdToSave = await addToStore('people', newPerson);
            }

            // MODIFIED: Mark as a visit attempt
            await addToStore('visits', {
                houseId: currentHouseId,
                date: new Date().toISOString(),
                notes: notes || "Phone call logged.",
                personId: personIdToSave,
                isNotAtHome: false,
                isVisitAttempt: true
            });
            
            const house = await getFromStore('houses', currentHouseId);

            if (modalRemoveNHCheck.checked) {
                house.isCurrentlyNH = false;
            }

            await updateInStore('houses', house);
            
            hideNoteModal();
            
            if (currentView === 'house-list-view') {
                await renderHouses(currentTerritoryId);
                // Restore scroll position after modal save
                setTimeout(() => window.scrollTo(0, houseListScrollPosition), 0);
            } else {
                await renderHouseDetails(currentHouseId);
            }
        });

        document.getElementById('house-detail-view').addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox' || !['not-at-home-check', 'not-interested-check', 'mailbox-check', 'notrespass-check', 'gate-check'].includes(e.target.id)) {
                return;
            }
            const checkbox = e.target;
            setTimeout(async () => {
                const house = await getFromStore('houses', currentHouseId);
                if (!house) return;

                const isChecked = checkbox.checked;
                const wasNotInterested = house.isNotInterested;

                switch (checkbox.id) {
                    case 'not-at-home-check': house.isCurrentlyNH = isChecked; break;
                    case 'not-interested-check': house.isNotInterested = isChecked; break;
                    case 'mailbox-check': house.hasMailbox = isChecked; break;
                    case 'notrespass-check': house.noTrespassing = isChecked; break;
                    case 'gate-check': house.hasGate = isChecked; break;
                }
                await updateInStore('houses', house);
                
                if (checkbox.id === 'not-interested-check' && isChecked && !wasNotInterested) {
                    // Mark as not a visit attempt
                    await addToStore('visits', {
                        houseId: currentHouseId,
                        date: new Date().toISOString(),
                        notes: "Marked as 'Not Interested'.",
                        personId: null,
                        isNotAtHome: false,
                        isVisitAttempt: false
                    });
                    await renderHouseDetails(currentHouseId);
                }
            }, 0);
        });

        document.getElementById('show-rvs-btn').addEventListener('click', async () => {
            await renderRVList();
            showView('rv-list-view');
        });
        document.getElementById('export-full-btn').addEventListener('click', handleFullBackup);
        document.getElementById('export-territory-mscribe-btn').addEventListener('click', handleTerritoryBackup);
        document.getElementById('export-street-mscribe-btn').addEventListener('click', handleStreetBackup); // <-- FIXED ID and function name
        // document.getElementById('export-csv-btn').addEventListener('click', handleExportCSV);
        document.getElementById('export-pdf-btn').addEventListener('click', handleExportPDF);
        document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
        document.getElementById('restore-file-input').addEventListener('change', handleCSVImport);
        document.getElementById('import-csv-btn').addEventListener('click', () => document.getElementById('import-csv-input').click());
        document.getElementById('import-csv-input').addEventListener('change', handleCSVImport);

    }

    // --- NEW: CSV GENERATION HELPER ---
    async function generateCSV(houseList) {
        if (!houseList || houseList.length === 0) {
            alert("No houses to export.");
            return null;
        }

        const csvEscape = (field) => {
            const stringField = String(field ?? '');
            if (/[",\n]/.test(stringField)) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        };

        const allStreets = await getAllFromStore('streets');
        const allTerritories = await getAllFromStore('territories');
        const streetsMap = new Map(allStreets.map(s => [s.id, s]));
        const territoriesMap = new Map(allTerritories.map(t => [t.id, t]));

        const headers = [
            'TerritoryNumber', 'TerritoryDescription', 'StreetName', 'HouseNumber', 'InitialNotes',
            'HasMailbox', 'NoTrespassing', 'HasGate'
        ];
        let csvRows = [headers.join(',')];

        for (const house of houseList) {
            const street = streetsMap.get(house.streetId);
            if (!street) continue;
            const territory = territoriesMap.get(street.territoryId);
            if (!territory) continue;

            const visits = await getByIndex('visits', 'houseId', house.id);
            const initialNotes = visits
                .filter(v => v.isVisitAttempt === false && v.notes !== 'House record created.' && v.notes !== 'House record created via CSV import.')
                .map(v => v.notes)
                .join('; ');

            const houseNumber = house.address.replace(street.name, '').trim();

            const row = [
                territory.number,
                territory.description,
                street.name,
                houseNumber,
                initialNotes,
                house.hasMailbox,
                house.noTrespassing,
                house.hasGate
            ].map(csvEscape).join(',');
            csvRows.push(row);
        }
        return csvRows.join('\n');
    }

    // --- BACKUP & RESTORE FUNCTIONS (MODIFIED FOR CSV) ---
    async function handleStreetBackup() {
        const street = await getFromStore('streets', currentStreetId);
        if (!street) return alert("Could not find current street.");
        
        const houses = await getByIndex('houses', 'streetId', currentStreetId);
        const csvContent = await generateCSV(houses);

        if (csvContent) {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const filename = `${street.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.csv`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        }
    }

    async function handleFullBackup() {
        try {
            const allHouses = await getAllFromStore('houses');
            const csvContent = await generateCSV(allHouses);

            if (csvContent) {
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const filename = `ministry_scribe_full_backup_${new Date().toISOString().split('T')[0]}.csv`;
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                a.click();
                URL.revokeObjectURL(a.href);
            }
        } catch (error) {
            console.error("Full CSV export failed:", error);
            alert("Could not perform the full CSV export.");
        }
    }

    async function handleTerritoryBackup() {
        const territory = await getFromStore('territories', currentTerritoryId);
        if (!territory) return alert("Could not find the current territory.");

        const streets = await getByIndex('streets', 'territoryId', currentTerritoryId);
        const streetIds = streets.map(s => s.id);
        const allHouses = await getAllFromStore('houses');
        const territoryHouses = allHouses.filter(h => streetIds.includes(h.streetId));
        const csvContent = await generateCSV(territoryHouses);

        if (csvContent) {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const filename = `territory_${territory.number}_${territory.description.replace(/\s/g, '_')}.csv`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        }
    }

    /**
 * Handles the CSV file selection, reads the file, and initiates the import process.
 * @param {Event} event The file input change event.
 */
function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvContent = e.target.result;
        try {
            const data = parseCSV(csvContent);
            if (data.length === 0) {
                alert("CSV file is empty or invalid.");
                return;
            }
            // Confirm with the user before proceeding
            if (confirm(`This will import ${data.length} new house records. This cannot be undone. Continue?`)) {
                await processCSVData(data);
                alert("CSV import successful!");
                await renderTerritories(); // Refresh the main view
            }
        } catch (error) {
            alert(`An error occurred during CSV import: ${error.message}`);
            console.error("CSV Import Error:", error);
        } finally {
            // Clear the file input to allow re-importing the same file
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

/**
 * Parses a CSV string into an array of objects.
 * @param {string} csvText The raw CSV string content.
 * @returns {Array<Object>} An array of objects, where each object represents a row.
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const rowObject = {};
        for (let j = 0; j < header.length; j++) {
            rowObject[header[j]] = values[j] ? values[j].trim() : '';
        }
        data.push(rowObject);
    }
    return data;
}

    /**
     * Processes the parsed CSV data and saves it to the database.
     * @param {Array<Object>} data The array of row objects from the CSV.
     */
    async function processCSVData(data) {
        // Use maps to cache created territories and streets to avoid redundant DB lookups
        const territoryCache = new Map();
        const streetCache = new Map();

        for (const row of data) {
            const {
                TerritoryNumber,
                TerritoryDescription,
                StreetName,
                HouseNumber,
                HasMailbox,
                NoTrespassing,
                HasGate,
                InitialNotes
            } = row;

            // --- Step 1: Find or Create Territory ---
            let territoryId;
            if (territoryCache.has(TerritoryNumber)) {
                territoryId = territoryCache.get(TerritoryNumber);
            } else {
                // Check if territory already exists in the database
                const territories = await getAllFromStore('territories');
                let existingTerritory = territories.find(t => t.number === TerritoryNumber);
                
                if (existingTerritory) {
                    territoryId = existingTerritory.id;
                } else {
                    territoryId = await addToStore('territories', {
                        number: TerritoryNumber,
                        description: TerritoryDescription,
                        createdAt: new Date().toISOString()
                    });
                }
                territoryCache.set(TerritoryNumber, territoryId);
            }

            // --- Step 2: Find or Create Street ---
            let streetId;
            const streetCacheKey = `${territoryId}-${StreetName}`;
            if (streetCache.has(streetCacheKey)) {
                streetId = streetCache.get(streetCacheKey);
            } else {
                const streets = await getByIndex('streets', 'territoryId', territoryId);
                let existingStreet = streets.find(s => s.name.toLowerCase() === StreetName.toLowerCase());

                if (existingStreet) {
                    streetId = existingStreet.id;
                } else {
                    streetId = await addToStore('streets', {
                        territoryId: territoryId,
                        name: StreetName
                    });
                }
                streetCache.set(streetCacheKey, streetId);
            }
            
            // --- Step 3: Create the House ---
            const newHouse = {
                streetId: streetId,
                address: `${HouseNumber} ${StreetName}`,
                isCurrentlyNH: true, // Default to Not at Home
                hasMailbox: HasMailbox ? HasMailbox.toLowerCase() === 'true' : false,
                noTrespassing: NoTrespassing ? NoTrespassing.toLowerCase() === 'true' : false,
                hasGate: HasGate ? HasGate.toLowerCase() === 'true' : false,
                isNotInterested: false // Default NI to false
            };

            const newHouseId = await addToStore('houses', newHouse);
            
            // --- Step 4: Add "Created" and Initial Notes ---
            await addToStore('visits', {
                houseId: newHouseId,
                date: new Date().toISOString(),
                notes: 'House record created via CSV import.',
                isVisitAttempt: false // This is not a real visit attempt
            });

            if (InitialNotes) {
                await addToStore('visits', {
                    houseId: newHouseId,
                    date: new Date().toISOString(),
                    notes: InitialNotes,
                    isVisitAttempt: false
                });
            }
        }
    }

    async function handleExportPDF() {
        const doc = new jsPDF();
        // This function now exports a STREET, not a territory
        const street = await getFromStore('streets', currentStreetId);
        const houses = await getByIndex('houses', 'streetId', currentStreetId);
        
        doc.setFontSize(18);
        doc.text(`Street Report: ${street.name}`, 14, 22);
        
        let y = 30;
        // Internal logic for generating the PDF content for houses is unchanged
        for (const house of houses) {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setLineWidth(0.5);
            doc.line(14, y, 196, y);
            y += 7;
            doc.setFontSize(12);
            doc.text(`Address: ${house.address}`, 14, y);
            y += 7;
        }

        doc.save(`${street.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.pdf`);
    }

});