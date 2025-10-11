// --- REFACTORED FILE: events.js ---
// This file contains all event listeners for the application. It uses actions to modify state.

function initializeEventListeners(state, actions) {
    // DOM Element getters remain the same
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

    // --- Suggestion Box Logic (no change, as it manages temporary modal state) ---
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

    // --- Simple Event Listeners ---
    personInput.addEventListener('focus', populateAndShowSuggestions);
    personInput.addEventListener('input', () => {
        state.selectedPersonId = null; 
        rvToggle.style.display = 'block';
        populateAndShowSuggestions();
    });
    
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

    document.getElementById('search-territory-input').addEventListener('input', async (e) => {
        const filter = e.target.value.trim();
        const allTerritories = await getAllFromStore('territories');
        // This is a direct render call because it's a transient UI filter, not a state change
        await renderTerritories(allTerritories, state.territorySort, filter);
    });

    // --- GLOBAL CLICK LISTENER (Refactored to use Actions) ---
    document.addEventListener('click', async (e) => {
        const target = e.target;

        // --- NAVIGATION ---
        const territoryLi = target.closest('#territory-list li:not(.placeholder)');
        if (territoryLi && !target.closest('.delete-btn, .edit-territory-btn')) {
            actions.navigateToStreets(Number(territoryLi.dataset.id));
            return;
        }

        const streetLi = target.closest('#street-list li:not(.placeholder)');
        if (streetLi && !target.closest('.delete-btn, .edit-street-btn')) {
            actions.navigateToHouses(Number(streetLi.dataset.id));
            return;
        }

        const houseLi = target.closest('#house-list li:not(.placeholder)');
        if (houseLi && !target.closest('.delete-btn') && !target.closest('.card-actions')) {
            actions.navigateToHouseDetails(Number(houseLi.dataset.id));
            return;
        }

        const rvLi = target.closest('#rv-list li');
        if (rvLi && !rvLi.classList.contains('placeholder')) {
            state.currentHouseId = Number(rvLi.dataset.houseId); // Set state needed for details
            const house = await getFromStore('houses', state.currentHouseId);
            if (house) {
                const street = await getFromStore('streets', house.streetId);
                state.currentStreetId = street.id;
                state.currentTerritoryId = street.territoryId;
                actions.navigateToHouseDetails(state.currentHouseId);
            }
            return;
        }
        
        // --- BACK BUTTONS ---
        if (target.classList.contains('back-btn')) {
            actions.navigateBack(target.dataset.target);
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
        
        // --- SORT BUTTON ---
        if (target.classList.contains('sort-btn')) {
            actions.updateTerritorySort(target.dataset.sort);
        }
    
        // --- DELETE BUTTONS (Complex logic stays here for now) ---
        if (target.classList.contains('delete-btn')) {
            const id = Number(target.dataset.id);
            const type = target.dataset.type;
            if (type === 'territory' && confirm('DELETE this territory and ALL its streets and houses? This cannot be undone.')) {
                // This is complex cascading delete logic, keep it here for now
                const streets = await getByIndex('streets', 'territoryId', id);
                for (const street of streets) {
                    const houses = await getByIndex('houses', 'streetId', street.id);
                    for (const house of houses) {
                        await deleteFromStore('visits', await getByIndex('visits', 'houseId', house.id).then(arr => arr.map(v => v.id)));
                        await deleteFromStore('people', await getByIndex('people', 'houseId', house.id).then(arr => arr.map(p => p.id)));
                        await deleteFromStore('houses', house.id);
                    }
                    await deleteFromStore('streets', street.id);
                }
                await deleteFromStore('territories', id);
                await actions.refreshTerritories();

            } else if (type === 'street' && confirm('DELETE this street and ALL its houses?')) {
                const houses = await getByIndex('houses', 'streetId', id);
                for (const house of houses) {
                     await deleteFromStore('visits', await getByIndex('visits', 'houseId', house.id).then(arr => arr.map(v => v.id)));
                     await deleteFromStore('people', await getByIndex('people', 'houseId', house.id).then(arr => arr.map(p => p.id)));
                     await deleteFromStore('houses', house.id);
                }
                await deleteFromStore('streets', id);
                await actions.refreshStreets();

            } else if (type === 'house' && confirm('Delete this house and its history?')) {
                 await deleteFromStore('visits', await getByIndex('visits', 'houseId', id).then(arr => arr.map(v => v.id)));
                 await deleteFromStore('people', await getByIndex('people', 'houseId', id).then(arr => arr.map(p => p.id)));
                 await deleteFromStore('houses', id);
                 await actions.refreshHouses();

            } else if (type === 'visit' && confirm('Delete this visit note?')) {
                await deleteFromStore('visits', id);
                await actions.refreshHouseDetails();
            }
        }

        // --- MENU TOGGLES (Simple UI interaction, no state change) ---
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
                    await actions.refreshHouseDetails();
                } else {
                    alert('Invalid date/time format. Please use YYYY-MM-DDTHH:MM.');
                }
            }
        }
    });

    // --- OTHER BUTTON LISTENERS (Refactored to use Actions) ---
    document.getElementById('add-territory-btn').addEventListener('click', () => showTerritoryModal());
    document.getElementById('add-street-btn').addEventListener('click', () => showStreetModal());
    document.getElementById('add-house-btn').addEventListener('click', showHouseModal);
    document.getElementById('add-visit-btn').addEventListener('click', () => {
        showNoteModal('Add New Visit Note');
        state.selectedPersonId = null;
    });
    
    document.getElementById('show-rvs-btn').addEventListener('click', actions.navigateToRVs);

    document.querySelector('.filter-controls').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        btn.classList.toggle('active'); // Immediate UI feedback
        actions.toggleHouseFilter(btn.dataset.filter);
    });

    // --- MODAL SAVE LOGIC ---
    // This logic performs direct data writes and then calls an action to refresh the UI.
    document.getElementById('modal-territory-save-btn').addEventListener('click', async () => {
        const number = modalTerritoryNumber.value.trim();
        const description = modalTerritoryDescription.value.trim();
        if (!number || !description) return alert('Please fill out both fields.');

        if (state.currentEditTerritoryId) {
            const territory = await getFromStore('territories', state.currentEditTerritoryId);
            territory.number = number;
            territory.description = description;
            await updateInStore('territories', territory);
        } else {
            await addToStore('territories', { description, number, createdAt: new Date().toISOString() });
        }
        hideTerritoryModal();
        state.currentEditTerritoryId = null;
        await actions.refreshTerritories();
    });
    
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
        await actions.refreshStreets();
    });

    document.getElementById('modal-house-save-btn').addEventListener('click', async () => {
        const houseNumber = modalHouseNumber.value.trim();
        if (!houseNumber) return alert('Please enter a house number.');

        const street = await getFromStore('streets', state.currentStreetId);
        const newHouse = {
            streetId: state.currentStreetId,
            address: `${houseNumber} ${street.name}`,
            hasMailbox: houseModalToggles.querySelector('[data-prop="hasMailbox"]').classList.contains('active'),
            noTrespassing: houseModalToggles.querySelector('[data-prop="noTrespassing"]').classList.contains('active'),
            isCurrentlyNH: houseModalToggles.querySelector('[data-prop="isCurrentlyNH"]').classList.contains('active'),
            hasGate: houseModalToggles.querySelector('[data-prop="hasGate"]').classList.contains('active'),
        };
        const newHouseId = await addToStore('houses', newHouse);

        await addToStore('visits', { houseId: newHouseId, date: new Date().toISOString(), notes: 'House record created.', isVisitAttempt: false });
        if (modalHouseNotes.value.trim()) {
            await addToStore('visits', { houseId: newHouseId, date: new Date().toISOString(), notes: modalHouseNotes.value.trim(), isVisitAttempt: false });
        }
        
        hideHouseModal();
        await actions.refreshHouses();
    });

    document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
        const notes = modalVisitNotes.value.trim();
        let personIdToSave = state.selectedPersonId;

        if (!personIdToSave && personInput.value.trim()) {
            const newName = personInput.value.trim();
            personIdToSave = await addToStore('people', { houseId: state.currentHouseId, name: newName, isRV: isRvCheck.checked });
        }

        await addToStore('visits', { houseId: state.currentHouseId, date: new Date().toISOString(), notes: notes || "Visit logged.", personId: personIdToSave, isNotAtHome: false, isVisitAttempt: true });
        
        if (modalRemoveNHCheck.checked) {
            const house = await getFromStore('houses', state.currentHouseId);
            house.isCurrentlyNH = false;
            await updateInStore('houses', house);
        }
        
        hideNoteModal();
        state.selectedPersonId = null;
        
        if (state.currentView === 'house-list-view') {
            await actions.refreshHouses();
        } else {
            await actions.refreshHouseDetails();
        }
    });

    // All other simple modal listeners (cancel, save & new, close) can remain as they are for now.
    // They are primarily UI interactions that don't directly change the global state.
    
    // --- IMPORT/EXPORT LISTENERS (Use API and then call refresh actions) ---
    const csvImportCallback = async () => await actions.refreshTerritories();
    document.getElementById('export-full-btn').addEventListener('click', handleFullBackup);
    document.getElementById('export-territory-mscribe-btn').addEventListener('click', () => handleTerritoryBackup(state.currentTerritoryId));
    document.getElementById('export-street-mscribe-btn').addEventListener('click', () => handleStreetBackup(state.currentStreetId));
    document.getElementById('export-pdf-btn').addEventListener('click', () => handleExportPDF(state.currentStreetId));
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('restore-file-input').addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
    document.getElementById('import-csv-btn').addEventListener('click', () => document.getElementById('import-csv-input').click());
    document.getElementById('import-csv-input').addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
}