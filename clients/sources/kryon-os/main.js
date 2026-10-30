/**
 * Daily GK for KryonOS (DGTX Clean Text Engine)
 * Automated Catalog Downloader under Menu System
 */

var SCREEN_WIDTH = System.screenWidth();   // 240
var SCREEN_HEIGHT = System.screenHeight(); // 320

// UI Colors
var COLOR_BG       = System.color(18, 22, 30);
var COLOR_CARD     = System.color(28, 34, 46);
var COLOR_HL       = System.color(30, 144, 255);
var COLOR_GREEN    = System.color(46, 204, 113);
var COLOR_RED      = System.color(231, 76, 60);
var COLOR_TEXT     = System.color(255, 255, 255);
var COLOR_MUTED    = System.color(170, 175, 185);
var COLOR_ORANGE   = System.color(243, 156, 18);
var COLOR_BAR_BG   = System.color(14, 18, 25);
var COLOR_BORDER   = System.color(45, 52, 65);
var COLOR_MODAL_BG = System.color(12, 15, 22);

// Application States
var STATE_FILE_LIST     = 0;
var STATE_NO_FILES      = 1;
var STATE_QUESTION      = 2;
var STATE_FEEDBACK      = 3;
var STATE_MENU          = 4;
var STATE_SCORECARD     = 5;
var STATE_DOWNLOAD_MENU = 6;
var STATE_DOWNLOADING   = 7;

// Modes
var MODE_QUIZ  = 0;
var MODE_STUDY = 1;

// Catalog & Base Download URL
var CATALOG_URL  = "https://raw.githubusercontent.com/shifat100/daily-gk/main/packs.json";
var RAW_BASE_URL = "https://raw.githubusercontent.com/shifat100/daily-gk/main/";

var app = {
    state: STATE_FILE_LIST,
    prevState: STATE_FILE_LIST,
    readMode: MODE_QUIZ,

    pakList: [],
    fileListPage: 0,
    filesPerPage: 5,
    selectedFileIdx: 0,
    searchFilter: "",

    menuSelectedIdx: 0,

    // Online Download Packs Cache
    onlinePacks: [],
    onlinePage: 0,
    downloadProgress: 0,
    downloadStatusText: "",

    questions: [],
    totalQuestions: 0,
    currentQId: 0,
    selectedOption: 0,
    userChoice: -1,
    score: 0,

    lastTouchState: false
};

// =========================================================================
// Text Wrapping Helper
// =========================================================================
function wrapText(str, maxChars) {
    if (!str) return [];
    var words = str.split(" ");
    var lines = [];
    var curLine = "";

    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if ((curLine + " " + w).trim().length <= maxChars) {
            curLine = (curLine + " " + w).trim();
        } else {
            if (curLine.length > 0) lines.push(curLine);
            curLine = w;
        }
    }
    if (curLine.length > 0) lines.push(curLine);
    return lines;
}

// =========================================================================
// DGTX Footer Extractor
// =========================================================================
function extractDgtxPayload(rawStr) {
    if (!rawStr || rawStr.length < 28) return null;

    var dgtxTag = rawStr.substring(rawStr.length - 4);
    if (dgtxTag === "DGTX") {
        var b0 = rawStr.charCodeAt(rawStr.length - 8) & 0xFF;
        var b1 = rawStr.charCodeAt(rawStr.length - 7) & 0xFF;
        var b2 = rawStr.charCodeAt(rawStr.length - 6) & 0xFF;
        var b3 = rawStr.charCodeAt(rawStr.length - 5) & 0xFF;
        var payloadSize = ((b0) | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;

        if (payloadSize > 0 && (rawStr.length - 8 - payloadSize) >= 0) {
            var jsonStart = rawStr.length - 8 - payloadSize;
            var jsonStr = rawStr.substring(jsonStart, jsonStart + payloadSize);
            try {
                return JSON.parse(jsonStr);
            } catch (err) {
                print("[DGTX] JSON parse error: " + err);
            }
        }
    }

    var directIdx = rawStr.lastIndexOf('[{"id":');
    if (directIdx !== -1) {
        var potentialJson = rawStr.substring(directIdx);
        var endIdx = potentialJson.lastIndexOf("}]");
        if (endIdx !== -1) {
            var candidate = potentialJson.substring(0, endIdx + 2);
            try {
                return JSON.parse(candidate);
            } catch (e2) {}
        }
    }

    return null;
}

// =========================================================================
// Storage Scanner
// =========================================================================
function isExcluded(name) {
    var s = name.toLowerCase();
    if (s === "." || s === "..") return true;
    return (s.indexOf("video") >= 0 || s.indexOf("audio") >= 0 ||
            s.indexOf("music") >= 0 || s.indexOf("record") >= 0 ||
            s.indexOf("system volume") >= 0 || s.indexOf("photo") >= 0 ||
            s.indexOf("image") >= 0 || s.indexOf("dcim") >= 0 ||
            s.indexOf("lost.dir") >= 0 || s.indexOf(".android") >= 0);
}

function scanDir(dir) {
    if (!FS.exists(dir)) return;
    var list = FS.listDir(dir);
    for (var i = 0; i < list.length; i++) {
        var full = list[i];
        if (full.toLowerCase().endsWith(".pak")) {
            var fn = full;
            var slash = fn.lastIndexOf("/");
            if (slash >= 0) fn = fn.substring(slash + 1);

            var exists = false;
            for (var j = 0; j < app.pakList.length; j++) {
                if (app.pakList[j].filename === fn) { exists = true; break; }
            }
            if (!exists) {
                app.pakList.push({
                    filepath: full,
                    filename: fn,
                    filesize: FS.getFileSize(full)
                });
            }
        }
    }
}

function scanAllDrives() {
    app.pakList = [];
    app.selectedFileIdx = 0;
    app.fileListPage = 0;

    if (FS.exists("/sd/")) {
        scanDir("/sd/");
        var sdDirs = FS.listDir("/sd/");
        for (var i = 0; i < sdDirs.length; i++) {
            if (FS.isDirectory(sdDirs[i]) && !isExcluded(sdDirs[i])) {
                scanDir(sdDirs[i]);
            }
        }
    }

    scanDir("/local/");
    var locDirs = FS.listDir("/local/");
    for (var k = 0; k < locDirs.length; k++) {
        if (FS.isDirectory(locDirs[k]) && !isExcluded(locDirs[k])) {
            scanDir(locDirs[k]);
        }
    }

    app.state = (app.pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
}

// =========================================================================
// PAK Loader
// =========================================================================
function openPak(path) {
    if (!FS.exists(path)) return false;

    System.fillScreen(COLOR_BG);
    System.setTextColor(COLOR_HL, COLOR_BG);
    System.drawString("Loading Package...", 50, 150, 2);

    var rawContent = FS.readTextFile(path);
    if (!rawContent || rawContent.length < 28) {
        System.notify("Read Error", "File is empty or corrupt!", "error", 3000);
        return false;
    }

    var parsed = extractDgtxPayload(rawContent);
    if (!parsed || !parsed.length) {
        System.notify("Format Error", "No DGTX text footer found!", "error", 3000);
        return false;
    }

    app.questions = parsed;
    app.totalQuestions = parsed.length;
    app.currentQId = 0;
    app.score = 0;
    app.selectedOption = 0;
    app.userChoice = -1;
    app.state = STATE_QUESTION;
    return true;
}

// =========================================================================
// Download Packages from packs.json
// =========================================================================
function fetchOnlineCatalog() {
    if (!Network.isConnected()) {
        Network.showWiFiPrompt();
        return;
    }

    System.fillScreen(COLOR_BG);
    System.setTextColor(COLOR_HL, COLOR_BG);
    System.drawString("Fetching packs.json...", 45, 140, 2);
    System.drawString("github.com/shifat100/daily-gk", 30, 165, 1);

    var res = Network.get(CATALOG_URL);
    if (res && res.status === 200 && res.body) {
        try {
            app.onlinePacks = JSON.parse(res.body);
            app.onlinePage = 0;
            app.state = STATE_DOWNLOAD_MENU;
            return;
        } catch (e) {
            print("[Catalog] JSON Error: " + e);
        }
    }

    // ফলব্যাক: যদি নেটওয়ার্ক থেকে ক্যাটালগ না আসে
    app.onlinePacks = [
        { "name": "Master Question Bank", "file": "data/master.pak", "questions": 7322, "size_kb": 30198.8 },
        { "name": "2026 সাধারণ জ্ঞান", "file": "data/2026/2026.pak", "questions": 2742, "size_kb": 11388.23 },
        { "name": "2025 সাধারণ জ্ঞান", "file": "data/2025/2025.pak", "questions": 3421, "size_kb": 13468.3 },
        { "name": "AI", "file": "data/ai/ai.pak", "questions": 1057, "size_kb": 4962.04 },
        { "name": "বই থেকে", "file": "data/books/books.pak", "questions": 102, "size_kb": 377.94 }
    ];
    app.onlinePage = 0;
    app.state = STATE_DOWNLOAD_MENU;
}

function startDownloadPack(packItem) {
    if (!Network.isConnected()) {
        Network.showWiFiPrompt();
        return;
    }

    var fullUrl = packItem.url;
    if (!fullUrl) {
        fullUrl = RAW_BASE_URL + packItem.file.replace("./", "");
    }

    var localDestDir = FS.exists("/sd/") ? "/sd/daily-gk/" : "/local/daily-gk/";
    if (!FS.exists(localDestDir)) {
        FS.mkdir(localDestDir);
    }

    var fileName = packItem.file.substring(packItem.file.lastIndexOf("/") + 1);
    var localPath = localDestDir + fileName;

    app.downloadProgress = 0;
    app.downloadStatusText = "Downloading " + fileName + "...";
    app.state = STATE_DOWNLOADING;
    drawScreen();

    var success = Network.downloadFile(fullUrl, localPath, function(readBytes, totalBytes) {
        if (totalBytes > 0) {
            app.downloadProgress = Math.floor((readBytes * 100) / totalBytes);
            drawDownloadingScreen();
        }
    });

    if (success) {
        System.notify("Saved!", fileName + " downloaded.", "success", 3000);
        scanAllDrives();
        app.state = STATE_FILE_LIST;
    } else {
        System.notify("Download Failed", "Network timeout or file error", "error", 3000);
        app.state = STATE_DOWNLOAD_MENU;
    }
    drawScreen();
}

// =========================================================================
// Screen Drawers
// =========================================================================
function drawSoftbar(left, center, right) {
    System.fillRect(0, 294, SCREEN_WIDTH, 26, COLOR_BAR_BG);
    System.drawLine(0, 294, SCREEN_WIDTH, 294, COLOR_BORDER);

    if (left && left.length > 0) {
        System.setTextColor(COLOR_HL, COLOR_BAR_BG);
        System.drawString(left, 8, 299, 2);
    }
    if (center && center.length > 0) {
        var cx = Math.floor(SCREEN_WIDTH / 2) - Math.floor(center.length * 3.5);
        System.setTextColor(COLOR_GREEN, COLOR_BAR_BG);
        System.drawString(center, cx, 299, 2);
    }
    if (right && right.length > 0) {
        var rx = SCREEN_WIDTH - (right.length * 7) - 8;
        System.setTextColor(COLOR_MUTED, COLOR_BAR_BG);
        System.drawString(right, rx, 299, 2);
    }
}

function drawFileList() {
    System.fillScreen(COLOR_BG);

    System.fillRect(0, 0, SCREEN_WIDTH, 26, COLOR_HL);
    System.setTextColor(COLOR_TEXT, COLOR_HL);
    System.drawString("Select Package (" + app.pakList.length + ")", 8, 6, 2);

    var startIdx = app.fileListPage * app.filesPerPage;
    var endIdx = Math.min(startIdx + app.filesPerPage, app.pakList.length);
    var curY = 32;

    for (var i = startIdx; i < endIdx; i++) {
        var isSel = (i === app.selectedFileIdx);
        var itemBg = isSel ? COLOR_HL : COLOR_CARD;
        var borderColor = isSel ? COLOR_TEXT : COLOR_BORDER;

        System.fillRect(8, curY, 224, 42, itemBg);
        System.drawRect(8, curY, 224, 42, borderColor);

        System.setTextColor(COLOR_TEXT, itemBg);
        var name = app.pakList[i].filename;
        if (name.length > 20) name = name.substring(0, 18) + "..";
        System.drawString("[" + (i + 1) + "] " + name, 14, curY + 6, 2);

        System.setTextColor(COLOR_MUTED, itemBg);
        var sz = Math.floor(app.pakList[i].filesize / 1024) + " KB";
        var drv = app.pakList[i].filepath.indexOf("/sd/") === 0 ? "SD Card" : "Flash";
        System.drawString(drv + " | " + sz, 14, curY + 23, 1);

        curY += 46;
    }

    var totalPages = Math.ceil(app.pakList.length / app.filesPerPage);
    if (totalPages > 1) {
        System.setTextColor(COLOR_MUTED, COLOR_BG);
        var pInfo = "Page " + (app.fileListPage + 1) + "/" + totalPages;
        System.drawString(pInfo, 100, 275, 1);
    }

    var leftBtn = (app.fileListPage > 0) ? "< Prev" : "Menu";
    var rightBtn = (endIdx < app.pakList.length) ? "Next >" : "Exit";
    drawSoftbar(leftBtn, "Open", rightBtn);
}

// Download Packages Screen (Rendered from packs.json)
function drawDownloadMenu() {
    System.fillScreen(COLOR_BG);

    System.fillRect(0, 0, SCREEN_WIDTH, 26, COLOR_GREEN);
    System.setTextColor(COLOR_TEXT, COLOR_GREEN);
    System.drawString("Download Packages", 8, 6, 2);

    var startIdx = app.onlinePage * 4;
    var endIdx = Math.min(startIdx + 4, app.onlinePacks.length);
    var curY = 32;

    for (var i = startIdx; i < endIdx; i++) {
        var pack = app.onlinePacks[i];
        System.fillRect(8, curY, 224, 52, COLOR_CARD);
        System.drawRect(8, curY, 224, 52, COLOR_BORDER);

        System.setTextColor(COLOR_HL, COLOR_CARD);
        var title = pack.name || pack.file;
        if (title.length > 20) title = title.substring(0, 18) + "..";
        System.drawString(title, 14, curY + 6, 2);

        System.setTextColor(COLOR_MUTED, COLOR_CARD);
        var qCount = pack.questions ? (pack.questions + " Qs") : "";
        var sz = pack.size_kb ? (Math.round(pack.size_kb) + " KB") : "";
        System.drawString(qCount + "  |  " + sz, 14, curY + 26, 1);

        System.fillRect(164, curY + 12, 60, 28, COLOR_HL);
        System.setTextColor(COLOR_TEXT, COLOR_HL);
        System.drawString("GET", 182, curY + 18, 2);

        curY += 58;
    }

    var totalPages = Math.ceil(app.onlinePacks.length / 4);
    var leftBtn = (app.onlinePage > 0) ? "< Prev" : "";
    var rightBtn = (endIdx < app.onlinePacks.length) ? "Next >" : "Back";
    drawSoftbar(leftBtn, "", rightBtn);
}

function drawDownloadingScreen() {
    System.fillScreen(COLOR_BG);

    System.fillRect(10, 80, 220, 160, COLOR_CARD);
    System.drawRect(10, 80, 220, 160, COLOR_HL);

    System.setTextColor(COLOR_TEXT, COLOR_CARD);
    System.drawString(app.downloadStatusText, 20, 100, 2);

    System.drawRect(20, 140, 200, 20, COLOR_BORDER);
    var fillW = Math.floor((app.downloadProgress * 196) / 100);
    if (fillW > 0) {
        System.fillRect(22, 142, fillW, 16, COLOR_GREEN);
    }

    System.setTextColor(COLOR_ORANGE, COLOR_CARD);
    System.drawString(app.downloadProgress + "%", 110, 175, 2);

    System.setTextColor(COLOR_MUTED, COLOR_CARD);
    System.drawString("Saving to Storage...", 65, 205, 1);
}

function drawQuestionScreen() {
    System.fillScreen(COLOR_BG);

    if (app.currentQId < 0 || app.currentQId >= app.totalQuestions) return;
    var qData = app.questions[app.currentQId];

    System.fillRect(0, 0, SCREEN_WIDTH, 26, COLOR_HL);
    System.setTextColor(COLOR_TEXT, COLOR_HL);
    var header = "Q " + (app.currentQId + 1) + "/" + app.totalQuestions +
                 (app.readMode === MODE_STUDY ? " (Study)" : " (Quiz)");
    System.drawString(header, 8, 6, 2);

    var qLines = wrapText(qData.q, 26);
    var qCardH = Math.max(50, (qLines.length * 16) + 12);
    System.fillRect(8, 30, 224, qCardH, COLOR_CARD);
    System.drawRect(8, 30, 224, qCardH, COLOR_BORDER);

    System.setTextColor(COLOR_TEXT, COLOR_CARD);
    var lineY = 36;
    for (var l = 0; l < qLines.length; l++) {
        System.drawString(qLines[l], 14, lineY, 2);
        lineY += 16;
    }

    var optY = 30 + qCardH + 6;
    var opts = qData.opts || [];
    var correctAns = qData.ans;

    for (var i = 0; i < 4; i++) {
        var optText = "[" + (i + 1) + "] " + (opts[i] !== undefined ? opts[i] : "-");
        var optBg = COLOR_CARD;
        var optBorder = COLOR_BORDER;

        if (app.readMode === MODE_STUDY) {
            if (i === correctAns) { optBg = COLOR_GREEN; optBorder = COLOR_GREEN; }
            else if (i === app.selectedOption) { optBg = COLOR_HL; optBorder = COLOR_HL; }
        } else {
            if (app.state === STATE_QUESTION) {
                if (i === app.selectedOption) { optBg = COLOR_HL; optBorder = COLOR_HL; }
            } else if (app.state === STATE_FEEDBACK) {
                if (i === correctAns) { optBg = COLOR_GREEN; optBorder = COLOR_GREEN; }
                else if (i === app.userChoice) { optBg = COLOR_RED; optBorder = COLOR_RED; }
            }
        }

        var optLines = wrapText(optText, 24);
        var optH = Math.max(28, (optLines.length * 15) + 6);

        System.fillRect(8, optY, 224, optH, optBg);
        System.drawRect(8, optY, 224, optH, optBorder);

        System.setTextColor(COLOR_TEXT, optBg);
        var optTextY = optY + 5;
        for (var ol = 0; ol < optLines.length; ol++) {
            System.drawString(optLines[ol], 14, optTextY, 2);
            optTextY += 15;
        }

        optY += optH + 4;
    }

    if (app.readMode === MODE_STUDY) {
        drawSoftbar("Menu", "Next >", "Packs");
    } else {
        if (app.state === STATE_FEEDBACK) {
            drawSoftbar("Menu", "Next Q >", "Packs");
        } else {
            drawSoftbar("Menu", "Submit", "Packs");
        }
    }
}

function drawNoFiles() {
    System.fillScreen(COLOR_BG);
    System.fillRect(0, 0, SCREEN_WIDTH, 26, COLOR_RED);
    System.setTextColor(COLOR_TEXT, COLOR_RED);
    System.drawString("No Packages Found!", 8, 6, 2);

    System.fillRect(8, 38, 224, 246, COLOR_CARD);
    System.setTextColor(COLOR_ORANGE, COLOR_CARD);
    System.drawString("No .PAK files detected!", 16, 48, 2);
    System.setTextColor(COLOR_TEXT, COLOR_CARD);
    System.drawString("Download packages from:", 16, 75, 2);
    System.setTextColor(COLOR_GREEN, COLOR_CARD);
    System.drawString("shifat100.github.io/daily-gk", 16, 95, 1);

    drawSoftbar("Menu", "Rescan", "Exit");
}

function drawMenu() {
    System.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_MODAL_BG);
    System.fillRect(12, 28, 216, 256, COLOR_CARD);
    System.fillRect(12, 28, 216, 26, COLOR_HL);
    System.setTextColor(COLOR_TEXT, COLOR_HL);
    System.drawString("Options Menu", 20, 34, 2);

    var menuTitles = [
        "1. Download Packages",
        "2. Search Questions",
        "3. Jump To Question",
        (app.readMode === MODE_STUDY) ? "4. Mode: [Study -> Quiz]" : "4. Mode: [Quiz -> Study]",
        "5. Rescan Storage",
        "6. Return to Packs"
    ];

    var my = 62;
    for (var m = 0; m < menuTitles.length; m++) {
        var mBg = (m === app.menuSelectedIdx) ? COLOR_HL : COLOR_CARD;
        System.fillRect(18, my, 204, 30, mBg);
        System.setTextColor(COLOR_TEXT, mBg);
        System.drawString(menuTitles[m], 26, my + 8, 2);
        my += 34;
    }

    drawSoftbar("Select", "", "Back");
}

function drawScorecard() {
    System.fillScreen(COLOR_BG);
    System.fillRect(10, 60, 220, 160, COLOR_CARD);
    System.drawRect(10, 60, 220, 160, COLOR_BORDER);
    System.setTextColor(COLOR_GREEN, COLOR_CARD);
    System.drawString("Quiz Completed!", 60, 80, 4);
    System.setTextColor(COLOR_TEXT, COLOR_CARD);
    System.drawString("Final Score: " + app.score + " / " + app.totalQuestions, 50, 120, 2);

    drawSoftbar("Again", "", "Pack List");
}

function drawScreen() {
    if (app.state === STATE_FILE_LIST) {
        drawFileList();
    } else if (app.state === STATE_QUESTION || app.state === STATE_FEEDBACK) {
        drawQuestionScreen();
    } else if (app.state === STATE_NO_FILES) {
        drawNoFiles();
    } else if (app.state === STATE_MENU) {
        drawMenu();
    } else if (app.state === STATE_SCORECARD) {
        drawScorecard();
    } else if (app.state === STATE_DOWNLOAD_MENU) {
        drawDownloadMenu();
    } else if (app.state === STATE_DOWNLOADING) {
        drawDownloadingScreen();
    }
}

// =========================================================================
// Input Event Handling (Touch)
// =========================================================================
function handleTouchInput(touch) {
    var x = touch.x;
    var y = touch.y;

    // 1. Softbar touches (y >= 290)
    if (y >= 290) {
        if (x < 80) {
            // Left Action
            if (app.state === STATE_FILE_LIST) {
                if (app.fileListPage > 0) {
                    app.fileListPage--;
                } else {
                    app.menuSelectedIdx = 0;
                    app.state = STATE_MENU;
                }
            } else if (app.state === STATE_NO_FILES) {
                app.menuSelectedIdx = 0;
                app.state = STATE_MENU;
            } else if (app.state === STATE_DOWNLOAD_MENU) {
                if (app.onlinePage > 0) {
                    app.onlinePage--;
                }
            } else if (app.state === STATE_QUESTION || app.state === STATE_FEEDBACK) {
                app.menuSelectedIdx = 0;
                app.state = STATE_MENU;
            } else if (app.state === STATE_MENU) {
                triggerMenuAction();
            } else if (app.state === STATE_SCORECARD) {
                app.score = 0;
                app.selectedOption = 0;
                app.userChoice = -1;
                app.currentQId = 0;
                app.state = STATE_QUESTION;
            }
        } else if (x >= 80 && x <= 160) {
            // Center Action
            if (app.state === STATE_FILE_LIST) {
                if (app.pakList.length > 0) {
                    openPak(app.pakList[app.selectedFileIdx].filepath);
                }
            } else if (app.state === STATE_NO_FILES) {
                scanAllDrives();
            } else if (app.state === STATE_QUESTION) {
                if (app.readMode === MODE_STUDY) {
                    if (app.currentQId + 1 < app.totalQuestions) {
                        app.currentQId++;
                    }
                } else {
                    app.userChoice = app.selectedOption;
                    if (app.userChoice === app.questions[app.currentQId].ans) {
                        app.score++;
                    }
                    app.state = STATE_FEEDBACK;
                }
            } else if (app.state === STATE_FEEDBACK) {
                if (app.currentQId + 1 < app.totalQuestions) {
                    app.selectedOption = 0;
                    app.userChoice = -1;
                    app.currentQId++;
                    app.state = STATE_QUESTION;
                } else {
                    app.state = STATE_SCORECARD;
                }
            }
        } else {
            // Right Action
            if (app.state === STATE_FILE_LIST) {
                var totalPages = Math.ceil(app.pakList.length / app.filesPerPage);
                if (app.fileListPage < totalPages - 1) {
                    app.fileListPage++;
                } else {
                    throw new Error("OS_EXIT");
                }
            } else if (app.state === STATE_DOWNLOAD_MENU) {
                var totalOnPages = Math.ceil(app.onlinePacks.length / 4);
                if (app.onlinePage < totalOnPages - 1) {
                    app.onlinePage++;
                } else {
                    app.state = STATE_FILE_LIST;
                }
            } else if (app.state === STATE_NO_FILES) {
                throw new Error("OS_EXIT");
            } else if (app.state === STATE_MENU) {
                app.state = (app.questions.length > 0) ? STATE_QUESTION : STATE_FILE_LIST;
            } else if (app.state === STATE_QUESTION || app.state === STATE_FEEDBACK || app.state === STATE_SCORECARD) {
                app.state = STATE_FILE_LIST;
            }
        }
        drawScreen();
        return;
    }

    // 2. File Selection List
    if (app.state === STATE_FILE_LIST) {
        var startIdx = app.fileListPage * app.filesPerPage;
        var endIdx = Math.min(startIdx + app.filesPerPage, app.pakList.length);
        var curY = 32;

        for (var i = startIdx; i < endIdx; i++) {
            if (x >= 8 && x <= 232 && y >= curY && y <= curY + 42) {
                app.selectedFileIdx = i;
                openPak(app.pakList[i].filepath);
                drawScreen();
                return;
            }
            curY += 46;
        }
    }

    // 3. Download Packages Screen (Touch GET Button)
    if (app.state === STATE_DOWNLOAD_MENU) {
        var startOIdx = app.onlinePage * 4;
        var endOIdx = Math.min(startOIdx + 4, app.onlinePacks.length);
        var curOY = 32;

        for (var j = startOIdx; j < endOIdx; j++) {
            if (y >= curOY && y <= curOY + 52) {
                startDownloadPack(app.onlinePacks[j]);
                return;
            }
            curOY += 58;
        }
    }

    // 4. Question Options Touch
    if (app.state === STATE_QUESTION) {
        var qLines = wrapText(app.questions[app.currentQId].q, 26);
        var qCardH = Math.max(50, (qLines.length * 16) + 12);
        var optStartY = 30 + qCardH + 6;

        for (var opt = 0; opt < 4; opt++) {
            var optLines = wrapText("[" + (opt + 1) + "] " + app.questions[app.currentQId].opts[opt], 24);
            var optH = Math.max(28, (optLines.length * 15) + 6);

            if (x >= 8 && x <= 232 && y >= optStartY && y <= optStartY + optH) {
                app.selectedOption = opt;
                if (app.readMode !== MODE_STUDY) {
                    app.userChoice = opt;
                    if (app.userChoice === app.questions[app.currentQId].ans) {
                        app.score++;
                    }
                    app.state = STATE_FEEDBACK;
                }
                drawScreen();
                return;
            }
            optStartY += optH + 4;
        }
    } else if (app.state === STATE_FEEDBACK) {
        if (app.currentQId + 1 < app.totalQuestions) {
            app.selectedOption = 0;
            app.userChoice = -1;
            app.currentQId++;
            app.state = STATE_QUESTION;
        } else {
            app.state = STATE_SCORECARD;
        }
        drawScreen();
    } else if (app.state === STATE_MENU) {
        var my = 62;
        for (var m = 0; m < 6; m++) {
            if (x >= 18 && x <= 222 && y >= my && y <= my + 30) {
                app.menuSelectedIdx = m;
                triggerMenuAction();
                drawScreen();
                return;
            }
            my += 34;
        }
    }
}

function triggerMenuAction() {
    switch (app.menuSelectedIdx) {
        case 0:
            // Download Packages from packs.json
            fetchOnlineCatalog();
            break;
        case 1:
            // Search
            var term = System.prompt("Search Question Text:", "");
            if (term && term.length > 0) {
                for (var i = 0; i < app.totalQuestions; i++) {
                    if (app.questions[i].q.toLowerCase().indexOf(term.toLowerCase()) >= 0) {
                        app.currentQId = i;
                        app.selectedOption = 0;
                        app.userChoice = -1;
                        break;
                    }
                }
            }
            app.state = STATE_QUESTION;
            break;
        case 2:
            // Jump
            var numStr = System.prompt("Jump To Q (1 - " + app.totalQuestions + "):", "");
            if (numStr) {
                var target = parseInt(numStr, 10);
                if (!isNaN(target) && target >= 1 && target <= app.totalQuestions) {
                    app.currentQId = target - 1;
                    app.selectedOption = 0;
                    app.userChoice = -1;
                }
            }
            app.state = STATE_QUESTION;
            break;
        case 3:
            // Mode toggle
            app.readMode = (app.readMode === MODE_QUIZ) ? MODE_STUDY : MODE_QUIZ;
            app.state = STATE_QUESTION;
            break;
        case 4:
            // Rescan
            scanAllDrives();
            break;
        case 5:
            // Back
            app.state = STATE_FILE_LIST;
            break;
    }
}

// =========================================================================
// Initialization
// =========================================================================
scanAllDrives();
drawScreen();

while (true) {
    var touch = System.getTouch();
    if (touch && touch.touched) {
        if (!app.lastTouchState) {
            handleTouchInput(touch);
            app.lastTouchState = true;
        }
    } else {
        app.lastTouchState = false;
    }
    System.delay(20);
}
