// --- REFACTORED FILE: ui.js ---
// This file contains all functions for rendering data to the DOM and managing UI components.
// It uses a component-based approach where helper functions build individual DOM elements.

// ===================================================================================
// --- COMPONENT HELPER FUNCTIONS ---
// These functions are responsible for creating single DOM elements for list items.
// ===================================================================================

async function createTerritoryListItem(territory) {
    const li = document.createElement('li');
    li.dataset.id = territory.id;

    const streets = await getByIndex('streets', 'territoryId', territory.id);
    const numberDisplay = territory.number ? `<strong>#${territory.number}</strong> -` : 'No # -';

    li.innerHTML = `
        <span>${numberDisplay} ${territory.description} (${streets.length} streets)</span>
        <div class="territory-actions">
            <button class="icon-btn edit-territory-btn" data-id="${territory.id}" title="Edit Territory">✏️</button>
            <button class="delete-btn" data-id="${territory.id}" data-type="territory">X</button>
        </div>
    `;
    return li;
}

async function createStreetListItem(street) {
    const li = document.createElement('li');
    li.dataset.id = street.id;
    
    const houses = await getByIndex('houses', 'streetId', street.id);
    
    li.innerHTML = `
        <span>${street.name} (${houses.length} houses)</span>
        <div class="street-actions">
            <button class="icon-btn edit-street-btn" data-id="${street.id}" title="Edit Street Name">✏️</button>
            <button class="delete-btn" data-id="${street.id}" data-type="street">X</button>
        </div>
    `;
    return li;
}

function createHouseListItem(house, visits) {
    const li = document.createElement('li');
    li.className = 'house-card';
    li.dataset.id = house.id;

    if (house.isNotInterested) {
        li.classList.add('is-ni');
    }

    const lastVisit = visits[0];
    const visitCount = visits.filter(v => v.isVisitAttempt !== false).length;

    let iconsHTML = '';
    if (house.hasMailbox) iconsHTML += `<span title="Mailbox Available">📭</span>`;
    if (house.noTrespassing) iconsHTML += `<span title="No Trespassing Sign">🚫</span>`;
    if (house.hasGate) iconsHTML += `<span title="Gated Property">🚧</span>`;
    if (house.isCurrentlyNH) iconsHTML += `<span title="Status: Not at Home">⏰</span>`;

    const lastActivityDate = lastVisit ? `Last Visit: <strong>${new Date(lastVisit.date).toLocaleDateString()}</strong>` : 'No activity yet';
    const personMet = lastVisit && !lastVisit.isNotAtHome && lastVisit.personName ? `Met: <strong>${lastVisit.personName}</strong>` : '';
    const niBadge = house.isNotInterested ? '<span class="ni-badge">NI</span>' : '';

    const hasSentLetter = visits.some(v => v.visitType === 'letter');
    const letterButtonClass = hasSentLetter ? 'sent-letter-btn letter-sent' : 'sent-letter-btn';
    const letterButtonText = hasSentLetter ? 'Letter Sent' : 'Send Letter';

    li.innerHTML = `
        <div class="card-header">
            <div class="card-title"><strong>${house.address}</strong> ${niBadge}</div>
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
    return li;
}

function createPersonListItem(person) {
    const li = document.createElement('li');
    const rvBadge = person.isRV ? '<span class="rv-badge">RV</span>' : '';
    li.innerHTML = `
        <span class="person-name">${person.name}${rvBadge}</span>
        <div class="person-actions">
            <button class="icon-btn edit-person-btn" data-id="${person.id}" title="Edit Name">✏️</button>
            <button class="icon-btn delete-person-btn" data-id="${person.id}" title="Delete Person">X</button>
        </div>
    `;
    return li;
}

function createVisitListItem(visit, people) {
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
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
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
    return li;
}

function createRVListItem(person, house, street, territory, lastVisitDate) {
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
    return li;
}

// ===================================================================================
// --- MAIN RENDER FUNCTIONS ---
// These functions orchestrate the fetching of data and use the component helpers
// to build and display lists of elements.
// ===================================================================================

function showView(viewId) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });
}

async function rerenderHousesAndPreserveScroll(streetId, activeHouseFilters) {
    const scrollPos = window.scrollY;
    await renderHouses(streetId, activeHouseFilters);
    setTimeout(() => window.scrollTo(0, scrollPos), 0);
}

async function renderTerritories(territories, territorySort = 'number', filter = '') {
    const territoryList = document.getElementById('territory-list');
    territoryList.innerHTML = '';

    let territoriesToRender = [...territories];

    if (filter) {
        const searchTerm = filter.toLowerCase();
        territoriesToRender = territoriesToRender.filter(t => 
            t.description.toLowerCase().includes(searchTerm) || 
            String(t.number || '').toLowerCase().includes(searchTerm)
        );
    }

    territoriesToRender.sort((a, b) => {
        if (territorySort === 'description') return a.description.localeCompare(b.description);
        if (territorySort === 'number') return (a.number || '').localeCompare(b.number || '', undefined, { numeric: true });
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (territoriesToRender.length === 0) {
        territoryList.innerHTML = filter ? `<li class="placeholder">No territories match "${filter}".</li>` : '<li class="placeholder">Click "+ Add New Territory" to begin.</li>';
    } else {
        const fragment = document.createDocumentFragment();
        for (const territory of territoriesToRender) {
            fragment.appendChild(await createTerritoryListItem(territory));
        }
        territoryList.appendChild(fragment);
    }

    document.getElementById('search-territory-input').classList.toggle('hidden', territories.length <= 10);
}

async function renderStreets(territoryId) {
    const streetList = document.getElementById('street-list');
    streetList.innerHTML = '';
    const territory = await getFromStore('territories', territoryId);
    document.getElementById('street-list-title').textContent = `Territory #${territory.number}: ${territory.description}`;

    const streets = (await getByIndex('streets', 'territoryId', territoryId)).sort((a, b) => a.name.localeCompare(b.name));

    if (streets.length === 0) {
        streetList.innerHTML = '<li class="placeholder">No streets added to this territory yet.</li>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    for (const street of streets) {
        fragment.appendChild(await createStreetListItem(street));
    }
    streetList.appendChild(fragment);
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
        acc[house.id] = (allVisitsArrays[index] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        return acc;
    }, {});

    const housesToRender = allHouses.filter(house => {
        const visits = visitsByHouseId[house.id] || [];
        if (activeHouseFilters.ni && house.isNotInterested) return false;
        if (activeHouseFilters.nt && house.noTrespassing) return false;
        if (activeHouseFilters.gated && house.hasGate) return false;
        if (activeHouseFilters.visited) {
            const hasActualVisit = visits.some(visit => (visit.isVisitAttempt !== false) && !visit.isNotAtHome);
            if (hasActualVisit && !house.isCurrentlyNH) return false;
        }
        return true;
    });

    if (housesToRender.length === 0) {
        const hasActiveFilters = Object.values(activeHouseFilters).some(v => v);
        if (hasActiveFilters) houseList.innerHTML = '<li class="placeholder">No houses match the current filters.</li>';
        else if (allHouses.length === 0) houseList.innerHTML = '<li class="placeholder">No houses added to this street yet.</li>';
        else houseList.innerHTML = '<li class="placeholder">All houses are currently hidden by filters.</li>';
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const house of housesToRender) {
        fragment.appendChild(createHouseListItem(house, visitsByHouseId[house.id]));
    }
    houseList.appendChild(fragment);
}

async function renderHouseDetails(houseId) {
    const house = await getFromStore('houses', houseId);
    document.getElementById('house-detail-address').textContent = house.address;
    document.getElementById('mailbox-check').checked = house.hasMailbox;
    document.getElementById('notrespass-check').checked = house.noTrespassing;
    document.getElementById('gate-check').checked = house.hasGate || false;
    document.getElementById('not-at-home-check').checked = house.isCurrentlyNH || false;
    document.getElementById('not-interested-check').checked = house.isNotInterested || false;

    const people = await getByIndex('people', 'houseId', houseId);
    const peopleList = document.getElementById('people-list');
    peopleList.innerHTML = '';
    if (people.length > 0) {
        const peopleFragment = document.createDocumentFragment();
        people.forEach(person => peopleFragment.appendChild(createPersonListItem(person)));
        peopleList.appendChild(peopleFragment);
    } else {
        peopleList.innerHTML = '<li class="placeholder">No individuals recorded yet.</li>';
    }

    const visits = (await getByIndex('visits', 'houseId', houseId)).sort((a, b) => new Date(b.date) - new Date(a.date));
    const visitList = document.getElementById('visit-notes-list');
    visitList.innerHTML = '';
    if(visits.length > 0) {
        const visitsFragment = document.createDocumentFragment();
        visits.forEach(visit => visitsFragment.appendChild(createVisitListItem(visit, people)));
        visitList.appendChild(visitsFragment);
    }
}

async function renderRVList() {
    const rvList = document.getElementById('rv-list');
    rvList.innerHTML = '';

    const allPeople = await getAllFromStore('people');
    const rvs = allPeople.filter(p => p.isRV);

    if (rvs.length === 0) {
        rvList.innerHTML = '<li class="placeholder">No individuals are marked as an RV yet.</li>';
        return;
    }
    
    // For efficiency, fetch all data once and create maps for quick lookups
    const allHouses = await getAllFromStore('houses');
    const allStreets = await getAllFromStore('streets');
    const allTerritories = await getAllFromStore('territories');
    const allVisits = await getAllFromStore('visits');
    const housesMap = new Map(allHouses.map(h => [h.id, h]));
    const streetsMap = new Map(allStreets.map(s => [s.id, s]));
    const territoriesMap = new Map(allTerritories.map(t => [t.id, t]));
    
    const fragment = document.createDocumentFragment();
    for (const person of rvs) {
        const house = housesMap.get(person.houseId);
        if (!house) continue;
        const street = streetsMap.get(house.streetId);
        if (!street) continue;
        const territory = territoriesMap.get(street.territoryId);
        if (!territory) continue;

        const lastVisit = allVisits
            .filter(v 