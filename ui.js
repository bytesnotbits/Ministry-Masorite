// Version 1.07.01
// --- FILE: ui.js ---
// This file contains all functions related to UI rendering and DOM manipulation.

const views = document.querySelectorAll('.view');
const territoryList = document.getElementById('territory-list');
const streetList = document.getElementById('street-list');
const houseList = document.getElementById('house-list');
const visitList = document.getElementById('visit-notes-list');

function showView(viewId) {
    views.forEach(view => view.classList.toggle('active', view.id === viewId));
}

async function rerenderHousesAndPreserveScroll(street, activeHouseFilters) {
    const scrollPos = window.scrollY;
    await renderHouses(street, activeHouseFilters);
    setTimeout(() => window.scrollTo(0, scrollPos), 0);
}

async function renderTerritories(territories, territorySort, filter = '') {
    territoryList.innerHTML = '';
    let territoriesToRender = territories;
    if (filter) {
        const searchTerm = filter.toLowerCase();
        territoriesToRender = territories.filter(t => 
            t.description.toLowerCase().includes(searchTerm) || 
            String(t.number || '').toLowerCase().includes(searchTerm)
        );
    }
    territoriesToRender.sort((a, b) => {
        if (territorySort === 'description') return a.description.localeCompare(b.description);
        if (territorySort === 'number') return (a.number || '').localeCompare(b.number || '', undefined, { numeric: true, sensitivity: 'base' });
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (territoriesToRender.length === 0) {
        territoryList.innerHTML = filter
            ? `<li class="placeholder">No territories match "${filter}".</li>`
            : '<li class="placeholder">Click "+ Add New Territory" to begin.</li>';
    } else {
        const streetCounts = new Map();
        const allStreets = await getAllFromStore('streets');
        for (const street of allStreets) {
            streetCounts.set(street.territoryId, (streetCounts.get(street.territoryId) || 0) + 1);
        }
        for (const territory of territoriesToRender) {
            const li = document.createElement('li');
            li.dataset.id = territory.id;
            const numberDisplay = territory.number ? `<strong>#${territory.number}</strong> -` : 'No # -';
            li.innerHTML = `
                <span>${numberDisplay} ${territory.description} (${streetCounts.get(territory.id) || 0} streets)</span>
                <div class="territory-actions">
                    <button class="icon-btn edit-territory-btn" data-id="${territory.id}" title="Edit Territory">✏️</button>
                    <button class="delete-btn" data-id="${territory.id}" data-type="territory">X</button>
                </div>`;
            territoryList.appendChild(li);
        }
    }
    document.getElementById('search-territory-input').classList.toggle('hidden', territories.length <= 10);
}

async function renderStreets(territory) {
    streetList.innerHTML = '';
    document.getElementById('street-list-title').textContent = `Territory #${territory.number}: ${territory.description}`;
    const streets = (await getByIndex('streets', 'territoryId', territory.id)).sort((a,b) => a.name.localeCompare(b.name));
    if (streets.length === 0) {
        streetList.innerHTML = '<li class="placeholder">No streets added to this territory yet.</li>';
    } else {
        const houseCounts = new Map();
        const allHouses = await getAllFromStore('houses');
        for (const house of allHouses) {
            houseCounts.set(house.streetId, (houseCounts.get(house.streetId) || 0) + 1);
        }
        for (const street of streets) {
            const li = document.createElement('li');
            li.dataset.id = street.id;
            li.innerHTML = `
                <span>${street.name} (${houseCounts.get(street.id) || 0} houses)</span>
                <div class="street-actions">
                    <button class="icon-btn edit-street-btn" data-id="${street.id}" title="Edit Street Name">✏️</button>
                    <button class="delete-btn" data-id="${street.id}" data-type="street">X</button>
                </div>`;
            streetList.appendChild(li);
        }
    }
}

async function renderHouses(street, activeHouseFilters) {
    houseList.innerHTML = '';
    document.getElementById('house-list-title').textContent = street.name;
    const allHouses = (await getByIndex('houses', 'streetId', street.id)).sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true, sensitivity: 'base' }));
    
    // We only need to fetch all visits once if the visited filter is active.
    let visitsByHouseId = {};
    if (Object.values(activeHouseFilters).some(v => v) || allHouses.length > 0) {
        const houseVisitPromises = allHouses.map(house => getByIndex('visits', 'houseId', house.id));
        const allVisitsArrays = await Promise.all(houseVisitPromises);
        visitsByHouseId = allHouses.reduce((acc, house, index) => {
            acc[house.id] = allVisitsArrays[index] || [];
            return acc;
        }, {});
    }

    const housesToRender = allHouses.filter(house => {
        if (activeHouseFilters.ni && house.isNotInterested) return false;
        if (activeHouseFilters.nt && house.noTrespassing) return false;
        if (activeHouseFilters.gated && house.hasGate) return false;
        // --- BUG FIX ---
        // The old logic was too complex. A house is considered "visited"
        // for filtering purposes if it is not currently marked as "Not at Home".
        if (activeHouseFilters.visited && !house.isCurrentlyNH) {
            return false;
        }
        return true;
    });

    if (housesToRender.length === 0) {
        const hasActiveFilters = Object.values(activeHouseFilters).some(v => v);
        if (hasActiveFilters) houseList.innerHTML = '<li class="placeholder">No houses match the current filters.</li>';
        else if (allHouses.length === 0) houseList.innerHTML = '<li class="placeholder">No houses added to this street yet.</li>';
        else houseList.innerHTML = '<li class="placeholder">All houses are currently hidden by filters.</li>';
    } else {
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
            li.className = `house-card ${house.isNotInterested ? 'is-ni' : ''}`;
            li.dataset.id = house.id;
            const niBadge = house.isNotInterested ? '<span class="ni-badge">NI</span>' : '';
            const hasSentLetter = visits.some(v => v.visitType === 'letter');
            li.innerHTML = `
                <div class="card-header">
                    <div class="card-title"><strong>${house.address}</strong> ${niBadge}</div>
                    <div class="card-controls">
                        <div class="icons">${iconsHTML}</div>
                        <button class="delete-btn" data-id="${house.id}" data-type="house">X</button>
                    </div>
                </div>
                <div class="house-card-details">${lastActivityDate}<br>Attempts: <strong>${visitCount}</strong> | ${personMet}</div>
                <div class="card-actions">
                    <button class="log-nh-btn" data-id="${house.id}">Log 'NH'</button>
                    <button class="sent-letter-btn ${hasSentLetter ? 'letter-sent' : ''}" data-id="${house.id}">${hasSentLetter ? 'Letter Sent' : 'Send Letter'}</button>
                    <button class="phone-call-btn" data-id="${house.id}">Phone Call</button>
                </div>`;
            houseList.appendChild(li);
        }
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
        people.forEach(person => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="person-name">${person.name}${person.isRV ? '<span class="rv-badge">RV</span>' : ''}</span>
                <div class="person-actions">
                    <button class="icon-btn edit-person-btn" data-id="${person.id}" title="Edit Name">✏️</button>
                    <button class="icon-btn delete-person-btn" data-id="${person.id}" title="Delete Person">X</button>
                </div>`;
            peopleList.appendChild(li);
        });
    } else {
        peopleList.innerHTML = '<li class="placeholder">No individuals recorded yet.</li>';
    }
    visitList.innerHTML = '';
    const visits = (await getByIndex('visits', 'houseId', houseId)).sort((a, b) => new Date(b.date) - new Date(a.date));
    visits.forEach(visit => {
        const li = document.createElement('li');
        let personInfo = visit.personName ? `Spoke with: <strong>${visit.personName}</strong><br>` : '';
        if (visit.personId && !visit.personName) { // Fallback for older data
            const person = people.find(p => p.id === visit.personId);
            if (person) personInfo = `Spoke with: <strong>${person.name}</strong><br>`;
        }
        const visitDate = new Date(visit.date);
        const formattedDateTime = visitDate.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        li.innerHTML = `
            <div>
                <span>${formattedDateTime}</span>
                <span class="edit-date-btn" data-id="${visit.id}">✏️ Change</span>
            </div>
            ${personInfo}
            <p>${visit.notes}</p>
            <button class="delete-btn" data-id="${visit.id}" data-type="visit">X</button>`;
        visitList.appendChild(li);
    });
}

async function renderRVList() {
    const rvList = document.getElementById('rv-list');
    rvList.innerHTML = '';
    const rvs = (await getAllFromStore('people')).filter(p => p.isRV);
    if (rvs.length === 0) {
        rvList.innerHTML = '<li class="placeholder">No individuals are marked as an RV yet.</li>';
    } else {
        const allHouses = new Map((await getAllFromStore('houses')).map(h => [h.id, h]));
        const allStreets = new Map((await getAllFromStore('streets')).map(s => [s.id, s]));
        const allTerritories = new Map((await getAllFromStore('territories')).map(t => [t.id, t]));
        for (const person of rvs) {
            const house = allHouses.get(person.houseId);
            if (!house) continue;
            const street = allStreets.get(house.streetId);
            if (!street) continue;
            const territory = allTerritories.get(street.territoryId);
            if (!territory) continue;
            const personVisits = (await getByIndex('visits', 'houseId', house.id)).filter(v => v.personId === person.id).sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastVisitDate = personVisits.length > 0 ? new Date(personVisits[0].date).toLocaleDateString() : 'No visits';
            const li = document.createElement('li');
            li.dataset.houseId = house.id;
            li.innerHTML = `
                <strong>${person.name}</strong>
                <div class="rv-details">
                    Last Visited: <strong>${lastVisitDate}</strong><br>
                    Territory: #${territory.number} (${street.name})<br>
                    Address: ${house.address}
                </div>`;
            rvList.appendChild(li);
        }
    }
}

const noteModal = document.getElementById('note-modal');
const territoryModal = document.getElementById('territory-modal');
const streetModal = document.getElementById('street-modal');
const houseModal = document.getElementById('house-modal');

function showNoteModal(title = 'Add Visit Note') {
    document.querySelector('#note-modal h3').textContent = title;
    noteModal.classList.remove('hidden');
}

function hideNoteModal() {
    noteModal.classList.add('hidden');
    document.getElementById('modal-visit-notes').value = '';
    document.getElementById('modal-person-input').value = '';
    document.getElementById('modal-remove-nh-check').checked = false;
    document.getElementById('modal-is-rv-check').checked = false;
    document.getElementById('modal-rv-toggle').style.display = 'none';
    document.getElementById('modal-suggestions-list').classList.add('hidden');
}

function showTerritoryModal(territory = null) {
    if (territory) {
        territoryModal.querySelector('h3').textContent = 'Edit Territory';
        document.getElementById('modal-territory-number').value = territory.number;
        document.getElementById('modal-territory-description').value = territory.description;
        document.getElementById('modal-territory-save-new-btn').classList.add('hidden');
    } else {
        territoryModal.querySelector('h3').textContent = 'Add New Territory';
        document.getElementById('modal-territory-number').value = '';
        document.getElementById('modal-territory-description').value = '';
        document.getElementById('modal-territory-save-new-btn').classList.remove('hidden');
    }
    territoryModal.classList.remove('hidden');
    document.getElementById('modal-territory-number').focus();
}

function hideTerritoryModal() {
    territoryModal.classList.add('hidden');
}

function showStreetModal(street = null) {
    if (street) {
        streetModal.querySelector('h3').textContent = 'Edit Street';
        document.getElementById('modal-street-name').value = street.name;
        document.getElementById('modal-street-save-new-btn').classList.add('hidden');
    } else {
        streetModal.querySelector('h3').textContent = 'Add New Street';
        document.getElementById('modal-street-name').value = '';
        document.getElementById('modal-street-save-new-btn').classList.remove('hidden');
    }
    streetModal.classList.remove('hidden');
    document.getElementById('modal-street-name').focus();
}

function hideStreetModal() {
    streetModal.classList.add('hidden');
}

function showHouseModal() {
    document.getElementById('modal-house-number').value = '';
    document.getElementById('modal-house-notes').value = '';
    const toggles = document.querySelector('#house-modal .modal-toggles');
    toggles.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    toggles.querySelector('[data-prop="isCurrentlyNH"]').classList.add('active');
    houseModal.classList.remove('hidden');
    document.getElementById('modal-house-number').focus();
}

function hideHouseModal() {
    houseModal.classList.add('hidden');
} 