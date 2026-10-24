package {
    import flash.display.Sprite;
    import flash.display.Bitmap;
    import flash.display.BitmapData;
    import flash.display.StageScaleMode;
    import flash.display.StageAlign;
    import flash.display.Graphics;
    import flash.events.Event;
    import flash.events.KeyboardEvent;
    import flash.events.MouseEvent;
    import flash.geom.Point;
    import flash.geom.Rectangle;
    import flash.net.FileFilter;
    import flash.net.FileReference;
    import flash.net.SharedObject;
    import flash.net.URLRequest;
    import flash.net.navigateToURL;
    import flash.system.fscommand;
    import flash.text.TextField;
    import flash.text.TextFormat;
    import flash.ui.Keyboard;
    import flash.utils.ByteArray;
    import flash.utils.Endian;

    [SWF(width="320", height="480", frameRate="30", backgroundColor="0x12161E")]
    public class DailyGK extends Sprite {

        // --- Native Resolution Base ---
        private const BASE_WIDTH:int         = 320;
        private const BASE_HEIGHT:int        = 480;
        private const HEADER_HEIGHT:int      = 32;
        private const SOFTBAR_HEIGHT:int     = 32;

        private const QUESTION_W:int         = 224;
        private const QUESTION_BYTES_ROW:int = 28;
        private const OPTION_W:int           = 208;
        private const OPTION_BYTES_ROW:int   = 26;
        private const TOTAL_HELP_SLIDES:int  = 4;
        private const TOTAL_MENU_ITEMS:int   = 6;
        private const TOTAL_QMENU_ITEMS:int  = 5;

        private const DOWNLOAD_URL:String    = "https://shifat100.github.io/daily-gk/client-pack.html";
        private const STORAGE_ID:String      = "DailyGKStore_v2";

        // --- Color Palette: Dark & Light Themes ---
        private var isLightTheme:Boolean = false;

        private function get COLOR_BG():uint        { return isLightTheme ? 0xF4F6FA : 0x12161E; }
        private function get COLOR_CARD():uint      { return isLightTheme ? 0xFFFFFF : 0x1C222E; }
        private function get COLOR_CARD_HOV():uint  { return isLightTheme ? 0xEDF2F9 : 0x252D3D; }
        private function get COLOR_HL():uint        { return isLightTheme ? 0x2563EB : 0x1E90FF; }
        private function get COLOR_HL_TEXT():uint   { return 0xFFFFFF; }
        private function get COLOR_GREEN():uint     { return isLightTheme ? 0x16A34A : 0x2ECC71; }
        private function get COLOR_RED():uint       { return isLightTheme ? 0xDC2626 : 0xE74C3C; }
        private function get COLOR_TEXT():uint      { return isLightTheme ? 0x111827 : 0xFFFFFF; }
        private function get COLOR_MUTED():uint     { return isLightTheme ? 0x6B7280 : 0xAAAFB9; }
        private function get COLOR_ORANGE():uint    { return isLightTheme ? 0xD97706 : 0xF39C12; }
        private function get COLOR_BAR_BG():uint    { return isLightTheme ? 0xE5E7EB : 0x0E1219; }
        private function get COLOR_BORDER():uint    { return isLightTheme ? 0xCBD5E1 : 0x2D3441; }
        private function get COLOR_INK():uint       { return isLightTheme ? 0x111827 : 0xFFFFFF; }

        // --- Application States ---
        private const STATE_FILE_LIST:int     = 0;
        private const STATE_NO_FILES:int      = 1;
        private const STATE_MENU:int          = 2;
        private const STATE_HELP_CAROUSEL:int = 3;
        private const STATE_ABOUT:int         = 4;
        private const STATE_CONFIRM_EXIT:int  = 5;
        private const STATE_QUESTION:int      = 6;
        private const STATE_FEEDBACK:int      = 7;
        private const STATE_QUESTION_MENU:int = 8;
        private const STATE_INPUT_DIALOG:int  = 9;
        private const STATE_SCORECARD:int     = 10;

        // --- Reading Modes & Input Targets ---
        private const READING_MODE_QUIZ:int  = 0;
        private const READING_MODE_STUDY:int = 1;

        private const INPUT_TARGET_FILE_SEARCH:int = 0;
        private const INPUT_TARGET_Q_SEARCH:int    = 1;
        private const INPUT_TARGET_JUMP_Q:int      = 2;

        // --- App Context State ---
        private var state:int;
        private var prevState:int;
        private var readMode:int;

        private var pakList:Array = [];
        private var filteredIndices:Array = [];
        private var selectedFileIdx:int = 0;
        private var fileScrollOffset:int = 0;
        private var searchFilter:String = "";

        private var menuSelectedIdx:int = 0;
        private var qmenuSelectedIdx:int = 0;
        private var helpSlideIdx:int = 0;

        // --- Current Loaded PAK ---
        private var pakData:ByteArray = null;
        private var totalQuestions:uint = 0;
        private var indexOffset:uint = 0;
        private var searchOffset:uint = 0;
        private var payloadBase:uint = 0;

        private var currentQId:uint = 0;
        private var curQHeight:int = 0;
        private var curOptHeights:Array = [0, 0, 0, 0];
        private var curCorrectAnswer:int = 0;
        private var curQBitmapData:BitmapData;
        private var curOptBitmapData:Array = [null, null, null, null];

        private var selectedOption:int = 0;
        private var userChoice:int = -1;
        private var score:int = 0;

        // --- Custom Input Dialog State ---
        private var inputTarget:int;
        private var inputBuffer:String = "";

        // --- Screen Rendering Layers ---
        private var screenBitmapData:BitmapData;
        private var screenBitmap:Bitmap;
        private var tfHelper:TextField;
        private var textFormat:TextFormat;
        private var fileRef:FileReference;

        public function DailyGK() {
            if (stage) init();
            else addEventListener(Event.ADDED_TO_STAGE, init);
        }

        private function init(e:Event = null):void {
            removeEventListener(Event.ADDED_TO_STAGE, init);

            stage.scaleMode = StageScaleMode.NO_SCALE;
            stage.align = StageAlign.TOP_LEFT;

            screenBitmapData = new BitmapData(BASE_WIDTH, BASE_HEIGHT, false, 0x12161E);
            screenBitmap = new Bitmap(screenBitmapData);
            addChild(screenBitmap);

            tfHelper = new TextField();
            textFormat = new TextFormat("_sans", 12, 0xFFFFFF, false);
            tfHelper.defaultTextFormat = textFormat;
            tfHelper.autoSize = "left";
            tfHelper.multiline = false;
            tfHelper.wordWrap = false;

            readMode = READING_MODE_QUIZ;
            state = STATE_NO_FILES;
            prevState = STATE_NO_FILES;

            fileRef = new FileReference();
            fileRef.addEventListener(Event.SELECT, onFileSelected);
            fileRef.addEventListener(Event.COMPLETE, onFileLoaded);

            stage.addEventListener(KeyboardEvent.KEY_DOWN, handleKeyDown);
            stage.addEventListener(MouseEvent.MOUSE_UP, handleMouseUp);
            stage.addEventListener(Event.RESIZE, onStageResize);

            loadStoredPaks();
            applyFileFilter();

            onStageResize(null);
            drawScreen();
        }

        // ==========================================
        //  ADAPTIVE RESIZING (Popup & Fullscreen)
        // ==========================================

        private function onStageResize(e:Event):void {
            var curW:int = Math.max(BASE_WIDTH, stage.stageWidth);
            var curH:int = Math.max(BASE_HEIGHT, stage.stageHeight);

            if (screenBitmapData.width != curW || screenBitmapData.height != curH) {
                screenBitmapData.dispose();
                screenBitmapData = new BitmapData(curW, curH, false, COLOR_BG);
                screenBitmap.bitmapData = screenBitmapData;
            }
            drawScreen();
        }

        private function get screenW():int { return screenBitmapData.width; }
        private function get screenH():int { return screenBitmapData.height; }

        // ==========================================
        //  PERSISTENT STORAGE (Mirroring IndexedDB)
        // ==========================================

        private function loadStoredPaks():void {
            pakList = [];
            try {
                var so:SharedObject = SharedObject.getLocal(STORAGE_ID);
                if (so && so.data && so.data.savedPaks is Array) {
                    var list:Array = so.data.savedPaks as Array;
                    for (var i:int = 0; i < list.length; i++) {
                        var item:Object = list[i];
                        if (item && item.bytes is ByteArray) {
                            var rawBytes:ByteArray = item.bytes as ByteArray;
                            rawBytes.position = 0;
                            rawBytes.endian = Endian.LITTLE_ENDIAN;
                            pakList.push({
                                name: item.name,
                                size: item.size,
                                totalQuestions: item.totalQuestions,
                                bytes: rawBytes
                            });
                        }
                    }
                }
                if (so && so.data && so.data.theme != null) {
                    isLightTheme = (so.data.theme == "light");
                }
            } catch (err:Error) {}
        }

        private function savePaksToStorage():void {
            try {
                var so:SharedObject = SharedObject.getLocal(STORAGE_ID);
                var saveList:Array = [];
                for (var i:int = 0; i < pakList.length; i++) {
                    saveList.push({
                        name: pakList[i].name,
                        size: pakList[i].size,
                        totalQuestions: pakList[i].totalQuestions,
                        bytes: pakList[i].bytes
                    });
                }
                so.data.savedPaks = saveList;
                so.data.theme = isLightTheme ? "light" : "dark";
                so.flush();
            } catch (err:Error) {}
        }

        private function deletePak(idx:int):void {
            if (idx < 0 || idx >= pakList.length) return;
            pakList.splice(idx, 1);
            savePaksToStorage();
            applyFileFilter();
            if (selectedFileIdx >= filteredIndices.length) {
                selectedFileIdx = Math.max(0, filteredIndices.length - 1);
            }
            state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
            drawScreen();
        }

        // ==========================================
        //  DGK1 BINARY PARSER & BITMAP MASK BLITTER
        // ==========================================

        private function openSelectedPak(bytes:ByteArray):Boolean {
            if (!bytes || bytes.length < 20) return false;

            bytes.position = 0;
            bytes.endian = Endian.LITTLE_ENDIAN;

            var magic:String = bytes.readUTFBytes(4);
            if (magic != "DGK1") return false;

            totalQuestions = bytes.readUnsignedInt();
            indexOffset    = bytes.readUnsignedInt();
            searchOffset   = bytes.readUnsignedInt();
            payloadBase    = bytes.readUnsignedInt();

            if (totalQuestions == 0) return false;

            pakData = bytes;
            score = 0;
            selectedOption = 0;
            userChoice = -1;
            state = STATE_QUESTION;

            loadQuestion(0);
            return true;
        }

        private function loadQuestion(qId:uint):Boolean {
            if (!pakData || qId >= totalQuestions) return false;

            var entryPos:uint = indexOffset + (qId * 20);
            pakData.position = entryPos;

            var payloadOffset:uint = pakData.readUnsignedInt();
            curQHeight = pakData.readUnsignedShort();
            curOptHeights[0] = pakData.readUnsignedShort();
            curOptHeights[1] = pakData.readUnsignedShort();
            curOptHeights[2] = pakData.readUnsignedShort();
            curOptHeights[3] = pakData.readUnsignedShort();
            curCorrectAnswer = pakData.readUnsignedByte();

            var curOffset:uint = payloadBase + payloadOffset;

            // Load Question Mask
            pakData.position = curOffset;
            var qBytesLen:int = curQHeight * QUESTION_BYTES_ROW;
            var qBytes:ByteArray = new ByteArray();
            if (qBytesLen > 0 && pakData.bytesAvailable >= qBytesLen) {
                pakData.readBytes(qBytes, 0, qBytesLen);
            }
            curQBitmapData = decode1BitMask(qBytes, QUESTION_W, curQHeight, QUESTION_BYTES_ROW, COLOR_INK);
            curOffset += qBytesLen;

            // Load Option Masks
            for (var i:int = 0; i < 4; i++) {
                pakData.position = curOffset;
                var optBytesLen:int = curOptHeights[i] * OPTION_BYTES_ROW;
                var optBytes:ByteArray = new ByteArray();
                if (optBytesLen > 0 && pakData.bytesAvailable >= optBytesLen) {
                    pakData.readBytes(optBytes, 0, optBytesLen);
                }
                curOptBitmapData[i] = decode1BitMask(optBytes, OPTION_W, curOptHeights[i], OPTION_BYTES_ROW, COLOR_INK);
                curOffset += optBytesLen;
            }

            currentQId = qId;
            return true;
        }

        private function decode1BitMask(bytes:ByteArray, width:int, height:int, bytesPerRow:int, color:uint):BitmapData {
            var bmd:BitmapData = new BitmapData(Math.max(1, width), Math.max(1, height), true, 0x00000000);
            if (height <= 0 || !bytes || bytes.length == 0) return bmd;

            bytes.position = 0;
            var argb:uint = 0xFF000000 | color;

            bmd.lock();
            for (var r:int = 0; r < height; r++) {
                for (var b:int = 0; b < bytesPerRow; b++) {
                    if (bytes.bytesAvailable <= 0) break;
                    var val:int = bytes.readUnsignedByte();
                    if (val == 0) continue;

                    for (var bit:int = 0; bit < 8; bit++) {
                        if ((val & (0x80 >> bit)) != 0) {
                            var sx:int = (b * 8) + bit;
                            if (sx < width) {
                                bmd.setPixel32(sx, r, argb);
                            }
                        }
                    }
                }
            }
            bmd.unlock();
            return bmd;
        }

        private function searchQuestionInPak(keyword:String):void {
            if (!pakData || keyword.length == 0) return;

            var sPos:uint = searchOffset;
            var lowerKey:String = keyword.toLowerCase();

            for (var i:uint = 0; i < totalQuestions; i++) {
                pakData.position = sPos;
                var qId:uint = pakData.readUnsignedShort();
                var tLen:uint = pakData.readUnsignedShort();
                if (tLen > 120) tLen = 120;

                var strText:String = pakData.readUTFBytes(tLen);
                if (strText.toLowerCase().indexOf(lowerKey) != -1) {
                    loadQuestion(qId);
                    return;
                }
                sPos += 4 + tLen;
            }
        }

        // ==========================================
        //  UI RENDERING
        // ==========================================

        private function drawSystemText(x:int, y:int, str:String, color:uint, bold:Boolean = false):void {
            textFormat.color = color;
            textFormat.bold = bold;
            tfHelper.defaultTextFormat = textFormat;
            tfHelper.text = str;

            var bmd:BitmapData = new BitmapData(Math.ceil(tfHelper.textWidth + 6), Math.ceil(tfHelper.textHeight + 4), true, 0x00000000);
            bmd.draw(tfHelper);

            screenBitmapData.copyPixels(bmd, bmd.rect, new Point(x, y), null, null, true);
            bmd.dispose();
        }

        private function drawSoftbar(left:String, center:String, right:String):void {
            var yPos:int = screenH - SOFTBAR_HEIGHT;
            screenBitmapData.fillRect(new Rectangle(0, yPos, screenW, SOFTBAR_HEIGHT), COLOR_BAR_BG);
            for (var i:int = 0; i < screenW; i++) {
                screenBitmapData.setPixel(i, yPos, COLOR_BORDER);
            }

            if (left && left.length > 0) {
                drawSystemText(12, yPos + 7, left, COLOR_HL, true);
            }
            if (center && center.length > 0) {
                var cx:int = (screenW / 2) - int(center.length * 3.5);
                drawSystemText(cx, yPos + 7, center, COLOR_GREEN, true);
            }
            if (right && right.length > 0) {
                var rx:int = screenW - int(right.length * 7.5) - 12;
                drawSystemText(rx, yPos + 7, right, COLOR_MUTED, true);
            }
        }

        private function drawHeader(title:String, sub:String = ""):void {
            screenBitmapData.fillRect(new Rectangle(0, 0, screenW, HEADER_HEIGHT), COLOR_HL);
            drawSystemText(12, 7, title, COLOR_HL_TEXT, true);

            // Sub text (e.g. Score)
            if (sub.length > 0) {
                drawSystemText(screenW - 90, 7, sub, COLOR_HL_TEXT);
            }

            // Theme Toggle Button Icon in top right [T]
            var btnX:int = screenW - 28;
            screenBitmapData.fillRect(new Rectangle(btnX, 5, 22, 22), 0x33000000);
            drawSystemText(btnX + 6, 7, "T", 0xFFFFFF, true);
        }

        private function drawScreen():void {
            screenBitmapData.fillRect(new Rectangle(0, 0, screenW, screenH), COLOR_BG);

            var i:int, curY:int, actualIdx:int, itemBg:uint, optBg:uint;
            var maxContentW:int = Math.min(screenW - 24, 760);
            var contentX:int = (screenW - maxContentW) / 2;

            switch (state) {
                case STATE_FILE_LIST:
                    drawHeader("Daily GK (" + filteredIndices.length + " Found)");

                    // Import Button
                    screenBitmapData.fillRect(new Rectangle(contentX + maxContentW - 110, 38, 110, 24), COLOR_HL);
                    drawSystemText(contentX + maxContentW - 98, 42, "+ Import .PAK", COLOR_HL_TEXT, true);

                    curY = 68;
                    var visibleRows:int = Math.max(5, (screenH - 110) / 48);
                    var endRow:int = Math.min(filteredIndices.length, fileScrollOffset + visibleRows);

                    for (i = fileScrollOffset; i < endRow; i++) {
                        actualIdx = filteredIndices[i];
                        itemBg = (i == selectedFileIdx) ? COLOR_HL : COLOR_CARD;
                        screenBitmapData.fillRect(new Rectangle(contentX, curY, maxContentW, 42), itemBg);

                        var numKey:int = (i < 9) ? (i + 1) : 0;
                        var pakItem:Object = pakList[actualIdx];
                        drawSystemText(contentX + 8, curY + 4, "[" + numKey + "] " + pakItem.name, COLOR_TEXT, true);
                        drawSystemText(contentX + 8, curY + 22, "Size: " + (pakItem.size / 1024).toFixed(0) + " KB | Q: " + pakItem.totalQuestions, COLOR_MUTED);

                        // Delete button
                        var delX:int = contentX + maxContentW - 28;
                        screenBitmapData.fillRect(new Rectangle(delX, curY + 11, 20, 20), COLOR_RED);
                        drawSystemText(delX + 6, curY + 12, "X", 0xFFFFFF, true);

                        curY += 46;
                    }
                    drawSoftbar("Menu", "Play", "Exit");
                    break;

                case STATE_NO_FILES:
                    drawHeader("No Packages Found!");
                    screenBitmapData.fillRect(new Rectangle(contentX, 48, maxContentW, 200), COLOR_CARD);
                    drawSystemText(contentX + 16, 60, "No .PAK files currently loaded.", COLOR_ORANGE, true);

                    // Import button
                    screenBitmapData.fillRect(new Rectangle(contentX + 16, 90, 140, 28), COLOR_HL);
                    drawSystemText(contentX + 24, 96, "Select .PAK from PC", COLOR_HL_TEXT, true);

                    drawSystemText(contentX + 16, 134, "Official repository:", COLOR_TEXT);
                    drawSystemText(contentX + 16, 154, "shifat100.github.io/daily-gk", COLOR_GREEN);
                    drawSoftbar("Menu", "Rescan", "Exit");
                    break;

                case STATE_MENU:
                    drawHeader("Options Menu");
                    curY = 48;
                    for (i = 0; i < TOTAL_MENU_ITEMS; i++) {
                        itemBg = (i == menuSelectedIdx) ? COLOR_HL : COLOR_CARD;
                        screenBitmapData.fillRect(new Rectangle(contentX, curY, maxContentW, 36), itemBg);
                        drawSystemText(contentX + 14, curY + 10, getMenuTitle(i), (i == menuSelectedIdx) ? COLOR_HL_TEXT : COLOR_TEXT);
                        curY += 40;
                    }
                    drawSoftbar("Select", "", "Back");
                    break;

                case STATE_QUESTION_MENU:
                    drawHeader("Reading Options");
                    curY = 48;
                    for (i = 0; i < TOTAL_QMENU_ITEMS; i++) {
                        itemBg = (i == qmenuSelectedIdx) ? COLOR_HL : COLOR_CARD;
                        screenBitmapData.fillRect(new Rectangle(contentX, curY, maxContentW, 36), itemBg);
                        drawSystemText(contentX + 14, curY + 10, getQMenuTitle(i), (i == qmenuSelectedIdx) ? COLOR_HL_TEXT : COLOR_TEXT);
                        curY += 40;
                    }
                    drawSoftbar("Select", "", "Back");
                    break;

                case STATE_QUESTION:
                case STATE_FEEDBACK:
                    var modeText:String = (readMode == READING_MODE_STUDY) ? "Study" : "Quiz";
                    var scoreSub:String = (readMode == READING_MODE_QUIZ) ? "Score: " + score : "";
                    drawHeader("Q " + (currentQId + 1) + "/" + totalQuestions + " (" + modeText + ")", scoreSub);

                    curY = 40;
                    // Question Box
                    var qBoxH:int = Math.max(36, curQHeight + 12);
                    screenBitmapData.fillRect(new Rectangle(contentX, curY, maxContentW, qBoxH), COLOR_CARD);
                    if (curQBitmapData) {
                        var qCenterOffsetX:int = contentX + (maxContentW - QUESTION_W) / 2;
                        screenBitmapData.copyPixels(curQBitmapData, curQBitmapData.rect, new Point(Math.max(contentX + 8, qCenterOffsetX), curY + 6), null, null, true);
                    }
                    curY += qBoxH + 10;

                    // Option Rows
                    for (i = 0; i < 4; i++) {
                        var optBoxH:int = Math.max(30, curOptHeights[i] + 10);
                        optBg = COLOR_CARD;

                        if (readMode == READING_MODE_STUDY) {
                            if (i == curCorrectAnswer) optBg = COLOR_GREEN;
                            else if (i == selectedOption) optBg = COLOR_HL;
                        } else {
                            if (state == STATE_QUESTION) {
                                if (i == selectedOption) optBg = COLOR_HL;
                            } else if (state == STATE_FEEDBACK) {
                                if (i == curCorrectAnswer) optBg = COLOR_GREEN;
                                else if (i == userChoice) optBg = COLOR_RED;
                            }
                        }

                        screenBitmapData.fillRect(new Rectangle(contentX, curY, maxContentW, optBoxH), optBg);
                        if (curOptBitmapData[i]) {
                            var optCenterOffsetX:int = contentX + (maxContentW - OPTION_W) / 2;
                            screenBitmapData.copyPixels(curOptBitmapData[i], curOptBitmapData[i].rect, new Point(Math.max(contentX + 12, optCenterOffsetX), curY + 5), null, null, true);
                        }
                        curY += optBoxH + 6;
                    }

                    if (readMode == READING_MODE_STUDY) {
                        drawSoftbar("Menu", "Next >", "Packs");
                    } else {
                        drawSoftbar("Menu", (state == STATE_FEEDBACK) ? "Next" : "OK", "Back");
                    }
                    break;

                case STATE_HELP_CAROUSEL:
                    drawHeader("Help Guide (" + (helpSlideIdx + 1) + "/4)");
                    screenBitmapData.fillRect(new Rectangle(contentX, 48, maxContentW, 230), COLOR_CARD);

                    if (helpSlideIdx == 0) {
                        drawSystemText(contentX + 16, 62, "[1. About .PAK Files]", COLOR_HL, true);
                        drawSystemText(contentX + 16, 90, "Daily GK uses .PAK packages.", COLOR_TEXT);
                        drawSystemText(contentX + 16, 110, "Each package contains ready", COLOR_TEXT);
                        drawSystemText(contentX + 16, 130, "pre-rendered global MCQs.", COLOR_TEXT);
                        drawSystemText(contentX + 16, 160, "No font needed on device!", COLOR_GREEN, true);
                        drawSystemText(contentX + 16, 180, "Zero CPU load, zero lag.", COLOR_MUTED);
                    } else if (helpSlideIdx == 1) {
                        drawSystemText(contentX + 16, 62, "[2. Storage & Folders]", COLOR_HL, true);
                        drawSystemText(contentX + 16, 90, "Put .pak anywhere on storage.", COLOR_TEXT);
                        drawSystemText(contentX + 16, 120, "Excluded folders:", COLOR_ORANGE, true);
                        drawSystemText(contentX + 16, 140, "Videos, Audio, Music, Photos,", COLOR_RED);
                        drawSystemText(contentX + 16, 160, "DCIM, System Volume.", COLOR_RED);
                    } else if (helpSlideIdx == 2) {
                        drawSystemText(contentX + 16, 62, "[3. Dual Touch & Keys]", COLOR_HL, true);
                        drawSystemText(contentX + 16, 90, "Touch any Option to Select", COLOR_GREEN, true);
                        drawSystemText(contentX + 16, 110, "Keys 1-4: Select Option directly", COLOR_TEXT);
                        drawSystemText(contentX + 16, 130, "D-Pad Up/Down: Highlight", COLOR_TEXT);
                        drawSystemText(contentX + 16, 150, "Key 1-9 in List: Jump file", COLOR_GREEN);
                        drawSystemText(contentX + 16, 175, "Study Mode available in menu!", COLOR_ORANGE);
                    } else if (helpSlideIdx == 3) {
                        drawSystemText(contentX + 16, 62, "[4. Download More]", COLOR_HL, true);
                        drawSystemText(contentX + 16, 90, "Need more quiz questions?", COLOR_TEXT);
                        drawSystemText(contentX + 16, 110, "Download packages from:", COLOR_TEXT);
                        drawSystemText(contentX + 16, 135, "shifat100.github.io/daily-gk", COLOR_GREEN);
                        drawSystemText(contentX + 16, 170, "Click [Download] to open web.", COLOR_HL);
                    }
                    drawSoftbar((helpSlideIdx == 3) ? "Download" : "< Prev", "Next >", "Back");
                    break;

                case STATE_ABOUT:
                    drawHeader("About Daily GK");
                    screenBitmapData.fillRect(new Rectangle(contentX, 48, maxContentW, 200), COLOR_CARD);
                    drawSystemText(contentX + 16, 62, "Daily GK Universal MRE", COLOR_HL, true);
                    drawSystemText(contentX + 16, 84, "Version: 3.5 Pure ActionScript 3.0", COLOR_MUTED);
                    drawSystemText(contentX + 16, 108, "Developer: Shifat100", COLOR_GREEN);
                    drawSystemText(contentX + 16, 128, "Platform: MediaTek S30+ / Flash SWF", COLOR_TEXT);
                    drawSystemText(contentX + 16, 152, "Modes: Study & Quiz Supported", COLOR_ORANGE);
                    drawSystemText(contentX + 16, 172, "Global Complex Text Engine", COLOR_ORANGE);
                    drawSoftbar("", "", "Back");
                    break;

                case STATE_CONFIRM_EXIT:
                    drawHeader("Exit Application?");
                    screenBitmapData.fillRect(new Rectangle(contentX, 80, maxContentW, 140), COLOR_CARD);
                    drawSystemText(contentX + 24, 100, "Are you sure you want", COLOR_TEXT);
                    drawSystemText(contentX + 24, 120, "to quit Daily GK?", COLOR_MUTED);

                    screenBitmapData.fillRect(new Rectangle(contentX + 24, 160, 80, 30), COLOR_RED);
                    drawSystemText(contentX + 48, 167, "Exit", 0xFFFFFF, true);

                    screenBitmapData.fillRect(new Rectangle(contentX + 120, 160, 80, 30), COLOR_HL);
                    drawSystemText(contentX + 138, 167, "Cancel", COLOR_HL_TEXT, true);
                    drawSoftbar("Exit", "", "Cancel");
                    break;

                case STATE_INPUT_DIALOG:
                    var dlgTitle:String = (inputTarget == INPUT_TARGET_FILE_SEARCH) ? "Search PAK Files" :
                                          ((inputTarget == INPUT_TARGET_JUMP_Q) ? "Jump to Question" : "Search Question");
                    drawHeader(dlgTitle);

                    screenBitmapData.fillRect(new Rectangle(contentX, 55, maxContentW, 195), COLOR_CARD);
                    drawSystemText(contentX + 16, 70, dlgTitle, COLOR_HL, true);

                    // Text Field Box
                    screenBitmapData.fillRect(new Rectangle(contentX + 16, 105, maxContentW - 32, 32), COLOR_BG);
                    drawSystemText(contentX + 22, 112, inputBuffer + "_", COLOR_GREEN);

                    // Del & Clear All Buttons
                    screenBitmapData.fillRect(new Rectangle(contentX + 16, 150, 90, 26), COLOR_RED);
                    drawSystemText(contentX + 26, 155, "[ ⌫ Del ]", 0xFFFFFF, true);

                    screenBitmapData.fillRect(new Rectangle(contentX + 116, 150, 90, 26), COLOR_BORDER);
                    drawSystemText(contentX + 122, 155, "[ Clear All ]", COLOR_MUTED, true);

                    drawSoftbar("Done", "⌫ Del", "Cancel");
                    break;

                case STATE_SCORECARD:
                    drawHeader("Quiz Completed!");
                    screenBitmapData.fillRect(new Rectangle(contentX, 60, maxContentW, 160), COLOR_CARD);
                    drawSystemText(contentX + 24, 85, "Final Score: " + score + " / " + totalQuestions, COLOR_GREEN, true);
                    drawSystemText(contentX + 24, 120, "Select [Again] to retry, or [Packs] to exit.", COLOR_MUTED);
                    drawSoftbar("Again", "", "Packs");
                    break;
            }
        }

        // ==========================================
        //  KEYBOARD CONTROLLER
        // ==========================================

        private function handleKeyDown(e:KeyboardEvent):void {
            var k:uint = e.keyCode;

            // Global Key: 'T' for theme toggle
            if (k == 84 /* T */ && state != STATE_INPUT_DIALOG) {
                isLightTheme = !isLightTheme;
                savePaksToStorage();
                if (curQBitmapData && curEntryValid()) {
                    loadQuestion(currentQId); // re-render masks with new theme ink
                }
                drawScreen();
                return;
            }

            // Input Dialog Mode
            if (state == STATE_INPUT_DIALOG) {
                if (k == Keyboard.BACKSPACE || k == 8 || e.charCode == 8 ||
                    k == Keyboard.DELETE || k == 46 || e.charCode == 127 ||
                    k == Keyboard.NUMPAD_DECIMAL || k == 110) {
                    if (inputBuffer.length > 0) {
                        inputBuffer = inputBuffer.substr(0, inputBuffer.length - 1);
                        drawScreen();
                    }
                    return;
                }
                if (k == Keyboard.ENTER || k == Keyboard.NUMPAD_ENTER || k == Keyboard.F1) {
                    submitInput();
                    return;
                }
                if (k == Keyboard.ESCAPE || k == Keyboard.F2) {
                    state = prevState;
                    drawScreen();
                    return;
                }
                if (e.charCode >= 32 && e.charCode <= 126) {
                    if (inputBuffer.length < 28) {
                        inputBuffer += String.fromCharCode(e.charCode);
                        drawScreen();
                    }
                    return;
                }
                return;
            }

            // Global Right Softkey (Back / Esc / F2)
            if (k == Keyboard.ESCAPE || k == Keyboard.F2) {
                if (state == STATE_FILE_LIST || state == STATE_NO_FILES) {
                    prevState = state;
                    state = STATE_CONFIRM_EXIT;
                } else if (state == STATE_MENU || state == STATE_HELP_CAROUSEL || state == STATE_ABOUT) {
                    state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                } else if (state == STATE_QUESTION_MENU) {
                    state = STATE_QUESTION;
                } else if (state == STATE_QUESTION || state == STATE_FEEDBACK || state == STATE_SCORECARD) {
                    state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                }
                drawScreen();
                return;
            }

            // Global Left Softkey (Menu / Select / F1 / Q)
            if (k == Keyboard.F1 || k == 81 /* Q */) {
                if (state == STATE_FILE_LIST || state == STATE_NO_FILES) {
                    menuSelectedIdx = 0;
                    state = STATE_MENU;
                } else if (state == STATE_QUESTION || state == STATE_FEEDBACK) {
                    qmenuSelectedIdx = 0;
                    state = STATE_QUESTION_MENU;
                } else if (state == STATE_MENU) {
                    menuAction();
                } else if (state == STATE_QUESTION_MENU) {
                    qmenuAction();
                } else if (state == STATE_HELP_CAROUSEL) {
                    if (helpSlideIdx == 3) launchBrowserDownload();
                    else if (helpSlideIdx > 0) helpSlideIdx--;
                } else if (state == STATE_SCORECARD) {
                    score = 0;
                    selectedOption = 0;
                    userChoice = -1;
                    state = STATE_QUESTION;
                    loadQuestion(0);
                }
                drawScreen();
                return;
            }

            // Main Menu Navigation
            if (state == STATE_MENU) {
                if (k == Keyboard.UP && menuSelectedIdx > 0) { menuSelectedIdx--; drawScreen(); }
                else if (k == Keyboard.DOWN && menuSelectedIdx < TOTAL_MENU_ITEMS - 1) { menuSelectedIdx++; drawScreen(); }
                else if (k == Keyboard.ENTER || k == Keyboard.SPACE) { menuAction(); }
                else if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_6) { executeMenuItem(k - Keyboard.NUMBER_1); }
                return;
            }

            // Reading Question Menu Navigation
            if (state == STATE_QUESTION_MENU) {
                if (k == Keyboard.UP && qmenuSelectedIdx > 0) { qmenuSelectedIdx--; drawScreen(); }
                else if (k == Keyboard.DOWN && qmenuSelectedIdx < TOTAL_QMENU_ITEMS - 1) { qmenuSelectedIdx++; drawScreen(); }
                else if (k == Keyboard.ENTER || k == Keyboard.SPACE) { qmenuAction(); }
                else if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_5) { executeQMenuItem(k - Keyboard.NUMBER_1); }
                return;
            }

            // File List Navigation
            if (state == STATE_FILE_LIST) {
                if (k == Keyboard.UP && selectedFileIdx > 0) {
                    selectedFileIdx--;
                    adjustScroll();
                    drawScreen();
                } else if (k == Keyboard.DOWN && selectedFileIdx < filteredIndices.length - 1) {
                    selectedFileIdx++;
                    adjustScroll();
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE) {
                    if (filteredIndices.length > 0) {
                        openSelectedPak(pakList[filteredIndices[selectedFileIdx]].bytes);
                        drawScreen();
                    }
                } else if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_9) {
                    var targetIdx:int = k - Keyboard.NUMBER_1;
                    if (targetIdx < filteredIndices.length) {
                        selectedFileIdx = targetIdx;
                        adjustScroll();
                        drawScreen();
                    }
                }
                return;
            }

            // Question Screen
            if (state == STATE_QUESTION) {
                var chosen:int = -1;
                if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_4) chosen = k - Keyboard.NUMBER_1;
                else if (k >= Keyboard.NUMPAD_1 && k <= Keyboard.NUMPAD_4) chosen = k - Keyboard.NUMPAD_1;

                if (chosen != -1) {
                    userChoice = chosen;
                    selectedOption = chosen;
                    if (readMode != READING_MODE_STUDY) {
                        if (userChoice == curCorrectAnswer) score++;
                        state = STATE_FEEDBACK;
                    }
                    drawScreen();
                    return;
                }

                if (readMode == READING_MODE_STUDY) {
                    if (k == Keyboard.RIGHT) {
                        if (currentQId + 1 < totalQuestions) loadQuestion(currentQId + 1);
                        drawScreen();
                        return;
                    } else if (k == Keyboard.LEFT) {
                        if (currentQId > 0) loadQuestion(currentQId - 1);
                        drawScreen();
                        return;
                    }
                }

                if (k == Keyboard.UP && selectedOption > 0) { selectedOption--; drawScreen(); }
                else if (k == Keyboard.DOWN && selectedOption < 3) { selectedOption++; drawScreen(); }
                else if (k == Keyboard.ENTER || k == Keyboard.SPACE) {
                    userChoice = selectedOption;
                    if (readMode != READING_MODE_STUDY) {
                        if (userChoice == curCorrectAnswer) score++;
                        state = STATE_FEEDBACK;
                    }
                    drawScreen();
                }
                return;
            }

            // Feedback Screen
            if (state == STATE_FEEDBACK) {
                if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.RIGHT || k == Keyboard.DOWN) {
                    if (currentQId + 1 < totalQuestions) {
                        selectedOption = 0;
                        userChoice = -1;
                        state = STATE_QUESTION;
                        loadQuestion(currentQId + 1);
                    } else {
                        state = STATE_SCORECARD;
                    }
                    drawScreen();
                }
                return;
            }

            // Help Carousel
            if (state == STATE_HELP_CAROUSEL) {
                if (k == Keyboard.LEFT && helpSlideIdx > 0) { helpSlideIdx--; drawScreen(); }
                else if (k == Keyboard.RIGHT || k == Keyboard.ENTER || k == Keyboard.SPACE) {
                    if (helpSlideIdx < TOTAL_HELP_SLIDES - 1) helpSlideIdx++;
                    else launchBrowserDownload();
                    drawScreen();
                }
                return;
            }

            // Confirm Exit
            if (state == STATE_CONFIRM_EXIT) {
                if (k == Keyboard.ENTER || k == Keyboard.SPACE) {
                    try { fscommand("quit"); } catch(err:Error) {}
                    state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                    drawScreen();
                }
                return;
            }
        }

        // ==========================================
        //  TOUCH & MOUSE CONTROLLER
        // ==========================================

        private function handleMouseUp(e:MouseEvent):void {
            var x:int = e.stageX;
            var y:int = e.stageY;

            // Top Header: Theme Switcher Touch
            if (y <= HEADER_HEIGHT && x >= screenW - 36) {
                isLightTheme = !isLightTheme;
                savePaksToStorage();
                if (curQBitmapData && curEntryValid()) {
                    loadQuestion(currentQId);
                }
                drawScreen();
                return;
            }

            // Softbar Touch
            if (y >= screenH - SOFTBAR_HEIGHT) {
                if (x < screenW * 0.3) handleKeyDown(new KeyboardEvent(KeyboardEvent.KEY_DOWN, true, false, 0, Keyboard.F1));
                else if (x >= screenW * 0.3 && x <= screenW * 0.7) handleKeyDown(new KeyboardEvent(KeyboardEvent.KEY_DOWN, true, false, 0, Keyboard.ENTER));
                else handleKeyDown(new KeyboardEvent(KeyboardEvent.KEY_DOWN, true, false, 0, Keyboard.F2));
                return;
            }

            var maxContentW:int = Math.min(screenW - 24, 760);
            var contentX:int = (screenW - maxContentW) / 2;

            // Input Dialog Touch Buttons
            if (state == STATE_INPUT_DIALOG) {
                if (x >= contentX + 16 && x <= contentX + 106 && y >= 150 && y <= 176) {
                    if (inputBuffer.length > 0) {
                        inputBuffer = inputBuffer.substr(0, inputBuffer.length - 1);
                        drawScreen();
                    }
                    return;
                } else if (x >= contentX + 116 && x <= contentX + 206 && y >= 150 && y <= 176) {
                    inputBuffer = "";
                    drawScreen();
                    return;
                }
            }

            // File List Touch & Delete Button
            if (state == STATE_FILE_LIST) {
                // Import button touch
                if (x >= contentX + maxContentW - 110 && x <= contentX + maxContentW && y >= 38 && y <= 62) {
                    promptBrowsePak();
                    return;
                }

                var curY:int = 68;
                var visibleRows:int = Math.max(5, (screenH - 110) / 48);
                var endRow:int = Math.min(filteredIndices.length, fileScrollOffset + visibleRows);

                for (var i:int = fileScrollOffset; i < endRow; i++) {
                    if (x >= contentX && x <= contentX + maxContentW && y >= curY && y <= curY + 42) {
                        // Clicked delete button [X]
                        if (x >= contentX + maxContentW - 30) {
                            deletePak(filteredIndices[i]);
                            return;
                        }
                        selectedFileIdx = i;
                        openSelectedPak(pakList[filteredIndices[i]].bytes);
                        drawScreen();
                        return;
                    }
                    curY += 46;
                }
            }

            // No files: Browse button touch
            if (state == STATE_NO_FILES) {
                if (x >= contentX + 16 && x <= contentX + 160 && y >= 90 && y <= 120) {
                    promptBrowsePak();
                    return;
                }
            }

            // Main Menu Touch
            if (state == STATE_MENU) {
                curY = 48;
                for (i = 0; i < TOTAL_MENU_ITEMS; i++) {
                    if (x >= contentX && x <= contentX + maxContentW && y >= curY && y <= curY + 36) {
                        executeMenuItem(i);
                        return;
                    }
                    curY += 40;
                }
            }

            // Question Menu Touch
            if (state == STATE_QUESTION_MENU) {
                curY = 48;
                for (i = 0; i < TOTAL_QMENU_ITEMS; i++) {
                    if (x >= contentX && x <= contentX + maxContentW && y >= curY && y <= curY + 36) {
                        executeQMenuItem(i);
                        return;
                    }
                    curY += 40;
                }
            }

            // Question View Option Touch
            if (state == STATE_QUESTION) {
                curY = 40 + Math.max(36, curQHeight + 12) + 10;
                for (i = 0; i < 4; i++) {
                    var optBoxH:int = Math.max(30, curOptHeights[i] + 10);
                    if (x >= contentX && x <= contentX + maxContentW && y >= curY && y <= curY + optBoxH) {
                        selectedOption = i;
                        userChoice = i;
                        if (readMode != READING_MODE_STUDY) {
                            if (userChoice == curCorrectAnswer) score++;
                            state = STATE_FEEDBACK;
                        }
                        drawScreen();
                        return;
                    }
                    curY += optBoxH + 6;
                }
            } else if (state == STATE_FEEDBACK) {
                handleKeyDown(new KeyboardEvent(KeyboardEvent.KEY_DOWN, true, false, 0, Keyboard.ENTER));
            }

            // Confirm Exit buttons
            if (state == STATE_CONFIRM_EXIT) {
                if (y >= 160 && y <= 190) {
                    if (x >= contentX + 24 && x <= contentX + 104) {
                        try { fscommand("quit"); } catch(err:Error) {}
                        state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                        drawScreen();
                    } else if (x >= contentX + 120 && x <= contentX + 200) {
                        state = prevState;
                        drawScreen();
                    }
                }
            }
        }

        // ==========================================
        //  ACTIONS & MENU DISPATCH
        // ==========================================

        private function menuAction():void {
            executeMenuItem(menuSelectedIdx);
        }

        private function executeMenuItem(idx:int):void {
            switch (idx) {
                case 0: openInput(INPUT_TARGET_FILE_SEARCH); break;
                case 1: launchBrowserDownload(); break;
                case 2: helpSlideIdx = 0; state = STATE_HELP_CAROUSEL; break;
                case 3: state = STATE_ABOUT; break;
                case 4: scanAll(); break;
                case 5: prevState = STATE_MENU; state = STATE_CONFIRM_EXIT; break;
            }
            drawScreen();
        }

        private function qmenuAction():void {
            executeQMenuItem(qmenuSelectedIdx);
        }

        private function executeQMenuItem(idx:int):void {
            switch (idx) {
                case 0: openInput(INPUT_TARGET_Q_SEARCH); break;
                case 1: openInput(INPUT_TARGET_JUMP_Q); break;
                case 2:
                    readMode = (readMode == READING_MODE_QUIZ) ? READING_MODE_STUDY : READING_MODE_QUIZ;
                    state = STATE_QUESTION;
                    break;
                case 3: launchBrowserDownload(); break;
                case 4: state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES; break;
            }
            drawScreen();
        }

        private function openInput(target:int):void {
            inputTarget = target;
            inputBuffer = "";
            prevState = state;
            state = STATE_INPUT_DIALOG;
            drawScreen();
        }

        private function submitInput():void {
            if (inputTarget == INPUT_TARGET_FILE_SEARCH) {
                searchFilter = inputBuffer;
                applyFileFilter();
                state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
            } else if (inputTarget == INPUT_TARGET_JUMP_Q) {
                var targetQ:int = parseInt(inputBuffer);
                if (targetQ >= 1 && targetQ <= int(totalQuestions)) {
                    selectedOption = 0;
                    userChoice = -1;
                    loadQuestion(uint(targetQ - 1));
                }
                state = STATE_QUESTION;
            } else if (inputTarget == INPUT_TARGET_Q_SEARCH) {
                searchQuestionInPak(inputBuffer);
                state = STATE_QUESTION;
            }
            drawScreen();
        }

        private function scanAll():void {
            loadStoredPaks();
            applyFileFilter();
            state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
            drawScreen();
        }

        private function adjustScroll():void {
            var visibleRows:int = Math.max(5, (screenH - 110) / 48);
            if (selectedFileIdx < fileScrollOffset) {
                fileScrollOffset = selectedFileIdx;
            } else if (selectedFileIdx >= fileScrollOffset + visibleRows) {
                fileScrollOffset = selectedFileIdx - visibleRows + 1;
            }
        }

        private function applyFileFilter():void {
            filteredIndices = [];
            for (var i:int = 0; i < pakList.length; i++) {
                if (searchFilter.length == 0 || String(pakList[i].name).toLowerCase().indexOf(searchFilter.toLowerCase()) != -1) {
                    filteredIndices.push(i);
                }
            }
            if (selectedFileIdx >= filteredIndices.length) {
                selectedFileIdx = Math.max(0, filteredIndices.length - 1);
            }
            adjustScroll();
        }

        private function promptBrowsePak():void {
            try {
                fileRef.browse([new FileFilter("Daily GK Package (*.pak)", "*.pak")]);
            } catch (err:Error) {}
        }

        private function onFileSelected(e:Event):void {
            fileRef.load();
        }

        private function onFileLoaded(e:Event):void {
            var raw:ByteArray = fileRef.data;
            raw.endian = Endian.LITTLE_ENDIAN;

            // Read total questions count from header
            var totalQ:uint = 0;
            if (raw.length >= 8) {
                raw.position = 4;
                totalQ = raw.readUnsignedInt();
                raw.position = 0;
            }

            var replaced:Boolean = false;
            for (var i:int = 0; i < pakList.length; i++) {
                if (pakList[i].name == fileRef.name) {
                    pakList[i].size = raw.length;
                    pakList[i].totalQuestions = totalQ;
                    pakList[i].bytes = raw;
                    replaced = true;
                    break;
                }
            }

            if (!replaced) {
                pakList.push({
                    name: fileRef.name,
                    size: raw.length,
                    totalQuestions: totalQ,
                    bytes: raw
                });
            }

            savePaksToStorage();
            applyFileFilter();
            state = STATE_FILE_LIST;
            drawScreen();
        }

        private function launchBrowserDownload():void {
            try {
                navigateToURL(new URLRequest(DOWNLOAD_URL), "_blank");
            } catch (err:Error) {}
        }

        private function curEntryValid():Boolean {
            return (pakData != null && totalQuestions > 0);
        }

        private function getMenuTitle(idx:int):String {
            switch (idx) {
                case 0: return "1. Search Files";
                case 1: return "2. Download More PAKs";
                case 2: return "3. Help Guide";
                case 3: return "4. About Daily GK";
                case 4: return "5. Rescan Storage";
                case 5: return "6. Exit App";
            }
            return "";
        }

        private function getQMenuTitle(idx:int):String {
            switch (idx) {
                case 0: return "1. Search Question";
                case 1: return "2. Jump To Question";
                case 2: return (readMode == READING_MODE_STUDY) ? "3. Mode: [Study -> Quiz]" : "3. Mode: [Quiz -> Study]";
                case 3: return "4. Download *.pak";
                case 4: return "5. Return to Main Menu";
            }
            return "";
        }
    }
}