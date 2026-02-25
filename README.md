# 2D Character Builder (AnimeStudio)

A web-based 2D character avatar creation tool built with a Python backend (FastAPI) and a vanilla JavaScript/HTML/CSS frontend. It allows users to upload structured Photoshop (`.psd`) files, automatically parses and extracts their layers, prevents duplicate assets via MD5 hashing, and provides an interactive "Dressing Room" UI to mix, match, and export custom character designs.

## Features

- **PSD Parsing:** Automatically extracts nested groups and layers from Photoshop files (.psd) using `psd-tools`.
- **Smart Asset Library:** Hashes extracted layer images using MD5 to ensure deduplication. Only unique assets are saved to the server.
- **Library Organizer:** Allows users to create custom taxonomy (Categories like "Face", "Body", "Hair"), assign fixed Z-indexes, and create nested Subfolders (e.g., specific character sets).
- **Drag & Drop:** Fully supports HTML5 Drag & Drop to organize raw PSD layers into categorized Subfolders.
- **Dressing Room UI:** A streamlined avatar creation interface. Features a nested folder navigation system tailored to save screen real estate. Selected assets display dynamic visual feedback and a "remove" trash bin overlay.
- **Canvas Rendering:** Combines transparent PNG layers on an HTML5 `<canvas>` strictly according to their assigned Z-indexes. Supports exporting the final composition as a high-quality PNG.
- **Responsive Flexbox Layout:** The workspace is dynamically split, affording a massive 2/3rds of the screen to library organization while precisely anchoring the 1/3rd character preview to the side.

## Tech Stack

- **Backend:** Python 3, FastAPI, Uvicorn, psd-tools, Pillow
- **Frontend:** HTML5, CSS3, Vanilla JavaScript, FontAwesome
- **Data Storage:** JSON Files (`database.json`, `custom_library.json`) and local file system for images.

## Setup & Installation

**1. Clone the repository:**
```bash
git clone https://github.com/khoatuan2006-eng/214Studio.git
cd 214Studio
```

**2. Install Backend Dependencies:**
Ensure you have Python 3 installed. Install the requirements via pip:
```bash
cd backend
pip install -r ../requirements.txt
```

**3. Run the Backend Server:**
The backend uses FastAPI and Uvicorn to serve both the API endpoints and the static frontend UI.
```bash
python main.py
```
*The server will start locally on `http://localhost:8001`.*

**4. Access the Application:**
Open your web browser and navigate to `http://localhost:8001` to use the application UI.

## Usage

1. **Upload PSD:** Navigate to the "Base Mode" tab, drag and drop a `.psd` file into the upload zone to parse its layers.
2. **Organize Assets:** Open the "Library Organizer" modal. Create custom categories (e.g., Background, Body, Hair) and adjust their drawing order (Z-Index).
3. **Sort Layers:** Drag the freshly parsed layers from the raw lists into your custom Categories and Subfolders.
4. **Mix & Match:** Switch to the "Dressing Room" tab. Browse your organized taxonomy and click on items to assemble your character avatar.
5. **Download:** Click the "Download Character" button. The image will be composited on the canvas and saved to your device.
