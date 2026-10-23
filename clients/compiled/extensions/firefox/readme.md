### Install in Firefox 48

Because the file is unsigned, standard installation will block it. Bypass it using the configuration change:

0. Rename Correct **manifest_v2.json** file to `manifest.json`
1. Open **Firefox 48**.
2. Type `about:config` into the address bar and press **Enter**. Click the button to accept the risk warning.
3. Type `xpinstall.signatures.required` into the search box at the top.
4. **Double-click** the setting in the list to change its value from `true` to `false`.
5. Drag your `daily-gk.xpi` file from your desktop and **drop it directly onto the open Firefox window**.


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
