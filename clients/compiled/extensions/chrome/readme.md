### Install CRX Extension in Google Chrome

Because local `.crx` files are not downloaded from the official Chrome Web Store, standard installation paths are blocked. You must use Chrome's built-in Developer Mode to install your package.

#### Method 1: Direct CRX Drag-and-Drop Installation
This is the standard approach for installing pre-packed extension files directly into your browser window.

1. Open **Google Chrome**.
2. Type `chrome://extensions/` into the address bar and press **Enter** to open the Extensions dashboard.
3. In the top-right corner of the page, locate the **Developer mode** toggle switch and turn it **ON**.
4. Locate your `.crx` extension file on your computer desktop or file explorer.
5. Drag the `.crx` file and **drop it directly** anywhere onto the open `chrome://extensions/` webpage.
6. A confirmation prompt will pop up asking: *"Add [Extension Name]?"*. Click **Add extension** to finish installation.

#### Method 2: Unpacked Folder Extraction (Fallback Bypassing Corrupt Errors)
If your Chrome version displays an installation error, policy block, or claims the `.crx` archive formatting is corrupt, you can bypass the packaging system entirely by extracting the source code.

1. Rename your file's extension from `.crx` to **`.zip`** (e.g., rename `daily-gk.crx` to `daily-gk.zip`).
2. **Extract/Unzip** that file into a new regular folder on your desktop.
3. Open **Google Chrome** and navigate to `chrome://extensions/`.
4. Ensure the **Developer mode** toggle switch in the top-right corner is turned **ON**.
5. Click the **Load unpacked** button located in the top-left corner of the dashboard toolbar.
6. Browse your system, select the extracted desktop folder (the one containing your root `manifest.json` file), and click **Select Folder**.
