import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.util.Enumeration;
import java.util.Vector;
import javax.microedition.io.Connector;
import javax.microedition.io.file.FileConnection;
import javax.microedition.io.file.FileSystemRegistry;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Font;
import javax.microedition.lcdui.Graphics;
import javax.microedition.midlet.MIDlet;

public class Midlet extends MIDlet {
    private Display display;
    private GKCanvas canvas;

    protected void startApp() {
        if (display == null) {
            display = Display.getDisplay(this);
            canvas = new GKCanvas(this);
            display.setCurrent(canvas);
        }
    }

    protected void pauseApp() {}

    protected void destroyApp(boolean unconditional) {
        if (canvas != null) {
            canvas.cleanup();
        }
    }

    public void exit() {
        destroyApp(true);
        notifyDestroyed();
    }

    public void openBrowser(String url) {
        try {
            platformRequest(url);
        } catch (Exception e) {
            // Ignored if device refuses backgrounding
        }
    }
}

class PakFileInfo {
    String filepath;
    String filename;
    long filesize;

    public PakFileInfo(String path, String name, long size) {
        this.filepath = path;
        this.filename = name;
        this.filesize = size;
    }
}

class PakIndexEntry {
    long payloadOffset;
    int qH;
    int[] optH = new int[4];
    int correctAnswer;
}

class GKCanvas extends Canvas {
    private final Midlet midlet;

    // Dimensions
    public static final int SCREEN_W = 240;
    public static final int SCREEN_H = 320;
    public static final int QUESTION_W = 224;
    public static final int QUESTION_BYTES_ROW = 28;
    public static final int OPTION_W = 208;
    public static final int OPTION_BYTES_ROW = 26;

    public static final String DOWNLOAD_URL = "http://github.com/shifat100/daily-gk";

    // Palette (RGB 888)
    public static final int COLOR_BG       = 0x12161E;
    public static final int COLOR_CARD     = 0x1C222E;
    public static final int COLOR_HL       = 0x1E90FF;
    public static final int COLOR_GREEN    = 0x2ECC71;
    public static final int COLOR_RED      = 0xE74C3C;
    public static final int COLOR_TEXT     = 0xFFFFFF;
    public static final int COLOR_MUTED    = 0xAAAFB9;
    public static final int COLOR_ORANGE   = 0xF39C12;
    public static final int COLOR_MODAL_BG = 0x0C0F16;
    public static final int COLOR_BAR_BG   = 0x0E1219;
    public static final int COLOR_BORDER   = 0x2D3441;

    // States
    public static final int STATE_FILE_LIST     = 0;
    public static final int STATE_NO_FILES      = 1;
    public static final int STATE_MENU          = 2;
    public static final int STATE_HELP_CAROUSEL = 3;
    public static final int STATE_ABOUT         = 4;
    public static final int STATE_CONFIRM_EXIT  = 5;
    public static final int STATE_QUESTION      = 6;
    public static final int STATE_FEEDBACK      = 7;
    public static final int STATE_QUESTION_MENU = 8;
    public static final int STATE_INPUT_DIALOG  = 9;
    public static final int STATE_SCORECARD     = 10;

    // Modes
    public static final int MODE_QUIZ  = 0;
    public static final int MODE_STUDY = 1;

    // Input Targets
    public static final int INPUT_FILE_SEARCH = 0;
    public static final int INPUT_Q_SEARCH    = 1;
    public static final int INPUT_JUMP_Q      = 2;

    private int state = STATE_FILE_LIST;
    private int prevState = STATE_FILE_LIST;
    private int readMode = MODE_QUIZ;

    // File Lists
    private Vector pakList = new Vector();
    private Vector filteredList = new Vector();
    private int selectedFileIdx = 0;
    private String searchFilter = "";

    // PAK Metadata
    private String currentPakPath = null;
    private int totalQuestions = 0;
    private long indexOffset = 0;
    private long searchOffset = 0;
    private long payloadBase = 0;

    private int currentQId = 0;
    private PakIndexEntry curEntry = new PakIndexEntry();
    private int selectedOption = 0;
    private int userChoice = -1;
    private int score = 0;

    // Bitmap Buffers (Large capacities matching C version to prevent noise)
    private byte[] qBitmap = new byte[4096];
    private byte[][] optBitmap = new byte[4][2048];
    private int[] rgbBuffer = new int[QUESTION_W * 160];

    // Menu States
    private int menuSelectedIdx = 0;
    private int qmenuSelectedIdx = 0;
    private int helpSlideIdx = 0;

    // Input Buffer
    private int inputTarget = INPUT_FILE_SEARCH;
    private StringBuffer inputBuffer = new StringBuffer();

    private Font sysFont;

    public GKCanvas(Midlet midlet) {
        this.midlet = midlet;
        setFullScreenMode(true);
        sysFont = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_SMALL);
        scanStorage();
    }

    public void cleanup() {
        pakList.removeAllElements();
        filteredList.removeAllElements();
    }

    // Little-Endian Unsigned 32-bit Integer
    private static long readLEUInt32(InputStream in) throws IOException {
        int b1 = in.read();
        int b2 = in.read();
        int b3 = in.read();
        int b4 = in.read();
        if ((b1 | b2 | b3 | b4) < 0) throw new EOFException();
        return ((long) (b1 & 0xFF)) |
               (((long) (b2 & 0xFF)) << 8) |
               (((long) (b3 & 0xFF)) << 16) |
               (((long) (b4 & 0xFF)) << 24);
    }

    // Little-Endian Unsigned 16-bit Integer
    private static int readLEUInt16(InputStream in) throws IOException {
        int b1 = in.read();
        int b2 = in.read();
        if ((b1 | b2) < 0) throw new EOFException();
        return (b1 & 0xFF) | ((b2 & 0xFF) << 8);
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long remaining = n;
        while (remaining > 0) {
            long skipped = in.skip(remaining);
            if (skipped <= 0) {
                if (in.read() == -1) break;
                remaining--;
            } else {
                remaining -= skipped;
            }
        }
    }

    private InputStream openFileStream(String path) throws IOException {
        if (path.startsWith("res://")) {
            return getClass().getResourceAsStream(path.substring(6));
        }
        FileConnection fc = (FileConnection) Connector.open(path, Connector.READ);
        return fc.openInputStream();
    }

    // JSR-75 Storage Scanner + Bundled PAK check
    private void scanStorage() {
        pakList.removeAllElements();
        selectedFileIdx = 0;
        searchFilter = "";

        // 1. Check bundled JAR asset
        if (getClass().getResourceAsStream("/daily_gk.pak") != null) {
            pakList.addElement(new PakFileInfo("res:///daily_gk.pak", "daily_gk.pak (Internal)", 0));
        }

        // 2. Direct JSR-75 Root scanning
        try {
            Enumeration roots = FileSystemRegistry.listRoots();
            while (roots.hasMoreElements()) {
                String root = (String) roots.nextElement();
                scanDirectory("file:///" + root);
            }
        } catch (Throwable t) {
            // JSR-75 not available or permission denied
        }

        applyFileFilter();

        if (pakList.size() > 0) {
            state = STATE_FILE_LIST;
        } else {
            state = STATE_NO_FILES;
        }
    }

    private void scanDirectory(String dirUrl) {
        try {
            FileConnection fc = (FileConnection) Connector.open(dirUrl, Connector.READ);
            if (fc.exists() && fc.isDirectory()) {
                Enumeration files = fc.list("*", false);
                while (files.hasMoreElements() && pakList.size() < 32) {
                    String name = (String) files.nextElement();
                    if (name.endsWith("/")) {
                        String lower = name.toLowerCase();
                        if (lower.indexOf("video") == -1 && lower.indexOf("music") == -1 &&
                            lower.indexOf("audio") == -1 && lower.indexOf("dcim") == -1 &&
                            lower.indexOf("photo") == -1 && lower.indexOf("lost.dir") == -1) {
                            scanDirectory(dirUrl + name);
                        }
                    } else if (name.toLowerCase().endsWith(".pak")) {
                        FileConnection childFc = (FileConnection) Connector.open(dirUrl + name, Connector.READ);
                        long size = childFc.fileSize();
                        childFc.close();
                        pakList.addElement(new PakFileInfo(dirUrl + name, name, size));
                    }
                }
            }
            fc.close();
        } catch (Throwable t) {}
    }

    private void applyFileFilter() {
        filteredList.removeAllElements();
        for (int i = 0; i < pakList.size(); i++) {
            PakFileInfo info = (PakFileInfo) pakList.elementAt(i);
            if (searchFilter.length() == 0 || info.filename.toLowerCase().indexOf(searchFilter.toLowerCase()) != -1) {
                filteredList.addElement(info);
            }
        }
        if (selectedFileIdx >= filteredList.size()) {
            selectedFileIdx = 0;
        }
    }

    private boolean openSelectedPak(String path) {
        try {
            currentPakPath = path;
            InputStream in = openFileStream(path);
            byte[] magic = new byte[4];
            in.read(magic);
            if (magic[0] != 'D' || magic[1] != 'G' || magic[2] != 'K' || magic[3] != '1') {
                in.close();
                return false;
            }

            totalQuestions = (int) readLEUInt32(in);
            indexOffset = readLEUInt32(in);
            searchOffset = readLEUInt32(in);
            payloadBase = readLEUInt32(in);
            in.close();

            if (totalQuestions <= 0) return false;

            score = 0;
            selectedOption = 0;
            userChoice = -1;
            loadQuestion(0);
            state = STATE_QUESTION;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean loadQuestion(int qId) {
        if (qId < 0 || qId >= totalQuestions) return false;

        // Reset buffers
        for (int b = 0; b < qBitmap.length; b++) qBitmap[b] = 0;
        for (int i = 0; i < 4; i++) {
            for (int b = 0; b < optBitmap[i].length; b++) optBitmap[i][b] = 0;
        }

        try {
            // 1. Read Index Table
            InputStream in = openFileStream(currentPakPath);
            long entryPos = indexOffset + ((long) qId * 20);
            skipFully(in, entryPos);

            curEntry.payloadOffset = readLEUInt32(in);
            curEntry.qH = readLEUInt16(in);
            for (int i = 0; i < 4; i++) {
                curEntry.optH[i] = readLEUInt16(in);
            }
            curEntry.correctAnswer = in.read() & 0xFF;
            in.close();

            // 2. Read Bitmaps in one fast sequential stream
            in = openFileStream(currentPakPath);
            long curOffset = payloadBase + curEntry.payloadOffset;
            skipFully(in, curOffset);

            // Question bitmap
            int qBytes = curEntry.qH * QUESTION_BYTES_ROW;
            int readQ = (qBytes > qBitmap.length) ? qBitmap.length : qBytes;
            if (readQ > 0) in.read(qBitmap, 0, readQ);
            if (qBytes > readQ) skipFully(in, qBytes - readQ);

            // 4 Options bitmaps
            for (int i = 0; i < 4; i++) {
                int optBytes = curEntry.optH[i] * OPTION_BYTES_ROW;
                int readOpt = (optBytes > optBitmap[i].length) ? optBitmap[i].length : optBytes;
                if (readOpt > 0) in.read(optBitmap[i], 0, readOpt);
                if (optBytes > readOpt) skipFully(in, optBytes - readOpt);
            }
            in.close();

            currentQId = qId;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void submitInput() {
        if (inputTarget == INPUT_FILE_SEARCH) {
            searchFilter = inputBuffer.toString().trim();
            applyFileFilter();
            state = STATE_FILE_LIST;
        } else if (inputTarget == INPUT_JUMP_Q) {
            try {
                int target = Integer.parseInt(inputBuffer.toString().trim());
                if (target >= 1 && target <= totalQuestions) {
                    selectedOption = 0;
                    userChoice = -1;
                    loadQuestion(target - 1);
                }
            } catch (Exception e) {}
            state = STATE_QUESTION;
        } else if (inputTarget == INPUT_Q_SEARCH) {
            searchQuestionText(inputBuffer.toString().trim().toLowerCase());
            state = STATE_QUESTION;
        }
    }

    private void searchQuestionText(String query) {
        if (query.length() == 0) return;
        try {
            InputStream in = openFileStream(currentPakPath);
            skipFully(in, searchOffset);

            for (int i = 0; i < totalQuestions; i++) {
                int qId = readLEUInt16(in);
                int tLen = readLEUInt16(in);
                byte[] textBytes = new byte[tLen];
                in.read(textBytes);
                String qText = new String(textBytes, "UTF-8").toLowerCase();
                if (qText.indexOf(query) != -1) {
                    in.close();
                    selectedOption = 0;
                    userChoice = -1;
                    loadQuestion(qId);
                    return;
                }
            }
            in.close();
        } catch (Exception e) {}
    }

    private void blitTransparentMask(Graphics g, int startX, int startY, int width, int height,
                                    int bytesPerRow, byte[] maskData, int textColor) {
        if (height <= 0 || width <= 0) return;
        int totalPixels = width * height;
        if (totalPixels > rgbBuffer.length) totalPixels = rgbBuffer.length;

        int opaqueColor = 0xFF000000 | (textColor & 0x00FFFFFF);

        for (int r = 0; r < height; r++) {
            int rowOffset = r * bytesPerRow;
            int outOffset = r * width;
            for (int b = 0; b < bytesPerRow; b++) {
                int val = maskData[rowOffset + b] & 0xFF;
                if (val == 0) {
                    for (int bit = 0; bit < 8; bit++) {
                        int px = (b * 8) + bit;
                        if (px < width && (outOffset + px) < totalPixels) {
                            rgbBuffer[outOffset + px] = 0x00000000;
                        }
                    }
                } else {
                    for (int bit = 0; bit < 8; bit++) {
                        int px = (b * 8) + bit;
                        if (px < width && (outOffset + px) < totalPixels) {
                            rgbBuffer[outOffset + px] = ((val & (0x80 >> bit)) != 0) ? opaqueColor : 0x00000000;
                        }
                    }
                }
            }
        }
        g.drawRGB(rgbBuffer, 0, width, startX, startY, width, height, true);
    }

    private void drawSoftbar(Graphics g, String left, String center, String right) {
        g.setColor(COLOR_BAR_BG);
        g.fillRect(0, 294, SCREEN_W, 26);
        g.setColor(COLOR_BORDER);
        g.drawLine(0, 294, SCREEN_W, 294);

        g.setFont(sysFont);
        if (left != null && left.length() > 0) {
            g.setColor(COLOR_HL);
            g.drawString(left, 8, 299, Graphics.TOP | Graphics.LEFT);
        }
        if (center != null && center.length() > 0) {
            g.setColor(COLOR_GREEN);
            int x = (SCREEN_W - sysFont.stringWidth(center)) / 2;
            g.drawString(center, x, 299, Graphics.TOP | Graphics.LEFT);
        }
        if (right != null && right.length() > 0) {
            g.setColor(COLOR_MUTED);
            int x = SCREEN_W - sysFont.stringWidth(right) - 8;
            g.drawString(right, x, 299, Graphics.TOP | Graphics.LEFT);
        }
    }

    protected void paint(Graphics g) {
        g.setColor(COLOR_BG);
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);

        if (state == STATE_FILE_LIST) {
            g.setColor(COLOR_HL);
            g.fillRect(0, 0, SCREEN_W, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("Daily GK (" + filteredList.size() + " Found)", 8, 6, Graphics.TOP | Graphics.LEFT);

            int curY = 32;
            for (int i = 0; i < filteredList.size() && i < 6; i++) {
                PakFileInfo info = (PakFileInfo) filteredList.elementAt(i);
                int itemBg = (i == selectedFileIdx) ? COLOR_HL : COLOR_CARD;
                int numKey = (i < 9) ? (i + 1) : 0;

                g.setColor(itemBg);
                g.fillRect(8, curY, 224, 40);

                g.setColor(COLOR_TEXT);
                g.drawString("[" + numKey + "] " + info.filename, 14, curY + 4, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_MUTED);
                g.drawString("Size: " + (info.filesize / 1024) + " KB | Touch to open", 14, curY + 20, Graphics.TOP | Graphics.LEFT);

                curY += 44;
            }

            drawSoftbar(g, "Menu", "Play", "Exit");
        }
        else if (state == STATE_NO_FILES) {
            g.setColor(COLOR_RED);
            g.fillRect(0, 0, SCREEN_W, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("No Packages Found!", 8, 6, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_CARD);
            g.fillRect(8, 38, 224, 246);

            g.setColor(COLOR_ORANGE);
            g.drawString("No .PAK files found in SD!", 16, 48, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_TEXT);
            g.drawString("Paste .pak in ANY folder,", 16, 75, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_MUTED);
            g.drawString("EXCEPT excluded media folders:", 16, 92, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_RED);
            g.drawString("- Videos / Video", 24, 115, Graphics.TOP | Graphics.LEFT);
            g.drawString("- Music / Audio / Record", 24, 132, Graphics.TOP | Graphics.LEFT);
            g.drawString("- Photos / DCIM / Images", 24, 149, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_TEXT);
            g.drawString("Get PAK files from:", 16, 195, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_GREEN);
            g.drawString("github.com/shifat100/daily-gk", 16, 215, Graphics.TOP | Graphics.LEFT);

            drawSoftbar(g, "Menu", "Rescan", "Exit");
        }
        else if (state == STATE_MENU) {
            g.setColor(COLOR_MODAL_BG);
            g.fillRect(0, 0, SCREEN_W, SCREEN_H);

            g.setColor(COLOR_CARD);
            g.fillRect(12, 28, 216, 256);
            g.setColor(COLOR_HL);
            g.fillRect(12, 28, 216, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("Options Menu", 20, 34, Graphics.TOP | Graphics.LEFT);

            String[] titles = {
                "1. Search Files", "2. Download More PAKs", "3. Help Guide",
                "4. About Daily GK", "5. Rescan Storage", "6. Exit App"
            };

            int curY = 62;
            for (int i = 0; i < titles.length; i++) {
                int mBg = (i == menuSelectedIdx) ? COLOR_HL : COLOR_CARD;
                g.setColor(mBg);
                g.fillRect(18, curY, 204, 30);
                g.setColor(COLOR_TEXT);
                g.drawString(titles[i], 26, curY + 8, Graphics.TOP | Graphics.LEFT);
                curY += 34;
            }

            drawSoftbar(g, "Select", "", "Back");
        }
        else if (state == STATE_QUESTION_MENU) {
            g.setColor(COLOR_MODAL_BG);
            g.fillRect(0, 0, SCREEN_W, SCREEN_H);

            g.setColor(COLOR_CARD);
            g.fillRect(12, 34, 216, 230);
            g.setColor(COLOR_HL);
            g.fillRect(12, 34, 216, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("Reading Options", 20, 40, Graphics.TOP | Graphics.LEFT);

            String modeTitle = (readMode == MODE_STUDY) ? "3. Mode: [Study -> Quiz]" : "3. Mode: [Quiz -> Study]";
            String[] qtitles = {
                "1. Search Question", "2. Jump To Question", modeTitle,
                "4. Download *.pak", "5. Return to Main Menu"
            };

            int curY = 68;
            for (int i = 0; i < qtitles.length; i++) {
                int mBg = (i == qmenuSelectedIdx) ? COLOR_HL : COLOR_CARD;
                g.setColor(mBg);
                g.fillRect(18, curY, 204, 30);
                g.setColor(COLOR_TEXT);
                g.drawString(qtitles[i], 26, curY + 8, Graphics.TOP | Graphics.LEFT);
                curY += 34;
            }

            drawSoftbar(g, "Select", "", "Back");
        }
        else if (state == STATE_INPUT_DIALOG) {
            g.setColor(COLOR_MODAL_BG);
            g.fillRect(0, 0, SCREEN_W, SCREEN_H);

            g.setColor(COLOR_CARD);
            g.fillRect(14, 70, 212, 160);
            g.setColor(COLOR_HL);
            g.fillRect(14, 70, 212, 26);

            g.setColor(COLOR_TEXT);
            if (inputTarget == INPUT_FILE_SEARCH) {
                g.drawString("Search PAK Files", 20, 76, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_MUTED);
                g.drawString("Enter keyword:", 22, 105, Graphics.TOP | Graphics.LEFT);
            } else if (inputTarget == INPUT_JUMP_Q) {
                g.drawString("Jump to Question", 20, 76, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_MUTED);
                g.drawString("Enter Number (1 - " + totalQuestions + "):", 22, 105, Graphics.TOP | Graphics.LEFT);
            } else {
                g.drawString("Search Question", 20, 76, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_MUTED);
                g.drawString("Enter search keyword:", 22, 105, Graphics.TOP | Graphics.LEFT);
            }

            g.setColor(COLOR_BG);
            g.fillRect(22, 126, 196, 32);
            g.setColor(COLOR_GREEN);
            g.drawString(inputBuffer.toString() + "_", 28, 134, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_MUTED);
            g.drawString("Use keypad/touch to type", 22, 175, Graphics.TOP | Graphics.LEFT);

            drawSoftbar(g, "Done", "Clear", "Cancel");
        }
        else if (state == STATE_CONFIRM_EXIT) {
            g.setColor(COLOR_MODAL_BG);
            g.fillRect(0, 0, SCREEN_W, SCREEN_H);

            g.setColor(COLOR_CARD);
            g.fillRect(18, 90, 204, 130);
            g.setColor(COLOR_RED);
            g.fillRect(18, 90, 204, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("Exit Application?", 26, 96, Graphics.TOP | Graphics.LEFT);

            g.drawString("Are you sure you want", 30, 130, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_MUTED);
            g.drawString("to quit Daily GK?", 30, 150, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_RED);
            g.fillRect(28, 180, 80, 28);
            g.setColor(COLOR_TEXT);
            g.drawString("Exit", 54, 186, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_HL);
            g.fillRect(132, 180, 80, 28);
            g.setColor(COLOR_TEXT);
            g.drawString("Cancel", 152, 186, Graphics.TOP | Graphics.LEFT);

            drawSoftbar(g, "Exit", "", "Cancel");
        }
        else if (state == STATE_QUESTION || state == STATE_FEEDBACK) {
            g.setColor(COLOR_HL);
            g.fillRect(0, 0, SCREEN_W, 26);
            g.setColor(COLOR_TEXT);
            String modeStr = (readMode == MODE_STUDY) ? "Study" : "Quiz";
            g.drawString("Q " + (currentQId + 1) + "/" + totalQuestions + " (" + modeStr + ")", 8, 6, Graphics.TOP | Graphics.LEFT);

            int curY = 30;
            g.setColor(COLOR_CARD);
            g.fillRect(8, curY, 224, curEntry.qH + 8);
            blitTransparentMask(g, 8, curY + 4, QUESTION_W, curEntry.qH, QUESTION_BYTES_ROW, qBitmap, COLOR_TEXT);

            curY += curEntry.qH + 10;

            for (int i = 0; i < 4; i++) {
                int optCardH = curEntry.optH[i] + 6;
                int optBg = COLOR_CARD;

                if (readMode == MODE_STUDY) {
                    if (i == curEntry.correctAnswer) optBg = COLOR_GREEN;
                    else if (i == selectedOption) optBg = COLOR_HL;
                } else {
                    if (state == STATE_QUESTION) {
                        if (i == selectedOption) optBg = COLOR_HL;
                    } else if (state == STATE_FEEDBACK) {
                        if (i == curEntry.correctAnswer) optBg = COLOR_GREEN;
                        else if (i == userChoice) optBg = COLOR_RED;
                    }
                }

                g.setColor(optBg);
                g.fillRect(8, curY, 224, optCardH);
                blitTransparentMask(g, 16, curY + 3, OPTION_W, curEntry.optH[i], OPTION_BYTES_ROW, optBitmap[i], COLOR_TEXT);

                curY += optCardH + 4;
            }

            if (readMode == MODE_STUDY) {
                drawSoftbar(g, "Menu", "Next >", "Pack List");
            } else {
                if (state == STATE_FEEDBACK) {
                    drawSoftbar(g, "Menu", "Next Q", "Pack List");
                } else {
                    drawSoftbar(g, "Menu", "Ans", "Back");
                }
            }
        }
        else if (state == STATE_HELP_CAROUSEL) {
            g.setColor(COLOR_HL);
            g.fillRect(0, 0, SCREEN_W, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("Help Guide (" + (helpSlideIdx + 1) + "/4)", 8, 6, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_CARD);
            g.fillRect(8, 36, 224, 215);

            if (helpSlideIdx == 0) {
                g.setColor(COLOR_HL);
                g.drawString("[1. About .PAK Files]", 16, 48, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_TEXT);
                g.drawString("Daily GK uses .PAK packages.", 16, 75, Graphics.TOP | Graphics.LEFT);
                g.drawString("Each package contains ready", 16, 95, Graphics.TOP | Graphics.LEFT);
                g.drawString("pre-rendered global MCQs.", 16, 115, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_GREEN);
                g.drawString("No font is needed on phone!", 16, 145, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_MUTED);
                g.drawString("Zero CPU load, zero lag.", 16, 165, Graphics.TOP | Graphics.LEFT);
            } else if (helpSlideIdx == 1) {
                g.setColor(COLOR_HL);
                g.drawString("[2. Storage & Folders]", 16, 48, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_TEXT);
                g.drawString("Put .pak in ANY folder on SD:", 16, 75, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_GREEN);
                g.drawString("e:/, e:/download, e:/study", 16, 95, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_ORANGE);
                g.drawString("Excluded media folders:", 16, 125, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_RED);
                g.drawString("Videos, Audio, Music, Photos.", 16, 145, Graphics.TOP | Graphics.LEFT);
            } else if (helpSlideIdx == 2) {
                g.setColor(COLOR_HL);
                g.drawString("[3. Dual Touch & Keys]", 16, 48, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_GREEN);
                g.drawString("Touch any Option to Select", 16, 75, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_TEXT);
                g.drawString("Keys 1-4: Select Option directly", 16, 95, Graphics.TOP | Graphics.LEFT);
                g.drawString("D-Pad Up/Down: Highlight", 16, 115, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_GREEN);
                g.drawString("Key 0-9 in List: Jump file", 16, 135, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_ORANGE);
                g.drawString("Study Mode available in menu!", 16, 160, Graphics.TOP | Graphics.LEFT);
            } else if (helpSlideIdx == 3) {
                g.setColor(COLOR_HL);
                g.drawString("[4. Download More]", 16, 48, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_TEXT);
                g.drawString("Need more quiz questions?", 16, 75, Graphics.TOP | Graphics.LEFT);
                g.drawString("Download latest packages from:", 16, 95, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_GREEN);
                g.drawString("github.com/shifat100/daily-gk", 16, 120, Graphics.TOP | Graphics.LEFT);
                g.setColor(COLOR_HL);
                g.drawString("Click [Download] to open web.", 16, 160, Graphics.TOP | Graphics.LEFT);
            }

            drawSoftbar(g, (helpSlideIdx == 3) ? "Download" : "< Prev", "Next >", "Back");
        }
        else if (state == STATE_ABOUT) {
            g.setColor(COLOR_HL);
            g.fillRect(0, 0, SCREEN_W, 26);
            g.setColor(COLOR_TEXT);
            g.drawString("About Daily GK", 8, 6, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_CARD);
            g.fillRect(10, 45, 220, 220);

            g.setColor(COLOR_HL);
            g.drawString("Daily GK Universal J2ME", 20, 60, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_MUTED);
            g.drawString("Version: 3.0 MIDP2.0/CLDC1.1", 20, 80, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_GREEN);
            g.drawString("Developer: Shifat100", 20, 110, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_TEXT);
            g.drawString("Platform: Java J2ME / S40 / SE", 20, 130, Graphics.TOP | Graphics.LEFT);
            g.setColor(COLOR_ORANGE);
            g.drawString("Modes: Study & Quiz Supported", 20, 155, Graphics.TOP | Graphics.LEFT);
            g.drawString("Global Complex Text Engine", 20, 180, Graphics.TOP | Graphics.LEFT);

            drawSoftbar(g, "", "", "Back");
        }
        else if (state == STATE_SCORECARD) {
            g.setColor(COLOR_CARD);
            g.fillRect(10, 60, 220, 160);
            g.setColor(COLOR_GREEN);
            g.drawString("Quiz Completed!", 75, 80, Graphics.TOP | Graphics.LEFT);

            g.setColor(COLOR_TEXT);
            g.drawString("Final Score: " + score + " / " + totalQuestions, 65, 120, Graphics.TOP | Graphics.LEFT);

            drawSoftbar(g, "Again", "", "Pack List");
        }
    }

    protected void keyPressed(int keyCode) {
        int ga = 0;
        try { ga = getGameAction(keyCode); } catch (Exception e) {}

        if (state == STATE_CONFIRM_EXIT) {
            if (isLeftSoftkey(keyCode) || ga == FIRE || keyCode == KEY_NUM5) {
                midlet.exit();
            } else if (isRightSoftkey(keyCode)) {
                state = prevState;
                repaint();
            }
            return;
        }

        if (state == STATE_INPUT_DIALOG) {
            if (keyCode >= KEY_NUM0 && keyCode <= KEY_NUM9) {
                if (inputBuffer.length() < 28) {
                    inputBuffer.append((char) ('0' + (keyCode - KEY_NUM0)));
                    repaint();
                }
            } else if (isLeftSoftkey(keyCode) || ga == FIRE || keyCode == KEY_NUM5) {
                submitInput();
                repaint();
            } else if (keyCode == KEY_POUND || keyCode == -8) {
                if (inputBuffer.length() > 0) {
                    inputBuffer.deleteCharAt(inputBuffer.length() - 1);
                    repaint();
                }
            } else if (isRightSoftkey(keyCode)) {
                state = prevState;
                repaint();
            }
            return;
        }

        if (isRightSoftkey(keyCode)) {
            if (state == STATE_FILE_LIST || state == STATE_NO_FILES) {
                prevState = state;
                state = STATE_CONFIRM_EXIT;
            } else if (state == STATE_MENU || state == STATE_HELP_CAROUSEL || state == STATE_ABOUT) {
                state = (pakList.size() > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
            } else if (state == STATE_QUESTION_MENU) {
                state = STATE_QUESTION;
            } else if (state == STATE_QUESTION || state == STATE_FEEDBACK || state == STATE_SCORECARD) {
                state = STATE_FILE_LIST;
            }
            repaint();
            return;
        }

        if (isLeftSoftkey(keyCode)) {
            if (state == STATE_FILE_LIST || state == STATE_NO_FILES) {
                menuSelectedIdx = 0;
                state = STATE_MENU;
                repaint();
                return;
            } else if (state == STATE_QUESTION || state == STATE_FEEDBACK) {
                qmenuSelectedIdx = 0;
                state = STATE_QUESTION_MENU;
                repaint();
                return;
            } else if (state == STATE_HELP_CAROUSEL) {
                if (helpSlideIdx == 3) {
                    midlet.openBrowser(DOWNLOAD_URL);
                } else if (helpSlideIdx > 0) {
                    helpSlideIdx--;
                    repaint();
                }
                return;
            } else if (state == STATE_SCORECARD) {
                score = 0;
                selectedOption = 0;
                userChoice = -1;
                loadQuestion(0);
                state = STATE_QUESTION;
                repaint();
                return;
            }
        }

        if (state == STATE_QUESTION_MENU) {
            if (ga == UP && qmenuSelectedIdx > 0) {
                qmenuSelectedIdx--;
                repaint();
            } else if (ga == DOWN && qmenuSelectedIdx < 4) {
                qmenuSelectedIdx++;
                repaint();
            } else if (ga == FIRE || keyCode == KEY_NUM5) {
                switch (qmenuSelectedIdx) {
                    case 0:
                        inputTarget = INPUT_Q_SEARCH;
                        inputBuffer.setLength(0);
                        prevState = state;
                        state = STATE_INPUT_DIALOG;
                        break;
                    case 1:
                        inputTarget = INPUT_JUMP_Q;
                        inputBuffer.setLength(0);
                        prevState = state;
                        state = STATE_INPUT_DIALOG;
                        break;
                    case 2:
                        readMode = (readMode == MODE_QUIZ) ? MODE_STUDY : MODE_QUIZ;
                        state = STATE_QUESTION;
                        break;
                    case 3:
                        midlet.openBrowser(DOWNLOAD_URL);
                        break;
                    case 4:
                        state = STATE_FILE_LIST;
                        break;
                }
                repaint();
            }
            return;
        }

        if (state == STATE_MENU) {
            if (ga == UP && menuSelectedIdx > 0) {
                menuSelectedIdx--;
                repaint();
            } else if (ga == DOWN && menuSelectedIdx < 5) {
                menuSelectedIdx++;
                repaint();
            } else if (ga == FIRE || keyCode == KEY_NUM5) {
                switch (menuSelectedIdx) {
                    case 0:
                        inputTarget = INPUT_FILE_SEARCH;
                        inputBuffer.setLength(0);
                        prevState = state;
                        state = STATE_INPUT_DIALOG;
                        break;
                    case 1:
                        midlet.openBrowser(DOWNLOAD_URL);
                        break;
                    case 2:
                        helpSlideIdx = 0;
                        state = STATE_HELP_CAROUSEL;
                        break;
                    case 3:
                        state = STATE_ABOUT;
                        break;
                    case 4:
                        scanStorage();
                        break;
                    case 5:
                        prevState = STATE_MENU;
                        state = STATE_CONFIRM_EXIT;
                        break;
                }
                repaint();
            }
            return;
        }

        if (state == STATE_FILE_LIST) {
            if (ga == UP && selectedFileIdx > 0) {
                selectedFileIdx--;
                repaint();
            } else if (ga == DOWN && selectedFileIdx < filteredList.size() - 1) {
                selectedFileIdx++;
                repaint();
            } else if (ga == FIRE || keyCode == KEY_NUM5) {
                if (filteredList.size() > 0) {
                    PakFileInfo info = (PakFileInfo) filteredList.elementAt(selectedFileIdx);
                    openSelectedPak(info.filepath);
                    repaint();
                }
            } else if (keyCode >= KEY_NUM1 && keyCode <= KEY_NUM9) {
                int target = keyCode - KEY_NUM1;
                if (target < filteredList.size()) {
                    selectedFileIdx = target;
                    repaint();
                }
            } else if (keyCode == KEY_NUM0) {
                if (9 < filteredList.size()) {
                    selectedFileIdx = 9;
                    repaint();
                }
            }
            return;
        }

        if (state == STATE_HELP_CAROUSEL) {
            if (ga == LEFT && helpSlideIdx > 0) {
                helpSlideIdx--;
                repaint();
            } else if (ga == RIGHT || ga == FIRE || keyCode == KEY_NUM5) {
                if (helpSlideIdx < 3) {
                    helpSlideIdx++;
                } else {
                    midlet.openBrowser(DOWNLOAD_URL);
                }
                repaint();
            }
            return;
        }

        if (state == STATE_QUESTION) {
            if (readMode == MODE_STUDY) {
                if (ga == RIGHT || ga == FIRE || keyCode == KEY_NUM5) {
                    if (currentQId + 1 < totalQuestions) {
                        loadQuestion(currentQId + 1);
                    }
                    repaint();
                    return;
                } else if (ga == LEFT && currentQId > 0) {
                    loadQuestion(currentQId - 1);
                    repaint();
                    return;
                }
            }

            if (keyCode >= KEY_NUM1 && keyCode <= KEY_NUM4) {
                userChoice = keyCode - KEY_NUM1;
                if (userChoice == curEntry.correctAnswer) score++;
                state = STATE_FEEDBACK;
                repaint();
                return;
            }

            if (ga == UP && selectedOption > 0) {
                selectedOption--;
                repaint();
            } else if (ga == DOWN && selectedOption < 3) {
                selectedOption++;
                repaint();
            } else if (ga == FIRE || keyCode == KEY_NUM5) {
                userChoice = selectedOption;
                if (userChoice == curEntry.correctAnswer) score++;
                state = STATE_FEEDBACK;
                repaint();
            }
        }
        else if (state == STATE_FEEDBACK) {
            if (ga == FIRE || keyCode == KEY_NUM5 || ga == RIGHT || ga == DOWN) {
                if (currentQId + 1 < totalQuestions) {
                    selectedOption = 0;
                    userChoice = -1;
                    loadQuestion(currentQId + 1);
                    state = STATE_QUESTION;
                } else {
                    state = STATE_SCORECARD;
                }
                repaint();
            }
        }
    }

    protected void pointerReleased(int x, int y) {
        if (y >= 290) {
            if (x < 80) {
                handleSoftkeyAction(true);
            } else if (x >= 80 && x <= 160) {
                keyPressed(KEY_NUM5);
            } else {
                handleSoftkeyAction(false);
            }
            return;
        }

        if (state == STATE_CONFIRM_EXIT) {
            if (y >= 180 && y <= 210) {
                if (x >= 28 && x <= 110) midlet.exit();
                else if (x >= 130 && x <= 215) {
                    state = prevState;
                    repaint();
                }
            }
            return;
        }

        if (state == STATE_FILE_LIST) {
            int curY = 32;
            for (int i = 0; i < filteredList.size() && i < 6; i++) {
                if (x >= 8 && x <= 232 && y >= curY && y <= curY + 40) {
                    selectedFileIdx = i;
                    PakFileInfo info = (PakFileInfo) filteredList.elementAt(i);
                    openSelectedPak(info.filepath);
                    repaint();
                    return;
                }
                curY += 44;
            }
        }

        if (state == STATE_MENU) {
            int curY = 62;
            for (int i = 0; i < 6; i++) {
                if (x >= 18 && x <= 222 && y >= curY && y <= curY + 30) {
                    menuSelectedIdx = i;
                    keyPressed(KEY_NUM5);
                    return;
                }
                curY += 34;
            }
        }

        if (state == STATE_QUESTION_MENU) {
            int curY = 68;
            for (int i = 0; i < 5; i++) {
                if (x >= 18 && x <= 222 && y >= curY && y <= curY + 30) {
                    qmenuSelectedIdx = i;
                    keyPressed(KEY_NUM5);
                    return;
                }
                curY += 34;
            }
        }

        if (state == STATE_QUESTION) {
            int curY = 30 + curEntry.qH + 10;
            for (int i = 0; i < 4; i++) {
                int optCardH = curEntry.optH[i] + 6;
                if (x >= 8 && x <= 232 && y >= curY && y <= curY + optCardH) {
                    selectedOption = i;
                    userChoice = i;
                    if (readMode != MODE_STUDY) {
                        if (userChoice == curEntry.correctAnswer) score++;
                        state = STATE_FEEDBACK;
                    }
                    repaint();
                    return;
                }
                curY += optCardH + 4;
            }
        } else if (state == STATE_FEEDBACK) {
            keyPressed(KEY_NUM5);
        }
    }

    private void handleSoftkeyAction(boolean isLeft) {
        if (isLeft) {
            keyPressed(-6);
        } else {
            keyPressed(-7);
        }
    }

    private boolean isLeftSoftkey(int keyCode) {
        return keyCode == -6 || keyCode == -21 || keyCode == 105;
    }

    private boolean isRightSoftkey(int keyCode) {
        return keyCode == -7 || keyCode == -22 || keyCode == 106;
    }
}