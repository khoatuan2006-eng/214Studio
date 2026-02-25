const API_BASE = 'http://localhost:8001/api';
const STATIC_BASE = 'http://localhost:8001/static';

// DOM Elements
const characterSelect = document.getElementById('characterSelect');
const dynamicControls = document.getElementById('dynamicControls');
const layerContainer = document.getElementById('layerContainer');
const previewPlaceholder = document.getElementById('previewPlaceholder');

const dropZone = document.getElementById('dropZone');
const psdInput = document.getElementById('psdInput');
const uploadStatus = document.getElementById('uploadStatus');
const uploadText = document.getElementById('uploadText');

let appData = []; // Store characters from DB

// Init
async function fetchCharacters() {
    try {
        const res = await fetch(`${API_BASE}/characters/`);
        if (!res.ok) throw new Error('Failed to fetch characters');

        appData = await res.json();
        populateCharacterSelect();
    } catch (err) {
        console.error('API Error:', err);
    }
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
