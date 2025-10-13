// Version 1.12.05
// --- FILE: database-api.js ---
// This file acts as a data layer, handling complex data operations like import, export, and backup.

const { jsPDF } = window.jspdf;

// --- START: NEW JSON EXPORT/IMPORT SYSTEM ---

async function bundleDataForExport(scope = 'full', id = null) {
    const bundle = {
        meta: {
            version: '1.07.01',
            exportDate: new Date().toISOString(),
            scope: scope,
            appName: 'MinistryScribe'
        },
        data: {
            territories: [],
            streets: [],
            houses: [],
            people: [],
            visits: [],
        }
    };

    if (scope === 'full') {
        bundle.data.territories = await getAllFromStore('territories');
        bundle.data.streets = await getAllFromStore('streets');
        bundle.data.houses = await getAllFromStore('houses');
        bundle.data.people = await getAllFromStore('people');
        bundle.data.visits = await getAllFromStore('visits');
    } else if (scope === 'territory' && id) {
        const territory = await getFromStore('territories', id);
        if (!territory) throw new Error("Territory not found.");
        bundle.data.territories.push(territory);

        const streets = await getByIndex('streets', 'territoryId', id);
        bundle.data.streets = streets;
        const streetIds = streets.map(s => s.id);

        for (const streetId of streetIds) {
            const houses = await getByIndex('houses', 'streetId', streetId);
            bundle.data.houses.push(...houses);
            const houseIds = houses.map(h => h.id);
            for (const houseId of houseIds) {
                bundle.data.people.push(...await getByIndex('people', 'houseId', houseId));
                bundle.data.visits.push(...await getByIndex('visits', 'houseId', houseId));
            }
        }
    } else if (scope === 'street' && id) {
        const street = await getFromStore('streets', id);
        if (!street) throw new Error("Street not found.");
        bundle.data.streets.push(street);

        const territory = await getFromStore('territories', street.territoryId);
        if(territory) bundle.data.territories.push(territory);

        const houses = await getByIndex('houses', 'streetId', id);
        bundle.data.houses.push(...houses);
        const houseIds = houses.map(h => h.id);
        for (const houseId of houseIds) {
            bundle.data.people.push(...await getByIndex('people', 'houseId', houseId));
            bundle.data.visits.push(...await getByIndex('visits', 'houseId', houseId));
        }
    }

    return bundle;
}

async function handleJsonExport(scope = 'full', id = null) {
    try {
        const bundle = await bundleDataForExport(scope, id);
        const jsonString = JSON.stringify(bundle, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        let filename = `ministry_scribe_full_backup.json`;
        if (scope === 'territory') {
            const t = bundle.data.territories[0];
            filename = `ms_territory_${t.number}.json`;
        } else if (scope === 'street') {
            const s = bundle.data.streets[0];
            filename = `ms_street_${s.name.replace(/\s/g, '_')}.json`;
        }

        const file = new File([blob], filename, { type: 'application/json' });

        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'Ministry Scribe Backup',
                text: `Backup file: ${filename}`,
                files: [file],
            });
        } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(file);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        }
    } catch (error) {
        console.error("Export failed:", error);
        alert(`Export failed: ${error.message}`);
    }
}

function handleFileImport(event, callback) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            const data = JSON.parse(content);

            if (!data.meta || data.meta.appName !== 'MinistryScribe' || !data.data) {
                throw new Error("This does not appear to be a valid Ministry Scribe file.");
            }

            if (data.meta.scope === 'full') {
                if (confirm("This will REPLACE all current data with the data from the backup file. This cannot be undone. Continue?")) {
                    await processFullImport(data.data);
                    alert("Full backup restored successfully!");
                    if (callback) callback();
                }
            } else {
                await processPartialImport(data, callback);
            }

        } catch (error) {
            alert(`Import failed: ${error.message}`);
            console.error("Import Error:", error);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

async function processFullImport(data) {
    await clearAllStores();
    for (const storeName in data) {
        for (const item of data[storeName]) {
            delete item.id;
            await addToStore(storeName, item);
        }
    }
}

async function processPartialImport(bundle, callback) {
    const importedTerritory = bundle.data.territories[0];
    if (!importedTerritory) throw new Error("Import file contains no territory data.");

    const existingTerritories = await getAllFromStore('territories');
    const conflict = existingTerritories.find(t => t.number === importedTerritory.number);
    
    if (conflict) {
        // --- START OF BUG FIX ---
        // The refactored call to UI.showImportConflictModal was not correctly implemented,
        // causing a script error that prevented the file input from resetting.
        // This direct implementation correctly sets up and displays the modal,
        // allowing the import process to complete successfully.
        document.getElementById('conflict-territory-number').textContent = conflict.number;
        const confirmBtn = document.getElementById('modal-import-confirm-btn');
        confirmBtn.dataset.bundle = JSON.stringify(bundle);
        confirmBtn.dataset.conflict = JSON.stringify(conflict);
        
        // The event listener in events.js relies on this global variable.
        // We preserve this behavior to ensure compatibility with the existing code.
        window.tempImportCallback = callback;
        
        document.getElementById('import-conflict-modal').classList.remove('hidden');
        // --- END OF BUG FIX ---
    } else {
        await executeMerge(bundle.data);
        alert(`Territory #${importedTerritory.number} imported successfully.`);
        if (callback) callback();
    }
}


async function executeMerge(data) {
    const territoryMap = new Map();
    const streetMap = new Map();
    const houseMap = new Map();

    for (const territory of data.territories) {
        const oldId = territory.id;
        delete territory.id;
        const newId = await addToStore('territories', territory);
        territoryMap.set(oldId, newId);
    }
    for (const street of data.streets) {
        const oldId = street.id;
        delete street.id;
        street.territoryId = territoryMap.get(street.territoryId);
        const newId = await addToStore('streets', street);
        streetMap.set(oldId, newId);
    }
    for (const house of data.houses) {
        const oldId = house.id;
        delete house.id;
        house.streetId = streetMap.get(house.streetId);
        const newId = await addToStore('houses', house);
        houseMap.set(oldId, newId);
    }
    for (const person of data.people) {
        delete person.id;
        person.houseId = houseMap.get(person.houseId);
        await addToStore('people', person);
    }
    for (const visit of data.visits) {
        delete visit.id;
        visit.houseId = houseMap.get(visit.houseId);
        await addToStore('visits', visit);
    }
}

async function executeOverwrite(bundle, conflict) {
    const streetsToDelete = await getByIndex('streets', 'territoryId', conflict.id);
    for (const street of streetsToDelete) {
        const housesToDelete = await getByIndex('houses', 'streetId', street.id);
        for (const house of housesToDelete) {
            const visits = await getByIndex('visits', 'houseId', house.id);
            for(const visit of visits) await deleteFromStore('visits', visit.id);
            const people = await getByIndex('people', 'houseId', house.id);
            for(const person of people) await deleteFromStore('people', person.id);
            await deleteFromStore('houses', house.id);
        }
        await deleteFromStore('streets', street.id);
    }
    await deleteFromStore('territories', conflict.id);
    await executeMerge(bundle.data);
}

async function handleExportPDF(streetId) {
    const street = await getFromStore('streets', streetId);
    const houses = (await getByIndex('houses', 'streetId', streetId)).sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true, sensitivity: 'base' }));
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Street Report: ${street.name}`, 14, 22);
    let y = 30;
    for (const house of houses) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setLineWidth(0.5);
        doc.line(14, y, 196, y);
        y += 7;
        doc.setFontSize(12);
        doc.text(`Address: ${house.address}`, 14, y);
        y += 7;
    }
    doc.save(`${street.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.pdf`);
}