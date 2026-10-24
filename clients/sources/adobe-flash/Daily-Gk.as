package {
    import flash.display.Sprite;
    import flash.display.Bitmap;
    import flash.display.BitmapData;
    import flash.display.StageScaleMode;
    import flash.display.StageAlign;
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

    [SWF(width="240", height="320", frameRate="30", backgroundColor="0x12161E")]
    public class DailyGK extends Sprite {

        // --- Screen & Buffer Dimensions ---
        private const SCREEN_WIDTH:int       = 240;
        private const SCREEN_HEIGHT:int      = 320;
        private const MAX_PAK_FILES:int      = 32;
        private const QUESTION_W:int         = 224;
        private const QUESTION_BYTES_ROW:int = 28;
        private const OPTION_W:int           = 208;
        private const OPTION_BYTES_ROW:int   = 26;
        private const TOTAL_HELP_SLIDES:int  = 4;
        private const TOTAL_MENU_ITEMS:int   = 7;
        private const TOTAL_QMENU_ITEMS:int  = 5;
        private const VISIBLE_FILE_ROWS:int  = 5;

        private const DOWNLOAD_URL:String = "http://shifat100.github.io/daily-gk/client-pack.html";
        private const STORAGE_ID:String   = "DailyGK_SaveData_Storage";

        // --- Color Palette (RGB565) ---
        private const COLOR_BG:uint       = 0x12161E;
        private const COLOR_CARD:uint     = 0x1C222E;
        private const COLOR_HL:uint       = 0x1E90FF;
        private const COLOR_GREEN:uint    = 0x2ECC71;
        private const COLOR_RED:uint      = 0xE74C3C;
        private const COLOR_TEXT:uint     = 0xFFFFFF;
        private const COLOR_MUTED:uint    = 0xAAAFB9;
        private const COLOR_ORANGE:uint   = 0xF39C12;
        private const COLOR_MODAL_BG:uint = 0x0C0F16;
        private const COLOR_BAR_BG:uint   = 0x0E1219;
        private const COLOR_BORDER:uint   = 0x2D3441;

        // --- Application States ---
        private const STATE_FILE_LIST:int          = 0;
        private const STATE_NO_FILES:int           = 1;
        private const STATE_MENU:int               = 2;
        private const STATE_HELP_CAROUSEL:int      = 3;
        private const STATE_ABOUT:int              = 4;
        private const STATE_CONFIRM_EXIT:int       = 5;
        private const STATE_QUESTION:int           = 6;
        private const STATE_FEEDBACK:int           = 7;
        private const STATE_QUESTION_MENU:int      = 8;
        private const STATE_INPUT_DIALOG:int       = 9;
        private const STATE_SCORECARD:int          = 10;
        private const STATE_CONFIRM_DELETE_PAK:int = 11;

        // --- Reading Modes & Input Targets ---
        private const READING_MODE_QUIZ:int  = 0;
        private const READING_MODE_STUDY:int = 1;

        private const INPUT_TARGET_FILE_SEARCH:int = 0;
        private const INPUT_TARGET_Q_SEARCH:int    = 1;
        private const INPUT_TARGET_JUMP_Q:int      = 2;

        // --- Framebuffer Surface ---
        private var screenBitmapData:BitmapData;
        private var screenBitmap:Bitmap;

        // --- App Context State ---
        private var state:int;
        private var prevState:int;
        private var readMode:int;

        private var pakList:Array = [];
        private var selectedFileIdx:int = 0;
        private var fileScrollOffset:int = 0;
        private var searchFilter:String = "";
        private var filteredIndices:Array = [];

        private var menuSelectedIdx:int = 0;
        private var qmenuSelectedIdx:int = 0;
        private var helpSlideIdx:int = 0;

        // Dialog button selection (0 = Left action, 1 = Right cancel)
        private var dialogButtonIdx:int = 1;

        // --- Current PAK Payload ---
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

        // --- Modal Input Box ---
        private var inputTarget:int;
        private var inputBuffer:String = "";

        // --- Text Rasterizer & File Handling ---
        private var tfHelper:TextField;
        private var textFormat:TextFormat;
        private var fileRef:FileReference;

        public function DailyGK() {
            if (stage) init();
            else addEventListener(Event.ADDED_TO_STAGE, init);
        }

        private function init(e:Event = null):void {
            removeEventListener(Event.ADDED_TO_STAGE, init);

            stage.scaleMode = StageScaleMode.SHOW_ALL;
            stage.align = StageAlign.TOP_LEFT;

            screenBitmapData = new BitmapData(SCREEN_WIDTH, SCREEN_HEIGHT, false, COLOR_BG);
            screenBitmap = new Bitmap(screenBitmapData);
            addChild(screenBitmap);

            tfHelper = new TextField();
            textFormat = new TextFormat("_sans", 11, COLOR_TEXT, false);
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

            // Load stored PAK files from local SharedObject (No demo fallback)
            loadStoredPaks();

            applyFileFilter();
            drawScreen();
        }

        // ==========================================
        //  PERSISTENT STORAGE (Flash SharedObject)
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
                                filename: item.filename,
                                filesize: item.filesize,
                                bytes: rawBytes
                            });
                        }
                    }
                }
            } catch (err:Error) {}
        }

        private function savePaksToStorage():void {
            try {
                var so:SharedObject = SharedObject.getLocal(STORAGE_ID);
                var saveList:Array = [];
                for (var i:int = 0; i < pakList.length; i++) {
                    saveList.push({
                        filename: pakList[i].filename,
                        filesize: pakList[i].filesize,
                        bytes: pakList[i].bytes
                    });
                }
                so.data.savedPaks = saveList;
                so.flush();
            } catch (err:Error) {}
        }

        private function deleteCurrentPak():void {
            if (filteredIndices.length == 0 || selectedFileIdx < 0 || selectedFileIdx >= filteredIndices.length) {
                return;
            }

            var actualIdx:int = filteredIndices[selectedFileIdx];
            pakList.splice(actualIdx, 1);
            savePaksToStorage();

            applyFileFilter();
            if (selectedFileIdx >= filteredIndices.length) {
                selectedFileIdx = Math.max(0, filteredIndices.length - 1);
            }
            adjustScroll();
        }

        // ==========================================
        //  PAK & 1-BIT MONOCHROME BITMAP DECODER
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

            // Load Question
            pakData.position = curOffset;
            var qBytesLen:int = curQHeight * QUESTION_BYTES_ROW;
            var qBytes:ByteArray = new ByteArray();
            if (qBytesLen > 0 && pakData.bytesAvailable >= qBytesLen) {
                pakData.readBytes(qBytes, 0, qBytesLen);
            }
            curQBitmapData = decode1BitMask(qBytes, QUESTION_W, curQHeight, QUESTION_BYTES_ROW, COLOR_TEXT);
            curOffset += qBytesLen;

            // Load 4 Options
            for (var i:int = 0; i < 4; i++) {
                pakData.position = curOffset;
                var optBytesLen:int = curOptHeights[i] * OPTION_BYTES_ROW;
                var optBytes:ByteArray = new ByteArray();
                if (optBytesLen > 0 && pakData.bytesAvailable >= optBytesLen) {
                    pakData.readBytes(optBytes, 0, optBytesLen);
                }
                curOptBitmapData[i] = decode1BitMask(optBytes, OPTION_W, curOptHeights[i], OPTION_BYTES_ROW, COLOR_TEXT);
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

        // ==========================================
        //  SCREEN RENDERING & UI SYSTEM
        // ==========================================

        private function drawSystemText(x:int, y:int, str:String, color:uint):void {
            textFormat.color = color;
            tfHelper.defaultTextFormat = textFormat;
            tfHelper.text = str;

            var bmd:BitmapData = new BitmapData(Math.ceil(tfHelper.textWidth + 5), Math.ceil(tfHelper.textHeight + 4), true, 0x00000000);
            bmd.draw(tfHelper);

            screenBitmapData.copyPixels(bmd, bmd.rect, new Point(x, y), null, null, true);
            bmd.dispose();
        }

        private function drawSoftbar(left:String, center:String, right:String):void {
            screenBitmapData.fillRect(new Rectangle(0, 294, SCREEN_WIDTH, 26), COLOR_BAR_BG);
            for (var i:int = 0; i < SCREEN_WIDTH; i++) {
                screenBitmapData.setPixel(i, 294, COLOR_BORDER);
            }

            if (left && left.length > 0) {
                drawSystemText(8, 298, left, COLOR_HL);
            }
            if (center && center.length > 0) {
                var cx:int = (SCREEN_WIDTH / 2) - int(center.length * 3.2);
                drawSystemText(cx, 298, center, COLOR_GREEN);
            }
            if (right && right.length > 0) {
                var rx:int = SCREEN_WIDTH - int(right.length * 7.5) - 6;
                drawSystemText(rx, 298, right, COLOR_MUTED);
            }
        }

        private function drawScreen():void {
            screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), COLOR_BG);

            var i:int, curY:int, actualIdx:int, itemBg:uint, optBg:uint;

            switch (state) {
                case STATE_FILE_LIST:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, 26), COLOR_HL);
                    drawSystemText(8, 6, "Daily GK (" + filteredIndices.length + " Stored)", COLOR_TEXT);

                    curY = 32;
                    var endRow:int = Math.min(filteredIndices.length, fileScrollOffset + VISIBLE_FILE_ROWS);

                    for (i = fileScrollOffset; i < endRow; i++) {
                        actualIdx = filteredIndices[i];
                        itemBg = (i == selectedFileIdx) ? COLOR_HL : COLOR_CARD;
                        screenBitmapData.fillRect(new Rectangle(8, curY, 224, 42), itemBg);

                        var numKey:int = (i < 9) ? (i + 1) : 0;
                        drawSystemText(14, curY + 4, "[" + numKey + "] " + pakList[actualIdx].filename, COLOR_TEXT);
                        drawSystemText(14, curY + 22, "Size: " + int(pakList[actualIdx].filesize / 1024) + " KB (Del: *)", COLOR_MUTED);

                        curY += 46;
                    }
                    drawSoftbar("Menu ", "Play", "Exit ");
                    break;

                case STATE_NO_FILES:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, 26), COLOR_RED);
                    drawSystemText(8, 6, "No Packages Stored!", COLOR_TEXT);

                    screenBitmapData.fillRect(new Rectangle(8, 38, 224, 246), COLOR_CARD);
                    drawSystemText(16, 48, "Storage is empty!", COLOR_ORANGE);
                    drawSystemText(16, 75, "Press [Enter], [Space] or [Touch]", COLOR_TEXT);
                    drawSystemText(16, 95, "to load .PAK file from device.", COLOR_GREEN);

                    drawSystemText(16, 130, "Loaded PAKs are automatically", COLOR_TEXT);
                    drawSystemText(16, 148, "saved in permanent storage.", COLOR_GREEN);

                    drawSystemText(16, 185, "Need question packages?", COLOR_TEXT);
                    drawSystemText(16, 203, "shifat100.github.io/daily-gk", COLOR_HL);

                    drawSoftbar("Menu ", "Browse ", "Exit ");
                    break;

                case STATE_MENU:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), COLOR_MODAL_BG);
                    screenBitmapData.fillRect(new Rectangle(12, 22, 216, 266), COLOR_CARD);
                    screenBitmapData.fillRect(new Rectangle(12, 22, 216, 26), COLOR_HL);
                    drawSystemText(20, 28, "Main Menu", COLOR_TEXT);

                    curY = 54;
                    for (i = 0; i < TOTAL_MENU_ITEMS; i++) {
                        itemBg = (i == menuSelectedIdx) ? COLOR_HL : COLOR_CARD;
                        screenBitmapData.fillRect(new Rectangle(18, curY, 204, 28), itemBg);
                        drawSystemText(26, curY + 6, getMenuTitle(i), COLOR_TEXT);
                        curY += 32;
                    }
                    drawSoftbar("Select ", "OK", "Back ");
                    break;

                case STATE_QUESTION_MENU:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), COLOR_MODAL_BG);
                    screenBitmapData.fillRect(new Rectangle(12, 34, 216, 230), COLOR_CARD);
                    screenBitmapData.fillRect(new Rectangle(12, 34, 216, 26), COLOR_HL);
                    drawSystemText(20, 40, "Reading Options", COLOR_TEXT);

                    curY = 68;
                    for (i = 0; i < TOTAL_QMENU_ITEMS; i++) {
                        itemBg = (i == qmenuSelectedIdx) ? COLOR_HL : COLOR_CARD;
                        screenBitmapData.fillRect(new Rectangle(18, curY, 204, 30), itemBg);
                        drawSystemText(26, curY + 8, getQMenuTitle(i), COLOR_TEXT);
                        curY += 34;
                    }
                    drawSoftbar("Select ", "OK", "Back ");
                    break;

                case STATE_INPUT_DIALOG:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), COLOR_MODAL_BG);
                    screenBitmapData.fillRect(new Rectangle(14, 55, 212, 195), COLOR_CARD);
                    screenBitmapData.fillRect(new Rectangle(14, 55, 212, 26), COLOR_HL);

                    if (inputTarget == INPUT_TARGET_FILE_SEARCH) {
                        drawSystemText(20, 61, "Search PAK Files", COLOR_TEXT);
                        drawSystemText(22, 88, "Enter keyword:", COLOR_MUTED);
                    } else if (inputTarget == INPUT_TARGET_JUMP_Q) {
                        drawSystemText(20, 61, "Jump to Question", COLOR_TEXT);
                        drawSystemText(22, 88, "Enter Number (1 - " + totalQuestions + "):", COLOR_MUTED);
                    } else {
                        drawSystemText(20, 61, "Search Question", COLOR_TEXT);
                        drawSystemText(22, 88, "Enter search keyword:", COLOR_MUTED);
                    }

                    // Input Text Field
                    screenBitmapData.fillRect(new Rectangle(22, 108, 196, 30), COLOR_BG);
                    drawSystemText(28, 115, inputBuffer + "_", COLOR_GREEN);

                    // Touch / Mouse Erase Buttons
                    screenBitmapData.fillRect(new Rectangle(22, 146, 94, 26), COLOR_RED);
                    drawSystemText(32, 152, "[ ⌫ Del ]", COLOR_TEXT);

                    screenBitmapData.fillRect(new Rectangle(124, 146, 94, 26), COLOR_BORDER);
                    drawSystemText(136, 152, "[ Clear All ]", COLOR_MUTED);

                    drawSystemText(22, 180, "Backspace/Del keys enabled", COLOR_MUTED);
                    drawSystemText(22, 198, "Press Enter or [Done] when ready", COLOR_HL);

                    drawSoftbar("Done ", "⌫ Del", "Cancel ");
                    break;

                case STATE_CONFIRM_EXIT:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), COLOR_MODAL_BG);
                    screenBitmapData.fillRect(new Rectangle(18, 90, 204, 130), COLOR_CARD);
                    screenBitmapData.fillRect(new Rectangle(18, 90, 204, 26), COLOR_RED);
                    drawSystemText(26, 96, "Exit Application?", COLOR_TEXT);

                    drawSystemText(30, 130, "Are you sure you want", COLOR_TEXT);
                    drawSystemText(30, 150, "to quit Daily GK?", COLOR_MUTED);

                    var exitBtnBg:uint = (dialogButtonIdx == 0) ? COLOR_GREEN : COLOR_RED;
                    var cancelBtnBg:uint = (dialogButtonIdx == 1) ? COLOR_HL : COLOR_BORDER;

                    screenBitmapData.fillRect(new Rectangle(28, 180, 80, 28), exitBtnBg);
                    drawSystemText(44, 186, "Exit", COLOR_TEXT);

                    screenBitmapData.fillRect(new Rectangle(132, 180, 80, 28), cancelBtnBg);
                    drawSystemText(146, 186, "Cancel", COLOR_TEXT);

                    drawSoftbar("Exit", "< Arrow >", "Cancel");
                    break;

                case STATE_CONFIRM_DELETE_PAK:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), COLOR_MODAL_BG);
                    screenBitmapData.fillRect(new Rectangle(16, 80, 208, 145), COLOR_CARD);
                    screenBitmapData.fillRect(new Rectangle(16, 80, 208, 26), COLOR_RED);
                    drawSystemText(24, 86, "Delete Stored PAK?", COLOR_TEXT);

                    drawSystemText(24, 115, "Remove file from storage:", COLOR_MUTED);
                    var fName:String = (filteredIndices.length > 0) ? pakList[filteredIndices[selectedFileIdx]].filename : "";
                    if (fName.length > 20) fName = fName.substr(0, 18) + "...";
                    drawSystemText(24, 135, fName, COLOR_ORANGE);

                    var delBtnBg:uint = (dialogButtonIdx == 0) ? COLOR_RED : COLOR_BORDER;
                    var keepBtnBg:uint = (dialogButtonIdx == 1) ? COLOR_HL : COLOR_BORDER;

                    screenBitmapData.fillRect(new Rectangle(28, 180, 80, 28), delBtnBg);
                    drawSystemText(38, 186, "Delete", COLOR_TEXT);

                    screenBitmapData.fillRect(new Rectangle(132, 180, 80, 28), keepBtnBg);
                    drawSystemText(146, 186, "Cancel", COLOR_TEXT);

                    drawSoftbar("Confirm", "< Arrow >", "Cancel");
                    break;

                case STATE_QUESTION:
                case STATE_FEEDBACK:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, 26), COLOR_HL);
                    var modeStr:String = (readMode == READING_MODE_STUDY) ? "Study" : "Quiz";
                    drawSystemText(8, 6, "Q " + (currentQId + 1) + "/" + totalQuestions + " (" + modeStr + ")", COLOR_TEXT);

                    curY = 30;
                    var qBoxHeight:int = curQHeight + 8;
                    screenBitmapData.fillRect(new Rectangle(8, curY, 224, qBoxHeight), COLOR_CARD);
                    if (curQBitmapData) {
                        screenBitmapData.copyPixels(curQBitmapData, curQBitmapData.rect, new Point(8, curY + 4), null, null, true);
                    }

                    curY += curQHeight + 10;

                    for (i = 0; i < 4; i++) {
                        var optCardH:int = curOptHeights[i] + 6;
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

                        screenBitmapData.fillRect(new Rectangle(8, curY, 224, optCardH), optBg);
                        if (curOptBitmapData[i]) {
                            screenBitmapData.copyPixels(curOptBitmapData[i], curOptBitmapData[i].rect, new Point(16, curY + 3), null, null, true);
                        }

                        curY += optCardH + 4;
                    }

                    if (readMode == READING_MODE_STUDY) {
                        drawSoftbar("Menu ", "Next >", "Packs ");
                    } else {
                        if (state == STATE_FEEDBACK) {
                            drawSoftbar("Menu ", "Next >", "Packs ");
                        } else {
                            drawSoftbar("Menu ", "OK", "Back ");
                        }
                    }
                    break;

                case STATE_HELP_CAROUSEL:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, 26), COLOR_HL);
                    drawSystemText(8, 6, "Help Guide (" + (helpSlideIdx + 1) + "/" + TOTAL_HELP_SLIDES + ")", COLOR_TEXT);
                    screenBitmapData.fillRect(new Rectangle(8, 36, 224, 215), COLOR_CARD);

                    if (helpSlideIdx == 0) {
                        drawSystemText(16, 48, "[1. Stored Packages]", COLOR_HL);
                        drawSystemText(16, 75, "Load your .pak from storage.", COLOR_TEXT);
                        drawSystemText(16, 95, "Packages are permanently saved.", COLOR_GREEN);
                        drawSystemText(16, 125, "Delete unused packages:", COLOR_ORANGE);
                        drawSystemText(16, 145, "Press [Del], [*], or Menu (3)", COLOR_RED);
                    } else if (helpSlideIdx == 1) {
                        drawSystemText(16, 48, "[2. Full Keyboard Nav]", COLOR_HL);
                        drawSystemText(16, 75, "Arrows: Navigate items", COLOR_TEXT);
                        drawSystemText(16, 95, "Enter / Space / 5: Select", COLOR_GREEN);
                        drawSystemText(16, 115, "1 - 4: Pick MCQ answer", COLOR_TEXT);
                        drawSystemText(16, 135, "Left/Right: Prev/Next Question", COLOR_ORANGE);
                        drawSystemText(16, 155, "F1: Menu, F2 / Esc: Back", COLOR_HL);
                    } else if (helpSlideIdx == 2) {
                        drawSystemText(16, 48, "[3. Dual Touch & Keys]", COLOR_HL);
                        drawSystemText(16, 75, "Full touch support enabled!", COLOR_GREEN);
                        drawSystemText(16, 95, "Touch any Option to answer.", COLOR_TEXT);
                        drawSystemText(16, 115, "Touch bottom bar for Softkeys.", COLOR_TEXT);
                        drawSystemText(16, 145, "Keys 1-9 direct select files.", COLOR_HL);
                    } else if (helpSlideIdx == 3) {
                        drawSystemText(16, 48, "[4. Download Packs]", COLOR_HL);
                        drawSystemText(16, 75, "Download latest packages from:", COLOR_TEXT);
                        drawSystemText(16, 105, "shifat100.github.io/daily-gk", COLOR_GREEN);
                        drawSystemText(16, 145, "Press Enter or Click Download", COLOR_HL);
                    }
                    drawSoftbar((helpSlideIdx == 3) ? "Download" : "< Prev", "Next >", "Back ");
                    break;

                case STATE_ABOUT:
                    screenBitmapData.fillRect(new Rectangle(0, 0, SCREEN_WIDTH, 26), COLOR_HL);
                    drawSystemText(8, 6, "About Daily GK", COLOR_TEXT);

                    screenBitmapData.fillRect(new Rectangle(10, 45, 220, 220), COLOR_CARD);
                    drawSystemText(20, 60, "Daily GK Flash AS3 Edition", COLOR_HL);
                    drawSystemText(20, 80, "Universal Keypad & Touch Support", COLOR_MUTED);
                    drawSystemText(20, 105, "Clean Storage: No Demo Fallback", COLOR_GREEN);
                    drawSystemText(20, 125, "Persistent Local Cache: ON", COLOR_GREEN);
                    drawSystemText(20, 150, "Platform: Flash (as3)", COLOR_TEXT);
                    drawSystemText(20, 175, "Dev: Shifat100", COLOR_ORANGE);
                    drawSoftbar("", "", "Back ");
                    break;

                case STATE_SCORECARD:
                    screenBitmapData.fillRect(new Rectangle(10, 60, 220, 160), COLOR_CARD);
                    drawSystemText(60, 80, "Quiz Completed!", COLOR_GREEN);
                    drawSystemText(50, 120, "Final Score: " + score + " / " + totalQuestions, COLOR_TEXT);
                    drawSoftbar("Again ", "OK", "Packs ");
                    break;
            }
        }

        // ==========================================
        //  COMPLETE KEYBOARD CONTROL SYSTEM
        // ==========================================

        private function handleKeyDown(e:KeyboardEvent):void {
            var k:uint = e.keyCode;

            // --- 1. Exit Confirmation Dialog ---
            if (state == STATE_CONFIRM_EXIT) {
                if (k == Keyboard.LEFT || k == Keyboard.RIGHT || k == Keyboard.UP || k == Keyboard.DOWN || k == Keyboard.TAB) {
                    dialogButtonIdx = (dialogButtonIdx == 0) ? 1 : 0;
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    if (dialogButtonIdx == 0) {
                        try { fscommand("quit"); } catch (err:Error) {}
                        state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                    } else {
                        state = prevState;
                    }
                    drawScreen();
                } else if (k == Keyboard.ESCAPE || k == Keyboard.F2) {
                    state = prevState;
                    drawScreen();
                }
                return;
            }

            // --- 2. Delete Confirmation Dialog ---
            if (state == STATE_CONFIRM_DELETE_PAK) {
                if (k == Keyboard.LEFT || k == Keyboard.RIGHT || k == Keyboard.UP || k == Keyboard.DOWN || k == Keyboard.TAB) {
                    dialogButtonIdx = (dialogButtonIdx == 0) ? 1 : 0;
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    if (dialogButtonIdx == 0) {
                        deleteCurrentPak();
                    }
                    state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                    drawScreen();
                } else if (k == Keyboard.ESCAPE || k == Keyboard.F2) {
                    state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
                    drawScreen();
                }
                return;
            }

            // --- 3. Text Input Dialog (With Fixed Backspace & Delete Handling) ---
            if (state == STATE_INPUT_DIALOG) {
                // Check Backspace, Delete, and Numpad Del FIRST
                if (k == Keyboard.BACKSPACE || k == 8 || e.charCode == 8 ||
                    k == Keyboard.DELETE || k == 46 || e.charCode == 127 ||
                    k == Keyboard.NUMPAD_DECIMAL || k == 110) {
                    if (inputBuffer.length > 0) {
                        inputBuffer = inputBuffer.substr(0, inputBuffer.length - 1);
                        drawScreen();
                    }
                    return;
                }

                // Submit Action
                if (k == Keyboard.ENTER || k == Keyboard.NUMPAD_ENTER || k == Keyboard.F1) {
                    submitInput();
                    return;
                }

                // Cancel Action
                if (k == Keyboard.ESCAPE || k == Keyboard.F2) {
                    state = prevState;
                    drawScreen();
                    return;
                }

                // Standard Character Typing (ASCII 32 to 126)
                if (e.charCode >= 32 && e.charCode <= 126) {
                    if (inputBuffer.length < 28) {
                        inputBuffer += String.fromCharCode(e.charCode);
                        drawScreen();
                    }
                    return;
                }
                return;
            }

            // --- Global Softkeys: Right Softkey (Back / Esc / F2) ---
            if (k == Keyboard.ESCAPE || k == Keyboard.F2) {
                if (state == STATE_FILE_LIST || state == STATE_NO_FILES) {
                    prevState = state;
                    dialogButtonIdx = 1;
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

            // --- Global Softkeys: Left Softkey (Menu / F1) ---
            if (k == Keyboard.F1) {
                if (state == STATE_FILE_LIST || state == STATE_NO_FILES) {
                    menuSelectedIdx = 0;
                    state = STATE_MENU;
                    drawScreen();
                    return;
                } else if (state == STATE_QUESTION || state == STATE_FEEDBACK) {
                    qmenuSelectedIdx = 0;
                    state = STATE_QUESTION_MENU;
                    drawScreen();
                    return;
                } else if (state == STATE_HELP_CAROUSEL) {
                    if (helpSlideIdx == 3) {
                        launchBrowserDownload();
                    } else if (helpSlideIdx > 0) {
                        helpSlideIdx--;
                        drawScreen();
                    }
                    return;
                } else if (state == STATE_SCORECARD) {
                    score = 0;
                    selectedOption = 0;
                    userChoice = -1;
                    state = STATE_QUESTION;
                    loadQuestion(0);
                    drawScreen();
                    return;
                }
            }

            // --- 4. Main Menu Navigation ---
            if (state == STATE_MENU) {
                if (k == Keyboard.UP && menuSelectedIdx > 0) {
                    menuSelectedIdx--;
                    drawScreen();
                } else if (k == Keyboard.DOWN && menuSelectedIdx < TOTAL_MENU_ITEMS - 1) {
                    menuSelectedIdx++;
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    executeMenuItem(menuSelectedIdx);
                } else if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_7) {
                    executeMenuItem(k - Keyboard.NUMBER_1);
                } else if (k >= Keyboard.NUMPAD_1 && k <= Keyboard.NUMPAD_7) {
                    executeMenuItem(k - Keyboard.NUMPAD_1);
                }
                return;
            }

            // --- 5. Question Reading Menu ---
            if (state == STATE_QUESTION_MENU) {
                if (k == Keyboard.UP && qmenuSelectedIdx > 0) {
                    qmenuSelectedIdx--;
                    drawScreen();
                } else if (k == Keyboard.DOWN && qmenuSelectedIdx < TOTAL_QMENU_ITEMS - 1) {
                    qmenuSelectedIdx++;
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    executeQMenuItem(qmenuSelectedIdx);
                } else if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_5) {
                    executeQMenuItem(k - Keyboard.NUMBER_1);
                } else if (k >= Keyboard.NUMPAD_1 && k <= Keyboard.NUMPAD_5) {
                    executeQMenuItem(k - Keyboard.NUMPAD_1);
                }
                return;
            }

            // --- 6. File List Navigation ---
            if (state == STATE_FILE_LIST) {
                // Delete Trigger: Delete key, Backspace, or '*'
                if (k == Keyboard.DELETE || k == Keyboard.BACKSPACE || k == 106 /* Numpad * */ || (e.shiftKey && k == Keyboard.NUMBER_8)) {
                    if (filteredIndices.length > 0) {
                        dialogButtonIdx = 0;
                        state = STATE_CONFIRM_DELETE_PAK;
                        drawScreen();
                    }
                    return;
                }

                if (k == Keyboard.UP && selectedFileIdx > 0) {
                    selectedFileIdx--;
                    adjustScroll();
                    drawScreen();
                } else if (k == Keyboard.DOWN && selectedFileIdx < filteredIndices.length - 1) {
                    selectedFileIdx++;
                    adjustScroll();
                    drawScreen();
                } else if (k == Keyboard.PAGE_UP) {
                    selectedFileIdx = Math.max(0, selectedFileIdx - VISIBLE_FILE_ROWS);
                    adjustScroll();
                    drawScreen();
                } else if (k == Keyboard.PAGE_DOWN) {
                    selectedFileIdx = Math.min(filteredIndices.length - 1, selectedFileIdx + VISIBLE_FILE_ROWS);
                    adjustScroll();
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    if (filteredIndices.length > 0) {
                        var actualIdx:int = filteredIndices[selectedFileIdx];
                        openSelectedPak(pakList[actualIdx].bytes);
                        drawScreen();
                    }
                } else if (k >= Keyboard.NUMBER_1 && k <= Keyboard.NUMBER_9) {
                    var targetIdx:int = k - Keyboard.NUMBER_1;
                    if (targetIdx < filteredIndices.length) {
                        selectedFileIdx = targetIdx;
                        adjustScroll();
                        drawScreen();
                    }
                } else if (k >= Keyboard.NUMPAD_1 && k <= Keyboard.NUMPAD_9) {
                    var targetNumIdx:int = k - Keyboard.NUMPAD_1;
                    if (targetNumIdx < filteredIndices.length) {
                        selectedFileIdx = targetNumIdx;
                        adjustScroll();
                        drawScreen();
                    }
                }
                return;
            }

            // --- 7. No Files Screen ---
            if (state == STATE_NO_FILES) {
                if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    promptBrowsePak();
                }
                return;
            }

            // --- 8. Question Screen (Quiz / Study) ---
            if (state == STATE_QUESTION) {
                // Direct Option Selection: 1 to 4
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

                // Study Mode: Left / Right Question Navigation
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

                if (k == Keyboard.UP && selectedOption > 0) {
                    selectedOption--;
                    drawScreen();
                } else if (k == Keyboard.DOWN && selectedOption < 3) {
                    selectedOption++;
                    drawScreen();
                } else if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    userChoice = selectedOption;
                    if (readMode != READING_MODE_STUDY) {
                        if (userChoice == curCorrectAnswer) score++;
                        state = STATE_FEEDBACK;
                    }
                    drawScreen();
                }
                return;
            }

            // --- 9. Feedback Screen ---
            if (state == STATE_FEEDBACK) {
                if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5 || k == Keyboard.RIGHT || k == Keyboard.DOWN) {
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

            // --- 10. Help Carousel ---
            if (state == STATE_HELP_CAROUSEL) {
                if (k == Keyboard.LEFT && helpSlideIdx > 0) {
                    helpSlideIdx--;
                    drawScreen();
                } else if (k == Keyboard.RIGHT || k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER) {
                    if (helpSlideIdx < TOTAL_HELP_SLIDES - 1) {
                        helpSlideIdx++;
                    } else {
                        launchBrowserDownload();
                    }
                    drawScreen();
                }
                return;
            }

            // --- 11. Scorecard ---
            if (state == STATE_SCORECARD) {
                if (k == Keyboard.ENTER || k == Keyboard.SPACE || k == Keyboard.NUMPAD_ENTER || k == Keyboard.NUMPAD_5) {
                    score = 0;
                    selectedOption = 0;
                    userChoice = -1;
                    state = STATE_QUESTION;
                    loadQuestion(0);
                    drawScreen();
                }
                return;
            }
        }

        // ==========================================
        //  TOUCH & PEN EVENT HANDLERS
        // ==========================================

        private function handleMouseUp(e:MouseEvent):void {
            var x:int = e.stageX;
            var y:int = e.stageY;

            // Softkey Zones Touch
            if (y >= 290) {
                if (x < 80) {
                    handleSoftkeySim(Keyboard.F1);
                } else if (x >= 80 && x <= 160) {
                    if (state == STATE_INPUT_DIALOG) {
                        // In Input Dialog, center button acts as Delete/Backspace
                        if (inputBuffer.length > 0) {
                            inputBuffer = inputBuffer.substr(0, inputBuffer.length - 1);
                            drawScreen();
                        }
                    } else {
                        handleSoftkeySim(Keyboard.ENTER);
                    }
                } else {
                    handleSoftkeySim(Keyboard.F2);
                }
                return;
            }

            // Touch support for Input Dialog Buttons (Del & Clear All)
            if (state == STATE_INPUT_DIALOG) {
                if (x >= 22 && x <= 116 && y >= 146 && y <= 172) {
                    // [ ⌫ Del ] Button
                    if (inputBuffer.length > 0) {
                        inputBuffer = inputBuffer.substr(0, inputBuffer.length - 1);
                        drawScreen();
                    }
                    return;
                } else if (x >= 124 && x <= 218 && y >= 146 && y <= 172) {
                    // [ Clear All ] Button
                    inputBuffer = "";
                    drawScreen();
                    return;
                }
            }

            if (state == STATE_CONFIRM_EXIT || state == STATE_CONFIRM_DELETE_PAK) {
                if (y >= 180 && y <= 210) {
                    if (x >= 28 && x <= 110) {
                        dialogButtonIdx = 0;
                        handleSoftkeySim(Keyboard.ENTER);
                    } else if (x >= 130 && x <= 215) {
                        dialogButtonIdx = 1;
                        handleSoftkeySim(Keyboard.ENTER);
                    }
                }
                return;
            }

            if (state == STATE_NO_FILES) {
                if (x >= 8 && x <= 232 && y >= 38 && y <= 284) {
                    promptBrowsePak();
                }
                return;
            }

            if (state == STATE_FILE_LIST) {
                var curY:int = 32;
                var endRow:int = Math.min(filteredIndices.length, fileScrollOffset + VISIBLE_FILE_ROWS);
                for (var i:int = fileScrollOffset; i < endRow; i++) {
                    if (x >= 8 && x <= 232 && y >= curY && y <= curY + 42) {
                        selectedFileIdx = i;
                        var actualIdx:int = filteredIndices[i];
                        openSelectedPak(pakList[actualIdx].bytes);
                        drawScreen();
                        return;
                    }
                    curY += 46;
                }
            }

            if (state == STATE_MENU) {
                curY = 54;
                for (i = 0; i < TOTAL_MENU_ITEMS; i++) {
                    if (x >= 18 && x <= 222 && y >= curY && y <= curY + 28) {
                        executeMenuItem(i);
                        return;
                    }
                    curY += 32;
                }
            }

            if (state == STATE_QUESTION_MENU) {
                curY = 68;
                for (i = 0; i < TOTAL_QMENU_ITEMS; i++) {
                    if (x >= 18 && x <= 222 && y >= curY && y <= curY + 30) {
                        executeQMenuItem(i);
                        return;
                    }
                    curY += 34;
                }
            }

            if (state == STATE_QUESTION) {
                curY = 30 + curQHeight + 10;
                for (i = 0; i < 4; i++) {
                    var optCardH:int = curOptHeights[i] + 6;
                    if (x >= 8 && x <= 232 && y >= curY && y <= curY + optCardH) {
                        selectedOption = i;
                        userChoice = i;
                        if (readMode != READING_MODE_STUDY) {
                            if (userChoice == curCorrectAnswer) score++;
                            state = STATE_FEEDBACK;
                        }
                        drawScreen();
                        return;
                    }
                    curY += optCardH + 4;
                }
            } else if (state == STATE_FEEDBACK) {
                handleSoftkeySim(Keyboard.ENTER);
            }
        }

        private function handleSoftkeySim(fakeKey:uint):void {
            var ke:KeyboardEvent = new KeyboardEvent(KeyboardEvent.KEY_DOWN, true, false, 0, fakeKey);
            handleKeyDown(ke);
        }

        // ==========================================
        //  MENU EXECUTIONS & HELPERS
        // ==========================================

        private function executeMenuItem(idx:int):void {
            switch (idx) {
                case 0: openInputBox(INPUT_TARGET_FILE_SEARCH); break;
                case 1: promptBrowsePak(); break;
                case 2:
                    if (filteredIndices.length > 0) {
                        dialogButtonIdx = 0;
                        state = STATE_CONFIRM_DELETE_PAK;
                    }
                    break;
                case 3: launchBrowserDownload(); break;
                case 4: helpSlideIdx = 0; state = STATE_HELP_CAROUSEL; break;
                case 5: state = STATE_ABOUT; break;
                case 6:
                    prevState = STATE_MENU;
                    dialogButtonIdx = 1;
                    state = STATE_CONFIRM_EXIT;
                    break;
            }
            drawScreen();
        }

        private function executeQMenuItem(idx:int):void {
            switch (idx) {
                case 0: openInputBox(INPUT_TARGET_Q_SEARCH); break;
                case 1: openInputBox(INPUT_TARGET_JUMP_Q); break;
                case 2:
                    readMode = (readMode == READING_MODE_QUIZ) ? READING_MODE_STUDY : READING_MODE_QUIZ;
                    state = STATE_QUESTION;
                    break;
                case 3: launchBrowserDownload(); break;
                case 4: state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES; break;
            }
            drawScreen();
        }

        private function adjustScroll():void {
            if (selectedFileIdx < fileScrollOffset) {
                fileScrollOffset = selectedFileIdx;
            } else if (selectedFileIdx >= fileScrollOffset + VISIBLE_FILE_ROWS) {
                fileScrollOffset = selectedFileIdx - VISIBLE_FILE_ROWS + 1;
            }
        }

        private function openInputBox(target:int):void {
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

        private function searchQuestionInPak(keyword:String):void {
            if (!pakData || keyword.length == 0) return;

            var sPos:uint = searchOffset;
            for (var i:uint = 0; i < totalQuestions; i++) {
                pakData.position = sPos;
                var qId:uint = pakData.readUnsignedShort();
                var tLen:uint = pakData.readUnsignedShort();
                if (tLen > 120) tLen = 120;

                var strText:String = pakData.readUTFBytes(tLen);
                if (strText.toLowerCase().indexOf(keyword.toLowerCase()) != -1) {
                    loadQuestion(qId);
                    return;
                }
                sPos += 4 + tLen;
            }
        }

        private function applyFileFilter():void {
            filteredIndices = [];
            for (var i:int = 0; i < pakList.length; i++) {
                if (searchFilter.length == 0 || String(pakList[i].filename).indexOf(searchFilter) != -1) {
                    filteredIndices.push(i);
                }
            }
            if (selectedFileIdx >= filteredIndices.length) {
                selectedFileIdx = Math.max(0, filteredIndices.length - 1);
            }
            adjustScroll();
            state = (pakList.length > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
        }

        private function launchBrowserDownload():void {
            try {
                navigateToURL(new URLRequest(DOWNLOAD_URL), "_blank");
            } catch (err:Error) {}
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

            // Check if file already exists in list, update it
            var replaced:Boolean = false;
            for (var i:int = 0; i < pakList.length; i++) {
                if (pakList[i].filename == fileRef.name) {
                    pakList[i].filesize = raw.length;
                    pakList[i].bytes = raw;
                    replaced = true;
                    break;
                }
            }

            if (!replaced) {
                pakList.push({
                    filename: fileRef.name,
                    filesize: raw.length,
                    bytes: raw
                });
            }

            // Save to persistent Flash SharedObject
            savePaksToStorage();

            applyFileFilter();
            drawScreen();
        }

        private function getMenuTitle(idx:int):String {
            switch (idx) {
                case 0: return "1. Search";
                case 1: return "2. Open File";
                case 2: return "3. Delete Selected PAK";
                case 3: return "4. Download More PAKs";
                case 4: return "5. Help";
                case 5: return "6. About";
                case 6: return "7. Exit";
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
