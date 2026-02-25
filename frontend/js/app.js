const API_BASE = 'http://localhost:8001/api';
const STATIC_BASE = 'http://localhost:8001/static';

// DOM Elements - Base
const characterSelect = document.getElementById('characterSelect');
const dynamicControls = document.getElementById('dynamicControls');
const layerContainer = document.getElementById('layerContainer');
const previewPlaceholder = document.getElementById('previewPlaceholder');

// DOM Elements - Modes & Modals
const tabBaseChar = document.getElementById('tabBaseChar');
const tabDressingRoom = document.getElementById('tabDressingRoom');
const baseModeControls = document.getElementById('baseModeControls');
const dressingRoomControls = document.getElementById('dressingRoomControls');

const openOrganizerBtn = document.getElementById('openOrganizerBtn');
const organizerModal = document.getElementById('organizerModal');
const closeOrganizerBtn = document.getElementById('closeOrganizerBtn');

const btnAddCategory = document.getElementById('btnAddCategory');
const addCategoryModal = document.getElementById('addCategoryModal');
const cancelAddCatBtn = document.getElementById('cancelAddCatBtn');
const confirmAddCatBtn = document.getElementById('confirmAddCatBtn');
const newCatName = document.getElementById('newCatName');
const newCatZIndex = document.getElementById('newCatZIndex');
const orgCategoriesContainer = document.getElementById('orgCategoriesContainer');
const orgBaseCharSelect = document.getElementById('orgBaseCharSelect');
const orgSourceLayers = document.getElementById('orgSourceLayers');
const drCategoriesContainer = document.getElementById('drCategoriesContainer');

// File Upload DOM
const dropZone = document.getElementById('dropZone');
const psdInput = document.getElementById('psdInput');
const uploadStatus = document.getElementById('uploadStatus');
const uploadText = document.getElementById('uploadText');

// Application State
let appData = []; // Store characters from base DB (database.json)
let customLibrary = { categories: [] }; // Store dressing room taxonomy (custom_library.json)
let currentMode = 'BASE'; // 'BASE' or 'DRESSING_ROOM'

// Init
async function init() {
    await fetchCharacters();
    await fetchCustomLibrary();
    setupEventListeners(); // To be declared below
}

init();

async function fetchCharacters() {
    try {
        const res = await fetch(`${API_BASE}/characters/`);
        if (!res.ok) throw new Error('Failed to fetch characters');
        appData = await res.json();
        populateCharacterSelect();
        populateOrganizerBaseSelect();
    } catch (err) {
        console.error('API Error:', err);
    }
}

async function fetchCustomLibrary() {
    try {
        const res = await fetch(`${API_BASE}/library/`);
        if (!res.ok) throw new Error('Failed to fetch library');
        customLibrary = await res.json();
        renderOrganizerCategories();
    } catch (err) {
        console.error('API Error:', err);
    }
}

// --- Mode Switching Logic ---
tabBaseChar.addEventListener('click', () => {
    currentMode = 'BASE';
    tabBaseChar.classList.add('active');
    tabDressingRoom.classList.remove('active');
    baseModeControls.classList.remove('hidden');
    dressingRoomControls.classList.add('hidden');
    updatePreview(); // Re-render base character canvas
});

tabDressingRoom.addEventListener('click', () => {
    currentMode = 'DRESSING_ROOM';
    tabDressingRoom.classList.add('active');
    tabBaseChar.classList.remove('active');
    dressingRoomControls.classList.remove('hidden');
    baseModeControls.classList.add('hidden');
    renderDressingRoomUI(); // Prepare custom UI
});

// --- Modals Logic ---
openOrganizerBtn.addEventListener('click', () => organizerModal.classList.remove('hidden'));
closeOrganizerBtn.addEventListener('click', () => organizerModal.classList.add('hidden'));

btnAddCategory.addEventListener('click', () => addCategoryModal.classList.remove('hidden'));
cancelAddCatBtn.addEventListener('click', () => addCategoryModal.classList.add('hidden'));

confirmAddCatBtn.addEventListener('click', async () => {
    const name = newCatName.value.trim();
    const zIndex = parseInt(newCatZIndex.value, 10) || 0;

    if (!name) return alert('Please enter a category name');

    try {
        const res = await fetch(`${API_BASE}/library/category/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, z_index: zIndex })
        });

        if (res.ok) {
            addCategoryModal.classList.add('hidden');
            newCatName.value = '';
            newCatZIndex.value = '0';
            await fetchCustomLibrary(); // reload and re-render
        }
    } catch (e) {
        console.error('Error creating category', e);
    }
});

// --- Organizer UI Renderers ---
function populateOrganizerBaseSelect() {
    // Check if the element exists to avoid errors on page load without correct HTML
    if (!orgBaseCharSelect) return;

    orgBaseCharSelect.innerHTML = '<option value="">Select Base Character...</option>';
    appData.forEach(char => {
        const option = document.createElement('option');
        option.value = char.id || char.name;
        option.textContent = char.name;
        orgBaseCharSelect.appendChild(option);
    });
}

// --- Helper for Backwards Compatibility ---
function getAssetPath(hash) {
    if (!appData) return `assets/${hash}.png`;
    for (let char of appData) {
        if (!char.layer_groups) continue;
        for (let group of Object.values(char.layer_groups)) {
            const found = group.find(a => a.hash === hash);
            if (found && found.path) return found.path;
        }
    }
    return `assets/${hash}.png`;
}

function renderOrganizerCategories() {
    if (!orgCategoriesContainer) return;
    orgCategoriesContainer.innerHTML = '';

    customLibrary.categories.sort((a, b) => b.z_index - a.z_index).forEach(cat => {
        const catEl = document.createElement('div');
        catEl.className = 'cat-box';
        catEl.innerHTML = `
            <div class="cat-header" style="display:flex; align-items:center;">
                <span class="z-badge" onclick="promptEditCategory('${cat.id}', '${cat.name}', ${cat.z_index})" style="cursor:pointer;" title="Edit Z-Index or Name">Z: ${cat.z_index}</span>
                <strong onclick="promptEditCategory('${cat.id}', '${cat.name}', ${cat.z_index})" style="cursor:pointer; margin-left:10px;" title="Edit Category">${cat.name}</strong>
                <button class="icon-btn" onclick="promptDeleteCategory('${cat.id}', '${cat.name}')" title="Delete Category" style="width:28px;height:28px;font-size:0.9rem;background:transparent;color:#ff7675;margin-left:auto;border:none;box-shadow:none;"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="cat-body" id="cat-body-${cat.id}">
                <!-- Subfolders will be injected here -->
            </div>
            <button class="add-sub-btn" onclick="promptAddSubfolder('${cat.id}')">
                <i class="fa-solid fa-plus"></i> Add Subfolder
            </button>
        `;
        orgCategoriesContainer.appendChild(catEl);

        const bodyEl = catEl.querySelector('.cat-body');
        cat.subfolders.forEach(sub => {
            const subEl = document.createElement('div');
            subEl.className = 'subfolder-box';
            subEl.innerHTML = `
                <div class="subfolder-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <span onclick="promptEditSubfolder('${cat.id}', '${sub.name}')" style="cursor:pointer;" title="Rename Subfolder"><i class="fa-solid fa-folder-open"></i> ${sub.name} <i class="fa-solid fa-pen" style="font-size:0.7em; margin-left:4px; opacity:0.5;"></i></span>
                    <button class="icon-btn" onclick="promptDeleteSubfolder('${cat.id}', '${sub.name}')" title="Delete Subfolder" style="width:24px;height:24px;font-size:0.8rem;background:transparent;color:#ff7675;border:none;box-shadow:none;"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="layer-drop-zone target-zone" data-cat="${cat.id}" data-sub="${sub.name}">
                    ${sub.assets.map(a => `
                        <div class="draggable-asset" style="background-image: url('${STATIC_BASE}/${getAssetPath(a.hash)}')" title="${a.name}">
                            <div class="asset-name">${a.name}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            bodyEl.appendChild(subEl);
        });
    });

    setupDragAndDrop();
}

async function promptAddSubfolder(catId) {
    const name = prompt("Enter subfolder name (e.g. Naruto, Eyes):");
    if (!name) return;

    try {
        const res = await fetch(`${API_BASE}/library/subfolder/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cat_id: catId, name })
        });
        if (res.ok) await fetchCustomLibrary();
    } catch (e) {
        console.error(e);
    }
}

async function promptEditCategory(catId, currentName, currentZ) {
    const newName = prompt("Enter new category name:", currentName);
    if (newName === null) return;

    const newZStr = prompt("Enter new Z-Index:", currentZ);
    if (newZStr === null) return;
    const newZ = parseInt(newZStr, 10);

    try {
        const res = await fetch(`${API_BASE}/library/category/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cat_id: catId, name: newName || currentName, z_index: isNaN(newZ) ? currentZ : newZ })
        });
        if (res.ok) await fetchCustomLibrary();
    } catch (e) {
        console.error(e);
    }
}

async function promptDeleteCategory(catId, catName) {
    if (!confirm(`Are you sure you want to delete category "${catName}" and all its subfolders? This cannot be undone.`)) return;

    try {
        const res = await fetch(`${API_BASE}/library/category/${catId}`, {
            method: 'DELETE'
        });
        if (res.ok) await fetchCustomLibrary();
    } catch (e) {
        console.error(e);
    }
}

async function promptEditSubfolder(catId, currentName) {
    const newName = prompt(`Rename subfolder "${currentName}" to:`, currentName);
    if (!newName || newName === currentName) return;

    try {
        const res = await fetch(`${API_BASE}/library/subfolder/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cat_id: catId, old_name: currentName, new_name: newName })
        });
        if (res.ok) await fetchCustomLibrary();
    } catch (e) {
        console.error(e);
    }
}

async function promptDeleteSubfolder(catId, subName) {
    if (!confirm(`Are you sure you want to delete subfolder "${subName}" and remove all its assets from this category?`)) return;

    try {
        const res = await fetch(`${API_BASE}/library/subfolder/${catId}/${encodeURIComponent(subName)}`, {
            method: 'DELETE'
        });
        if (res.ok) await fetchCustomLibrary();
    } catch (e) {
        console.error(e);
    }
}

// Load source layers when selecting a base character in organizer
orgBaseCharSelect.addEventListener('change', (e) => {
    const charId = e.target.value;
    const char = appData.find(c => (c.id === charId || c.name === charId));
    orgSourceLayers.innerHTML = '';

    if (!char || !char.layer_groups) return;

    // Render the layer_groups as draggable subfolders instead of raw raw assets
    Object.entries(char.layer_groups).forEach(([groupName, groupAssets]) => {
        const folderEl = document.createElement('div');
        folderEl.className = 'draggable-asset folder-asset';
        folderEl.draggable = true;
        // Use the first asset as the thumbnail for the folder
        if (groupAssets.length > 0) {
            folderEl.style.backgroundImage = `url('${STATIC_BASE}/${groupAssets[0].path}')`;
        }

        folderEl.innerHTML = `
            <div class="asset-name"><i class="fa-solid fa-folder"></i> ${groupName} (${groupAssets.length})</div>
        `;

        folderEl.addEventListener('dragstart', (evt) => {
            evt.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'folder',
                folderName: groupName,
                assets: groupAssets.map(a => ({
                    name: a.name,
                    hash: a.hash || a.path.split('/').pop().replace('.png', '')
                }))
            }));
        });

        orgSourceLayers.appendChild(folderEl);
    });
});

function setupDragAndDrop() {
    const dropZones = document.querySelectorAll('.target-zone');

    dropZones.forEach(zone => {
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', e => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', async e => {
            e.preventDefault();
            zone.classList.remove('drag-over');

            const dataStr = e.dataTransfer.getData('text/plain');
            if (!dataStr) return;

            const data = JSON.parse(dataStr);
            const catId = zone.dataset.cat;
            const subName = zone.dataset.sub;

            if (data.type === 'folder') {
                // If it's a folder, we need to add all its assets to the subfolder
                try {
                    // Fast sequential insert (in real app, use a bulk endpoint)
                    for (const asset of data.assets) {
                        await fetch(`${API_BASE}/library/asset/`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                cat_id: catId,
                                sub_name: subName,
                                asset_name: asset.name,
                                asset_hash: asset.hash
                            })
                        });
                    }
                    await fetchCustomLibrary();
                } catch (err) {
                    console.error('Error assigning folder assets', err);
                }
            } else {
                // Single asset fallback
                try {
                    const res = await fetch(`${API_BASE}/library/asset/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cat_id: catId,
                            sub_name: subName,
                            asset_name: data.name,
                            asset_hash: data.hash
                        })
                    });
                    if (res.ok) await fetchCustomLibrary();
                } catch (err) {
                    console.error('Error assigning asset', err);
                }
            }
        });
    });
}

// --- Dressing Room UI Renderers ---
let dressingRoomSelections = {}; // e.g. { "cat_1_id": {hash: "abc", name:"Eye"} }

function renderDressingRoomUI() {
    if (!drCategoriesContainer) return;
    drCategoriesContainer.innerHTML = '';
    dressingRoomSelections = {}; // reset selections on render

    // Sort categories by z_index descending
    const sortedCats = [...customLibrary.categories].sort((a, b) => b.z_index - a.z_index);

    if (sortedCats.length === 0) {
        drCategoriesContainer.innerHTML = '<p style="color:var(--text-muted); font-size: 0.9rem;">No custom categories found. Open Library Organizer to create some.</p>';
        return;
    }

    // Group categories by z_index
    const zGroups = {};
    sortedCats.forEach(cat => {
        if (!zGroups[cat.z_index]) zGroups[cat.z_index] = [];
        zGroups[cat.z_index].push(cat);
    });

    Object.keys(zGroups).sort((a, b) => b - a).forEach(z_index => {
        const groupCats = zGroups[z_index];

        // Create a flex container for categories with the same z-index
        const rowGroup = document.createElement('div');
        rowGroup.style.display = 'flex';
        rowGroup.style.gap = '20px'; // Space between categories in the same row
        rowGroup.style.marginBottom = '15px'; // Space between rows
        rowGroup.style.flexWrap = 'wrap';

        groupCats.forEach(cat => {
            const catGroup = document.createElement('div');
            catGroup.className = 'control-group';
            catGroup.style.flex = '1';
            catGroup.style.minWidth = '200px'; // Prevent them from becoming too narrow
            catGroup.style.marginBottom = '0'; // Remove default margin as rowGroup handles it

            catGroup.innerHTML = `
                <label>${cat.name} <span class="badge" style="float:right; background:var(--primary); padding:2px 6px; border-radius:4px; font-size:0.7rem;">Z: ${cat.z_index}</span></label>
                <div id="dr-subfolders-${cat.id}" style="margin-top: 10px;">
                    <!-- Subfolder thumbnail grids will be rendered here -->
                </div>
                <!-- Keep a hidden select for compatibility with drawing logic -->
                <select id="dr-select-${cat.id}" data-catid="${cat.id}" style="display:none;"></select>
            `;

            rowGroup.appendChild(catGroup);
        });

        drCategoriesContainer.appendChild(rowGroup);

        // After appending to DOM, initialize the thumbnails
        groupCats.forEach(cat => {
            const selectEl = rowGroup.querySelector(`#dr-select-${cat.id}`);
            const subfoldersContainer = rowGroup.querySelector(`#dr-subfolders-${cat.id}`);
            renderDressingRoomThumbnails(subfoldersContainer, cat, selectEl);
        });
    });
}

// Global state to track which subfolder is currently open in the Dressing Room for each category
let openSubfolders = {}; // e.g., { "c1": "Naruto" }

function renderDressingRoomThumbnails(container, cat, selectEl) {
    container.innerHTML = '';
    const selectedHash = selectEl.value;

    // Check if a subfolder is currently "open" for this category
    const activeSubfolderName = openSubfolders[cat.id];
    let activeSubfolder = null;
    if (activeSubfolderName) {
        activeSubfolder = cat.subfolders.find(s => s.name === activeSubfolderName);
    }

    if (activeSubfolder) {
        // --- RENDERING OPEN SUBFOLDER VIEW ---

        // Header with Back Button and Subfolder Name
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.marginBottom = '10px';
        headerDiv.style.cursor = 'pointer';
        headerDiv.style.color = 'var(--text-main)';
        headerDiv.innerHTML = `<i class="fa-solid fa-chevron-left"></i> <span style="margin-left: 8px; font-weight: bold;">${activeSubfolder.name}</span>`;
        headerDiv.onclick = () => {
            // "Go Back" interaction
            openSubfolders[cat.id] = null;
            renderDressingRoomThumbnails(container, cat, selectEl);
        };
        container.appendChild(headerDiv);

        // Thumbnail Grid for the active subfolder
        const grid = document.createElement('div');
        grid.className = 'thumbnail-grid';
        grid.style.maxHeight = 'none';

        activeSubfolder.assets.forEach(asset => {
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail-wrapper';

            const img = document.createElement('img');
            img.crossOrigin = "Anonymous";
            img.src = `${STATIC_BASE}/${getAssetPath(asset.hash)}`;
            img.alt = asset.name;
            img.title = asset.name;

            if (asset.hash === selectedHash) {
                img.classList.add('selected');
            }

            img.onclick = () => {
                if (selectEl.value === asset.hash) {
                    selectEl.value = "";
                    delete dressingRoomSelections[cat.id];
                } else {
                    selectEl.value = asset.hash;
                    dressingRoomSelections[cat.id] = { hash: asset.hash, name: asset.name, z_index: cat.z_index };
                }
                renderDressingRoomThumbnails(container, cat, selectEl);
                drawDressingRoomCanvas();
            };

            wrapper.appendChild(img);

            // Trash overlay to remove selection
            const removeBtn = document.createElement('div');
            removeBtn.className = 'remove-overlay';
            removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            removeBtn.onclick = (e) => {
                e.stopPropagation(); // Don't trigger the image toggle
                selectEl.value = "";
                delete dressingRoomSelections[cat.id];
                renderDressingRoomThumbnails(container, cat, selectEl);
                drawDressingRoomCanvas();
            };
            wrapper.appendChild(removeBtn);

            grid.appendChild(wrapper);
        });
        container.appendChild(grid);

    } else {
        // --- RENDERING FOLDER LIST VIEW (Default) ---

        const grid = document.createElement('div');
        grid.className = 'thumbnail-grid';
        grid.style.maxHeight = 'none';

        cat.subfolders.forEach(sub => {
            if (sub.assets.length === 0) return;

            // Use explicitly styled divs mapping to `.thumbnail-grid img` dimensions 
            // but looking like folders instead of images
            const folderEl = document.createElement('div');
            folderEl.className = 'folder-thumbnail';
            folderEl.style.width = '45px';
            folderEl.style.height = '45px';
            folderEl.style.borderRadius = '6px';
            folderEl.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
            folderEl.style.border = '2px solid transparent';
            folderEl.style.cursor = 'pointer';
            folderEl.style.overflow = 'hidden';
            folderEl.style.position = 'relative';
            folderEl.style.display = 'flex';
            folderEl.style.alignItems = 'center';
            folderEl.style.justifyContent = 'center';
            folderEl.title = sub.name;

            // Set first asset as background
            folderEl.style.backgroundImage = `url('${STATIC_BASE}/${getAssetPath(sub.assets[0].hash)}')`;
            folderEl.style.backgroundSize = 'contain';
            folderEl.style.backgroundPosition = 'center';
            folderEl.style.backgroundRepeat = 'no-repeat';

            // Add a folder icon overlay to indicate it's a directory, not an item
            folderEl.innerHTML = `<div style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.7); border-radius:4px; padding:2px; font-size:10px;"><i class="fa-solid fa-folder"></i></div>`;

            // If the selected hash is inside this folder, highlight the folder slightly
            const hasSelected = sub.assets.some(a => a.hash === selectedHash);
            if (hasSelected) {
                folderEl.style.borderColor = 'var(--primary)';
            }

            folderEl.onclick = () => {
                openSubfolders[cat.id] = sub.name;
                renderDressingRoomThumbnails(container, cat, selectEl);
            };

            grid.appendChild(folderEl);
        });

        container.appendChild(grid);
    }
}

async function drawDressingRoomCanvas() {
    previewPlaceholder.classList.add('hidden');
    layerContainer.innerHTML = '';

    const selections = Object.values(dressingRoomSelections);
    if (selections.length === 0) {
        previewPlaceholder.classList.remove('hidden');
        return;
    }

    // Sort heavily by z_index (ascending draw order, so higher z is drawn last/on top)
    // Remember custom library category structure: z_index
    selections.sort((a, b) => a.z_index - b.z_index);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // We need to wait for all images to load to determine max canvas size
    const imagePromises = selections.map(sel => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve({ img, sel });
            img.onerror = () => resolve(null); // skip broken images
            img.src = `${STATIC_BASE}/${getAssetPath(sel.hash)}`;
        });
    });

    const loadedImages = (await Promise.all(imagePromises)).filter(v => v !== null);

    if (loadedImages.length === 0) return;

    // Use dimensions of the first valid image (usually the Base Body)
    // or fallback to container size.
    let canvasW = loadedImages[0].img.naturalWidth;
    let canvasH = loadedImages[0].img.naturalHeight;

    if (canvasW === 0 || canvasH === 0) {
        canvasW = layerContainer.clientWidth > 0 ? layerContainer.clientWidth : 800;
        canvasH = layerContainer.clientHeight > 0 ? layerContainer.clientHeight : 800;
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Draw images in z-index sorted order
    loadedImages.forEach(({ img }) => {
        ctx.drawImage(img, 0, 0, canvasW, canvasH);
    });

    // Make canvas responsive
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';

    layerContainer.appendChild(canvas);
}

function populateCharacterSelect() {
    // Preserve current selection if any
    const currentVal = characterSelect.value;

    characterSelect.innerHTML = '<option value="" disabled selected>Select a Character...</option>';

    appData.forEach(char => {
        const option = document.createElement('option');
        option.value = char.id || char.name;
        option.textContent = char.name;
        characterSelect.appendChild(option);
    });

    if (currentVal && Array.from(characterSelect.options).some(o => o.value === currentVal)) {
        characterSelect.value = currentVal;
    }
}

function updatePreview() {
    const selectedCharId = characterSelect.value;
    const selectedChar = appData.find(c => (c.id === selectedCharId || c.name === selectedCharId));

    if (!selectedChar) {
        dynamicControls.innerHTML = '';
        layerContainer.innerHTML = '';
        previewPlaceholder.classList.remove('hidden');
        return;
    }

    previewPlaceholder.classList.add('hidden');
    buildDynamicUI(selectedChar);
}

function buildDynamicUI(character) {
    dynamicControls.innerHTML = '';
    layerContainer.innerHTML = '';

    // Safety check just in case it's an old format
    const groupOrder = character.group_order || [];
    const layerGroups = character.layer_groups || {};

    if (groupOrder.length === 0) {
        dynamicControls.innerHTML = '<p style="color:red; padding:10px;">No groups found for this character. Please upload a structured PSD.</p>';
        return;
    }

    // Build UI controls and Image Layers bottom up or top down
    // Since we want Z-index to match the group_order index

    groupOrder.forEach((groupName, index) => {
        const layers = layerGroups[groupName] || [];

        // --- 1. Create Control UI
        const controlDiv = document.createElement('div');
        controlDiv.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = `${index + 1}. Select ${groupName}`;
        controlDiv.appendChild(label);

        // Create Grid Container
        const grid = document.createElement('div');
        grid.className = 'thumbnail-grid';

        // --- 2. Create Image Layer tag for the preview
        const layerImg = document.createElement('img');
        layerImg.id = `layer_${index}`;
        layerImg.className = 'layer';
        // Match the PSD indexing order
        layerImg.style.zIndex = index;

        // Hide initially until a selection is made
        layerImg.src = "";
        layerImg.classList.add('hidden');
        layerContainer.appendChild(layerImg);

        if (layers.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.style.color = 'var(--text-muted)';
            emptyMsg.style.fontSize = '0.8rem';
            emptyMsg.textContent = 'No layers available';
            grid.appendChild(emptyMsg);
        } else {
            // First option (None/Empty)
            const noneThumb = document.createElement('div');
            noneThumb.className = 'thumbnail-item';
            noneThumb.title = "None";
            noneThumb.innerHTML = `<span class="thumbnail-none"><i class="fa-solid fa-ban"></i>None</span>`;

            // Add click listener for 'None'
            noneThumb.addEventListener('click', () => {
                // Remove active class from all peers
                Array.from(grid.children).forEach(child => child.classList.remove('active'));
                noneThumb.classList.add('active');

                layerImg.src = "";
                layerImg.classList.add('hidden');
            });
            grid.appendChild(noneThumb);

            // Add real thumbnails
            layers.forEach((layer, layerIdx) => {
                const thumb = document.createElement('div');
                thumb.className = 'thumbnail-item';
                thumb.title = layer.name;

                const thumbImg = document.createElement('img');
                thumbImg.crossOrigin = "Anonymous";
                thumbImg.src = `${STATIC_BASE}/${layer.path}`;
                thumbImg.alt = layer.name;
                thumb.appendChild(thumbImg);

                // Auto-select first actual layer
                if (layerIdx === 0) {
                    thumb.classList.add('active');
                    layerImg.crossOrigin = "Anonymous";
                    layerImg.src = `${STATIC_BASE}/${layer.path}`;
                    layerImg.classList.remove('hidden');
                }

                // Add click listener
                thumb.addEventListener('click', () => {
                    // Remove active class from all peers
                    Array.from(grid.children).forEach(child => child.classList.remove('active'));
                    thumb.classList.add('active');

                    layerImg.crossOrigin = "Anonymous";
                    layerImg.src = `${STATIC_BASE}/${layer.path}`;
                    layerImg.classList.remove('hidden');
                });

                grid.appendChild(thumb);
            });

            // If layers exist but first item wasn't active (defensive check)
            if (!Array.from(grid.children).some(c => c.classList.contains('active'))) {
                noneThumb.classList.add('active');
            }
        }

        controlDiv.appendChild(grid);
        dynamicControls.appendChild(controlDiv);
    });
}

// Event Listeners
characterSelect.addEventListener('change', updatePreview);

// Drag and Drop Upload
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    if (e.dataTransfer.files.length) {
        handleUpload(e.dataTransfer.files[0]);
    }
});

psdInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleUpload(e.target.files[0]);
    }
});

async function handleUpload(file) {
    if (!file.name.toLowerCase().endsWith('.psd')) {
        alert('Please drop a valid .psd file.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    uploadStatus.classList.remove('hidden', 'error');
    uploadText.textContent = `Uploading ${file.name}...`;
    dropZone.style.pointerEvents = 'none';

    try {
        const res = await fetch(`${API_BASE}/upload-psd/`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Upload failed');
        }

        uploadText.textContent = "Upload successful! Extracting...";

        // Refresh characters
        await fetchCharacters();
        uploadStatus.classList.add('hidden');

        if (characterSelect.value) {
            updatePreview();
        }

        alert("Character extracted and added to the list!");

    } catch (err) {
        console.error("Upload error:", err);
        uploadStatus.classList.add('error');
        uploadText.textContent = "Error: " + err.message;
        uploadStatus.querySelector('.spinner').style.display = 'none';
    } finally {
        dropZone.style.pointerEvents = 'auto';
        // reset input
        psdInput.value = "";
    }
}

// Download functionality
document.getElementById('downloadBtn').addEventListener('click', async () => {
    // 1. Get all currently visible layer images
    const visibleLayers = Array.from(layerContainer.querySelectorAll('img.layer:not(.hidden)'));

    if (visibleLayers.length === 0) {
        alert("No character or layers selected to download.");
        return;
    }

    // Sort layers by their z-index to ensure correct drawing order (bottom to top)
    visibleLayers.sort((a, b) => {
        return parseInt(a.style.zIndex || 0) - parseInt(b.style.zIndex || 0);
    });

    // 2. Create a temporary canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Attempt to parse dimensions from the container or the first image
    const firstImg = visibleLayers[0];
    // Create a new image object to ensure it's loaded before reading dimensions
    const tempImg = new Image();
    tempImg.crossOrigin = "Anonymous";

    // We wrapped the rest of the flow in a promise to ensure naturalWidth is parsed correctly
    try {
        await new Promise((resolve, reject) => {
            tempImg.onload = resolve;
            tempImg.onerror = reject;
            tempImg.src = firstImg.src;
            // If image is already cached, complete is true immediately
            if (tempImg.complete && tempImg.naturalWidth > 0) {
                resolve();
            }
        });
    } catch (e) {
        console.error("Failed to parse image dimension for canvas", e);
    }

    // Safely apply original PSD dimensions to prevent squishing
    // If it STILL fails (e.g. 0), provide a square fallback to avoid 0-byte crashes, but it shouldn't
    const canvasW = tempImg.naturalWidth > 0 ? tempImg.naturalWidth : 1000;
    const canvasH = tempImg.naturalHeight > 0 ? tempImg.naturalHeight : 1000;

    canvas.width = canvasW;
    canvas.height = canvasH;

    // 3. Draw each layer onto the canvas
    visibleLayers.forEach(img => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    });

    const charName = characterSelect.options[characterSelect.selectedIndex]?.text || 'character';
    const defaultFilename = `${charName}_export.png`;

    // 4. File System Access API must be called synchronously inside the click handler
    if (window.showSaveFilePicker) {
        try {
            // Show standard save dialog to choose location and name immediately
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFilename,
                types: [{
                    description: 'PNG Image',
                    accept: { 'image/png': ['.png'] }
                }]
            });

            // Only convert to blob after the user has picked a file
            canvas.toBlob(async (blob) => {
                try {
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } catch (writeErr) {
                    console.error("Error writing to file:", writeErr);
                    alert("Failed to save file data.");
                }
            }, 'image/png');

        } catch (err) {
            // Ignore AbortError (user cancelled dialog)
            if (err.name !== 'AbortError') {
                console.error("Save file dialog failed:", err);

                // Fallback if the picker fails for some other reason
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = defaultFilename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 'image/png');
            }
        }
    } else {
        // Fallback for older browsers (or browsers block API without secure context)
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    }
});

// Start
fetchCharacters();
