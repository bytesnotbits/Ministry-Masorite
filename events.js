// Version 1.07.04
// --- FILE: events.js ---
// This file contains all event listeners for the application. It uses actions to modify state.
function initializeEventListeners(state, actions) {
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

    async function populateAndShowSuggestions() {
        suggestionsList.innerHTML = '';
        const allPeople = await getByIndex('people', 'houseId', state.currentHouseId);
        const filter = personInput.value.toLowerCase();
        const filteredPeople = allPeople.filter(p => p.name.toLowerCase().includes(filter));
        filteredPeople.forEach(person => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = `${person.name}${person.isRV ? ' (RV)' : ''}`;
            item.dataset.id = person.id;
            item.dataset.name = person.name;
            suggestionsList.appendChild(item);
        });
        if (personInput.value.trim() && !filteredPeople.some(p => p.name.toLowerCase() === filter)) {
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
        state.selectedPersonId = null; 
        rvToggle.style.display = 'block';
        populateAndShowSuggestions();
    });

    suggestionsList.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        state.selectedPersonId = item.dataset.id === 'new' ? null : Number(item.dataset.id);
        if (state.selectedPersonId) {
            personInput.value = item.dataset.name;
            rvToggle.style.display = 'none';
        }
        suggestionsList.classList.add('hidden');
    });

    document.getElementById('search-territory-input').addEventListener('input', () => actions.refreshTerritories());
    houseModalToggles.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (btn) btn.classList.toggle('active');
    });

    document.addEventListener('click', async (e) => {
        const target = e.target;
        const territoryLi = target.closest('#territory-list li:not(.placeholder)');
        if (territoryLi && !target.closest('.delete-btn, .edit-territory-btn')) return actions.navigateToStreets(Number(territoryLi.dataset.id));
        const streetLi = target.closest('#street-list li:not(.placeholder)');
        if (streetLi && !target.closest('.delete-btn, .edit-street-btn')) return actions.navigateToHouses(Number(streetLi.dataset.id));
        const houseLi = target.closest('#house-list li:not(.placeholder)');
        if (houseLi && !target.closest('.delete-btn, .card-actions')) return actions.navigateToHouseDetails(Number(houseLi.dataset.id));
        const rvLi = target.closest('#rv-list li:not(.placeholder)');
        if (rvLi) {
            const houseId = Number(rvLi.dataset.houseId);
            const house = await getFromStore('houses', houseId);
            const street = await getFromStore('streets', house.streetId);
            state.currentTerritoryId = street.territoryId;
            state.currentStreetId = street.id;
            return actions.navigateToHouseDetails(houseId);
        }
        const cardActions = target.closest('.card-actions');
        if (cardActions) {
            const houseId = Number(target.closest('button').dataset.id);
            if (!houseId) return;
            if (target.classList.contains('log-nh-btn')) {
                const house = await getFromStore('houses', houseId);
                house.isCurrentlyNH = true;
                await updateInStore('houses', house);
                await addToStore('visits', { houseId, date: new Date().toISOString(), notes: 'Not at home.', isNotAtHome: true, isVisitAttempt: true });
            } else if (target.classList.contains('sent-letter-btn')) {
                if (!target.classList.contains('letter-sent')) {
                    const house = await getFromStore('houses', houseId);
                    house.isCurrentlyNH = false;
                    await updateInStore('houses', house);
                    await addToStore('visits', { houseId, date: new Date().toISOString(), notes: 'Letter sent.', isVisitAttempt: false, visitType: 'letter' });
                } else if (confirm('Undo "Letter Sent" note? This will delete the record.')) {
                    const allVisits = await getByIndex('visits', 'houseId', houseId);
                    const lastLetterVisit = allVisits.filter(v => v.visitType === 'letter').sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                    if (lastLetterVisit) await deleteFromStore('visits', lastLetterVisit.id);
                }
            } else if (target.classList.contains('phone-call-btn')) {
                await addToStore('visits', { houseId, date: new Date().toISOString(), notes: 'Phone call attempt.', isVisitAttempt: true, visitType: 'phone' });
            }
            return actions.refreshHouses();
        }
        if (target.classList.contains('back-btn')) return actions.navigateBack(target.dataset.target);
        const editTerritoryBtn = target.closest('.edit-territory-btn');
        if (editTerritoryBtn) {
            state.currentEditTerritoryId = Number(editTerritoryBtn.dataset.id);
            const territory = await getFromStore('territories', state.currentEditTerritoryId);
            return showTerritoryModal(territory);
        }
        const editStreetBtn = target.closest('.edit-street-btn');
        if (editStreetBtn) {
            state.currentEditStreetId = Number(editStreetBtn.dataset.id);
            const street = await getFromStore('streets', state.currentEditStreetId);
            return showStreetModal(street);
        }
        if (target.classList.contains('sort-btn')) return actions.updateTerritorySort(target.dataset.sort);
        const deleteBtn = target.closest('.delete-btn');
        if (deleteBtn) {
            const id = Number(deleteBtn.dataset.id);
            const type = deleteBtn.dataset.type;
            const deleteHouseChildren = async (houseId) => {
                const visits = await getByIndex('visits', 'houseId', houseId);
                for (const visit of visits) await deleteFromStore('visits', visit.id);
                const people = await getByIndex('people', 'houseId', houseId);
                for (const person of people) await deleteFromStore('people', person.id);
            };
            if (type === 'territory' && confirm('DELETE this territory and ALL its streets and houses?')) {
                const streets = await getByIndex('streets', 'territoryId', id);
                for (const street of streets) {
                    const houses = await getByIndex('houses', 'streetId', street.id);
                    for (const house of houses) { await deleteHouseChildren(house.id); await deleteFromStore('houses', house.id); }
                    await deleteFromStore('streets', street.id);
                }
                await deleteFromStore('territories', id);
                return actions.refreshTerritories();
            } else if (type === 'street' && confirm('DELETE this street and ALL its houses?')) {
                const houses = await getByIndex('houses', 'streetId', id);
                for (const house of houses) { await deleteHouseChildren(house.id); await deleteFromStore('houses', house.id); }
                await deleteFromStore('streets', id);
                return actions.refreshStreets();
            } else if (type === 'house' && confirm('Delete this house and its history?')) {
                await deleteHouseChildren(id); await deleteFromStore('houses', id);
                return actions.refreshHouses();
            } else if (type === 'visit' && confirm('Delete this visit note?')) {
                await deleteFromStore('visits', id);
                return actions.refreshHouseDetails();
            }
        }
        const editPersonBtn = target.closest('.edit-person-btn');
        if (editPersonBtn) {
            const personId = Number(editPersonBtn.dataset.id);
            const person = await getFromStore('people', personId);
            const newName = prompt('Enter new name:', person.name);
            if (newName && newName.trim()) {
                person.name = newName.trim();
                await updateInStore('people', person);
                await actions.refreshHouseDetails();
            }
            return;
        }
        const deletePersonBtn = target.closest('.delete-person-btn');
        if (deletePersonBtn) {
            const personId = Number(deletePersonBtn.dataset.id);
            if (confirm('Are you sure you want to delete this person?')) {
                await deleteFromStore('people', personId);
                await actions.refreshHouseDetails();
            }
            return;
        }
        if (target.id === 'data-menu-toggle-btn') document.getElementById('territory-data-management').classList.toggle('hidden');
        if (target.id === 'export-territory-menu-toggle-btn') document.getElementById('territory-export-management').classList.toggle('hidden');
        if (target.id === 'export-street-menu-toggle-btn') document.getElementById('street-data-management').classList.toggle('hidden');
        if (target.id === 'about-menu-toggle-btn') document.getElementById('about-section').classList.toggle('hidden');
        if (target.classList.contains('edit-date-btn')) {
            const visitId = Number(target.dataset.id);
            const visit = await getFromStore('visits', visitId);
            const d = new Date(visit.date);
            const currentDateTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const newDateTimeStr = prompt('Enter new date and time (YYYY-MM-DDTHH:MM):', currentDateTime);
            if (newDateTimeStr && !isNaN(new Date(newDateTimeStr))) {
                visit.date = new Date(newDateTimeStr).toISOString();
                await updateInStore('visits', visit);
                await actions.refreshHouseDetails();
            } else if (newDateTimeStr) {
                alert('Invalid date/time format.');
            }
        }
    });
    document.getElementById('add-territory-btn').addEventListener('click', () => showTerritoryModal());
    document.getElementById('add-street-btn').addEventListener('click', () => showStreetModal());
    document.getElementById('add-house-btn').addEventListener('click', showHouseModal);
    document.getElementById('add-visit-btn').addEventListener('click', () => showNoteModal('Add New Visit Note'));
    document.getElementById('show-rvs-btn').addEventListener('click', actions.navigateToRVs);
    document.querySelector('.filter-controls').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        btn.classList.toggle('active');
        actions.toggleHouseFilter(btn.dataset.filter);
    });
    const saveTerritory = async () => {
        const number = modalTerritoryNumber.value.trim();
        const description = modalTerritoryDescription.value.trim();
        if (!number || !description) { alert('Please fill out both fields.'); return false; }
        if (state.currentEditTerritoryId) {
            const t = await getFromStore('territories', state.currentEditTerritoryId);
            t.number = number; t.description = description; await updateInStore('territories', t);
        } else {
            await addToStore('territories', { description, number, createdAt: new Date().toISOString() });
        }
        await actions.refreshTerritories();
        return true;
    };
    document.getElementById('modal-territory-save-btn').addEventListener('click', async () => { if (await saveTerritory()) hideTerritoryModal(); });
    document.getElementById('modal-territory-save-new-btn').addEventListener('click', async () => {
        if (await saveTerritory()) { modalTerritoryNumber.value = ''; modalTerritoryDescription.value = ''; modalTerritoryNumber.focus(); }
    });
    const saveStreet = async () => {
        const name = modalStreetName.value.trim();
        if (!name) { alert('Street name is required.'); return false; }
        if (state.currentEditStreetId) {
            const s = await getFromStore('streets', state.currentEditStreetId);
            s.name = name; await updateInStore('streets', s);
        } else {
            await addToStore('streets', { territoryId: state.currentTerritoryId, name });
        }
        await actions.refreshStreets();
        return true;
    };
    document.getElementById('modal-street-save-btn').addEventListener('click', async () => { if (await saveStreet()) hideStreetModal(); });
    document.getElementById('modal-street-save-new-btn').addEventListener('click', async () => {
        if (await saveStreet()) { modalStreetName.value = ''; modalStreetName.focus(); }
    });
    const saveHouse = async () => {
        const houseNumber = modalHouseNumber.value.trim();
        if (!houseNumber) { alert('Please enter a house number.'); return false; }
        const street = await getFromStore('streets', state.currentStreetId);
        const newHouse = {
            streetId: state.currentStreetId, address: `${houseNumber} ${street.name}`,
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
        await actions.refreshHouses();
        return true;
    };
    document.getElementById('modal-house-save-btn').addEventListener('click', async () => { if (await saveHouse()) hideHouseModal(); });
    document.getElementById('modal-house-save-new-btn').addEventListener('click', async () => {
        if (await saveHouse()) {
            modalHouseNumber.value = ''; modalHouseNotes.value = '';
            houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
            houseModalToggles.querySelector('[data-prop="isCurrentlyNH"]').classList.add('active');
            modalHouseNumber.focus();
        }
    });
    document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
        let personIdToSave = state.selectedPersonId;
        let personNameToSave = personInput.value.trim();

        if (!personNameToSave) {
            personIdToSave = null;
        } else if (!personIdToSave) {
            personIdToSave = await addToStore('people', { 
                houseId: state.currentHouseId, 
                name: personNameToSave, 
                isRV: isRvCheck.checked 
            });
        }
        
        const newVisit = {
            houseId: state.currentHouseId,
            date: new Date().toISOString(),
            notes: modalVisitNotes.value.trim() || "Visit logged.",
            personId: personIdToSave,
            personName: personNameToSave || null,
            isNotAtHome: false,
            isVisitAttempt: true
        };
        await addToStore('visits', newVisit);

        if (modalRemoveNHCheck.checked) {
            const house = await getFromStore('houses', state.currentHouseId);
            house.isCurrentlyNH = false;
            await updateInStore('houses', house);
        }
        hideNoteModal();
        await (state.currentView === 'house-list-view' ? actions.refreshHouses() : actions.refreshHouseDetails());
    });
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('.close-modal-btn, [id$="-cancel-btn"]')) {
                hideNoteModal(); hideTerritoryModal(); hideStreetModal(); hideHouseModal();
            }
        });
    });
    const csvImportCallback = async () => actions.refreshTerritories();
    document.getElementById('export-full-btn').addEventListener('click', handleFullBackup);
    document.getElementById('export-territory-mscribe-btn').addEventListener('click', () => handleTerritoryBackup(state.currentTerritoryId));
    document.getElementById('export-street-mscribe-btn').addEventListener('click', () => handleStreetBackup(state.currentStreetId));
    document.getElementById('export-pdf-btn').addEventListener('click', () => handleExportPDF(state.currentStreetId));
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('restore-file-input').addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
    document.getElementById('import-csv-btn').addEventListener('click', () => document.getElementById('import-csv-input').click());
    document.getElementById('import-csv-input').addEventListener('change', (e) => handleCSVImport(e, csvImportCallback));
    document.getElementById('house-detail-view').addEventListener('change', async (e) => {
        if (e.target.type !== 'checkbox') return;
        const house = await getFromStore('houses', state.currentHouseId);
        if (!house) return;
        const wasNotInterested = house.isNotInterested;
        const propMap = { 'not-at-home-check': 'isCurrentlyNH', 'not-interested-check': 'isNotInterested', 'mailbox-check': 'hasMailbox', 'notrespass-check': 'noTrespassing', 'gate-check': 'hasGate' };
        const propToUpdate = propMap[e.target.id];
        if (propToUpdate) {
            house[propToUpdate] = e.target.checked;
            await updateInStore('houses', house);
            if (propToUpdate === 'isNotInterested' && !wasNotInterested && e.target.checked) {
                await addToStore('visits', { houseId: state.currentHouseId, date: new Date().toISOString(), notes: "Marked as 'Not Interested'.", isVisitAttempt: false });
            }
            // Always refresh details view to ensure consistency
            await actions.refreshHouseDetails();
        }
    });
}