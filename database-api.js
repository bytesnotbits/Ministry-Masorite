const { jsPDF } = window.jspdf;

// --- START: NEW JSON EXPORT/IMPORT SYSTEM ---

async function bundleDataForExport(scope = 'full', id = null) {
    const bundle = {
        meta: {
            version: '1.16.02',
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
            studies: [],
            studyHistory: []
        }
    };

    if (scope === 'full') {
        // Build the data relationally.
        const territories = await getAllFromStore('territories');
        bundle.data.territories = territories;

        for (const territory of territories) {
            const streets = await getByIndex('streets', 'territoryId', territory.id);
            bundle.data.streets.push(...streets);
            for (const street of streets) {
                const houses = await getByIndex('houses', 'streetId', street.id);
                bundle.data.houses.push(...houses);
                for (const house of houses) {
                    bundle.data.people.push(...await getByIndex('people', 'houseId', house.id));
                    bundle.data.visits.push(...await getByIndex('visits', 'houseId', house.id));
                }
            }
        }
        
        // --- CORRECT PLACEMENT ---
        // This runs only ONCE, after all other data is gathered.
        bundle.data.studies = await getAllFromStore('studies');
        bundle.data.studyHistory = await getAllFromStore('studyHistory');
        
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

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Ministry Scribe Backup',
                    text: `Backup file: ${filename}`,
                    files: [file],
                });
            } catch (shareError) {
                // User canceled share or desktop browser blocked it — fallback to download
                console.warn("Share failed or not allowed, falling back to download:", shareError);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(file);
                a.download = filename;
                a.click();
                URL.revokeObjectURL(a.href);
            }
        } else {
            // Default fallback for desktop browsers
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
    const fileInput = event.target;
    const file = fileInput.files[0];
    
    // CRITICAL FIX: Clear the input immediately to prevent reload loops
    fileInput.value = '';
    
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
        }
    };
    
    reader.onerror = () => {
        alert('Failed to read the file. Please try again.');
    };
    
    reader.readAsText(file);
}

async function processFullImport(data) {
    await clearAllStores();
    // *** FIX: Use the executeMerge function which correctly remaps foreign keys. ***
    await executeMerge(data);
}

async function processPartialImport(bundle, callback) {
    const importedTerritory = bundle.data.territories[0];
    if (!importedTerritory) throw new Error("Import file contains no territory data.");

    const existingTerritories = await getAllFromStore('territories');
    const conflict = existingTerritories.find(t => t.number === importedTerritory.number);
    
    if (conflict) {
        // Show conflict modal
        document.getElementById('conflict-territory-number').textContent = conflict.number;
        const confirmBtn = document.getElementById('modal-import-confirm-btn');
        
        // Store data on the button
        confirmBtn.setAttribute('data-bundle', JSON.stringify(bundle));
        confirmBtn.setAttribute('data-conflict', JSON.stringify(conflict));
        
        // Store callback globally
        window.tempImportCallback = callback;
        
        // Show the modal
        document.getElementById('import-conflict-modal').classList.remove('hidden');
    } else {
        // No conflict - just merge directly
        await executeMerge(bundle.data);
        alert(`Territory #${importedTerritory.number} imported successfully.`);
        if (callback) callback();
    }
}

async function executeMerge(data, existingTerritory = null) {
    // Map old IDs (from JSON) to new IDs (generated by this DB instance)
    const idMaps = {
        territories: new Map(),
        streets: new Map(),
        houses: new Map(),
        people: new Map(),
        visits: new Map(),
        studies: new Map(),
        studyHistory: new Map()
    };

    // 1. Process Territories
    if (existingTerritory) {
        // We are merging into an existing territory.
        // The file contains only one territory in a partial import.
        const territoryFromFile = data.territories[0];
        if (territoryFromFile) {
            // Map the ID from the file to the ID of the existing territory.
            idMaps.territories.set(territoryFromFile.id, existingTerritory.id);
        }
    } else {
        // This is the original behavior for a full import or a partial import with no conflict.
        for (const territory of data.territories) {
            const oldId = territory.id;
            delete territory.id;
            const newId = await addToStore('territories', territory);
            idMaps.territories.set(oldId, newId);
        }
    }

    // 2. Process Streets (and link them to new Territory IDs)
    for (const street of data.streets) {
        const oldId = street.id;
        delete street.id;
        // Ensure territoryId is mapped, or default to null if mapping fails
        street.territoryId = idMaps.territories.get(street.territoryId) || null; 
        if (!street.territoryId) {
            console.warn('Orphaned street found and skipped during import:', street);
            continue; // Skip streets that can't be linked
        }
        const newId = await addToStore('streets', street);
        idMaps.streets.set(oldId, newId);
    }
    
    // 3. Process Houses (and link them to new Street IDs)
    for (const house of data.houses) {
        const oldId = house.id;
        delete house.id;
        // Ensure streetId is mapped
        house.streetId = idMaps.streets.get(house.streetId) || null;
        if (!house.streetId) {
            console.warn('Orphaned house found and skipped during import:', house);
            continue; // Skip houses that can't be linked
        }
        
        // CRITICAL: Ensure all boolean fields are present, especially for old imported data
        if (house.isNotInterested === undefined) house.isNotInterested = false; 
        if (house.isCurrentlyNH === undefined) house.isCurrentlyNH = true; // Default to true if missing
        if (house.hasGate === undefined) house.hasGate = false;
        if (house.hasMailbox === undefined) house.hasMailbox = false;
        if (house.noTrespassing === undefined) house.noTrespassing = false;

        const newId = await addToStore('houses', house);
        idMaps.houses.set(oldId, newId);
    }

    // 4. Process People (linking to new House IDs or as unattached)
    if (data.people) {
        for (const person of data.people) {
            const oldPersonId = person.id; // Get the old ID before deleting
            const oldHouseId = person.houseId;
            const newHouseId = idMaps.houses.get(oldHouseId);

            // A person can exist without a house (new feature)
            // or must be linked to a house that was successfully imported.
            if (person.houseId === null || newHouseId) {
                delete person.id;
                person.houseId = newHouseId || null; // Assign new ID or keep it null
                
                const newPersonId = await addToStore('people', person);
                idMaps.people.set(oldPersonId, newPersonId); // Map old person ID to new
            }
        }
    }

    // 5. Process Visits (linking to new House IDs)
    if (data.visits) {
        for (const visit of data.visits) {
            const oldHouseId = visit.houseId;
            const newHouseId = idMaps.houses.get(oldHouseId);
            if (newHouseId) {
                delete visit.id;
                visit.houseId = newHouseId;
                await addToStore('visits', visit);
            }
        }
    }
    // 6. Process Studies (linking to new Person IDs)
    if (data.studies) {
        for (const study of data.studies) {
            const oldPersonId = study.personId;
            const newPersonId = idMaps.people.get(oldPersonId);
            
            // Only import studies for people who were successfully imported.
            if (newPersonId) {
                const oldStudyId = study.id;
                delete study.id;
                study.personId = newPersonId;
                
                const newStudyId = await addToStore('studies', study);
                idMaps.studies.set(oldStudyId, newStudyId);
            }
        }
    }

    // 7. Process Study History (linking to new Study IDs)
    if (data.studyHistory) {
        for (const session of data.studyHistory) {
            const oldStudyId = session.studyId;
            const newStudyId = idMaps.studies.get(oldStudyId);
            
            // Only import history for studies that were successfully imported.
            if (newStudyId) {
                delete session.id;
                session.studyId = newStudyId;
                await addToStore('studyHistory', session);
            }
        }
    }
}


async function executeOverwrite(bundle, conflict) {
    // Find the territory ID in the current DB that matches the conflict number
    // We must use the stored ID (`conflict.id`) for deletion, not the imported ID.
    
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
