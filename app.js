const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', async () => {
    // --- STATE MANAGEMENT ---
    let currentView = 'territory-list-view';
    let currentTerritoryId = null;
    let currentHouseId = null;
    let territorySort = 'name';
    let selectedPersonId = null;
    let currentEditTerritoryId = null;
    let territoryListScrollPosition = 0;
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

    // --- NEW HELPER FUNCTION ---
    // This function wraps the render logic with scroll position preservation.
    async function rerenderHousesAndPreserveScroll() {
        const scrollPos = window.scrollY;
        await renderHouses(currentTerritoryId);
        // Use setTimeout to ensure the DOM has been painted before scrolling.
        setTimeout(() => window.scrollTo(0, scrollPos), 0);
    }

    async function renderTerritories(filter = '') {
        territoryList.innerHTML = '';
        let territories = await getAllFromStore('territories');

        if (filter) {
            const searchTerm = filter.toLowerCase();
            territories = territories.filter(territory => {
                const nameMatch = territory.name.toLowerCase().includes(searchTerm);
                const numberMatch = String(territory.number || '').toLowerCase().includes(searchTerm);
                return nameMatch || numberMatch;
            });
        }

        territories.sort((a, b) => {
            if (territorySort === 'name') {
                return a.name.localeCompare(b.name);
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
                const houses = await getByIndex('houses', 'territoryId', territory.id);
                const li = document.createElement('li');
                li.dataset.id = territory.id;
                const numberDisplay = territory.number ? `<strong>#${territory.number}</strong> -` : 'No # -';

                li.innerHTML = `
                    <span>${numberDisplay} ${territory.name} (${houses.length} houses)</span>
                    <div class="territory-actions">
                        <button class="icon-btn edit-territory-btn" data-id="${territory.id}" title="Edit Territory">✏️</button>
                        <button class="delete-btn" data-id="${territory.id}" data-type="territory">X</button>
                    </div>
                `;
                territoryList.appendChild(li);
            }
        }

        const searchInput = document.getElementById('search-territory-input');
        const totalTerritories = (await getAllFromStore('territories')).length;
        const SEARCH_VISIBILITY_THRESHOLD = 10; 
        const shouldShowSearch = totalTerritories > SEARCH_VISIBILITY_THRESHOLD;
        searchInput.classList.toggle('hidden', !shouldShowSearch);
    }
    
    async function renderHouses(territoryId) {
        houseList.innerHTML = '';
        const territory = await getFromStore('territories', territoryId);
        document.getElementById('house-list-title').textContent = territory.name;

        const allHouses = await getByIndex('houses', 'territoryId', territoryId);
        
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
                // MODIFIED: Only hide if an actual visit attempt was made
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
            // MODIFIED: Only count records marked as a visit attempt.
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

    async function renderRVList() {
        const rvList = document.getElementById('rv-list');
        rvList.innerHTML = '';

        const allPeople = await getAllFromStore('people');
        const allHouses = await getAllFromStore('houses');
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

            const territory = allTerritories.find(t => t.id === house.territoryId);
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
                    Territory: ${territory.name} (#${territory.number})<br>
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
        const suggestionsList = document.getElementById('modal-suggestions-list');
        const rvToggle = document.getElementById('modal-rv-toggle');
        const isRvCheck = document.getElementById('modal-is-rv-check');
        const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');
    
        const territoryModal = document.getElementById('territory-modal');
        const modalTerritoryNumber = document.getElementById('modal-territory-number');
        const modalTerritoryName = document.getElementById('modal-territory-name');
    
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

        personInput.addEventListener('focus', populateAndShowSuggestions);
        personInput.addEventListener('input', () => {
            selectedPersonId = null; 
            rvToggle.style.display = 'block';
            populateAndShowSuggestions();
        });

        document.addEventListener('click', (e) => {
            if (!personInput.contains(e.target) && !suggestionsList.contains(e.target)) {
                suggestionsList.classList.add('hidden');
            }
        });

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
                modalTerritoryName.value = territoryToEdit.name;
                currentEditTerritoryId = territoryToEdit.id;
                saveAndNewBtn.classList.add('hidden');
            } else {
                modalTitle.textContent = 'Add New Territory';
                modalTerritoryNumber.value = '';
                modalTerritoryName.value = '';
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
    
        async function handleSaveTerritory() {
            const number = modalTerritoryNumber.value.trim();
            const name = modalTerritoryName.value.trim();

            if (!number || !name) {
                alert('Please fill out both the territory number and name.');
                return false; 
            }

            await addToStore('territories', {
                name,
                number,
                createdAt: new Date().toISOString()
            });
            return true;
        }
    
        async function handleSaveHouse() {
            const houseNumber = modalHouseNumber.value.trim();
            if (!houseNumber) {
                alert('Please enter a house number.');
                return false;
            }
    
            const territory = await getFromStore('territories', currentTerritoryId);
            const fullAddress = `${houseNumber} ${territory.name}`;
            const initialNotes = modalHouseNotes.value.trim();
    
            const newHouse = {
                territoryId: currentTerritoryId,
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

            const rvLi = target.closest('#rv-list li');
            if (rvLi && !rvLi.classList.contains('placeholder')) {
                currentHouseId = Number(rvLi.dataset.houseId);
                const house = await getFromStore('houses', currentHouseId);
                if (house) {
                    currentTerritoryId = house.territoryId;
                    await renderHouseDetails(currentHouseId);
                    showView('house-detail-view');
                }
                return;
            }

            const editTerritoryBtn = target.closest('.edit-territory-btn');
            if (editTerritoryBtn) {
                const territoryId = Number(editTerritoryBtn.dataset.id);
                const territory = await getFromStore('territories', territoryId);
                showTerritoryModal(territory);
                return; 
            }
    
            if (target.classList.contains('edit-person-btn')) {
                const personId = Number(target.dataset.id);
                const person = await getFromStore('people', personId);
                const newName = prompt('Enter the new name:', person.name);
                if (newName) {
                    person.name = newName;
                    await updateInStore('people', person);
                    await renderHouseDetails(currentHouseId);
                }
            }

            if (target.classList.contains('delete-person-btn')) {
                const personId = Number(target.dataset.id);
                if (confirm('Are you sure you want to delete this person? This will not delete their past visit notes.')) {
                    await deleteFromStore('people', personId);
                    await renderHouseDetails(currentHouseId);
                }
            }
            
            if (target.classList.contains('log-nh-btn')) {
                e.stopPropagation();
                const houseId = Number(target.dataset.id);
                if (!houseId) return;
                // Mark as a visit attempt
                await addToStore('visits', {
                    houseId: houseId, date: new Date().toISOString(),
                    notes: 'Not at home.', personName: '', isNotAtHome: true,
                    isVisitAttempt: true
                });
                const house = await getFromStore('houses', houseId);
                house.isCurrentlyNH = true;
                await updateInStore('houses', house);
                await rerenderHousesAndPreserveScroll();
                return;
            }

            if (target.classList.contains('sent-letter-btn')) {
                e.stopPropagation();
                const houseId = Number(target.dataset.id);
                const isLetterSent = target.classList.contains('letter-sent');

                if (isLetterSent) {
                    if (confirm("This will remove the 'Letter Sent' visit record and reset the house to 'Not at Home'. Do you want to proceed?")) {
                        const visits = await getByIndex('visits', 'houseId', houseId);
                        const letterVisit = visits
                            .filter(v => v.visitType === 'letter')
                            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

                        if (letterVisit) {
                            await deleteFromStore('visits', letterVisit.id);
                        }

                        const house = await getFromStore('houses', houseId);
                        house.isCurrentlyNH = true;
                        await updateInStore('houses', house);
                        await rerenderHousesAndPreserveScroll();
                    }
                } else {
                    // Mark as a visit attempt
                    await addToStore('visits', {
                        houseId: houseId,
                        date: new Date().toISOString(),
                        notes: 'Letter sent.',
                        isNotAtHome: false,
                        visitType: 'letter',
                        isVisitAttempt: true
                    });

                    const house = await getFromStore('houses', houseId);
                    house.isCurrentlyNH = false;
                    await updateInStore('houses', house);
                    await rerenderHousesAndPreserveScroll();
                }
                return;
            }

            if (target.classList.contains('phone-call-btn')) {
                e.stopPropagation();
                const houseId = Number(target.dataset.id);
                if (!houseId) return;
                currentHouseId = houseId;
                houseListScrollPosition = window.scrollY; // Save scroll position BEFORE modal opens
                showNoteModal('Log Phone Call');
                return;
            }
    
            const territoryLi = target.closest('#territory-list li');
            if (territoryLi && !target.classList.contains('delete-btn') && !territoryLi.classList.contains('placeholder')) {
                territoryListScrollPosition = window.scrollY;
                currentTerritoryId = Number(territoryLi.dataset.id);
                activeHouseFilters = { visited: false, ni: false, nt: false, gated: false };
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                
                await renderHouses(currentTerritoryId);
                showView('house-list-view');
                return;
            }
    
            const houseLi = target.closest('#house-list li');
            if (houseLi && !target.classList.contains('delete-btn') && !houseLi.classList.contains('placeholder')) {
                houseListScrollPosition = window.scrollY;
                currentHouseId = Number(houseLi.dataset.id);
                await renderHouseDetails(currentHouseId);
                showView('house-detail-view');
                return;
            }
    
            if (target.classList.contains('back-btn')) {
                const targetView = target.dataset.target;

                if (targetView === 'house-list-view') {
                    await renderHouses(currentTerritoryId);
                    showView(targetView);
                    setTimeout(() => window.scrollTo(0, houseListScrollPosition), 0);
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
    
            if (target.classList.contains('delete-btn')) {
                const id = Number(target.dataset.id);
                const type = target.dataset.type;
                if (type === 'territory' && confirm('Are you sure you want to delete this entire territory and all its houses? This cannot be undone.')) {
                    const houses = await getByIndex('houses', 'territoryId', id);
                    for (const house of houses) {
                        const visits = await getByIndex('visits', 'houseId', house.id);
                        for (const visit of visits) await deleteFromStore('visits', visit.id);
                        const people = await getByIndex('people', 'houseId', house.id);
                        for (const person of people) await deleteFromStore('people', person.id);
                        await deleteFromStore('houses', house.id);
                    }
                    await deleteFromStore('territories', id);
                    await renderTerritories();
                } else if (type === 'house' && confirm('Are you sure you want to delete this house and all its visit history?')) {
                    const visits = await getByIndex('visits', 'houseId', id);
                    for (const visit of visits) await deleteFromStore('visits', visit.id);
                    const people = await getByIndex('people', 'houseId', id);
                    for (const person of people) await deleteFromStore('people', person.id);
                    await deleteFromStore('houses', id);
                    await rerenderHousesAndPreserveScroll();
                    return;
                } else if (type === 'visit' && confirm('Delete this visit note?')) {
                    await deleteFromStore('visits', id);
                    await renderHouseDetails(currentHouseId);
                }
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

        const searchInput = document.getElementById('search-territory-input');
        searchInput.addEventListener('input', (e) => {
            renderTerritories(e.target.value.trim());
        });
    
        document.getElementById('add-territory-btn').addEventListener('click', () => showTerritoryModal());
        
        document.getElementById('modal-territory-save-btn').addEventListener('click', async () => {
            const number = modalTerritoryNumber.value.trim();
            const name = modalTerritoryName.value.trim();

            if (!number || !name) {
                alert('Please fill out both the territory number and name.');
                return;
            }

            if (currentEditTerritoryId) {
                const territory = await getFromStore('territories', currentEditTerritoryId);
                territory.number = number;
                territory.name = name;
                await updateInStore('territories', territory);
            } else {
                await addToStore('territories', {
                    name,
                    number,
                    createdAt: new Date().toISOString()
                });
            }

            hideTerritoryModal();
            await renderTerritories();
        });
        document.getElementById('modal-territory-save-new-btn').addEventListener('click', async () => {
            if (await handleSaveTerritory()) {
                modalTerritoryName.value = '';
                modalTerritoryName.focus();
            }
        });
        document.getElementById('modal-territory-cancel-btn').addEventListener('click', hideTerritoryModal);
        territoryModal.querySelector('.close-modal-btn').addEventListener('click', hideTerritoryModal);
    
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

        document.getElementById('data-menu-toggle-btn').addEventListener('click', () => {
            document.getElementById('territory-data-management').classList.toggle('hidden');
        });

        document.getElementById('export-menu-toggle-btn').addEventListener('click', () => {
            document.getElementById('house-data-management').classList.toggle('hidden');
        });

        document.getElementById('about-menu-toggle-btn').addEventListener('click', () => {
            document.getElementById('about-section').classList.toggle('hidden');
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
        document.getElementById('export-mscribe-btn').addEventListener('click', handleTerritoryBackup);
        document.getElementById('export-csv-btn').addEventListener('click', handleExportCSV);
        document.getElementById('export-pdf-btn').addEventListener('click', handleExportPDF);
        document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
        document.getElementById('restore-file-input').addEventListener('change', handleRestore);
    }

    // --- BACKUP & RESTORE FUNCTIONS ---
    async function handleTerritoryBackup() {
        const territory = await getFromStore('territories', currentTerritoryId);
        const houses = await getByIndex('houses', 'territoryId', currentTerritoryId);
        let visits = [];
        let people = [];
        for (const house of houses) {
            const houseVisits = await getByIndex('visits', 'houseId', house.id);
            visits.push(...houseVisits);
            const housePeople = await getByIndex('people', 'houseId', house.id);
            people.push(...housePeople);
        }

        const backupData = {
            type: 'territory_backup',
            territories: [territory],
            houses,
            visits,
            people
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const filename = `${territory.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.mscribe`;

        if (navigator.share && navigator.canShare) {
            const file = new File([blob], filename, { type: 'application/json' });
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ title: 'Territory Backup', text: `Ministry Scribe backup for ${territory.name}`, files: [file] });
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn('Web Share API failed, falling back to download.', err);
                }
            }
        }

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    async function handleFullBackup() {
        try {
            const backupData = {
                type: 'full_backup',
                territories: await getAllFromStore('territories'),
                houses: await getAllFromStore('houses'),
                visits: await getAllFromStore('visits'),
                people: await getAllFromStore('people')
            };

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const filename = `ministry_scribe_full_backup_${new Date().toISOString().split('T')[0]}.mscribe`;

            if (navigator.share && navigator.canShare) {
                const file = new File([blob], filename, { type: 'application/json' });
                if (navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ title: 'Full Ministry Scribe Backup', text: 'Full database backup for Ministry Scribe.', files: [file] });
                        return;
                    } catch (err) {
                        if (err.name === 'AbortError') return;
                        console.warn('Web Share API failed, falling back to download.', err);
                    }
                }
            }
            
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

        } catch (error) {
            console.error("Full backup failed:", error);
            alert("Could not perform the full backup.");
        }
    }

    async function handleRestore(event) {
        const file = event.target.files[0];
        if (!file) return;
    
        const reader = new FileReader();
        reader.onload = async (e) => {
            let data;
            try {
                data = JSON.parse(e.target.result);
            } catch (err) {
                alert("Restore failed. The file is not a valid JSON file. Please ensure it was downloaded correctly from your cloud service using the 'Download' button and not edited in a word processor.");
                console.error("JSON Parsing Error:", err);
                event.target.value = '';
                return;
            }

            try {
                if (data && data.type === 'full_backup') {
                    if (confirm('This is a FULL backup. Restoring will ERASE all current data. Are you sure?')) {
                        await clearAllStores();
                        if (data.territories) for (const item of data.territories) await addToStore('territories', item);
                        if (data.houses) for (const item of data.houses) await addToStore('houses', item);
                        if (data.visits) for (const item of data.visits) await addToStore('visits', item);
                        if (data.people) for (const item of data.people) await addToStore('people', item);
                        alert('Full restore successful!');
                        await renderTerritories();
                        showView('territory-list-view');
                    }
                } else if (data && data.type === 'territory_backup') {
                    const backupTerritory = data.territories[0];
                    const territoryName = backupTerritory.name;
    
                    if (confirm(`This will import and overwrite the territory "${territoryName}". Continue?`)) {
                        const allTerritories = await getAllFromStore('territories');
                        const existingTerritory = allTerritories.find(t => t.name === territoryName);
    
                        let targetTerritoryId;
                        if (existingTerritory) {
                            targetTerritoryId = existingTerritory.id;
                            const oldHouses = await getByIndex('houses', 'territoryId', targetTerritoryId);
                            for (const house of oldHouses) {
                                const visits = await getByIndex('visits', 'houseId', house.id);
                                for (const visit of visits) await deleteFromStore('visits', visit.id);
                                const people = await getByIndex('people', 'houseId', house.id);
                                for (const person of people) await deleteFromStore('people', person.id);
                                await deleteFromStore('houses', house.id);
                            }
                        } else {
                            targetTerritoryId = await addToStore('territories', { name: backupTerritory.name, number: backupTerritory.number, createdAt: backupTerritory.createdAt });
                        }
    
                        for (const house of data.houses || []) {
                            const oldHouseId = house.id;
                            delete house.id;
                            house.territoryId = targetTerritoryId;
                            const newHouseId = await addToStore('houses', house);

                            for (const person of (data.people || []).filter(p => p.houseId === oldHouseId)) {
                                const oldPersonId = person.id;
                                delete person.id;
                                person.houseId = newHouseId;
                                const newPersonId = await addToStore('people', person);

                                for (const visit of (data.visits || []).filter(v => v.personId === oldPersonId)) {
                                    delete visit.id;
                                    visit.houseId = newHouseId;
                                    visit.personId = newPersonId;
                                    await addToStore('visits', visit);
                                }
                            }
                            for (const visit of (data.visits || []).filter(v => v.houseId === oldHouseId && !v.personId)) {
                                delete visit.id;
                                visit.houseId = newHouseId;
                                await addToStore('visits', visit);
                            }
                        }
                        
                        alert(`Territory "${territoryName}" imported successfully!`);
                        await renderTerritories();
                        showView('territory-list-view');
                    }
                } else {
                    alert('Restore failed. The file is not a recognized Ministry Scribe backup file.');
                }
            } catch (err) {
                alert('Restore failed due to an unexpected error. See the console for details.');
                console.error("Restore Process Error:", err);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    
    async function handleExportCSV() {
        const territory = await getFromStore('territories', currentTerritoryId);
        const houses = await getByIndex('houses', 'territoryId', currentTerritoryId);
        
        let csvContent = "Address,Status,Mailbox,No Trespassing,Gate,Last Visit Date,Last Visit Note,Person Met\n";
        
        for (const house of houses) {
            const visits = (await getByIndex('visits', 'houseId', house.id)).sort((a,b) => new Date(b.date) - new Date(a.date));
            const peopleAtHouse = await getByIndex('people', 'houseId', house.id);
            const lastVisit = visits[0];
            
            let personName = '';
            if (lastVisit) {
                if (lastVisit.personId) {
                    const person = peopleAtHouse.find(p => p.id === lastVisit.personId);
                    if (person) personName = person.name;
                } else if (lastVisit.personName) {
                    personName = lastVisit.personName;
                }
            }

            const cleanNote = lastVisit ? `"${lastVisit.notes.replace(/"/g, '""')}"` : 'N/A';
            const status = house.isCurrentlyNH ? "Not at Home" : "OK";
            
            csvContent += `"${house.address}",${status},${house.hasMailbox},${house.noTrespassing},${house.hasGate},${lastVisit ? new Date(lastVisit.date).toLocaleDateString() : 'N/A'},${cleanNote},"${personName}"\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${territory.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function handleExportPDF() {
        const doc = new jsPDF();
        const territory = await getFromStore('territories', currentTerritoryId);
        const houses = await getByIndex('houses', 'territoryId', currentTerritoryId);
        
        doc.setFontSize(18);
        doc.text(`Territory Report: ${territory.name}`, 14, 22);
        
        let y = 30;

        for (const house of houses) {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setLineWidth(0.5);
            doc.line(14, y, 196, y);
            y += 7;

            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            const status = house.isCurrentlyNH ? " (Status: Not at Home)" : "";
            doc.text(`Address: ${house.address}${status}`, 14, y);
            y += 7;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
            doc.text(`Mailbox: ${house.hasMailbox ? 'Yes' : 'No'} | No Trespassing: ${house.noTrespassing ? 'Yes' : 'No'}`, 16, y);
            y += 7;

            const visits = (await getByIndex('visits', 'houseId', house.id)).sort((a, b) => new Date(b.date) - new Date(a.date));
            const peopleAtHouse = await getByIndex('people', 'houseId', house.id);

            if (visits.length > 0) {
                 doc.setFont(undefined, 'bold');
                 doc.text("Visit History:", 16, y);
                 y += 5;
                 doc.setFont(undefined, 'normal');
                for(const visit of visits) {
                     if (y > 280) { doc.addPage(); y = 20; }

                     let personName = '';
                     if (visit.personId) {
                         const person = peopleAtHouse.find(p => p.id === visit.personId);
                         if (person) personName = person.name;
                     } else if (visit.personName) {
                         personName = visit.personName;
                     }
                     const personInfo = personName ? `(Spoke with ${personName})` : '';

                     const visitText = `${new Date(visit.date).toLocaleDateString()} ${personInfo}: ${visit.notes}`;
                     const splitText = doc.splitTextToSize(visitText, 170);
                     doc.text(splitText, 18, y);
                     y += (splitText.length * 4) + 2;
                }
            } else {
                 doc.text("No visits recorded.", 16, y);
                 y += 5;
            }
             y += 3;
        }

        doc.save(`${territory.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.pdf`);
    }

});