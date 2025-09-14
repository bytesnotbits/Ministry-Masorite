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
        
        // Sorting logic
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
            const visits = await getByIndex('visits', 'houseId', house.id);
            const lastVisit = visits.sort((a,b) => new Date(b.date) - new Date(a.date))[0];
            const primaryPerson = lastVisit ? lastVisit.personName : 'No visits yet';

            const li = document.createElement('li');
            li.className = 'house-card';
            li.dataset.id = house.id;
            li.innerHTML = `
                <strong>${house.address}</strong><br>
                <small>${primaryPerson}</small>
                <div class="icons">
                    <span class="${house.hasMailbox ? 'active' : ''}">📭</span>
                    <span class="${house.noTrespassing ? 'active' : ''}">🚫</span>
                </div>
                <button class="delete-btn" data-id="${house.id}" data-type="house">X</button>
            `;
            houseList.appendChild(li);
        }
    }

    async function renderHouseDetails(houseId) {
        const house = await getFromStore('houses', houseId);
        document.getElementById('house-detail-address').textContent = house.address;
        document.getElementById('mailbox-check').checked = house.hasMailbox;
        document.getElementById('notrespass-check').checked = house.noTrespassing;
        
        // Render visits
        visitList.innerHTML = '';
        const visits = await getByIndex('visits', 'houseId', houseId);
        visits.sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

        for (const visit of visits) {
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${new Date(visit.date).toLocaleDateString()}</strong>
                <span class="edit-date-btn" data-id="${visit.id}">✏️ Change Date</span>
                <p>${visit.notes}</p>
                <button class="delete-btn" data-id="${visit.id}" data-type="visit">X</button>
            `;
            visitList.appendChild(li);
        }
    }

    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        // Main Navigation
        document.addEventListener('click', async (e) => {
            // Navigate to house list from territory list
            if (e.target && e.target.closest('#territory-list li') && !e.target.classList.contains('delete-btn')) {
                const li = e.target.closest('li');
                currentTerritoryId = Number(li.dataset.id);
                await renderHouses(currentTerritoryId);
                showView('house-list-view');
            }
            // Navigate to house details from house list
            if (e.target && e.target.closest('#house-list li') && !e.target.classList.contains('delete-btn')) {
                const li = e.target.closest('li');
                currentHouseId = Number(li.dataset.id);
                await renderHouseDetails(currentHouseId);
                showView('house-detail-view');
            }
            // Back buttons
            if (e.target.classList.contains('back-btn')) {
                const targetView = e.target.dataset.target;
                showView(targetView);
            }
            // Sorting buttons
            if (e.target.classList.contains('sort-btn')) {
                territorySort = e.target.dataset.sort;
                await renderTerritories();
            }
        });

        // Add Buttons
        document.getElementById('add-territory-btn').addEventListener('click', async () => {
            const name = prompt('Enter the name for the new territory (e.g., "Maple Street"):');
            if (name) {
                await addToStore('territories', { name, createdAt: new Date() });
                await renderTerritories();
            }
        });

        document.getElementById('add-house-btn').addEventListener('click', async () => {
            const address = prompt('Enter the house number and street:');
            if (address) {
                await addToStore('houses', { territoryId: currentTerritoryId, address, hasMailbox: false, noTrespassing: false });
                await renderHouses(currentTerritoryId);
            }
        });
        
        document.getElementById('add-visit-btn').addEventListener('click', async () => {
            const notesInput = document.getElementById('visit-note-input');
            const notes = notesInput.value;
            const personName = prompt("Who did you speak with? (Optional)");
            if(notes) {
                await addToStore('visits', { houseId: currentHouseId, date: new Date(), notes, personName });
                await renderHouseDetails(currentHouseId);
                notesInput.value = '';
            } else {
                alert('Please enter some notes for the visit.');
            }
        });

        // House Detail Checkboxes
        document.getElementById('mailbox-check').addEventListener('change', async (e) => {
            const house = await getFromStore('houses', currentHouseId);
            house.hasMailbox = e.target.checked;
            await updateInStore('houses', house);
        });
        document.getElementById('notrespass-check').addEventListener('change', async (e) => {
            const house = await getFromStore('houses', currentHouseId);
            house.noTrespassing = e.target.checked;
            await updateInStore('houses', house);
        });
        
        // Deletion Logic
        document.addEventListener('click', async (e) => {
            if (!e.target.classList.contains('delete-btn')) return;
            const id = Number(e.target.dataset.id);
            const type = e.target.dataset.type;

            if (type === 'territory' && confirm('Are you sure you want to delete this entire territory and all its houses? This cannot be undone.')) {
                // Also delete all associated houses and their visits
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
        });
        
        // Edit visit date
        document.addEventListener('click', async (e) => {
            if (!e.target.classList.contains('edit-date-btn')) return;
            const visitId = Number(e.target.dataset.id);
            const newDateStr = prompt('Enter new date (YYYY-MM-DD):');
            if (newDateStr && !isNaN(new Date(newDateStr))) {
                const visit = await getFromStore('visits', visitId);
                visit.date = new Date(newDateStr);
                await updateInStore('visits', visit);
                await renderHouseDetails(currentHouseId);
            } else if(newDateStr) {
                alert('Invalid date format.');
            }
        });

        // --- DATA MANAGEMENT ---
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
            territories: [territory], // Only backing up the current territory
            houses,
            visits
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${territory.name.replace(/\s/g, '_')}.mscribe`;
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
                if (data.territories) {
                    for(const item of data.territories) await addToStore('territories', item);
                }
                if (data.houses) {
                    for(const item of data.houses) await addToStore('houses', item);
                }
                if (data.visits) {
                    for(const item of data.visits) await addToStore('visits', item);
                }
                alert('Restore successful!');
                await renderTerritories();
                showView('territory-list-view');
            } catch (err) {
                alert('Restore failed. The file may be corrupt.');
                console.error(err);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }
    
    async function handleExportCSV() {
        const territory = await getFromStore('territories', currentTerritoryId);
        const houses = await getByIndex('houses', 'territoryId', currentTerritoryId);
        
        let csvContent = "Address,Has Mailbox,No Trespassing,Last Visit Date,Last Visit Note\n";
        
        for (const house of houses) {
            const visits = await getByIndex('visits', 'houseId', house.id);
            const lastVisit = visits.sort((a,b) => new Date(b.date) - new Date(a.date))[0];
            const cleanNote = lastVisit ? `"${lastVisit.notes.replace(/"/g, '""')}"` : 'N/A';
            
            csvContent += `"${house.address}",${house.hasMailbox},${house.noTrespassing},${lastVisit ? new Date(lastVisit.date).toLocaleDateString() : 'N/A'},${cleanNote}\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${territory.name.replace(/\s/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function handleExportPDF() {
        const doc = new jsPDF();
        const territory = await getFromStore('territories', currentTerritoryId);
        const houses = await getByIndex('houses', 'territoryId', currentTerritoryId);
        
        doc.setFontSize(18);
        doc.text(`Territory Report: ${territory.name}`, 14, 22);
        
        let y = 30; // Vertical position in PDF

        for (const house of houses) {
            if (y > 280) { // Add new page if content overflows
                doc.addPage();
                y = 20;
            }
            doc.setFontSize(12);
            doc.text(`Address: ${house.address}`, 14, y);
            y += 7;
            doc.setFontSize(10);
            doc.text(`Mailbox: ${house.hasMailbox ? 'Yes' : 'No'} | No Trespassing: ${house.noTrespassing ? 'Yes' : 'No'}`, 16, y);
            y += 7;

            const visits = await getByIndex('visits', 'houseId', house.id);
            visits.sort((a, b) => new Date(b.date) - new Date(a.date));
            if (visits.length > 0) {
                 doc.text("Visit History:", 16, y);
                 y += 5;
                for(const visit of visits) {
                     if (y > 280) { doc.addPage(); y = 20; }
                     doc.text(`${new Date(visit.date).toLocaleDateString()}: ${visit.notes}`, 18, y);
                     y += 5;
                }
            } else {
                 doc.text("No visits recorded.", 16, y);
                 y += 5;
            }
             y += 5; // Extra space
        }

        doc.save(`${territory.name.replace(/\s/g, '_')}.pdf`);
    }

});
