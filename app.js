// Ensure window.jsPDF is available
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
        
        territories.sort((a, b) => {
            if (territorySort === 'name') return a.name.localeCompare(b.name);
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
            li.innerHTML = `
                <span>${territory.name} (${houses.length} houses)</span>
                <button class="delete-btn" data-id="${territory.id}" data-type="territory">X</button>
            `;
            territoryList.appendChild(li);
        }
    }

    // renderHouses function
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
        // THIS LOGIC IS NEW: It checks the house's own property
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
    // THIS LOGIC IS NEW: It checks the house's own property
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

    // --- EVENT LISTENERS SETUP ---
// REPLACE your old setupEventListeners function with this one
function setupEventListeners() {
    // --- Get Modal Elements ---
    const noteModal = document.getElementById('note-modal');
    const modalPersonName = document.getElementById('modal-person-name');
    const modalVisitNotes = document.getElementById('modal-visit-notes');
    const modalRemoveNHCheck = document.getElementById('modal-remove-nh-check');

    // --- Show/Hide Modal Functions ---
    const showNoteModal = () => noteModal.classList.remove('hidden');
    const hideNoteModal = () => {
        noteModal.classList.add('hidden');
        modalPersonName.value = '';
        modalVisitNotes.value = '';
        modalRemoveNHCheck.checked = false;
    };

    // --- Main Click Handler ---
    document.addEventListener('click', async (e) => {
        const target = e.target;

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
        if (houseLi && !target.classList.contains('delete-btn') && !houseLi.classList.contains('placeholder')) {
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
                for(const house of houses) {
                    const visits = await getByIndex('visits', 'houseId', house.id);
                    for(const visit of visits) await deleteFromStore('visits', visit.id);
                    await deleteFromStore('houses', house.id);
                }
                await deleteFromStore('territories', id);
                await renderTerritories();
            } else if (type === 'house' && confirm('Are you sure you want to delete this house and all its visit history?')) {
                const visits = await getByIndex('visits', 'houseId', id);
                for(const visit of visits) await deleteFromStore('visits', visit.id);
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
            } else if(newDateStr) {
                alert('Invalid date format.');
            }
        }
    });

    // Add Buttons
    document.getElementById('add-territory-btn').addEventListener('click', async () => {
        const name = prompt('Enter the name for the new territory (e.g., "Maple Street"):');
        if (name) {
            await addToStore('territories', { name, createdAt: new Date().toISOString() });
            await renderTerritories();
        }
    });

    document.getElementById('add-house-btn').addEventListener('click', async () => {
        const houseNumber = prompt('Enter the house number:');
        if (houseNumber) {
            const territory = await getFromStore('territories', currentTerritoryId);
            const fullAddress = `${houseNumber} ${territory.name}`;
            await addToStore('houses', { 
                territoryId: currentTerritoryId, address: fullAddress,
                hasMailbox: false, noTrespassing: false, isCurrentlyNH: false 
            });
            await renderHouses(currentTerritoryId);
        }
    });
    
    // 'Add New Visit Note' button NOW OPENS THE MODAL
    document.getElementById('add-visit-btn').addEventListener('click', showNoteModal);

    // MODAL event listeners
    document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
        const notes = modalVisitNotes.value;
        if (!notes) {
            alert('Please enter some notes for the visit.');
            return;
        }

        await addToStore('visits', {
            houseId: currentHouseId, date: new Date().toISOString(),
            notes: notes, personName: modalPersonName.value || '',
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
    document.querySelector('.close-modal-btn').addEventListener('click', hideNoteModal);

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

    // 'NH' Checkbox is NOW A PURE TOGGLE
    document.getElementById('not-at-home-check').addEventListener('change', async (e) => {
        if (!currentHouseId) return;
        const house = await getFromStore('houses', currentHouseId);
        house.isCurrentlyNH = e.target.checked;
        await updateInStore('houses', house);
        await renderHouseDetails(currentHouseId);
    });

    // Data Management Event Listeners
    document.getElementById('export-mscribe-btn').addEventListener('click', handleBackup);
    document.getElementById('export-csv-btn').addEventListener('click', handleExportCSV);
    document.getElementById('export-pdf-btn').addEventListener('click', handleExportPDF);
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('restore-file-input').addEventListener('change', handleRestore);
}

    // Add Buttons
    document.getElementById('add-territory-btn').addEventListener('click', async () => {
        const name = prompt('Enter the name for the new territory (e.g., "Maple Street"):');
        if (name) {
            await addToStore('territories', { name, createdAt: new Date().toISOString() });
            await renderTerritories();
        }
    });

    document.getElementById('add-house-btn').addEventListener('click', async () => {
        const houseNumber = prompt('Enter the house number:');
        if (houseNumber) {
            const territory = await getFromStore('territories', currentTerritoryId);
            const fullAddress = `${houseNumber} ${territory.name}`;
            await addToStore('houses', { 
                territoryId: currentTerritoryId, 
                address: fullAddress,
                hasMailbox: false, 
                noTrespassing: false 
            });
            await renderHouses(currentTerritoryId);
        }
    });
    
    // 'Add New Visit Note' button NOW OPENS THE MODAL
    document.getElementById('add-visit-btn').addEventListener('click', showNoteModal);

    // MODAL event listeners
    document.getElementById('modal-save-note-btn').addEventListener('click', async () => {
        const notes = modalVisitNotes.value;
        if (!notes) {
            alert('Please enter some notes for the visit.');
            return;
        }

        // Create the new visit log
        await addToStore('visits', {
            houseId: currentHouseId, date: new Date().toISOString(),
            notes: notes, personName: modalPersonName.value || '',
            isNotAtHome: false // A manual note is never a "not at home" by default
        });
        
        const house = await getFromStore('houses', currentHouseId);
        
        // If the user wants to remove the NH status, update the house
        if (modalRemoveNHCheck.checked) {
            house.isCurrentlyNH = false;
        }
        // Smart Helper: If they didn't check the box, but the house WAS an NH, we assume this successful visit clears the status.
        else if (house.isCurrentlyNH) {
             house.isCurrentlyNH = false;
        }

        await updateInStore('houses', house);
        hideNoteModal();
        await renderHouseDetails(currentHouseId);
    });
    
    document.getElementById('modal-cancel-btn').addEventListener('click', hideNoteModal);
    document.querySelector('.close-modal-btn').addEventListener('click', hideNoteModal);

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

    // 'NH' Checkbox is NOW A PURE TOGGLE (UPDATED)
    document.getElementById('not-at-home-check').addEventListener('change', async (e) => {
        if (!currentHouseId) return;
        const house = await getFromStore('houses', currentHouseId);

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

    // Non-destructive version
    document.getElementById('not-at-home-check').addEventListener('change', async (e) => {
    if (!currentHouseId) return;
    
    const visits = (await getByIndex('visits', 'houseId', currentHouseId)).sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastVisit = visits[0];

    // If the box is CHECKED, add a standard "Not at Home" record.
    if (e.target.checked) {
        await addToStore('visits', {
            houseId: currentHouseId,
            date: new Date().toISOString(),
            notes: 'Not at home.',
            personName: '',
            isNotAtHome: true 
        });
    } 
    // If the box is UNCHECKED, it means we are updating the status.
    // This action ADDS a new record instead of deleting the old one.
    else {
        // This should only happen if the last visit was indeed a "Not at Home".
        if (lastVisit && lastVisit.isNotAtHome) {
            await addToStore('visits', {
                houseId: currentHouseId,
                date: new Date().toISOString(),
                notes: "Status updated from 'Not at Home'.", // The new, clear note
                personName: '',
                isNotAtHome: false // Explicitly set the status to false
            });
        }
    }

    // Refresh the visit history to show the newly added record.
    await renderHouseDetails(currentHouseId);
});

    
    // Data Management Event Listeners
    document.getElementById('export-mscribe-btn').addEventListener('click', handleBackup);
    document.getElementById('export-csv-btn').addEventListener('click', handleExportCSV);
    document.getElementById('export-pdf-btn').addEventListener('click', handleExportPDF);
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('restore-file-input').addEventListener('change', handleRestore);
}
    // --- BACKUP & RESTORE FUNCTIONS ---
    async function handleBackup() {
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
    
    async function handleRestore(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!confirm('Are you sure? Restoring will ERASE all data currently in the app and replace it with the backup file.')) {
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                await clearAllStores();
                if (data.territories) for(const item of data.territories) await addToStore('territories', item);
                if (data.houses) for(const item of data.houses) await addToStore('houses', item);
                if (data.visits) for(const item of data.visits) await addToStore('visits', item);
                alert('Restore successful!');
                await renderTerritories();
                showView('territory-list-view');
            } catch (err) {
                alert('Restore failed. The file may be corrupt.');
                console.error(err);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
    
    async function handleExportCSV() {
        const territory = await getFromStore('territories', currentTerritoryId);
        const houses = await getByIndex('houses', 'territoryId', currentTerritoryId);
        
        let csvContent = "Address,Has Mailbox,No Trespassing,Last Visit Date,Last Visit Note,Person Met\n";
        
        for (const house of houses) {
            const visits = (await getByIndex('visits', 'houseId', house.id)).sort((a,b) => new Date(b.date) - new Date(a.date));
            const lastVisit = visits[0];
            const cleanNote = lastVisit ? `"${lastVisit.notes.replace(/"/g, '""')}"` : 'N/A';
            
            csvContent += `"${house.address}",${house.hasMailbox},${house.noTrespassing},${lastVisit ? new Date(lastVisit.date).toLocaleDateString() : 'N/A'},${cleanNote},"${lastVisit ? lastVisit.personName || '' : ''}"\n`;
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
            doc.text(`Address: ${house.address}`, 14, y);
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
