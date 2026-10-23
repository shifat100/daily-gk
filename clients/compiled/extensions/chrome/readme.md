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


### Google Chrome Manifest Version Support by Chrome Release Version

Below is the definitive timeline tracking Manifest V2 (MV2) deprecation and Manifest V3 (MV3) implementation based on specific Google Chrome browser release versions.

| Chrome Version | Manifest V2 Status | Manifest V3 Status |
| :--- | :--- | :--- |
| **Chrome 88** *(Dec 2020)* | Fully Supported | **Official Introduction:** MV3 support is natively added to the browser engine. |
| **Chrome 127** *(Jul 2024)* | **Warnings Initiated:** Disabled automatically in pre-release channels (Beta/Dev). Users see warning banners in stable channels. | Primary stable platform. |
| **Chrome 138** *(Jul 2025)* | **End of Execution:** Automatically disabled for all users on the stable release channel. Dynamic code blocks are blocked from running. | Dominant production framework. |
| **Chrome 144** *(Jan 2026)* | **Enterprise Support Ends:** Administrative enterprise policies (`ExtensionManifestV2Availability`) completely lose functionality. | The only operational format for corporate environments. |
| **Chrome 151** *(Sep 2026)* | **Engine Code Purged:** Legacy code supporting Manifest V2 parsing is completely deleted from the Chromium repository. | **100% Mandatory:** The browser engine will refuse to read or process V2 syntax. |

***

### Key Technical Shifts between Versions

* **Chrome 88 to 126:** The transitional era. Extensions written in either Manifest V2 or Manifest V3 can be packed, loaded as unpacked developer folders, or downloaded from the Web Store seamlessly.
* **Chrome 127 to 137:** The warning and phase-out window. Standard users are progressively blocked from running local unverified MV2 `.crx` assets or developer unpacks unless temporary fallback flags are adjusted.
* **Chrome 138+:** The pure Manifest V3 era. Passing `"manifest_version": 2` inside a custom `manifest.json` file instantly triggers a parsing crash or corruption error upon installation.
