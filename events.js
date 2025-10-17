// Version 1.20.04
/*
Here, I'll modify the event listener for the import confirmation button to pass the conflict object to the executeMerge function 
when the "merge" option is selected.
*/
// --- FILE: events.js ---
// This file contains all event listeners for the application. It uses actions to modify state.+

let selectedStudyPersonId = null;

function initializeEventListeners(state, actions) {
    // --- START: MODAL HELPER FUNCTIONS ---
    // The refactored UI object was not correctly implemented, leading to errors when
    // trying to show or hide modals. These helpers handle the logic directly.

    const hideAllModals = () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
        
        // Clean up temporary state associated with the conflict modal
        window.tempImportCallback = undefined;
        
        // Reset radio selection if browser caching forces it visible
        const mergeRadio = document.getElementById('import-choice-merge');
        if (mergeRadio) mergeRadio.checked = true;
        
        // Clear any stored data on confirm button
        const confirmBtn = document.getElementById('modal-import-confirm-btn');
        if (confirmBtn) {
            confirmBtn.removeAttribute('data-bundle');
            confirmBtn.removeAttribute('data-conflict');
        }
        document.getElementById('clear-search-btn').addEventListener('click', () => actions.clearSearch());
        document.getElementById('new-search-btn').addEventListener('click', () => actions.newSearch());
    };

    const showTerritoryModal = (territory = null) => {
        const modal = document.getElementById('territory-modal');
        const numberInput = document.getElementById('modal-territory-number');
        const descriptionInput = document.getElementById('modal-territory-description');
        const title = modal.querySelector('h3');
        if (territory) {
            title.textContent = 'Edit Territory';
            numberInput.value = territory.number;
            descriptionInput.value = territory.description;
        } else {
            title.textContent = 'Add New Territory';
            numberInput.value = '';
            descriptionInput.value = '';
            state.currentEditTerritoryId = null;
        }
        modal.classList.remove('hidden');
    };

    const showStreetModal = (street = null) => {
        const modal = document.getElementById('street-modal');
        const nameInput = document.getElementById('modal-street-name');
        const title = modal.querySelector('h3');
        if (street) {
            title.textContent = 'Edit Street';
            nameInput.value = street.name;
        } else {
            title.textContent = 'Add New Street';
            nameInput.value = '';
            state.currentEditStreetId = null;
        }
        modal.classList.remove('hidden');
    };

    const showHouseModal = () => {
        document.getElementById('modal-house-number').value = '';
        document.getElementById('modal-house-notes').value = '';
        document.querySelectorAll('#house-modal .toggle-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('#house-modal [data-prop="isCurrentlyNH"]').classList.add('active');
        document.getElementById('house-modal').classList.remove('hidden');
    };

    const showNoteModal = (titleText) => {
        document.getElementById('note-modal').querySelector('h3').textContent = titleText;
        document.getElementById('modal-person-input').value = '';
        document.getElementById('modal-visit-notes').value = '';
        document.getElementById('modal-suggestions-list').innerHTML = '';
        document.getElementById('modal-suggestions-list').classList.add('hidden');
        document.getElementById('modal-is-rv-check').checked = false;
        document.getElementById('modal-remove-nh-check').checked = false;
        state.selectedPersonId = null;
        document.getElementById('note-modal').classList.remove('hidden');
    };
    
    const showPhoneCallModal = () => {
        document.getElementById('modal-phone-person-name').value = '';
        document.getElementById('modal-phone-notes').value = '';
        document.querySelectorAll('#phone-call-modal .toggle-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('phone-call-modal').classList.remove('hidden');
    };

    const showStudyModal = () => {
        selectedStudyPersonId = null; // Reset selection
        document.getElementById('study-modal').querySelector('h3').textContent = 'Start New Bible Study';
        document.getElementById('modal-study-person-input').value = '';
        document.getElementById('modal-study-publication').value = '';
        document.getElementById('modal-study-lesson').value = '';
        document.getElementById('modal-study-progress').value = '';
        document.getElementById('modal-study-suggestions-list').innerHTML = '';
        document.getElementById('modal-study-suggestions-list').classList.add('hidden');
        document.getElementById('study-modal').classList.remove('hidden');
        document.getElementById('modal-study-person-input').focus();
    };

    const showStudyModalForEdit = async (study) => {
        state.currentEditStudyId = study.id; // Set the ID we are editing
        document.getElementById('study-modal').querySelector('h3').textContent = 'Edit Bible Study';
        
        // Populate the form with existing data
        const person = await getFromStore('people', study.personId);
        document.getElementById('modal-study-person-input').value = person ? person.name : 'Unknown';
        document.getElementById('modal-study-person-input').disabled = true; // Prevent changing the person
        document.getElementById('modal-study-publication').value = study.publication || '';
        document.getElementById('modal-study-lesson').value = study.currentLesson || '';
        document.getElementById('modal-study-progress').value = study.lessonProgress || '';

        document.getElementById('modal-study-suggestions-list').classList.add('hidden');
        document.getElementById('study-modal').classList.remove('hidden');
        document.getElementById('modal-study-publication').focus();
    };


    // --- END: MODAL HELPER FUNCTIONS ---

    // CRITICAL: Hide all modals on page load to prevent cached state issues
    hideAllModals();

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
    const modalPhonePersonName = document.getElementById('modal-phone-person-name');
    const modalPhoneNotes = document.getElementById('modal-phone-notes');
    const phoneCallModalToggles = document.querySelector('#phone-call-modal .modal-toggles');
    const toggleTerritories = document.getElementById('toggle-completed-territories');
    const toggleStreets = document.getElementById('toggle-completed-streets');
    const studyPersonInput = document.getElementById('modal-study-person-input');
    const studySuggestionsList = document.getElementById('modal-study-suggestions-list');
    
    // This function searches ALL people in the database to start a study with them.
    async function populateAndShowStudySuggestions() {
        studySuggestionsList.innerHTML = '';
        const allPeople = await getAllFromStore('people');
        const filter = studyPersonInput.value.toLowerCase().trim();
        const allHouses = new Map((await getAllFromStore('houses')).map(h => [h.id, h]));

        const filteredPeople = allPeople.filter(p => p.name.toLowerCase().includes(filter));

        filteredPeople.forEach(person => {
            const house = allHouses.get(person.houseId);
            const address = house ? `(${house.address})` : '(No address)';
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = `${person.name} ${address}`;
            item.dataset.id = person.id;
            item.dataset.name = person.name;
            studySuggestionsList.appendChild(item);
        });

        // Add an option to create a new person if the text doesn't exactly match an existing one
        const exactMatch = allPeople.some(p => p.name.toLowerCase() === filter);
        if (filter && !exactMatch) {
            const newItem = document.createElement('div');
            newItem.className = 'suggestion-item is-new';
            newItem.textContent = `+ Create new person: "${studyPersonInput.value}"`;
            newItem.dataset.id = 'new'; // Special identifier
            newItem.dataset.name = studyPersonInput.value;
            studySuggestionsList.appendChild(newItem);
        }

        // Show/hide the list based on whether it has any children
        studySuggestionsList.classList.toggle('hidden', studySuggestionsList.children.length === 0);
    }

    // Event listeners for the person search input
    studyPersonInput.addEventListener('focus', populateAndShowStudySuggestions);
    studyPersonInput.addEventListener('input', () => {
        selectedStudyPersonId = null; // Clear selection on new input
        populateAndShowStudySuggestions();
    });

    // Event listener for clicking a person in the suggestions list
    studySuggestionsList.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item || !item.dataset.id) return;

        if (item.dataset.id === 'new') {
            selectedStudyPersonId = 'new'; // Use 'new' as a flag
            studyPersonInput.value = item.dataset.name;
        } else {
            selectedStudyPersonId = Number(item.dataset.id);
            studyPersonInput.value = item.dataset.name;
        }
        
        studySuggestionsList.classList.add('hidden');
    });

    // Event listener for the main button that opens the modal
    document.getElementById('add-study-btn').addEventListener('click', () => showStudyModal());

    // Event listener for the save button (Handles BOTH Create and Edit)
    document.getElementById('modal-study-save-btn').addEventListener('click', async () => {
        const publication = document.getElementById('modal-study-publication').value.trim();
        if (!publication) {
            alert('Please enter the name of the publication.');
            return;
        }

        // --- EDIT LOGIC ---
        if (state.currentEditStudyId) {
            const study = await getFromStore('studies', state.currentEditStudyId);
            study.publication = publication;
            study.currentLesson = document.getElementById('modal-study-lesson').value.trim();
            study.lessonProgress = document.getElementById('modal-study-progress').value.trim();
            await updateInStore('studies', study);
            
            hideAllModals();
            await actions.refreshStudyDetails();
            state.currentEditStudyId = null; // Reset edit state
            document.getElementById('modal-study-person-input').disabled = false; // Re-enable for next time
            return; // Stop execution here
        }

        // --- CREATE LOGIC (The original code) ---
        const personName = document.getElementById('modal-study-person-input').value.trim();
        if (!personName) {
            alert('Please select or create the person this study is with.');
            return;
        }

        let personIdToSave;
        if (selectedStudyPersonId === 'new') {
            const newPerson = { name: personName, houseId: null, isRV: true };
            personIdToSave = await addToStore('people', newPerson);
        } else {
            personIdToSave = selectedStudyPersonId;
        }

        if (!personIdToSave) {
            alert('Could not find or create the person. Please try again.');
            return;
        }

        const newStudy = {
            personId: personIdToSave,
            publication: publication,
            currentLesson: document.getElementById('modal-study-lesson').value.trim(),
            lessonProgress: document.getElementById('modal-study-progress').value.trim(),
            isActive: true,
            goals: [],
            createdAt: new Date().toISOString()
        };
        await addToStore('studies', newStudy);

        if (selectedStudyPersonId !== 'new') {
            const person = await getFromStore('people', personIdToSave);
            if (!person.isRV) {
                person.isRV = true;
                await updateInStore('people', person);
            }
        }
        
        hideAllModals();
        await actions.navigateToStudies();
    });

    // --- END: BIBLE STUDY MODAL LOGIC ---

    // --- START: LOG STUDY SESSION MODAL LOGIC ---
    const showSessionModal = async () => {
        const study = await getFromStore('studies', state.currentStudyId);
        // Pre-fill the lesson from the main study record
        document.getElementById('modal-session-lesson').value = study.currentLesson || '';
        document.getElementById('modal-session-progress').value = '';
        document.getElementById('modal-session-partner').value = '';
        document.getElementById('modal-session-notes').value = '';
        document.getElementById('modal-session-update-main').checked = true; // Default to checked
        document.getElementById('log-session-modal').classList.remove('hidden');
        document.getElementById('modal-session-progress').focus();
    };

    // Event listener for the button on the detail screen
    document.getElementById('log-study-session-btn').addEventListener('click', showSessionModal);

    // Event listener for the save button in the modal
    document.getElementById('modal-session-save-btn').addEventListener('click', async () => {
        const lessonStudied = document.getElementById('modal-session-lesson').value.trim();
        const stoppingPoint = document.getElementById('modal-session-progress').value.trim();

        if (!lessonStudied || !stoppingPoint) {
            alert('Please fill in the lesson and where you left off.');
            return;
        }

        const newSession = {
            studyId: state.currentStudyId,
            date: new Date().toISOString(),
            lessonStudied: lessonStudied,
            stoppingPoint: stoppingPoint,
            partner: document.getElementById('modal-session-partner').value.trim(),
            nextStudyNotes: document.getElementById('modal-session-notes').value.trim()
        };
        
        await addToStore('studyHistory', newSession);

        // If the checkbox is ticked, update the main study record as well
        if (document.getElementById('modal-session-update-main').checked) {
            const study = await getFromStore('studies', state.currentStudyId);
            study.currentLesson = lessonStudied;
            study.lessonProgress = stoppingPoint;
            await updateInStore('studies', study);
        }

        hideAllModals();
        await actions.refreshStudyDetails(); // Refresh the detail view to show the new log
    });
    // --- END: LOG STUDY SESSION MODAL LOGIC ---

    function handleToggleChange(event) {
        state.hideCompleted = event.target.checked;
        toggleTerritories.checked = state.hideCompleted;
        toggleStreets.checked = state.hideCompleted;
        document.body.classList.toggle('hide-completed', state.hideCompleted);
    }

    toggleTerritories.addEventListener('change', handleToggleChange);
    toggleStreets.addEventListener('change', handleToggleChange);

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

    phoneCallModalToggles.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        const wasActive = btn.classList.contains('active');
        phoneCallModalToggles.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        if (!wasActive) {
            btn.classList.add('active');
        }
    });

    document.addEventListener('click', async (e) => {
        const target = e.target;
        const territoryLi = target.closest('#territory-list li:not(.placeholder)');
        if (territoryLi && !target.closest('.delete-btn, .edit-territory-btn')) return actions.navigateToStreets(Number(territoryLi.dataset.id));
        const streetLi = target.closest('#street-list li:not(.placeholder)');
        if (streetLi && !target.closest('.delete-btn, .edit-street-btn')) return actions.navigateToHouses(Number(streetLi.dataset.id));
        const houseLi = target.closest('#house-list li:not(.placeholder)');
        const studyLi = target.closest('#study-list li:not(.placeholder)');

        // --- List Navigation ---
        if (studyLi) return actions.navigateToStudyDetails(Number(studyLi.dataset.studyId));
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

        // --- Detail View Button Actions ---
        const editStudyBtn = target.closest('#edit-study-details-btn');
        if (editStudyBtn) {
            const study = await getFromStore('studies', state.currentStudyId);
            if (study) return showStudyModalForEdit(study);
        }

        const concludeStudyBtn = target.closest('#conclude-study-btn');
        if (concludeStudyBtn) {
            if (confirm('Are you sure you want to conclude this study? It will be removed from the active list but its history will be saved.')) {
                const study = await getFromStore('studies', state.currentStudyId);
                if (study) {
                    study.isActive = false;
                    await updateInStore('studies', study);
                    return actions.navigateBack('study-list-view');
                }
            }
        }

        // --- Card Button Actions ---
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
                    if (lastLetterVisit) {
                        await deleteFromStore('visits', lastLetterVisit.id);
                        const house = await getFromStore('houses', houseId);
                        house.isCurrentlyNH = true;
                        await updateInStore('houses', house);
                    }
                }
            } else if (target.classList.contains('phone-call-btn')) {
                state.currentHouseId = houseId;
                showPhoneCallModal();
                return;
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
        const editNoteBtn = target.closest('.edit-note-btn');
        if (editNoteBtn) {
            const visitId = Number(editNoteBtn.dataset.id);
            const visit = await getFromStore('visits', visitId);
            const newNote = prompt('Enter new note text:', visit.notes);
            if (newNote !== null) {
                visit.notes = newNote.trim();
                await updateInStore('visits', visit);
                await actions.refreshHouseDetails();
            }
            return;
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
    document.getElementById('show-studies-btn').addEventListener('click', actions.navigateToStudies);
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
    document.getElementById('modal-territory-save-btn').addEventListener('click', async () => { if (await saveTerritory()) hideAllModals(); });
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
    document.getElementById('modal-street-save-btn').addEventListener('click', async () => { if (await saveStreet()) hideAllModals(); });
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
    document.getElementById('modal-house-save-btn').addEventListener('click', async () => { if (await saveHouse()) hideAllModals(); });
    document.getElementById('modal-house-save-new-btn').addEventListener('click', async () => {
        if (await saveHouse()) {
            modalHouseNumber.value = ''; modalHouseNotes.value = '';
            houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
            houseModalToggles.querySelector('[data-prop="isCurrentlyNH"]').classList.add('active');
            modalHouseNumber.focus();
        }
    });
    document.getElementById('modal-phone-save-btn').addEventListener('click', async () => {
        const noAnswerBtn = phoneCallModalToggles.querySelector('[data-outcome="no-answer"]');
        const voicemailBtn = phoneCallModalToggles.querySelector('[data-outcome="left-voicemail"]');
        const personName = modalPhonePersonName.value.trim();
        const notes = modalPhoneNotes.value.trim();
        let constructedNotes = [];
        if (noAnswerBtn.classList.contains('active')) constructedNotes.push("No answer.");
        else if (voicemailBtn.classList.contains('active')) constructedNotes.push("Left voicemail.");
        if (personName) constructedNotes.push(`Spoke with ${personName}.`);
        if (notes) constructedNotes.push(notes);
        if (constructedNotes.length === 0) constructedNotes.push("Phone call attempt.");
        const newVisit = {
            houseId: state.currentHouseId,
            date: new Date().toISOString(),
            notes: constructedNotes.join(' '),
            personName: personName || null,
            isVisitAttempt: true,
            visitType: 'phone'
        };
        await addToStore('visits', newVisit);
        hideAllModals();
        await actions.refreshHouses();
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
        hideAllModals();
        await (state.currentView === 'house-list-view' ? actions.refreshHouses() : actions.refreshHouseDetails());
    });

    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('.close-modal-btn, [id$="-cancel-btn"]')) {
                hideAllModals();
            }
        });
    });


    const importCallback = () => actions.refreshTerritories();
    document.getElementById('export-full-json-btn').addEventListener('click', () => handleJsonExport('full'));
    document.getElementById('export-territory-json-btn').addEventListener('click', () => handleJsonExport('territory', state.currentTerritoryId));
    document.getElementById('export-street-json-btn').addEventListener('click', () => handleJsonExport('street', state.currentStreetId));
    document.getElementById('import-file-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input').addEventListener('change', (e) => handleFileImport(e, importCallback));
    
    // CRITICAL FIX: Import confirm button with proper validation
    document.getElementById('modal-import-confirm-btn').addEventListener('click', async (e) => {
        const bundleStr = e.target.dataset.bundle;
        const conflictStr = e.target.dataset.conflict;
        
        // Check if we have valid data - if not, just close the modal
        if (!bundleStr || !conflictStr || bundleStr === '' || conflictStr === '') {
            console.warn('Import modal opened without data - closing gracefully');
            hideAllModals();
            return;
        }
        
        try {
            const choice = document.querySelector('input[name="import-choice"]:checked').value;
            const bundle = JSON.parse(bundleStr);
            const conflict = JSON.parse(conflictStr);
            const callback = window.tempImportCallback;
            
            hideAllModals();

            if (choice === 'merge') {
                await executeMerge(bundle.data, conflict);
                alert('Data merged successfully.');
            } else if (choice === 'overwrite') {
                await executeOverwrite(bundle, conflict);
                alert('Data overwritten successfully.');
            }
            if (callback) callback();
        } catch (error) {
            hideAllModals();
            alert(`An error occurred during import: ${error.message}`);
            console.error(error);
        }
    });

    document.getElementById('export-pdf-btn').addEventListener('click', () => handleExportPDF(state.currentStreetId));

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
            await actions.refreshHouseDetails();
        }
    });
}