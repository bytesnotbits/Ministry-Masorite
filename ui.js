/*
Purpose of this file:
Create a ui.js module to separate all the rendering and DOM manipulation logic from the main application logic.
The goal here is to take all the functions from app.js whose primary job is to draw things on the screen (like rendering lists or showing modals) 
and move them into their own dedicated file. This will immediately make app.js smaller and easier to read.
*/

// --- NEW FILE: ui.js ---
// This file contains all functions for rendering data to the DOM and managing UI components like views and modals.

// --- NAVIGATION ---
function showView(viewId) {
    // This function will need access to the `views` DOM element collection.
    // We will pass it in or define it here later. For now, we assume it's globally available.
    const views = document.querySelectorAll('.view');
    views.forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });
}

// --- RENDERING FUNCTIONS ---

async function rerenderHousesAndPreserveScroll(streetId) {
    const scrollPos = window.scrollY;
    await renderHouses(streetId); // Pass streetId through
    // Use setTimeout to ensure the DOM has been painted before scrolling.
    setTimeout(() => window.scrollTo(0, scrollPos), 0);
}

async function renderTerritories(territories, territorySort = 'number', filter = '') {
    const territoryList = document.getElementById('territory-list');
    territoryList.innerHTML = '';

    let territoriesToRender = [...territories];

    if (filter) {
        const searchTerm = filter.toLowerCase();
        territoriesToRender = territoriesToRender.filter(territory => {
            const nameMatch = territory.description.toLowerCase().includes(searchTerm);
            const numberMatch = String(territory.number || '').toLowerCase().includes(searchTerm);
            return nameMatch || numberMatch;
        });
    }

    territoriesToRender.sort((a, b) => {
        if (territorySort === 'description') {
            return a.description.localeCompare(b.description);
        } else if (territorySort === 'number') {
            const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            return naturalSort(a.number || '', b.number || '');
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (territoriesToRender.length === 0) {
        if (filter) {
            territoryList.innerHTML = `<li class="placeholder">No territories match "${filter}".</li>`;
        } else {
            territoryList.innerHTML = '<li class="placeholder">Click "+ Add New Territory" to begin.</li>';
        }
    } else {
        for (const territory of territoriesToRender) {
            const streets = await getByIndex('streets', 'territoryId', territory.id);
            const li = document.createElement('li');
            li.dataset.id = territory.id;
            
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

    const searchInput = document.getElementById('search-territory-input');
    const SEARCH_VISIBILITY_THRESHOLD = 10; 
    const shouldShowSearch = territories.length > SEARCH_VISIBILITY_THRESHOLD;
    searchInput.classList.toggle('hidden', !shouldShowSearch);
}

async function renderStreets(territoryId) {
    const streetList = document.getElementById('street-list');
    streetList.innerHTML = '';
    const territory = await getFromStore('territories', territoryId);
    document.getElementById('street-list-title').textContent = `Territory #${territory.number}: ${territory.description}`;

    const streets = (await getByIndex('streets', 'territoryId', territoryId)).sort((a,b) => a.name.localeCompare(b.name));

    if (streets.length === 0) {
        streetList.innerHTML = '<li class="placeholder">No streets added to this territory yet.</li>';
        return;
    }

    for (const street of streets) {
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

async function renderHouses(streetId, activeHouseFilters) {
    const houseList = document.getElementById('house-list');
    houseList.innerHTML = '';
    const street = await getFromStore('streets', streetId);
    document.getElementById('house-list-title').textContent = street.name;

    const allHouses = (await getByIndex('houses', 'streetId', streetId)).sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true, sensitivity: 'base' }));
    
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
    } else {
        peopleList.innerHTML = '<li class="placeholder">No individuals recorded yet.</li>';
    }

    const visitList = document.getElementById('visit-notes-list');
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

async function renderRVList() {
    const rvList = document.getElementById('rv-list');
    rvList.innerHTML = '';

    const allPeople = await getAllFromStore('people');
    const allHouses = await getAllFromStore('houses');
    const allStreets = await getAllFromStore('streets');
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


// --- MODAL MANAGEMENT ---

function showNoteModal(title = 'Add Visit Note') {
    const noteModal = document.getElementById('note-modal');
    const personInput = document.getElementById('modal-person-input');
    const rvToggle = document.getElementById('modal-rv-toggle');
    const isRvCheck = document.getElementById('modal-is-rv-check');

    document.querySelector('#note-modal h3').textContent = title;
    personInput.value = '';
    // selectedPersonId will be managed in app.js
    rvToggle.style.display = 'none'; 
    isRvCheck.checked = false;
    
    noteModal.classList.remove('hidden');
}

function hideNoteModal() {
    const noteModal = document.getElementById('note-modal');
    const modalVisitNotes = document.getElementById('modal-visit-notes');
    const personInput = document.getElementById('modal-person-input');
    const suggestionsList = document.getElementById('modal-suggestions-list');
    const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');
    const rvToggle = document.getElementById('modal-rv-toggle');
    const isRvCheck = document.getElementById('modal-is-rv-check');

    noteModal.classList.add('hidden');
    modalVisitNotes.value = '';
    personInput.value = '';
    modalRemoveNHCheck.checked = false;
    isRvCheck.checked = false;
    rvToggle.style.display = 'none';
    suggestionsList.classList.add('hidden');
    // selectedPersonId will be reset in app.js
}

function showTerritoryModal(territoryToEdit = null) {
    const territoryModal = document.getElementById('territory-modal');
    const modalTitle = territoryModal.querySelector('h3');
    const saveAndNewBtn = document.getElementById('modal-territory-save-new-btn');
    const modalTerritoryNumber = document.getElementById('modal-territory-number');
    const modalTerritoryDescription = document.getElementById('modal-territory-description');

    if (territoryToEdit) {
        modalTitle.textContent = 'Edit Territory';
        modalTerritoryNumber.value = territoryToEdit.number;
        modalTerritoryDescription.value = territoryToEdit.description;
        saveAndNewBtn.classList.add('hidden');
    } else {
        modalTitle.textContent = 'Add New Territory';
        modalTerritoryNumber.value = '';
        modalTerritoryDescription.value = '';
        saveAndNewBtn.classList.remove('hidden');
    }

    territoryModal.classList.remove('hidden');
    modalTerritoryNumber.focus();
}

function hideTerritoryModal() {
    document.getElementById('territory-modal').classList.add('hidden');
}

function showStreetModal(streetToEdit = null) {
    const streetModal = document.getElementById('street-modal');
    const modalTitle = streetModal.querySelector('h3');
    const saveAndNewBtn = document.getElementById('modal-street-save-new-btn');
    const modalStreetName = document.getElementById('modal-street-name');

    if (streetToEdit) {
        modalTitle.textContent = 'Edit Street';
        modalStreetName.value = streetToEdit.name;
        saveAndNewBtn.classList.add('hidden');
    } else {
        modalTitle.textContent = 'Add New Street';
        modalStreetName.value = '';
        saveAndNewBtn.classList.remove('hidden');
    }
    streetModal.classList.remove('hidden');
    modalStreetName.focus();
}

function hideStreetModal() { 
    document.getElementById('street-modal').classList.add('hidden'); 
}

function showHouseModal() {
    const houseModal = document.getElementById('house-modal');
    const modalHouseNumber = document.getElementById('modal-house-number');
    const modalHouseNotes = document.getElementById('modal-house-notes');
    const houseModalToggles = document.querySelector('#house-modal .modal-toggles');

    houseModal.classList.remove('hidden');
    modalHouseNumber.focus();
    modalHouseNumber.value = '';
    modalHouseNotes.value = '';
    houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    houseModalToggles.querySelector('[data-prop="isCurrentlyNH"]').classList.add('active');
}

function hideHouseModal() {
    const houseModal = document.getElementById('house-modal');
    const modalHouseNumber = document.getElementById('modal-house-number');
    const modalHouseNotes = document.getElementById('modal-house-notes');
    const houseModalToggles = document.querySelector('#house-modal .modal-toggles');

    houseModal.classList.add('hidden');
    modalHouseNumber.value = '';
    modalHouseNotes.value = '';
    houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
}