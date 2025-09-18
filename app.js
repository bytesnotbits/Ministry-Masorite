const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', async () => {
    // --- STATE MANAGEMENT ---
    let currentView = 'territory-list-view';
    let currentTerritoryId = null;
    let currentHouseId = null;
    let territorySort = 'name';

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
    async function renderTerritories() {
        territoryList.innerHTML = '';
        let territories = await getAllFromStore('territories');
    
        // Sorter for strings containing numbers (Natural Sort)
        const naturalSort = (a, b) => {
            // Use Intl.Collator for robust, locale-aware natural sorting
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        };
        
        // UPDATED: Sorting logic to use natural sort for 'number'
        territories.sort((a, b) => {
            if (territorySort === 'name') {
                return a.name.localeCompare(b.name);
            } else if (territorySort === 'number') {
                // Use natural sort for territory numbers
                // Provide a default empty string for any old data without a .number property
                return naturalSort(a.number || '', b.number || '');
            }
            // Default sort by date
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    
        if (territories.length === 0) {
            territoryList.innerHTML = '<li class="placeholder">Click "+ Add New Territory" to begin.</li>';
            return;
        }
    
        for (const territory of territories) {
            const houses = await getByIndex('houses', 'territoryId', territory.id);
            const li = document.createElement('li');
            li.dataset.id = territory.id;
    
            // Display the territory number (works perfectly with strings)
            const numberDisplay = territory.number ? `<strong>#${territory.number}</strong> -` : 'No # -';
    
            li.innerHTML = `
                <span>${numberDisplay} ${territory.name} (${houses.length} houses)</span>
                <button class="delete-btn" data-id="${territory.id}" data-type="territory">X</button>
            `;
            territoryList.appendChild(li);
        }
    }

    async function renderHouses(territoryId) {
        houseList.innerHTML = '';
        const territory = await getFromStore('territories', territoryId);
        document.getElementById('house-list-title').textContent = territory.name;
    
        const houses = await getByIndex('houses', 'territoryId', territoryId);
        if (houses.length === 0) {
            houseList.innerHTML = '<li class="placeholder">No houses added to this territory yet.</li>';
            return;
        }
    
        for (const house of houses) {
            const visits = (await getByIndex('visits', 'houseId', house.id)).sort((a,b) => new Date(b.date) - new Date(a.date));
            const lastVisit = visits[0];
    
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
            li.innerHTML = `
                <strong>${house.address}</strong>
                <div class="house-card-details">
                    ${lastActivityDate}<br>
                    ${personMet}
                </div>
                <div class="icons">
                    ${iconsHTML}
                </div>
                <button class="delete-btn" data-id="${house.id}" data-type="house">X</button>
                <button class="log-nh-btn" data-id="${house.id}">Log 'NH'</button>
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
        
        visitList.innerHTML = '';
        const visits = (await getByIndex('visits', 'houseId', houseId)).sort((a, b) => new Date(b.date) - new Date(a.date));

        for (const visit of visits) {
            const li = document.createElement('li');
            const personInfo = visit.personName ? `Spoke with: <strong>${visit.personName}</strong><br>` : '';
            li.innerHTML = `
                <div>
                    <span>${new Date(visit.date).toLocaleDateString()}</span>
                    <span class="edit-date-btn" data-id="${visit.id}">✏️ Change Date</span>
                </div>
                ${personInfo}
                <p>${visit.notes}</p>
                <button class="delete-btn" data-id="${visit.id}" data-type="visit">X</button>
            `;
            visitList.appendChild(li);
        }
    }

    function setupEventListeners() {
        // --- Get Note Modal Elements ---
        const noteModal = document.getElementById('note-modal');
        const modalPersonName = document.getElementById('modal-person-name');
        const modalVisitNotes = document.getElementById('modal-visit-notes');
        const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');
    
        // --- Get Territory Modal Elements ---
        const territoryModal = document.getElementById('territory-modal');
        const modalTerritoryNumber = document.getElementById('modal-territory-number');
        const modalTerritoryName = document.getElementById('modal-territory-name');
    
        // --- Get House Modal Elements ---
        const houseModal = document.getElementById('house-modal');
        const modalHouseNumber = document.getElementById('modal-house-number');
        const houseModalToggles = document.querySelector('#house-modal .modal-toggles');
    
        // --- Show/Hide Note Modal Functions ---
        const showNoteModal = () => noteModal.classList.remove('hidden');
        const hideNoteModal = () => {
            noteModal.classList.add('hidden');
            modalPersonName.value = '';
            modalVisitNotes.value = '';
            modalRemoveNHCheck.checked = false;
        };
    
        // --- Show/Hide Territory Modal Functions ---
        const showTerritoryModal = () => {
            territoryModal.classList.remove('hidden');
            modalTerritoryNumber.focus(); 
        };
        const hideTerritoryModal = () => {
            territoryModal.classList.add('hidden');
            modalTerritoryNumber.value = '';
            modalTerritoryName.value = '';
        };
    
        // --- Show/Hide House Modal Functions ---
        const showHouseModal = () => {
            houseModal.classList.remove('hidden');
            modalHouseNumber.focus();
        };
        const hideHouseModal = () => {
            houseModal.classList.add('hidden');
            modalHouseNumber.value = '';
            houseModalToggles.querySelectorAll('.toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        };
    
        // --- Core Logic for Saving a Territory ---
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
            await renderTerritories();
            return true;
        }
    
        // --- Core Logic for Saving a House ---
        async function handleSaveHouse() {
            const houseNumber = modalHouseNumber.value.trim();
            if (!houseNumber) {
                alert('Please enter a house number.');
                return false;
            }
    
            const territory = await getFromStore('territories', currentTerritoryId);
            const fullAddress = `${houseNumber} ${territory.name}`;
    
            const newHouse = {
                territoryId: currentTerritoryId,
                address: fullAddress,
                hasMailbox: document.querySelector('.toggle-btn[data-prop="hasMailbox"]').classList.contains('active'),
                noTrespassing: document.querySelector('.toggle-btn[data-prop="noTrespassing"]').classList.contains('active'),
                isCurrentlyNH: document.querySelector('.toggle-btn[data-prop="isCurrentlyNH"]').classList.contains('active'),
                hasGate: document.querySelector('.toggle-btn[data-prop="hasGate"]').classList.contains('active')
            };
    
            await addToStore('houses', newHouse);
            await renderHouses(currentTerritoryId);
            return true;
        }
    
    
        // --- Main Click Handler ---
        document.addEventListener('click', async (e) => {
            const target = e.target;
    
            // Log 'NH' Button
            if (target.classList.contains('log-nh-btn')) {
                e.stopPropagation();
                const houseId = Number(target.dataset.id);
                if (!houseId) return;
                await addToStore('visits', {
                    houseId: houseId, date: new Date().toISOString(),
                    notes: 'Not at home.', personName: '', isNotAtHome: true
                });
                const house = await getFromStore('houses', houseId);
                house.isCurrentlyNH = true;
                await updateInStore('houses', house);
                await renderHouses(currentTerritoryId);
                return;
            }
    
            // Navigate to house list
            const territoryLi = target.closest('#territory-list li');
            if (territoryLi && !target.classList.contains('delete-btn') && !territoryLi.classList.contains('placeholder')) {
                currentTerritoryId = Number(territoryLi.dataset.id);
                await renderHouses(currentTerritoryId);
                showView('house-list-view');
                return;
            }
    
            // Navigate to house details
            const houseLi = target.closest('#house-list li');
            if (houseLi && !target.closest('button') && !houseLi.classList.contains('placeholder')) {
                currentHouseId = Number(houseLi.dataset.id);
                await renderHouseDetails(currentHouseId);
                showView('house-detail-view');
                return;
            }
    
            // Back buttons
            if (target.classList.contains('back-btn')) {
                const targetView = target.dataset.target;
                if (targetView === 'house-list-view') await renderHouses(currentTerritoryId);
                showView(targetView);
            }
    
            // Sorting buttons
            if (target.classList.contains('sort-btn')) {
                territorySort = target.dataset.sort;
                await renderTerritories();
            }
    
            // Deletion logic
            if (target.classList.contains('delete-btn')) {
                const id = Number(target.dataset.id);
                const type = target.dataset.type;
                if (type === 'territory' && confirm('Are you sure you want to delete this entire territory and all its houses? This cannot be undone.')) {
                    const houses = await getByIndex('houses', 'territoryId', id);
                    for (const house of houses) {
                        const visits = await getByIndex('visits', 'houseId', house.id);
                        for (const visit of visits) await deleteFromStore('visits', visit.id);
                        await deleteFromStore('houses', house.id);
                    }
                    await deleteFromStore('territories', id);
                    await renderTerritories();
                } else if (type === 'house' && confirm('Are you sure you want to delete this house and all its visit history?')) {
                    const visits = await getByIndex('visits', 'houseId', id);
                    for (const visit of visits) await deleteFromStore('visits', visit.id);
                    await deleteFromStore('houses', id);
                    await renderHouses(currentTerritoryId);
                } else if (type === 'visit' && confirm('Delete this visit note?')) {
                    await deleteFromStore('visits', id);
                    await renderHouseDetails(currentHouseId);
                }
            }
    
            // Edit visit date
            if (target.classList.contains('edit-date-btn')) {
                const visitId = Number(target.dataset.id);
                const visit = await getFromStore('visits', visitId);
                const currentDate = new Date(visit.date).toISOString().split('T')[0];
                const newDateStr = prompt('Enter new date (YYYY-MM-DD):', currentDate);
                if (newDateStr && !isNaN(new Date(newDateStr))) {
                    visit.date = new Date(newDateStr);
                    await updateInStore('visits', visit);
                    await renderHouseDetails(currentHouseId);
                } else if (newDateStr) {
                    alert('Invalid date format.');
                }
            }
        });
    
        // --- Individual Button Event Listeners ---
    
        document.getElementById('add-territory-btn').addEventListener('click', showTerritoryModal);
        
        // --- Territory Modal Event Listeners ---
        document.getElementById('modal-territory-save-btn').addEventListener('click', async () => {
            const success = await handleSaveTerritory();
            if (success) {
                hideTerritoryModal();
            }
        });
        document.getElementById('modal-territory-save-new-btn').addEventListener('click', async () => {
            const success = await handleSaveTerritory();
            if (success) {
                modalTerritoryName.value = '';
                modalTerritoryName.focus();
            }
        });
        document.getElementById('modal-territory-cancel-btn').addEventListener('click', hideTerritoryModal);
        territoryModal.querySelector('.close-modal-btn').addEventListener('click', hideTerritoryModal);
    
        // --- House Modal Event Listeners ---
        houseModalToggles.addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn');
            if (btn) {
                btn.classList.toggle('active');
            }
        });
        document.getElementById('modal-house-save-btn').addEventListener('click', async () => {
            const success = await handleSaveHouse();
            if (success) {
                hideHouseModal();
            }
        });
        document.getElementById('modal-house-save-new-btn').addEventListener('click', async () => {
            const success = await handleSaveHouse();
            if (success) {
                modalHouseNumber.value = '';
                modalHouseNumber.focus();
            }
        });
        document.getElementById('modal-house-cancel-btn').addEventListener('click', hideHouseModal);
        houseModal.querySelector('.close-modal-btn').addEventListener('click', hideHouseModal);
    
    
        // --- View-Specific Button Listeners ---
        document.getElementById('add-house-btn').addEventListener('click', showHouseModal);
        document.getElementById('add-visit-btn').addEventListener('click', showNoteModal);
    
        // NOTE MODAL event listeners
        document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
            const notes = modalVisitNotes.value;
            if (!notes) {
                alert('Please enter some notes for the visit.');
                return;
            }
            await addToStore('visits', {
                houseId: currentHouseId,
                date: new Date().toISOString(),
                notes: notes,
                personName: modalPersonName.value || '',
                isNotAtHome: false
            });
            const house = await getFromStore('houses', currentHouseId);
            if (modalRemoveNHCheck.checked) {
                house.isCurrentlyNH = false;
            } else if (house.isCurrentlyNH) {
                house.isCurrentlyNH = false;
            }
            await updateInStore('houses', house);
            hideNoteModal();
            await renderHouseDetails(currentHouseId);
        });
        document.getElementById('modal-cancel-btn').addEventListener('click', hideNoteModal);
        noteModal.querySelector('.close-modal-btn').addEventListener('click', hideNoteModal);
    
        // House Detail Checkboxes
        document.getElementById('mailbox-check').addEventListener('change', async (e) => {
            if (!currentHouseId) return;
            const house = await getFromStore('houses', currentHouseId);
            house.hasMailbox = e.target.checked;
            await updateInStore('houses', house);
        });
        document.getElementById('notrespass-check').addEventListener('change', async (e) => {
            if (!currentHouseId) return;
            const house = await getFromStore('houses', currentHouseId);
            house.noTrespassing = e.target.checked;
            await updateInStore('houses', house);
        });
        document.getElementById('gate-check').addEventListener('change', async (e) => {
            if (!currentHouseId) return;
            const house = await getFromStore('houses', currentHouseId);
            house.hasGate = e.target.checked;
            await updateInStore('houses', house);
        });
        document.getElementById('not-at-home-check').addEventListener('change', async (e) => {
            if (!currentHouseId) return;
            const house = await getFromStore('houses', currentHouseId);
            house.isCurrentlyNH = e.target.checked;
            await updateInStore('houses', house);
            await renderHouseDetails(currentHouseId);
        });
    
    // Data Management Event Listeners
        document.getElementById('export-full-btn').addEventListener('click', handleFullBackup); // NEW
        document.getElementById('export-mscribe-btn').addEventListener('click', handleTerritoryBackup); // RENAMED
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
        for (const house of houses) {
            const houseVisits = await getByIndex('visits', 'houseId', house.id);
            visits.push(...houseVisits);
        }
        
        const backupData = {
            territories: [territory],
            houses,
            visits
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${territory.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.mscribe`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // Full backup
    async function handleFullBackup() {
        console.log("Starting full database backup...");
        try {
            const backupData = {
                type: 'full_backup', // TYPE IDENTIFIER
                territories: await getAllFromStore('territories'),
                houses: await getAllFromStore('houses'),
                visits: await getAllFromStore('visits')
            };
    
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `ministry_scribe_full_backup_${new Date().toISOString().split('T')[0]}.mscribe`;
            a.click();
            URL.revokeObjectURL(a.href);
            console.log("Full backup successful.");
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
            try {
                const data = JSON.parse(e.target.result);
    
                // --- SMART RESTORE LOGIC ---
                if (data.type === 'full_backup') {
                    // Handle Full Restore
                    if (confirm('This is a FULL backup file. Restoring will ERASE all data currently in the app. Are you sure?')) {
                        await clearAllStores();
                        if (data.territories) for (const item of data.territories) await addToStore('territories', item);
                        if (data.houses) for (const item of data.houses) await addToStore('houses', item);
                        if (data.visits) for (const item of data.visits) await addToStore('visits', item);
                        alert('Full restore successful!');
                        await renderTerritories();
                        showView('territory-list-view');
                    }
                } else if (data.type === 'territory_backup' && data.territories && data.territories.length > 0) {
                    // Handle Single Territory Merge/Update
                    const backupTerritory = data.territories[0];
                    const territoryName = backupTerritory.name;
    
                    if (confirm(`This file contains the territory "${territoryName}". This will overwrite the existing territory data. Continue?`)) {
                        // Find if a territory with the same name already exists
                        const allTerritories = await getAllFromStore('territories');
                        const existingTerritory = allTerritories.find(t => t.name === territoryName);
    
                        let targetTerritoryId;
    
                        if (existingTerritory) {
                            // Territory exists, OVERWRITE its data
                            console.log(`Updating existing territory: ${territoryName}`);
                            targetTerritoryId = existingTerritory.id;
    
                            // Delete all old houses and visits for this territory
                            const oldHouses = await getByIndex('houses', 'territoryId', targetTerritoryId);
                            for (const house of oldHouses) {
                                const oldVisits = await getByIndex('visits', 'houseId', house.id);
                                for (const visit of oldVisits) {
                                    await deleteFromStore('visits', visit.id);
                                }
                                await deleteFromStore('houses', house.id);
                            }
                        } else {
                            // Territory is new, ADD it
                            console.log(`Adding new territory: ${territoryName}`);
                            // Add the new territory to get a new ID
                            const newId = await addToStore('territories', {
                                name: backupTerritory.name,
                                number: backupTerritory.number,
                                createdAt: backupTerritory.createdAt
                            });
                            targetTerritoryId = newId;
                        }
    
                        // Add houses and visits from the backup file, pointing to the correct territory ID
                        for (const house of data.houses) {
                            house.territoryId = targetTerritoryId;
                            // We must delete the old ID to let IndexedDB auto-generate a new one
                            delete house.id; 
                            const newHouseId = await addToStore('houses', house);
                            
                            // Find visits for this house and add them with the new house ID
                            const visitsForThisHouse = data.visits.filter(v => v.houseId === house.id);
                            for (const visit of visitsForThisHouse) {
                                visit.houseId = newHouseId;
                                delete visit.id;
                                await addToStore('visits', visit);
                            }
                        }
                        
                        alert(`Territory "${territoryName}" has been imported successfully!`);
                        await renderTerritories();
                        showView('territory-list-view');
                    }
                } else {
                    alert('Restore failed. The file format is not recognized.');
                }
            } catch (err) {
                alert('Restore failed. The file may be corrupt or invalid.');
                console.error(err);
            } finally {
                event.target.value = ''; // Clear the input
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
            const lastVisit = visits[0];
            const cleanNote = lastVisit ? `"${lastVisit.notes.replace(/"/g, '""')}"` : 'N/A';
            const status = house.isCurrentlyNH ? "Not at Home" : "OK";
            
            csvContent += `"${house.address}",${status},${house.hasMailbox},${house.noTrespassing},${house.hasGate},${lastVisit ? new Date(lastVisit.date).toLocaleDateString() : 'N/A'},${cleanNote},"${lastVisit ? lastVisit.personName || '' : ''}"\n`;
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
            if (visits.length > 0) {
                 doc.setFont(undefined, 'bold');
                 doc.text("Visit History:", 16, y);
                 y += 5;
                 doc.setFont(undefined, 'normal');
                for(const visit of visits) {
                     if (y > 280) { doc.addPage(); y = 20; }
                     const personInfo = visit.personName ? `(Spoke with ${visit.personName})` : '';
                     const visitText = `${new Date(visit.date).toLocaleDateString()} ${personInfo}: ${visit.notes}`;
                     const splitText = doc.splitTextToSize(visitText, 170); // Wrap text
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
