// --- NEW FILE: events.js ---
// This file contains all event listeners for the application.

function initializeEventListeners(state) {
    // DOM Element getters
    const personInput = document.getElementById('modal-person-input');
    const suggestionsList = document.getElementById('modal-suggestions-list');
    const rvToggle = document.getElementById('modal-rv-toggle');
    const isRvCheck = document.getElementById('modal-is-rv-check');
    const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');
    const modalVisitNotes = document.getElementById('modal-visit-notes');
    const territoryModal = document.getElementById('territory-modal');
    const modalTerritoryNumber = document.getElementById('modal-territory-number');
    const modalTerritoryDescription = document.getElementById('modal-territory-description');
    const streetModal = document.getElementById('street-modal');
    const modalStreetName = document.getElementById('modal-street-name');
    const houseModal = document.getElementById('house-modal');
    const modalHouseNumber = document.getElementById('modal-house-number');
    const modalHouseNotes = document.getElementById('modal-house-notes');
    const houseModalToggles = document.querySelector('#house-modal .modal-toggles');

    // --- Suggestion Box Logic ---
    async function populateAndShowSuggestions() {
        suggestionsList.innerHTML = '';
        const allPeople = await getByIndex('people', 'houseId', state.currentHouseId);
        
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
            state.selectedPersonId = null; 
        } else {
            state.selectedPersonId = Number(personId);
            personInput.value = item.dataset.name;
            rvToggle.style.display = 'none';
        }
        suggestionsList.classList.add('hidden');
    });

    document.getElementById('note-modal').querySelector('.close-modal-btn').addEventListener('click', hideNoteModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', hideNoteModal);
    
    // --- DATA SAVING LOGIC (To be moved to api.js later) ---
    async function handleSaveTerritory() {
        const number = modalTerritoryNumber.value.trim();
        const description = modalTerritoryDescription.value.trim();
        if (!number || !description) {
            alert('Please fill out both territory number and description.');
            return false;
        }
        await addToStore('territories', {
            number,
            description,
            createdAt: new Date().toISOString()
        });
        const allTerritories = await getAllFromStore('territories');
        await renderTerritories(allTerritories, state.territorySort);
        return true;
    }

    async function handleSaveStreet() {
        const name = modalStreetName.value.trim();
        if (!name) {
            alert('Please enter a street name.');
            return false;
        }
        await addToStore('streets', { territoryId: state.currentTerritoryId, name });
        await renderStreets(state.currentTerritoryId);
        return true;
    }

    async function handleSaveHouse() {
        const houseNumber = modalHouseNumber.value.trim();
        if (!houseNumber) {
            alert('Please enter a house number.');
            return false;
        }
        const street = await getFromStore('streets', state.currentStreetId);
        const fullAddress = `${houseNumber} ${street.name}`;
        const initialNotes = modalHouseNotes.value.trim();

        const newHouse = {
            streetId: state.currentStreetId,
            address: fullAddress,
            hasMailbox: document.querySelector('.toggle-btn[data-prop="hasMailbox"]').classList.contains('active'),
            noTrespassing: document.querySelector('.toggle-btn[data-prop="noTrespassing"]').classList.contains('active'),
            isCurrentlyNH: document.querySelector('.toggle-btn[data-prop="isCurrentlyNH"]').classList.contains('active'),
            hasGate: document.querySelector('.toggle-btn[data-prop="hasGate"]').classList.contains('active')
        };

        const newHouseId = await addToStore('houses', newHouse);

        await addToStore('visits', {
            houseId: newHouseId,
            date: new Date().toISOString(),
            notes: 'House record created.',
            isNotAtHome: false,
            isVisitAttempt: false
        });

        if (initialNotes) {
            await addToStore('visits', {
                houseId: newHouseId,
                date: new Date().toISOString(),
                notes: initialNotes,
                isNotAtHome: false,
                isVisitAttempt: false
            });
        }

        await rerenderHousesAndPreserveScroll(state.currentStreetId, state.activeHouseFilters);
        return true;
    }

    // --- GLOBAL CLICK LISTENER ---
    document.addEventListener('click', async (e) => {
        const target = e.target;

        // --- NAVIGATION ---
        const territoryLi = target.closest('#territory-list li:not(.placeholder)');
        if (territoryLi && !target.closest('.delete-btn, .edit-territory-btn')) {
            state.territoryListScrollPosition = window.scrollY;
            state.currentTerritoryId = Number(territoryLi.dataset.id);
            await renderStreets(state.currentTerritoryId);
            showView('street-list-view');
            state.currentView = 'street-list-view';
            return;
        }

        const streetLi = target.closest('#street-list li:not(.placeholder)');
        if (streetLi && !target.closest('.delete-btn, .edit-street-btn')) {
            state.streetListScrollPosition = window.scrollY;
            state.currentStreetId = Number(streetLi.dataset.id);
            state.activeHouseFilters = { visited: false, ni: false, nt: false, gated: false };
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            await renderHouses(state.currentStreetId, state.activeHouseFilters);
            showView('house-list-view');
            state.currentView = 'house-list-view';
            return;
        }

        const houseLi = target.closest('#house-list li:not(.placeholder)');
        if (houseLi && !target.closest('.delete-btn') && !target.closest('.card-actions')) {
            state.houseListScrollPosition = window.scrollY;
            state.currentHouseId = Number(houseLi.dataset.id);
            await renderHouseDetails(state.currentHouseId);
            showView('house-detail-view');
            state.currentView = 'house-detail-view';
            return;
        }

        const rvLi = target.closest('#rv-list li');
        if (rvLi && !rvLi.classList.contains('placeholder')) {
            state.currentHouseId = Number(rvLi.dataset.houseId);
            const house = await getFromStore('houses', state.currentHouseId);
            if (house) {
                const street = await getFromStore('streets', house.streetId);
                state.currentStreetId = street.id;
                state.currentTerritoryId = street.territoryId;
                await renderHouseDetails(state.currentHouseId);
                showView('house-detail-view');
                state.currentView = 'house-detail-view';
            }
            return;
        }
        
        // --- BACK BUTTONS ---
        if (target.classList.contains('back-btn')) {
            const targetView = target.dataset.target;
            if (targetView === 'house-list-view') {
                await renderHouses(state.currentStreetId, state.activeHouseFilters);
                showView(targetView);
                setTimeout(() => window.scrollTo(0, state.houseListScrollPosition), 0);
            } else if (targetView === 'street-list-view') {
                await renderStreets(state.currentTerritoryId);
                showView(targetView);
                setTimeout(() => window.scrollTo(0, state.streetListScrollPosition), 0);
            } else if (targetView === 'territory-list-view') {
                showView(targetView);
                setTimeout(() => window.scrollTo(0, state.territoryListScrollPosition), 0);
            } else {
                showView(targetView);
            }
            state.currentView = targetView;
            return;
        }

        // --- EDIT BUTTONS ---
        const editTerritoryBtn = target.closest('.edit-territory-btn');
        if (editTerritoryBtn) {
            state.currentEditTerritoryId = Number(editTerritoryBtn.dataset.id);
            const territory = await getFromStore('territories', state.currentEditTerritoryId);
            showTerritoryModal(territory);
            return; 
        }

        const editStreetBtn = target.closest('.edit-street-btn');
        if (editStreetBtn) {
            state.currentEditStreetId = Number(editStreetBtn.dataset.id);
            const street = await getFromStore('streets', state.currentEditStreetId);
            showStreetModal(street);
            return;
        }

        // --- SORT & DELETE ---
        if (target.classList.contains('sort-btn')) {
            state.territorySort = target.dataset.sort;
            const allTerritories = await getAllFromStore('territories');
            await renderTerritories(allTerritories, state.territorySort);
        }

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
                const allTerritories = await getAllFromStore('territories');
                await renderTerritories(allTerritories, state.territorySort);

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
                await renderStreets(state.currentTerritoryId);

            } else if (type === 'house' && confirm('Delete this house and its history?')) {
                const visits = await getByIndex('visits', 'houseId', id);
                for (const visit of visits) await deleteFromStore('visits', visit.id);
                const people = await getByIndex('people', 'houseId', id);
                for (const person of people) await deleteFromStore('people', person.id);
                await deleteFromStore('houses', id);
                await rerenderHousesAndPreserveScroll(state.currentStreetId, state.activeHouseFilters);

            } else if (type === 'visit' && confirm('Delete this visit note?')) {
                await deleteFromStore('visits', id);
                await renderHouseDetails(state.currentHouseId);
            }
        }

        // --- MENU TOGGLES ---
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

        // --- EDIT VISIT DATE ---
        if (target.classList.contains('edit-date-btn')) {
            const visitId = Number(target.dataset.id);
            const visit = await getFromStore('visits', visitId);
            const d = new Date(visit.date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const currentDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            const newDateTimeStr = prompt('Enter new date and time (YYYY-MM-DDTHH:MM):', currentDateTime);

            if (newDateTimeStr) {
                const newDate = new Date(newDateTimeStr);
                if (!isNaN(newDate)) {
                    visit.date = newDate.toISOString();
                    await updateInStore('visits', visit);
                    await renderHouseDetails(state.currentHouseId);
                } else {
                    alert('Invalid date/time format. Please use YYYY-MM-DDTHH:MM.');
                }
            }
        }
    });

    // --- OTHER EVENT LISTENERS ---
    personInput.addEventListener('focus', populateAndShowSuggestions);
    personInput.addEventListener('input', () => {
        state.selectedPersonId = null; 
        rvToggle.style.display = 'block';
        populateAndShowSuggestions();
    });

    document.getElementById('search-territory-input').addEventListener('input', async (e) => {
        const filter = e.target.value.trim();
        const allTerritories = await getAllFromStore('territories');
        await renderTerritories(allTerritories, state.territorySort, filter);
    });

    // --- MODAL & BUTTON LISTENERS ---
    document.getElementById('add-territory-btn').addEventListener('click', () => showTerritoryModal());
    
    document.getElementById('modal-territory-save-btn').addEventListener('click', async () => {
        const number = modalTerritoryNumber.value.trim();
        const description = modalTerritoryDescription.value.trim();
        if (!number || !description) {
            alert('Please fill out both the territory number and description.');
            return;
        }
        if (state.currentEditTerritoryId) {
            const territory = await getFromStore('territories', state.currentEditTerritoryId);
            territory.number = number;
            territory.description = description;
            await updateInStore('territories', territory);
        } else {
            await addToStore('territories', {
                description, number, createdAt: new Date().toISOString()
            });
        }
        hideTerritoryModal();
        state.currentEditTerritoryId = null;
        const allTerritories = await getAllFromStore('territories');
        await renderTerritories(allTerritories, state.territorySort);
    });

    document.getElementById('modal-territory-save-new-btn').addEventListener('click', async () => {
        if (await handleSaveTerritory()) {
            modalTerritoryDescription.value = '';
            modalTerritoryNumber.value = '';
            modalTerritoryNumber.focus();
        }
    });
    document.getElementById('modal-territory-cancel-btn').addEventListener('click', () => {
        hideTerritoryModal();
        state.currentEditTerritoryId = null;
    });
    territoryModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        hideTerritoryModal();
        state.currentEditTerritoryId = null;
    });

    document.getElementById('add-street-btn').addEventListener('click', () => showStreetModal());

    document.getElementById('modal-street-save-btn').addEventListener('click', async () => {
        const name = modalStreetName.value.trim();
        if (!name) return alert('Street name is required.');

        if (state.currentEditStreetId) {
            const street = await getFromStore('streets', state.currentEditStreetId);
            street.name = name;
            await updateInStore('streets', street);
        } else {
            await addToStore('streets', { territoryId: state.currentTerritoryId, name });
        }
        hideStreetModal();
        state.currentEditStreetId = null;
        await renderStreets(state.currentTerritoryId);
    });

    document.getElementById('modal-street-save-new-btn').addEventListener('click', async () => {
        if (await handleSaveStreet()) {
            modalStreetName.value = '';
            modalStreetName.focus();
        }
    });
    document.getElementById('modal-street-cancel-btn').addEventListener('click', () => {
        hideStreetModal();
        state.currentEditStreetId = null;
    });
    streetModal.querySelector('.close-modal-btn').addEventListener('click', () => {
        hideStreetModal();
        state.currentEditStreetId = null;
    });

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
            modalHouseNotes.value = '';
            modalHouseNumber.focus();
        }
    });
    document.getElementById('modal-house-cancel-btn').addEventListener('click', hideHouseModal);
    houseModal.querySelector('.close-modal-btn').addEventListener('click', hideHouseModal);

    document.getElementById('add-house-btn').addEventListener('click', showHouseModal);
    document.getElementById('add-visit-btn').addEventListener('click', () => {
        showNoteModal('Add New Visit Note');
        state.selectedPersonId = null;
    });

    document.querySelector('.filter-controls').addEventListener('click', async (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;

        const filterType = btn.dataset.filter;
        state.activeHouseFilters[filterType] = !state.activeHouseFilters[filterType];
        btn.classList.toggle('active');
        
        await rerenderHousesAndPreserveScroll(state.currentStreetId, state.activeHouseFilters);
    });

    document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
        const notes = modalVisitNotes.value.trim();
        let personIdToSave = state.selectedPersonId;

        if (!personIdToSave && personInput.value.trim() !== '') {
            const newName = personInput.value.trim();
            const newPerson = { houseId: state.currentHouseId, name: newName, isRV: isRvCheck.checked };
            personIdToSave = await addToStore('people', newPerson);
        }

        await addToStore('visits', {
            houseId: state.currentHouseId,
            date: new Date().toISOString(),
            notes: notes || "Visit logged.",
            personId: personIdToSave,
            isNotAtHome: false,
            isVisitAttempt: true
        });
        
        const house = await getFromStore('houses', state.currentHouseId);
        if (modalRemoveNHCheck.checked) {
            house.isCurrentlyNH = false;
        }
        await updateInStore('houses', house);
        
        hideNoteModal();
        state.selectedPersonId = null;
        
        if (state.currentView === 'house-list-view') {
            await rerenderHousesAndPreserveScroll(state.currentStreetId, state.activeHouseFilters);
        } else {
            await renderHouseDetails(state.currentHouseId);
        }
    });

    document.getElementById('house-detail-view').addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') return;
        const checkbox = e.target;
        setTimeout(async () => {
            const house = await getFromStore('houses', state.currentHouseId);
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
                await addToStore('visits', {
                    houseId: state.currentHouseId,
                    date: new Date().toISOString(),
                    notes: "Marked as 'Not Interested'.",
                    isVisitAttempt: false
                });
                await renderHouseDetails(state.currentHouseId);
            }
        }, 0);
    });

    document.getElementById('show-rvs-btn').addEventListener('click', async () => {
        await renderRVList();
        showView('rv-list-view');
        state.currentView = 'rv-list-view';
    });

    // --- IMPORT/EXPORT LISTENERS (CALLING THE API) ---
    document.getElementById('export-full-btn').addEventListener('click', handleFullBackup);
    document.getElementById('export-territory-mscribe-btn').addEventListener('click', () => handleTerritoryBackup(state.currentTerritoryId));
    document.getElementById('export-street-mscribe-btn').addEventListener('click', () => handleStreetBackup(state.currentStreetId));
    document.getElementById('export-pdf-btn').addEventListener('click', () => handleExportPDF(state.currentStreetId));
    
    const restoreFileInput = document.getElementById('restore-file-input');
    const importCsvInput = document.getElementById('import-csv-input');

    const csvImportCallback = async () => {
        const allTerritories = await getAllFromStore('territories');
        await renderTerritories(allTerritories, state.territorySort);
    };

    document.getElementById('restore-btn').addEventListener('click', () => restoreFileInput.click());
    restoreFileInput.addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
    
    document.getElementById('import-csv-btn').addEventListener('click', () => importCsvInput.click());
    importCsvInput.addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
}