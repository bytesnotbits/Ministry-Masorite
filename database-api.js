// Version 1.06.02
// --- FILE: database-api.js ---
// This file acts as a data layer, handling complex data operations like import, export, and backup.

const { jsPDF } = window.jspdf;

async function generateCSV(houseList) {
    if (!houseList || houseList.length === 0) {
        alert("No houses to export.");
        return null;
    }
    const csvEscape = (field) => {
        const stringField = String(field ?? '');
        if (/[",\n]/.test(stringField)) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    };
    const allStreets = await getAllFromStore('streets');
    const allTerritories = await getAllFromStore('territories');
    const streetsMap = new Map(allStreets.map(s => [s.id, s]));
    const territoriesMap = new Map(allTerritories.map(t => [t.id, t]));
    const headers = [
        'TerritoryNumber', 'TerritoryDescription', 'StreetName', 'HouseNumber', 'InitialNotes',
        'HasMailbox', 'NoTrespassing', 'HasGate'
    ];
    let csvRows = [headers.join(',')];
    for (const house of houseList) {
        const street = streetsMap.get(house.streetId);
        if (!street) continue;
        const territory = territoriesMap.get(street.territoryId);
        if (!territory) continue;
        const visits = await getByIndex('visits', 'houseId', house.id);
        const initialNotes = visits
            .filter(v => v.isVisitAttempt === false && !v.notes.startsWith('House record created'))
            .map(v => v.notes)
            .join('; ');
        const houseNumber = house.address.replace(street.name, '').trim();
        const row = [
            territory.number, territory.description, street.name, houseNumber, initialNotes,
            house.hasMailbox, house.noTrespassing, house.hasGate
        ].map(csvEscape).join(',');
        csvRows.push(row);
    }
    return csvRows.join('\n');
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

async function handleStreetBackup(streetId) {
    const street = await getFromStore('streets', streetId);
    if (!street) return alert("Could not find current street.");
    const houses = await getByIndex('houses', 'streetId', streetId);
    const csvContent = await generateCSV(houses);
    if (csvContent) {
        const filename = `${street.name.replace(/[^\w\s]/gi, '').replace(/\s/g, '_')}.csv`;
        downloadCSV(csvContent, filename);
    }
}

async function handleFullBackup() {
    try {
        const allHouses = await getAllFromStore('houses');
        const csvContent = await generateCSV(allHouses);
        if (csvContent) {
            const filename = `ministry_scribe_full_backup_${new Date().toISOString().split('T')[0]}.csv`;
            downloadCSV(csvContent, filename);
        }
    } catch (error) {
        console.error("Full CSV export failed:", error);
        alert("Could not perform the full CSV export.");
    }
}

async function handleTerritoryBackup(territoryId) {
    const territory = await getFromStore('territories', territoryId);
    if (!territory) return alert("Could not find the current territory.");
    const streets = await getByIndex('streets', 'territoryId', territoryId);
    const streetIds = streets.map(s => s.id);
    const allHouses = await getAllFromStore('houses');
    const territoryHouses = allHouses.filter(h => streetIds.includes(h.streetId));
    const csvContent = await generateCSV(territoryHouses);
    if (csvContent) {
        const filename = `territory_${territory.number}_${territory.description.replace(/\s/g, '_')}.csv`;
        downloadCSV(csvContent, filename);
    }
}

async function handleExportPDF(streetId) {
    const street = await getFromStore('streets', streetId);
    const houses = await getByIndex('houses', 'streetId', streetId);
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

function handleCSVImport(event, callback) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvContent = e.target.result;
        try {
            const data = parseCSV(csvContent);
            if (data.length === 0) return alert("CSV file is empty or invalid.");
            if (confirm(`This will import ${data.length} new house records. This cannot be undone. Continue?`)) {
                await processCSVData(data);
                alert("CSV import successful!");
                if (callback) callback();
            }
        } catch (error) {
            alert(`An error occurred during CSV import: ${error.message}`);
            console.error("CSV Import Error:", error);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const rowObject = {};
        for (let j = 0; j < header.length; j++) {
            rowObject[header[j]] = values[j] ? values[j].trim() : '';
        }
        data.push(rowObject);
    }
    return data;
}

async function processCSVData(data) {
    const territoryCache = new Map();
    const streetCache = new Map();
    const allExistingTerritories = await getAllFromStore('territories');
    for (const row of data) {
        const { TerritoryNumber, TerritoryDescription, StreetName, HouseNumber, HasMailbox, NoTrespassing, HasGate, InitialNotes } = row;
        let territoryId;
        if (territoryCache.has(TerritoryNumber)) {
            territoryId = territoryCache.get(TerritoryNumber);
        } else {
            let existingTerritory = allExistingTerritories.find(t => t.number === TerritoryNumber);
            if (existingTerritory) {
                territoryId = existingTerritory.id;
            } else {
                territoryId = await addToStore('territories', { number: TerritoryNumber, description: TerritoryDescription, createdAt: new Date().toISOString() });
            }
            territoryCache.set(TerritoryNumber, territoryId);
        }
        let streetId;
        const streetCacheKey = `${territoryId}-${StreetName}`;
        if (streetCache.has(streetCacheKey)) {
            streetId = streetCache.get(streetCacheKey);
        } else {
            const streets = await getByIndex('streets', 'territoryId', territoryId);
            let existingStreet = streets.find(s => s.name.toLowerCase() === StreetName.toLowerCase());
            if (existingStreet) {
                streetId = existingStreet.id;
            } else {
                streetId = await addToStore('streets', { territoryId: territoryId, name: StreetName });
            }
            streetCache.set(streetCacheKey, streetId);
        }
        const newHouse = {
            streetId: streetId, address: `${HouseNumber} ${StreetName}`, isCurrentlyNH: true,
            hasMailbox: HasMailbox ? HasMailbox.toLowerCase() === 'true' : false,
            noTrespassing: NoTrespassing ? NoTrespassing.toLowerCase() === 'true' : false,
            hasGate: HasGate ? HasGate.toLowerCase() === 'true' : false,
            isNotInterested: false
        };
        const newHouseId = await addToStore('houses', newHouse);
        await addToStore('visits', { houseId: newHouseId, date: new Date().toISOString(), notes: 'House record created via CSV import.', isVisitAttempt: false });
        if (InitialNotes) {
            await addToStore('visits', { houseId: newHouseId, date: new Date().toISOString(), notes: InitialNotes, isVisitAttempt: false });
        }
    }
}