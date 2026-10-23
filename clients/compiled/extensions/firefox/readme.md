### Install in Firefox 48

Because the file is unsigned, standard installation will block it. Bypass it using the configuration change:

0. Rename Correct **manifest_v2.json** file to `manifest.json`
1. Open **Firefox 48**.
2. Type `about:config` into the address bar and press **Enter**. Click the button to accept the risk warning.
3. Type `xpinstall.signatures.required` into the search box at the top.
4. **Double-click** the setting in the list to change its value from `true` to `false`.
5. Drag your `daily-gk.xpi` file from your desktop and **drop it directly onto the open Firefox window**.
