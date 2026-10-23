### Install in Firefox 48

Because the file is unsigned, standard installation will block it. Bypass it using the configuration change:

1. Open **Firefox 48**.
2. Type `about:config` into the address bar and press **Enter**. Click the button to accept the risk warning.
3. Type `xpinstall.signatures.required` into the search box at the top.
4. **Double-click** the setting in the list to change its value from `true` to `false`.
5. Drag your `daily-gk-mani2.xpi` file from your desktop and **drop it directly onto the open Firefox window**.


### Firefox Manifest Version Support Timeline

| Manifest Version | Supported Firefox Versions | Status Details |
| :--- | :--- | :--- |
| **Manifest V2** | **Firefox 48 to Present** | **Fully Active (Deprecated).** Firefox is gradually deprecating V2, but it remains active for enterprise and legacy compatibility. |
| **Manifest V3** | **Firefox 109 to Present** | **Current Standard.** Full, stable production support was officially enabled in **Firefox 109**. |

***

### Key Transition Details

* **Firefox 48:** The very first version to natively support modern WebExtensions using the **Manifest V2** standard.
* **Firefox 101 to 108:** Contained experimental, hidden preview support for Manifest V3 (disabled by default or required toggling developer flags).
* **Firefox 109:** Released as the milestone version where **Manifest V3** became fully stable, production-ready, and enabled by default for all users.

###  Local Installation in Firefox 109 And Upper

Because Firefox 109 is a modern production version, it strictly blocks the permanent installation of unsigned local `.xpi` files. You can test your extension locally using one of the following two routes:

#### Option A: Temporary Load (Best for Development)
This method lets you load your extension instantly on a standard production version of Firefox 109 without changing any security flags. 

1. Open **Firefox 109**.
2. Type `about:debugging#/runtime/this-firefox` into the address bar and press **Enter**.
3. Click the **Load Temporary Add-on…** button.
4. Navigate to your project folder and select your **`manifest.json`** file (or select the built `.xpi` file).

*Note: The extension will remain active until you close or restart Firefox.*

#### Option B: Permanent Load (Requires Developer Edition/Nightly)
If you want the unsigned extension to stay installed permanently when the browser restarts, you must use a developer version of the browser.

1. Download and open **Firefox Developer Edition** or **Firefox Nightly** (Version 109+).
2. Type `about:config` into the address bar and press **Enter**. Click the button to accept the risk warning.
3. Type `xpinstall.signatures.required` into the search box at the top.
4. **Double-click** the setting in the list to change its value from `true` to `false`.
5. Drag your newly created `daily-gk-mani3.xpi` file from your desktop and **drop it directly onto the open Firefox window** to install it permanently.
