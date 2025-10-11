// --- REFACTORED FILE: events.js ---
// This file contains all event listeners for the application. It uses actions to modify state.

function initializeEventListeners(state, actions) {
    // DOM Element getters
    const personInput = document.getElementById('modal-person-input');
    const suggestionsList = document.getElementById('modal-suggestions-list');
    const rvToggle = document.getElementById('modal-rv-toggle');
    const isRvCheck = document.getElementById('modal-is-rv-check');
    const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');
    const modalVisitNotes = document.getElementById('modal-visit-notes');
    const modalTerritoryNumber = document.getElementById('modal-territory-number');
    const modalTerritoryDescription = document.getElementById('modal-territory-description');
    const modalStreetName = document.getElementById('modal-street-name');
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

    // --- Input-specific Listeners ---
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
        await renderTerritories(allTerritories, state.territorySort, filter);
    });

    // --- GLOBAL CLICK LISTENER ---
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
            state.currentHouseId = Number(rvLi.dataset.houseId);
            const house = await getFromStore('houses', state.currentHouseId);
            if (house) {
                const street = await getFromStore('streets', house.streetId);
                state.currentStreetId = street.id;
                state.currentTerritoryId = street.territoryId;
                actions.navigateToHouseDetails(state.currentHouseId);
            }
            return;
        }

        // --- HOUSE CARD ACTION BUTTONS ---
        const cardActions = target.closest('.card-actions');
        if (cardActions) {
            const houseId = Number(target.dataset.id);
            if (!houseId) return;

            // Handle 'Log NH' Button
            if (target.classList.contains('log-nh-btn')) {
                const house = await getFromStore('houses', houseId);
                if (house) {
                    house.isCurrentlyNH = true;
                    await updateInStore('houses', house);
                    await addToStore('visits', {
                        houseId: houseId,
                        date: new Date().toISOString(),
                        notes: 'Not at home.',
                        isNotAtHome: true,
                        isVisitAttempt: true
                    });
                    await actions.refreshHouses();
                }
            }

            // --- NEW (Version 1.05.01): ADVANCED 'Send Letter' LOGIC ---
            if (target.classList.contains('sent-letter-btn')) {
                // CASE 1: The button is in the "Send Letter" state (does NOT have .letter-sent)
                if (!target.classList.contains('letter-sent')) {
                    // Update the house status to NOT be "Not at Home" anymore
                    const house = await getFromStore('houses', houseId);
                    if (house) {
                        house.isCurrentlyNH = false;
                        await updateInStore('houses', house);
                    }
                    // Add the visit record for the letter
                    await addToStore('visits', {
                        houseId: houseId,
                        date: new Date().toISOString(),
                        notes: 'Letter sent.',
                        isVisitAttempt: false,
                        visitType: 'letter'
                    });
                } 
                // CASE 2: The button is in the "Letter Sent" state (has .letter-sent), so we UNDO.
                else {
                    if (confirm('Undo "Letter Sent" note? This will delete the record.')) {
                        // Find the specific visit to delete
                        const allVisits = await getByIndex('visits', 'houseId', houseId);
                        const lastLetterVisit = allVisits
                            .filter(v => v.visitType === 'letter')
                            .sort((a, b) => new Date(b.date) - new Date(a.date))[0]; // Get the most recent one

                        if (lastLetterVisit) {
                            await deleteFromStore('visits', lastLetterVisit.id);
                        } else {
                            alert('Could not find the original letter note to delete.');
                        }
                    }
                }
                // Finally, always refresh the house list to show the changes
                await actions.refreshHouses();
            }

            // Handle 'Phone Call' Button
            if (target.classList.contains('phone-call-btn')) {
                await addToStore('visits', {
                    houseId: houseId,
                    date: new Date().toISOString(),
                    notes: 'Phone call attempt.',
                    isVisitAttempt: true,
                    visitType: 'phone'
                });
                await actions.refreshHouses();
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

            const deleteChildren = async (houseId) => {
                const visitIds = (await getByIndex('visits', 'houseId', houseId)).map(v => v.id);
                for (const visitId of visitIds) { await deleteFromStore('visits', visitId); }

                const peopleIds = (await getByIndex('people', 'houseId', houseId)).map(p => p.id);
                for (const personId of peopleIds) { await deleteFromStore('people', personId); }
            };

            if (type === 'territory' && confirm('DELETE this territory and ALL its streets and houses? This cannot be undone.')) {
                const streets = await getByIndex('streets', 'territoryId', id);
                for (const street of streets) {
                    const houses = await getByIndex('houses', 'streetId', street.id);
                    for (const house of houses) {
                        await deleteChildren(house.id);
                        await deleteFromStore('houses', house.id);
                    }
                    await deleteFromStore('streets', street.id);
                }
                await deleteFromStore('territories', id);
                await actions.refreshTerritories();

            } else if (type === 'street' && confirm('DELETE this street and ALL its houses?')) {
                const houses = await getByIndex('houses', 'streetId', id);
                for (const house of houses) {
                    await deleteChildren(house.id);
                    await deleteFromStore('houses', house.id);
                }
                await deleteFromStore('streets', id);
                await actions.refreshStreets();

            } else if (type === 'house' && confirm('Delete this house and its history?')) {
                 await deleteChildren(id);
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

    // --- BUTTON LISTENERS ---
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
        btn.classList.toggle('active');
        actions.toggleHouseFilter(btn.dataset.filter);
    });

    // --- MODAL SAVE LOGIC ---
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
        
        await (state.currentView === 'house-list-view' ? actions.refreshHouses() : actions.refreshHouseDetails());
    });

    // --- ADDED: SAVE & NEW BUTTONS ---
    document.getElementById('modal-territory-save-new-btn').addEventListener('click', async () => {
        const number = modalTerritoryNumber.value.trim();
        const description = modalTerritoryDescription.value.trim();
        if (!number || !description) return alert('Please fill out both fields.');

        await addToStore('territories', { description, number, createdAt: new Date().toISOString() });
        
        modalTerritoryNumber.value = '';
        modalTerritoryDescription.value = '';
        modalTerritoryNumber.focus(); 
        
        await actions.refreshTerritories();
    });

    document.getElementById('modal-street-save-new-btn').addEventListener('click', async () => {
        const name = modalStreetName.value.trim();
        if (!name) return alert('Street name is required.');
        
        await addToStore('streets', { territoryId: state.currentTerritoryId, name });
        modalStreetName.value = '';
        modalStreetName.focus();
        await actions.refreshStreets();
    });

    document.getElementById('modal-house-save-new-btn').addEventListener('click', async () => {
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

        modalHouseNumber.value = '';
        modalHouseNotes.value = '';
        houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
        houseModalToggles.querySelector('[data-prop="isCurrentlyNH"]').classList.add('active');
        modalHouseNumber.focus();
        
        await actions.refreshHouses();
    });

    // --- ADDED: UNIVERSAL MODAL CLOSE/CANCEL LISTENERS ---
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', (e) => {
            // If the click is on the backdrop itself (not the content) or a close button
            if (e.target === modal || e.target.closest('.close-modal-btn, [id$="-cancel-btn"]')) {
                hideNoteModal();
                hideTerritoryModal();
                hideStreetModal();
                hideHouseModal();
            }
        });
    });
    
    // --- IMPORT/EXPORT LISTENERS ---
    const csvImportCallback = async () => await actions.refreshTerritories();
    document.getElementById('export-full-btn').addEventListener('click', handleFullBackup);
    document.getElementById('export-territory-mscribe-btn').addEventListener('click', () => handleTerritoryBackup(state.currentTerritoryId));
    document.getElementById('export-street-mscribe-btn').addEventListener('click', () => handleStreetBackup(state.currentStreetId));
    document.getElementById('export-pdf-btn').addEventListener('click', () => handleExportPDF(state.currentStreetId));
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('restore-file-input').addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
    document.getElementById('import-csv-btn').addEventListener('click', () => document.getElementById('import-csv-input').click());
    document.getElementById('import-csv-input').addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
    
    // --- HOUSE DETAIL CHECKBOX LISTENER ---
    document.getElementById('house-detail-view').addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox') {
            const house = await getFromStore('houses', state.currentHouseId);
            if (!house) return;

            switch (e.target.id) {
                case 'not-at-home-check': house.isCurrentlyNH = e.target.checked; break;
                case 'not-interested-check': house.isNotInterested = e.target.checked; break;
                case 'mailbox-check': house.hasMailbox = e.target.checked; break;
                case 'notrespass-check': house.noTrespassing = e.target.checked; break;
                case 'gate-check': house.hasGate = e.target.checked; break;
            }
            
            await updateInStore('houses', house);
        }
    });
}