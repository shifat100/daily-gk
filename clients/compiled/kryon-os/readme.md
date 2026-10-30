
# Daily GK App — KryonOS Installation & Setup Guide

This guide explains how to locally install and run the **Daily GK** application on your KryonOS-powered device (ESP32 / ESP32-S3 / CYD / M5Stack Cardputer, etc.).

---

## 1. Required Files

Make sure your package folder contains the following two files:

```text
com.dailygk.quiz/
├── app.json
└── main.js
```

---

## 2. Installation Methods (Choose Any One)

### Method 1: Using MicroSD Card & On-Device App Installer (Recommended / Offline)

1. Insert your **MicroSD card** into a computer/card reader (ensure the card is formatted as **FAT32**).
2. Create a folder named `com.dailygk.quiz` anywhere on the card (e.g., in the root directory or a `Downloads` folder).
3. Copy both `app.json` and `main.js` inside the `com.dailygk.quiz/` folder.
4. Eject the SD card, insert it into your KryonOS device, and power it on.
5. From the KryonOS Home Screen, scroll down and tap **`App Installer`** under the **`[ SYSTEM ]`** section.
6. Select **`SD Card`** and browse to the directory where you placed the folder.
7. You will see **`[App] Daily GK`** listed. Tap on it.
8. Review the metadata screen and tap the green **`Install`** button.
9. Once the progress reaches 100%, return to the Home Screen—**Daily GK** will now be available under **`[ APPS ]`**.

---

### Method 2: Using the Built-In Web Server & Browser (Wireless / Local Flash)

If you do not have an SD card, you can install the app directly into internal flash memory via the KryonOS Web IDE:

1. Enable Wi-Fi on your device via **Settings > WiFi Options**.
2. Navigate to **Settings > WiFi Options > Web Server** and tap **Turn ON**.
3. Note the displayed **IP Address** (e.g., `http://192.168.0.105`) along with the **User** and **Pass** credentials.
4. Open a browser on your PC or smartphone, navigate to the device's IP, and log in.
5. In the storage sidebar, select **`LittleFS (Flash)`**.
6. Open the **`apps`** directory (path: `/littlefs/apps/`).
7. Click the **New Folder** button on the toolbar and name it: `com.dailygk.quiz`.
8. Enter the newly created `com.dailygk.quiz` folder and click **Upload** to upload both `app.json` and `main.js`.
9. Once uploaded, exit to the KryonOS Launcher or restart your device. **Daily GK** will appear on the Home Screen.

---

### Method 3: Direct File Placement (Advanced)

To bypass the installer and deploy the app directly:

1. Mount your MicroSD card and place the folder directly at:
   ```text
   /sd/apps/com.dailygk.quiz/
   ```
   *(Or for internal flash memory: `/local/apps/com.dailygk.quiz/`)*
2. Re-insert the card into your device and boot into KryonOS. The OS will automatically scan `/sd/apps/` and register **Daily GK** on the Home Screen.

---

## 3. Where to Place `.PAK` Data Files

After launching Daily GK, the app scans storage for questions and quiz packs. Place your generated `.pak` files in any of the following locations:

* **On MicroSD Card:**
  * `/sd/daily-gk/` *(recommended)*
  * Root folder: `/sd/`
* **On Internal Flash:**
  * `/local/daily-gk/`
  * Root folder: `/local/`

> **Online Downloader:** When connected to Wi-Fi, open the in-app menu and select **`1. Download Packages`** to download quiz packs directly from GitHub onto your device.

---

## 4. Troubleshooting

* **Installation Blocked (Invalid Package Name / Author Conflict)?**
  * The `packageName` in `app.json` must be strictly lowercase, contain no spaces, and include at least one dot (e.g., `com.dailygk.quiz`).
  * The `api` level in `app.json` must be less than or equal to your device's current KryonOS API level (default: `1`).
* **App Crashes or Shows a Black Screen on Launch?**
  * If your board has limited SRAM (no PSRAM enabled), disable Wi-Fi in **Settings > WiFi Options** to free up 60–80 KB of RAM before launching the app.
