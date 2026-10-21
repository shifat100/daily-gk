#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#include "vmsys.h"
#include "vmio.h"
#include "vmgraph.h"
#include "vmsock.h"
#include "vmchset.h"
#include "vmstdlib.h"
#include "vmtimer.h"

#define SCREEN_WIDTH         240
#define SCREEN_HEIGHT        320
#define MAX_PAK_FILES        32
#define MAX_QUESTIONS        1000
#define QUESTION_W           224
#define QUESTION_BYTES_ROW   28
#define OPTION_W             208
#define OPTION_BYTES_ROW     26
#define TOTAL_HELP_SLIDES    4
#define TOTAL_MENU_ITEMS     6
#define TOTAL_QMENU_ITEMS    5

/* Increased buffer capacities to completely prevent noise & line jumbling */
#define MAX_Q_BITMAP_SIZE    4096   /* Up to 146 px height */
#define MAX_OPT_BITMAP_SIZE  2048   /* Up to 78 px height */

#define DOWNLOAD_URL         "http://github.com/shifat100/daily-gk"

/* Color Palette (RGB565) */
#define COLOR_BG             VM_COLOR_888_TO_565(18, 22, 30)
#define COLOR_CARD           VM_COLOR_888_TO_565(28, 34, 46)
#define COLOR_HL             VM_COLOR_888_TO_565(30, 144, 255)
#define COLOR_GREEN          VM_COLOR_888_TO_565(46, 204, 113)
#define COLOR_RED            VM_COLOR_888_TO_565(231, 76, 60)
#define COLOR_TEXT           VM_COLOR_888_TO_565(255, 255, 255)
#define COLOR_MUTED          VM_COLOR_888_TO_565(170, 175, 185)
#define COLOR_ORANGE         VM_COLOR_888_TO_565(243, 156, 18)
#define COLOR_MODAL_BG       VM_COLOR_888_TO_565(12, 15, 22)
#define COLOR_BAR_BG         VM_COLOR_888_TO_565(14, 18, 25)
#define COLOR_BORDER         VM_COLOR_888_TO_565(45, 52, 65)

typedef enum {
    STATE_FILE_LIST,
    STATE_NO_FILES,
    STATE_MENU,
    STATE_HELP_CAROUSEL,
    STATE_ABOUT,
    STATE_CONFIRM_EXIT,
    STATE_QUESTION,
    STATE_FEEDBACK,
    STATE_QUESTION_MENU,
    STATE_INPUT_DIALOG,
    STATE_SCORECARD
} AppState;

typedef enum {
    READING_MODE_QUIZ,
    READING_MODE_STUDY
} ReadingMode;

typedef enum {
    INPUT_TARGET_FILE_SEARCH,
    INPUT_TARGET_Q_SEARCH,
    INPUT_TARGET_JUMP_Q
} InputTarget;

typedef struct {
    char filepath[128];
    char filename[64];
    VMUINT32 filesize;
} PakFileInfo;

/* Exact 20-byte alignment matching the builder output */
typedef struct {
    VMUINT32 payload_offset;
    VMUINT16 q_h;
    VMUINT16 opt_h[4];
    VMUINT8  correct_answer;
    VMUINT8  reserved[5];
} PakIndexEntry;

typedef struct {
    AppState        state;
    AppState        prev_state;
    ReadingMode     read_mode;
    VMINT           layer_hdl[1];
    VMBYTE*         buffer;

    PakFileInfo     pak_list[MAX_PAK_FILES];
    int             pak_count;
    int             selected_file_idx;
    char            search_filter[32];
    int             filtered_indices[MAX_PAK_FILES];
    int             filtered_count;

    int             menu_selected_idx;
    int             qmenu_selected_idx;
    int             help_slide_idx;

    VMFILE          pak_file;
    VMUINT32        total_questions;
    VMUINT32        index_offset;
    VMUINT32        search_offset;
    VMUINT32        payload_base;

    VMUINT32        current_q_id;
    PakIndexEntry   cur_entry;
    int             selected_option;
    int             user_choice;
    int             score;

    /* Custom Input Dialog State */
    InputTarget     input_target;
    char            input_buffer[32];
    int             input_cursor;

    VMBYTE          q_bitmap[MAX_Q_BITMAP_SIZE];
    VMBYTE          opt_bitmap[4][MAX_OPT_BITMAP_SIZE];

    VMWCHAR         ucs2_buf[128];
} AppContext;

static AppContext g_app;

static void draw_screen(void);
static void scan_all_drives(void);
static int open_selected_pak(const char* path);
static int load_question(VMUINT32 q_id);
static void launch_browser_download(void);
static void apply_file_filter(void);
static void open_input_box(InputTarget target);
static void submit_input(void);

static void draw_system_text(VMINT x, VMINT y, const char* str, VMUINT16 color) {
    vm_ascii_to_ucs2(g_app.ucs2_buf, 256, (VMSTR)str);
    vm_graphic_textout_by_baseline(g_app.buffer, x, y, g_app.ucs2_buf, vm_wstrlen(g_app.ucs2_buf), color, 12);
}

static void draw_softbar(const char* left, const char* center, const char* right) {
    int x_pos;
    vm_graphic_fill_rect(g_app.buffer, 0, 294, SCREEN_WIDTH, 26, COLOR_BAR_BG, COLOR_BAR_BG);
    vm_graphic_line(g_app.buffer, 0, 294, SCREEN_WIDTH, 294, COLOR_BORDER);

    if (left && strlen(left) > 0) {
        draw_system_text(8, 299, left, COLOR_HL);
    }
    if (center && strlen(center) > 0) {
        x_pos = (SCREEN_WIDTH / 2) - ((int)strlen(center) * 3);
        draw_system_text(x_pos, 299, center, COLOR_GREEN);
    }
    if (right && strlen(right) > 0) {
        x_pos = SCREEN_WIDTH - ((int)strlen(right) * 7) - 6;
        draw_system_text(x_pos, 299, right, COLOR_MUTED);
    }
}

static const char* get_menu_title(int idx) {
    switch (idx) {
        case 0: return "1. Search Files";
        case 1: return "2. Download More PAKs";
        case 2: return "3. Help Guide";
        case 3: return "4. About Daily GK";
        case 4: return "5. Rescan Storage";
        case 5: return "6. Exit App";
        default: return "";
    }
}

static const char* get_qmenu_title(int idx) {
    switch (idx) {
        case 0: return "1. Search Question";
        case 1: return "2. Jump To Question";
        case 2: return (g_app.read_mode == READING_MODE_STUDY) ? "3. Mode: [Study -> Quiz]" : "3. Mode: [Quiz -> Study]";
        case 3: return "4. Download *.pak";
        case 4: return "5. Return to Main Menu";
        default: return "";
    }
}

static void blit_transparent_mask(int start_x, int start_y, int width, int height, 
                                 int bytes_per_row, const VMBYTE* mask_data, VMUINT16 text_color) {
    int r, b, bit, sx, sy;
    VMBYTE val;
    VMUINT16* fb;

    fb = (VMUINT16*)g_app.buffer;

    for (r = 0; r < height; r++) {
        sy = start_y + r;
        if (sy < 0 || sy >= SCREEN_HEIGHT) continue;

        for (b = 0; b < bytes_per_row; b++) {
            val = mask_data[r * bytes_per_row + b];
            if (val == 0) continue;

            for (bit = 0; bit < 8; bit++) {
                if (val & (0x80 >> bit)) {
                    sx = start_x + (b * 8) + bit;
                    if (sx >= 0 && sx < SCREEN_WIDTH) {
                        fb[sy * SCREEN_WIDTH + sx] = text_color;
                    }
                }
            }
        }
    }
}

static void launch_browser_download(void) {
    VMWCHAR wurl[128];
    vm_ascii_to_ucs2(wurl, 256, (VMSTR)DOWNLOAD_URL);
    vm_open_wap_url(wurl);
}

static void apply_file_filter(void) {
    int i;
    g_app.filtered_count = 0;

    for (i = 0; i < g_app.pak_count; i++) {
        if (strlen(g_app.search_filter) == 0 || strstr(g_app.pak_list[i].filename, g_app.search_filter) != NULL) {
            g_app.filtered_indices[g_app.filtered_count++] = i;
        }
    }
    if (g_app.selected_file_idx >= g_app.filtered_count) {
        g_app.selected_file_idx = 0;
    }
}

static int is_blacklisted_dir(const char* name) {
    char lower[64];
    int i;
    char c;

    for (i = 0; name[i] != '\0' && i < 63; i++) {
        c = name[i];
        if (c >= 'A' && c <= 'Z') c = c + ('a' - 'A');
        lower[i] = c;
    }
    lower[i] = '\0';

    if (strcmp(lower, ".") == 0 || strcmp(lower, "..") == 0) return 1;
    if (strstr(lower, "video") || strstr(lower, "audio") || strstr(lower, "music") ||
        strstr(lower, "record") || strstr(lower, "system volume") || strstr(lower, "photo") ||
        strstr(lower, "image") || strstr(lower, "dcim") || strstr(lower, "lost.dir") ||
        strstr(lower, ".android")) return 1;

    return 0;
}

static void scan_directory_for_pak(const char* dir) {
    VMWCHAR wpattern[128];
    char pattern[128];
    vm_fileinfo_ext finfo;
    VMINT hfind;
    int i;
    char fname_ascii[64];
    int is_duplicate;
    VMWCHAR c;

    sprintf(pattern, "%s*.pak", dir);
    vm_ascii_to_ucs2(wpattern, 256, (VMSTR)pattern);

    hfind = vm_find_first_ext(wpattern, &finfo);
    if (hfind >= 0) {
        do {
            if (g_app.pak_count < MAX_PAK_FILES) {
                is_duplicate = 0;

                for (i = 0; finfo.filefullname[i] != 0 && i < 63; i++) {
                    c = finfo.filefullname[i];
                    fname_ascii[i] = (c < 128) ? (char)c : '_';
                }
                fname_ascii[i] = '\0';

                if (strlen(fname_ascii) == 0) continue;

                for (i = 0; i < g_app.pak_count; i++) {
                    if (strcmp(g_app.pak_list[i].filename, fname_ascii) == 0) {
                        is_duplicate = 1;
                        break;
                    }
                }

                if (!is_duplicate) {
                    sprintf(g_app.pak_list[g_app.pak_count].filepath, "%s%s", dir, fname_ascii);
                    strcpy(g_app.pak_list[g_app.pak_count].filename, fname_ascii);
                    g_app.pak_list[g_app.pak_count].filesize = finfo.filesize;
                    g_app.pak_count++;
                }
            }
        } while (vm_find_next_ext(hfind, &finfo) == 0);
        vm_find_close_ext(hfind);
    }
}

static void scan_drive_smart(const char* root_path) {
    char subdirs[32][64];
    int subdir_count;
    char pattern[128];
    VMWCHAR wpattern[128];
    vm_fileinfo_ext finfo;
    VMINT hfind;
    int i;
    char dirname[64];
    char full_subdir[128];
    VMWCHAR c;

    subdir_count = 0;
    scan_directory_for_pak(root_path);

    sprintf(pattern, "%s*", root_path);
    vm_ascii_to_ucs2(wpattern, 256, (VMSTR)pattern);

    hfind = vm_find_first_ext(wpattern, &finfo);
    if (hfind >= 0) {
        do {
            if (finfo.attributes & 0x10) {
                for (i = 0; finfo.filefullname[i] != 0 && i < 63; i++) {
                    c = finfo.filefullname[i];
                    dirname[i] = (c < 128) ? (char)c : '_';
                }
                dirname[i] = '\0';

                if (!is_blacklisted_dir(dirname)) {
                    if (subdir_count < 32) {
                        strcpy(subdirs[subdir_count++], dirname);
                    }
                }
            }
        } while (vm_find_next_ext(hfind, &finfo) == 0);
        vm_find_close_ext(hfind);
    }

    for (i = 0; i < subdir_count; i++) {
        sprintf(full_subdir, "%s%s\\", root_path, subdirs[i]);
        scan_directory_for_pak(full_subdir);
    }
}

static void scan_all_drives(void) {
    g_app.pak_count = 0;
    g_app.selected_file_idx = 0;
    strcpy(g_app.search_filter, "");

    scan_drive_smart("e:\\");
    scan_drive_smart("c:\\");

    apply_file_filter();

    if (g_app.pak_count > 0) {
        g_app.state = STATE_FILE_LIST;
    } else {
        g_app.state = STATE_NO_FILES;
    }
}

/* 100% Robust Question Loader: Zero Noise, Zero Drift */
static int load_question(VMUINT32 q_id) {
    VMUINT32 entry_pos;
    VMUINT32 cur_offset;
    VMUINT nread;
    int i;
    int q_bytes, opt_bytes, read_bytes;

    if (g_app.pak_file < 0 || q_id >= g_app.total_questions) return 0;

    /* 1. Clear previous buffers completely to avoid residual static pixels */
    memset(g_app.q_bitmap, 0, sizeof(g_app.q_bitmap));
    memset(g_app.opt_bitmap, 0, sizeof(g_app.opt_bitmap));

    entry_pos = g_app.index_offset + (q_id * 20);
    vm_file_seek(g_app.pak_file, entry_pos, BASE_BEGIN);
    vm_file_read(g_app.pak_file, &g_app.cur_entry, 20, &nread);

    cur_offset = g_app.payload_base + g_app.cur_entry.payload_offset;

    /* 2. Load Question with absolute seek */
    q_bytes = g_app.cur_entry.q_h * QUESTION_BYTES_ROW;
    read_bytes = (q_bytes > MAX_Q_BITMAP_SIZE) ? MAX_Q_BITMAP_SIZE : q_bytes;
    vm_file_seek(g_app.pak_file, cur_offset, BASE_BEGIN);
    if (read_bytes > 0) {
        vm_file_read(g_app.pak_file, g_app.q_bitmap, read_bytes, &nread);
    }
    cur_offset += q_bytes; /* Advance by exact written payload size */

    /* 3. Load 4 Options with absolute offsets (prevents cross-corruption) */
    for (i = 0; i < 4; i++) {
        opt_bytes = g_app.cur_entry.opt_h[i] * OPTION_BYTES_ROW;
        read_bytes = (opt_bytes > MAX_OPT_BITMAP_SIZE) ? MAX_OPT_BITMAP_SIZE : opt_bytes;
        vm_file_seek(g_app.pak_file, cur_offset, BASE_BEGIN);
        if (read_bytes > 0) {
            vm_file_read(g_app.pak_file, g_app.opt_bitmap[i], read_bytes, &nread);
        }
        cur_offset += opt_bytes; /* Advance by exact written size */
    }

    g_app.current_q_id = q_id;
    return 1;
}

static int open_selected_pak(const char* path) {
    VMWCHAR wpath[128];
    char magic[4];
    VMUINT nread;

    nread = 0;
    if (g_app.pak_file >= 0) {
        vm_file_close(g_app.pak_file);
        g_app.pak_file = -1;
    }

    vm_ascii_to_ucs2(wpath, 256, (VMSTR)path);
    g_app.pak_file = vm_file_open(wpath, MODE_READ, FALSE);
    if (g_app.pak_file < 0) {
        g_app.pak_file = vm_file_open(wpath, MODE_READ, TRUE);
    }
    if (g_app.pak_file < 0) return 0;

    vm_file_read(g_app.pak_file, magic, 4, &nread);
    if (nread < 4 || memcmp(magic, "DGK1", 4) != 0) {
        vm_file_close(g_app.pak_file);
        g_app.pak_file = -1;
        return 0;
    }

    vm_file_read(g_app.pak_file, &g_app.total_questions, 4, &nread);
    vm_file_read(g_app.pak_file, &g_app.index_offset, 4, &nread);
    vm_file_read(g_app.pak_file, &g_app.search_offset, 4, &nread);
    vm_file_read(g_app.pak_file, &g_app.payload_base, 4, &nread);

    if (g_app.total_questions == 0) {
        vm_file_close(g_app.pak_file);
        g_app.pak_file = -1;
        return 0;
    }

    g_app.score = 0;
    g_app.selected_option = 0;
    g_app.user_choice = -1;
    g_app.state = STATE_QUESTION;
    load_question(0);

    return 1;
}

static void open_input_box(InputTarget target) {
    g_app.input_target = target;
    strcpy(g_app.input_buffer, "");
    g_app.input_cursor = 0;
    g_app.prev_state = g_app.state;
    g_app.state = STATE_INPUT_DIALOG;
}

static void submit_input(void) {
    int q_target;
    VMUINT32 s_pos;
    VMUINT32 i;
    VMUINT nread;
    VMUINT16 q_id;
    VMUINT16 t_len;
    char s_text[128];

    if (g_app.input_target == INPUT_TARGET_FILE_SEARCH) {
        strcpy(g_app.search_filter, g_app.input_buffer);
        apply_file_filter();
        g_app.state = STATE_FILE_LIST;
    } 
    else if (g_app.input_target == INPUT_TARGET_JUMP_Q) {
        q_target = atoi(g_app.input_buffer);
        if (q_target >= 1 && q_target <= (int)g_app.total_questions) {
            g_app.selected_option = 0;
            g_app.user_choice = -1;
            load_question((VMUINT32)(q_target - 1));
            g_app.state = STATE_QUESTION;
        } else {
            g_app.state = STATE_QUESTION;
        }
    }
    else if (g_app.input_target == INPUT_TARGET_Q_SEARCH) {
        s_pos = g_app.search_offset;

        for (i = 0; i < g_app.total_questions; i++) {
            q_id = 0;
            t_len = 0;

            vm_file_seek(g_app.pak_file, s_pos, BASE_BEGIN);
            vm_file_read(g_app.pak_file, &q_id, 2, &nread);
            vm_file_read(g_app.pak_file, &t_len, 2, &nread);

            if (t_len > 120) t_len = 120;
            vm_file_read(g_app.pak_file, s_text, t_len, &nread);
            s_text[t_len] = '\0';

            if (strstr(s_text, g_app.input_buffer) != NULL) {
                load_question(q_id);
                break;
            }
            s_pos += 4 + t_len;
        }
        g_app.state = STATE_QUESTION;
    }
}

static void draw_screen(void) {
    int i, cur_y, actual_idx, num_key, opt_card_h;
    char text_buf[64];
    VMUINT16 opt_bg, item_bg, m_bg;

    if (!g_app.buffer) return;

    vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_BG, COLOR_BG);

    if (g_app.state == STATE_FILE_LIST) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, 26, COLOR_HL, COLOR_HL);
        sprintf(text_buf, "Daily GK (%d Found)", g_app.filtered_count);
        draw_system_text(8, 6, text_buf, COLOR_TEXT);

        cur_y = 32;
        for (i = 0; i < g_app.filtered_count && i < 6; i++) {
            actual_idx = g_app.filtered_indices[i];
            item_bg = (i == g_app.selected_file_idx) ? COLOR_HL : COLOR_CARD;
            num_key = (i < 9) ? (i + 1) : 0;

            vm_graphic_fill_rect(g_app.buffer, 8, cur_y, 224, 40, item_bg, item_bg);
            sprintf(text_buf, "[%d] %s", num_key, g_app.pak_list[actual_idx].filename);
            draw_system_text(14, cur_y + 4, text_buf, COLOR_TEXT);

            sprintf(text_buf, "Size: %d KB ", (int)(g_app.pak_list[actual_idx].filesize / 1024));
            draw_system_text(14, cur_y + 20, text_buf, COLOR_MUTED);

            cur_y += 44;
        }

        draw_softbar("Menu", "Play", "Exit");
    }
    else if (g_app.state == STATE_NO_FILES) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, 26, COLOR_RED, COLOR_RED);
        draw_system_text(8, 6, "No Packages Found!", COLOR_TEXT);

        vm_graphic_fill_rect(g_app.buffer, 8, 38, 224, 246, COLOR_CARD, COLOR_CARD);
        draw_system_text(16, 48, "No .PAK files found in SD!", COLOR_ORANGE);
        draw_system_text(16, 75, "Paste .pak in ANY folder,", COLOR_TEXT);
        draw_system_text(16, 92, "EXCEPT these excluded ones:", COLOR_MUTED);

        draw_system_text(24, 115, "- Videos / Video", COLOR_RED);
        draw_system_text(24, 132, "- Music / Audio / Record", COLOR_RED);
        draw_system_text(24, 149, "- Photos / DCIM / Images", COLOR_RED);
        draw_system_text(24, 166, "- System Volume / LOST.DIR", COLOR_RED);

        draw_system_text(16, 195, "Get PAK files from:", COLOR_TEXT);
        draw_system_text(16, 212, "github.com/shifat100/", COLOR_GREEN);
        draw_system_text(16, 229, "daily-gk", COLOR_GREEN);

        draw_softbar("Menu", "Rescan", "Exit");
    }
    else if (g_app.state == STATE_MENU) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_MODAL_BG, COLOR_MODAL_BG);
        vm_graphic_fill_rect(g_app.buffer, 12, 28, 216, 256, COLOR_CARD, COLOR_CARD);
        vm_graphic_fill_rect(g_app.buffer, 12, 28, 216, 26, COLOR_HL, COLOR_HL);
        draw_system_text(20, 34, "Options Menu", COLOR_TEXT);

        cur_y = 62;
        for (i = 0; i < TOTAL_MENU_ITEMS; i++) {
            m_bg = (i == g_app.menu_selected_idx) ? COLOR_HL : COLOR_CARD;
            vm_graphic_fill_rect(g_app.buffer, 18, cur_y, 204, 30, m_bg, m_bg);
            draw_system_text(26, cur_y + 8, get_menu_title(i), COLOR_TEXT);
            cur_y += 34;
        }

        draw_softbar("Select", "", "Back");
    }
    else if (g_app.state == STATE_QUESTION_MENU) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_MODAL_BG, COLOR_MODAL_BG);
        vm_graphic_fill_rect(g_app.buffer, 12, 34, 216, 230, COLOR_CARD, COLOR_CARD);
        vm_graphic_fill_rect(g_app.buffer, 12, 34, 216, 26, COLOR_HL, COLOR_HL);
        draw_system_text(20, 40, "Reading Options", COLOR_TEXT);

        cur_y = 68;
        for (i = 0; i < TOTAL_QMENU_ITEMS; i++) {
            m_bg = (i == g_app.qmenu_selected_idx) ? COLOR_HL : COLOR_CARD;
            vm_graphic_fill_rect(g_app.buffer, 18, cur_y, 204, 30, m_bg, m_bg);
            draw_system_text(26, cur_y + 8, get_qmenu_title(i), COLOR_TEXT);
            cur_y += 34;
        }

        draw_softbar("Select", "", "Back");
    }
    else if (g_app.state == STATE_INPUT_DIALOG) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_MODAL_BG, COLOR_MODAL_BG);
        vm_graphic_fill_rect(g_app.buffer, 14, 70, 212, 160, COLOR_CARD, COLOR_CARD);
        vm_graphic_fill_rect(g_app.buffer, 14, 70, 212, 26, COLOR_HL, COLOR_HL);

        if (g_app.input_target == INPUT_TARGET_FILE_SEARCH) {
            draw_system_text(20, 76, "Search PAK Files", COLOR_TEXT);
            draw_system_text(22, 105, "Enter keyword:", COLOR_MUTED);
        } else if (g_app.input_target == INPUT_TARGET_JUMP_Q) {
            draw_system_text(20, 76, "Jump to Question", COLOR_TEXT);
            sprintf(text_buf, "Enter Number (1 - %d):", (int)g_app.total_questions);
            draw_system_text(22, 105, text_buf, COLOR_MUTED);
        } else {
            draw_system_text(20, 76, "Search Question", COLOR_TEXT);
            draw_system_text(22, 105, "Enter search keyword:", COLOR_MUTED);
        }

        vm_graphic_fill_rect(g_app.buffer, 22, 126, 196, 32, COLOR_BG, COLOR_BG);
        sprintf(text_buf, "%s_", g_app.input_buffer);
        draw_system_text(28, 134, text_buf, COLOR_GREEN);

        draw_system_text(22, 175, "Use keypad/touch to type", COLOR_MUTED);
        draw_softbar("Done", "Clear", "Cancel");
    }
    else if (g_app.state == STATE_CONFIRM_EXIT) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLOR_MODAL_BG, COLOR_MODAL_BG);
        vm_graphic_fill_rect(g_app.buffer, 18, 90, 204, 130, COLOR_CARD, COLOR_CARD);
        vm_graphic_fill_rect(g_app.buffer, 18, 90, 204, 26, COLOR_RED, COLOR_RED);
        draw_system_text(26, 96, "Exit Application?", COLOR_TEXT);

        draw_system_text(30, 130, "Are you sure you want", COLOR_TEXT);
        draw_system_text(30, 150, "to quit Daily GK?", COLOR_MUTED);

        vm_graphic_fill_rect(g_app.buffer, 28, 180, 80, 28, COLOR_RED, COLOR_RED);
        draw_system_text(44, 186, "Exit", COLOR_TEXT);

        vm_graphic_fill_rect(g_app.buffer, 132, 180, 80, 28, COLOR_HL, COLOR_HL);
        draw_system_text(146, 186, "Cancel", COLOR_TEXT);

        draw_softbar("Exit", "", "Cancel");
    }
    else if (g_app.state == STATE_QUESTION || g_app.state == STATE_FEEDBACK) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, 26, COLOR_HL, COLOR_HL);
        sprintf(text_buf, "Q %d/%d (%s)", (int)(g_app.current_q_id + 1), (int)g_app.total_questions,
                (g_app.read_mode == READING_MODE_STUDY) ? "Study" : "Quiz");
        draw_system_text(8, 6, text_buf, COLOR_TEXT);

        cur_y = 30;
        vm_graphic_fill_rect(g_app.buffer, 8, cur_y, 224, g_app.cur_entry.q_h + 8, COLOR_CARD, COLOR_CARD);
        blit_transparent_mask(8, cur_y + 4, QUESTION_W, g_app.cur_entry.q_h, QUESTION_BYTES_ROW, g_app.q_bitmap, COLOR_TEXT);

        cur_y += g_app.cur_entry.q_h + 10;

        for (i = 0; i < 4; i++) {
            opt_card_h = g_app.cur_entry.opt_h[i] + 6;
            opt_bg = COLOR_CARD;

            if (g_app.read_mode == READING_MODE_STUDY) {
                if (i == g_app.cur_entry.correct_answer) opt_bg = COLOR_GREEN;
                else if (i == g_app.selected_option) opt_bg = COLOR_HL;
            } else {
                if (g_app.state == STATE_QUESTION) {
                    if (i == g_app.selected_option) opt_bg = COLOR_HL;
                } else if (g_app.state == STATE_FEEDBACK) {
                    if (i == g_app.cur_entry.correct_answer) opt_bg = COLOR_GREEN;
                    else if (i == g_app.user_choice) opt_bg = COLOR_RED;
                }
            }

            vm_graphic_fill_rect(g_app.buffer, 8, cur_y, 224, opt_card_h, opt_bg, opt_bg);
            blit_transparent_mask(16, cur_y + 3, OPTION_W, g_app.cur_entry.opt_h[i], OPTION_BYTES_ROW, g_app.opt_bitmap[i], COLOR_TEXT);

            cur_y += opt_card_h + 4;
        }

        if (g_app.read_mode == READING_MODE_STUDY) {
            draw_softbar("Menu", "Next >", "Pack List");
        } else {
            if (g_app.state == STATE_FEEDBACK) {
                draw_softbar("Menu", "Next Q", "Pack List");
            } else {
                draw_softbar("Menu", "Ans", "Back");
            }
        }
    }
    else if (g_app.state == STATE_HELP_CAROUSEL) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, 26, COLOR_HL, COLOR_HL);
        sprintf(text_buf, "Help Guide (%d/%d)", g_app.help_slide_idx + 1, TOTAL_HELP_SLIDES);
        draw_system_text(8, 6, text_buf, COLOR_TEXT);

        vm_graphic_fill_rect(g_app.buffer, 8, 36, 224, 215, COLOR_CARD, COLOR_CARD);

        if (g_app.help_slide_idx == 0) {
            draw_system_text(16, 48, "[1. About .PAK Files]", COLOR_HL);
            draw_system_text(16, 75, "Daily GK uses .PAK packages.", COLOR_TEXT);
            draw_system_text(16, 95, "Each package contains ready", COLOR_TEXT);
            draw_system_text(16, 115, "pre-rendered global MCQs.", COLOR_TEXT);
            draw_system_text(16, 145, "No font is needed on phone!", COLOR_GREEN);
            draw_system_text(16, 165, "Zero CPU load, zero lag.", COLOR_MUTED);
        } else if (g_app.help_slide_idx == 1) {
            draw_system_text(16, 48, "[2. Storage & Folders]", COLOR_HL);
            draw_system_text(16, 75, "Put .pak in ANY folder on SD:", COLOR_TEXT);
            draw_system_text(16, 95, "e:\\, e:\\download, e:\\study", COLOR_GREEN);
            draw_system_text(16, 125, "Excluded folders:", COLOR_ORANGE);
            draw_system_text(16, 145, "Videos, Audio, Music, Record,", COLOR_RED);
            draw_system_text(16, 165, "Photos, DCIM, System Volume.", COLOR_RED);
        } else if (g_app.help_slide_idx == 2) {
            draw_system_text(16, 48, "[3. Dual Touch & Keys]", COLOR_HL);
            draw_system_text(16, 75, "Touch any Option to Select", COLOR_GREEN);
            draw_system_text(16, 95, "Keys 1-4: Select Option directly", COLOR_TEXT);
            draw_system_text(16, 115, "D-Pad Up/Down: Highlight", COLOR_TEXT);
            draw_system_text(16, 135, "Key 0-9 in List: Jump file", COLOR_GREEN);
            draw_system_text(16, 160, "Study Mode available in menu!", COLOR_ORANGE);
        } else if (g_app.help_slide_idx == 3) {
            draw_system_text(16, 48, "[4. Download More]", COLOR_HL);
            draw_system_text(16, 75, "Need more quiz questions?", COLOR_TEXT);
            draw_system_text(16, 95, "Download latest packages from:", COLOR_TEXT);
            draw_system_text(16, 120, "github.com/shifat100/", COLOR_GREEN);
            draw_system_text(16, 140, "daily-gk", COLOR_GREEN);
            draw_system_text(16, 170, "Click [Download] to open web.", COLOR_HL);
        }

        draw_softbar((g_app.help_slide_idx == 3) ? "Download" : "< Prev", "Next >", "Back");
    }
    else if (g_app.state == STATE_ABOUT) {
        vm_graphic_fill_rect(g_app.buffer, 0, 0, SCREEN_WIDTH, 26, COLOR_HL, COLOR_HL);
        draw_system_text(8, 6, "About Daily GK", COLOR_TEXT);

        vm_graphic_fill_rect(g_app.buffer, 10, 45, 220, 220, COLOR_CARD, COLOR_CARD);
        draw_system_text(20, 60, "Daily GK Universal MRE", COLOR_HL);
        draw_system_text(20, 80, "Version: 3.0 Touch & Keypad", COLOR_MUTED);
        draw_system_text(20, 110, "Developer: Shifat100", COLOR_GREEN);
        draw_system_text(20, 130, "Platform: MediaTek S30+", COLOR_TEXT);
        draw_system_text(20, 155, "Modes: Study & Quiz Supported", COLOR_ORANGE);
        draw_system_text(20, 180, "Global Complex Text Engine", COLOR_ORANGE);

        draw_softbar("", "", "[Back]");
    }
    else if (g_app.state == STATE_SCORECARD) {
        vm_graphic_fill_rect(g_app.buffer, 10, 60, 220, 160, COLOR_CARD, COLOR_CARD);
        draw_system_text(60, 80, "Quiz Completed!", COLOR_GREEN);

        sprintf(text_buf, "Final Score: %d / %d", g_app.score, (int)g_app.total_questions);
        draw_system_text(50, 120, text_buf, COLOR_TEXT);

        draw_softbar("Again", "", "Pack List");
    }

    vm_graphic_flush_layer(g_app.layer_hdl, 1);
}

static void handle_keyevt(VMINT event, VMINT keycode) {
    int target_idx;
    int actual_idx;
    int len;
    char ch;

    if (event != VM_KEY_EVENT_DOWN) return;

    if (g_app.state == STATE_CONFIRM_EXIT) {
        if (keycode == VM_KEY_OK || keycode == VM_KEY_NUM5 || keycode == VM_KEY_LEFT_SOFTKEY) {
            if (g_app.pak_file >= 0) {
                vm_file_close(g_app.pak_file);
                g_app.pak_file = -1;
            }
            if (g_app.layer_hdl[0] != -1) {
                vm_graphic_delete_layer(g_app.layer_hdl[0]);
                g_app.layer_hdl[0] = -1;
            }
            vm_exit_app();
            return;
        } else if (keycode == VM_KEY_RIGHT_SOFTKEY) {
            g_app.state = g_app.prev_state;
            draw_screen();
        }
        return;
    }

    if (g_app.state == STATE_INPUT_DIALOG) {
        if (keycode >= VM_KEY_NUM0 && keycode <= VM_KEY_NUM9) {
            len = strlen(g_app.input_buffer);
            if (len < 28) {
                ch = '0' + (keycode - VM_KEY_NUM0);
                g_app.input_buffer[len] = ch;
                g_app.input_buffer[len + 1] = '\0';
                draw_screen();
            }
        } else if (keycode == VM_KEY_LEFT_SOFTKEY || keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
            submit_input();
            draw_screen();
        } else if (keycode == VM_KEY_POUND || keycode == VM_KEY_CLEAR) {
            len = strlen(g_app.input_buffer);
            if (len > 0) {
                g_app.input_buffer[len - 1] = '\0';
                draw_screen();
            }
        } else if (keycode == VM_KEY_RIGHT_SOFTKEY) {
            g_app.state = g_app.prev_state;
            draw_screen();
        }
        return;
    }

    if (keycode == VM_KEY_RIGHT_SOFTKEY) {
        if (g_app.state == STATE_FILE_LIST || g_app.state == STATE_NO_FILES) {
            g_app.prev_state = g_app.state;
            g_app.state = STATE_CONFIRM_EXIT;
        } else if (g_app.state == STATE_MENU || g_app.state == STATE_HELP_CAROUSEL || g_app.state == STATE_ABOUT) {
            g_app.state = (g_app.pak_count > 0) ? STATE_FILE_LIST : STATE_NO_FILES;
        } else if (g_app.state == STATE_QUESTION_MENU) {
            g_app.state = STATE_QUESTION;
        } else if (g_app.state == STATE_QUESTION || g_app.state == STATE_FEEDBACK || g_app.state == STATE_SCORECARD) {
            if (g_app.pak_file >= 0) {
                vm_file_close(g_app.pak_file);
                g_app.pak_file = -1;
            }
            g_app.state = STATE_FILE_LIST;
        }
        draw_screen();
        return;
    }

    if (keycode == VM_KEY_LEFT_SOFTKEY) {
        if (g_app.state == STATE_FILE_LIST || g_app.state == STATE_NO_FILES) {
            g_app.menu_selected_idx = 0;
            g_app.state = STATE_MENU;
            draw_screen();
            return;
        } else if (g_app.state == STATE_QUESTION || g_app.state == STATE_FEEDBACK) {
            g_app.qmenu_selected_idx = 0;
            g_app.state = STATE_QUESTION_MENU;
            draw_screen();
            return;
        } else if (g_app.state == STATE_HELP_CAROUSEL) {
            if (g_app.help_slide_idx == 3) {
                launch_browser_download();
            } else if (g_app.help_slide_idx > 0) {
                g_app.help_slide_idx--;
                draw_screen();
            }
            return;
        } else if (g_app.state == STATE_SCORECARD) {
            g_app.score = 0;
            g_app.selected_option = 0;
            g_app.user_choice = -1;
            g_app.state = STATE_QUESTION;
            load_question(0);
            draw_screen();
            return;
        }
    }

    if (g_app.state == STATE_QUESTION_MENU) {
        if (keycode == VM_KEY_UP && g_app.qmenu_selected_idx > 0) {
            g_app.qmenu_selected_idx--;
            draw_screen();
        } else if (keycode == VM_KEY_DOWN && g_app.qmenu_selected_idx < TOTAL_QMENU_ITEMS - 1) {
            g_app.qmenu_selected_idx++;
            draw_screen();
        } else if (keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
            switch (g_app.qmenu_selected_idx) {
                case 0:
                    open_input_box(INPUT_TARGET_Q_SEARCH);
                    break;
                case 1:
                    open_input_box(INPUT_TARGET_JUMP_Q);
                    break;
                case 2:
                    g_app.read_mode = (g_app.read_mode == READING_MODE_QUIZ) ? READING_MODE_STUDY : READING_MODE_QUIZ;
                    g_app.state = STATE_QUESTION;
                    break;
                case 3:
                    launch_browser_download();
                    break;
                case 4:
                    if (g_app.pak_file >= 0) {
                        vm_file_close(g_app.pak_file);
                        g_app.pak_file = -1;
                    }
                    g_app.state = STATE_FILE_LIST;
                    break;
            }
            draw_screen();
        }
        return;
    }

    if (g_app.state == STATE_MENU) {
        if (keycode == VM_KEY_UP && g_app.menu_selected_idx > 0) {
            g_app.menu_selected_idx--;
            draw_screen();
        } else if (keycode == VM_KEY_DOWN && g_app.menu_selected_idx < TOTAL_MENU_ITEMS - 1) {
            g_app.menu_selected_idx++;
            draw_screen();
        } else if (keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
            switch (g_app.menu_selected_idx) {
                case 0:
                    open_input_box(INPUT_TARGET_FILE_SEARCH);
                    break;
                case 1:
                    launch_browser_download();
                    break;
                case 2:
                    g_app.help_slide_idx = 0;
                    g_app.state = STATE_HELP_CAROUSEL;
                    break;
                case 3:
                    g_app.state = STATE_ABOUT;
                    break;
                case 4:
                    scan_all_drives();
                    break;
                case 5:
                    g_app.prev_state = STATE_MENU;
                    g_app.state = STATE_CONFIRM_EXIT;
                    break;
            }
            draw_screen();
        }
        return;
    }

    if (g_app.state == STATE_FILE_LIST) {
        if (keycode == VM_KEY_UP && g_app.selected_file_idx > 0) {
            g_app.selected_file_idx--;
            draw_screen();
        } else if (keycode == VM_KEY_DOWN && g_app.selected_file_idx < g_app.filtered_count - 1) {
            g_app.selected_file_idx++;
            draw_screen();
        } else if (keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
            if (g_app.filtered_count > 0) {
                actual_idx = g_app.filtered_indices[g_app.selected_file_idx];
                open_selected_pak(g_app.pak_list[actual_idx].filepath);
                draw_screen();
            }
        } 
        else if (keycode >= VM_KEY_NUM1 && keycode <= VM_KEY_NUM9) {
            target_idx = keycode - VM_KEY_NUM1;
            if (target_idx < g_app.filtered_count) {
                g_app.selected_file_idx = target_idx;
                draw_screen();
            }
        } else if (keycode == VM_KEY_NUM0) {
            if (9 < g_app.filtered_count) {
                g_app.selected_file_idx = 9;
                draw_screen();
            }
        }
        return;
    }

    if (g_app.state == STATE_HELP_CAROUSEL) {
        if (keycode == VM_KEY_LEFT && g_app.help_slide_idx > 0) {
            g_app.help_slide_idx--;
            draw_screen();
        } else if (keycode == VM_KEY_RIGHT || keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
            if (g_app.help_slide_idx < TOTAL_HELP_SLIDES - 1) {
                g_app.help_slide_idx++;
            } else {
                launch_browser_download();
            }
            draw_screen();
        }
        return;
    }

    if (g_app.state == STATE_QUESTION) {
        if (g_app.read_mode == READING_MODE_STUDY) {
            if (keycode == VM_KEY_RIGHT || keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
                if (g_app.current_q_id + 1 < g_app.total_questions) {
                    load_question(g_app.current_q_id + 1);
                }
                draw_screen();
                return;
            } else if (keycode == VM_KEY_LEFT && g_app.current_q_id > 0) {
                load_question(g_app.current_q_id - 1);
                draw_screen();
                return;
            }
        }

        if (keycode >= VM_KEY_NUM1 && keycode <= VM_KEY_NUM4) {
            g_app.user_choice = keycode - VM_KEY_NUM1;
            if (g_app.user_choice == g_app.cur_entry.correct_answer) g_app.score++;
            g_app.state = STATE_FEEDBACK;
            draw_screen();
            return;
        }

        if (keycode == VM_KEY_UP && g_app.selected_option > 0) {
            g_app.selected_option--;
            draw_screen();
        } else if (keycode == VM_KEY_DOWN && g_app.selected_option < 3) {
            g_app.selected_option++;
            draw_screen();
        } else if (keycode == VM_KEY_OK || keycode == VM_KEY_NUM5) {
            g_app.user_choice = g_app.selected_option;
            if (g_app.user_choice == g_app.cur_entry.correct_answer) g_app.score++;
            g_app.state = STATE_FEEDBACK;
            draw_screen();
        }
    }
    else if (g_app.state == STATE_FEEDBACK) {
        if (keycode == VM_KEY_OK || keycode == VM_KEY_NUM5 || keycode == VM_KEY_RIGHT || keycode == VM_KEY_DOWN) {
            if (g_app.current_q_id + 1 < g_app.total_questions) {
                g_app.selected_option = 0;
                g_app.user_choice = -1;
                g_app.state = STATE_QUESTION;
                load_question(g_app.current_q_id + 1);
            } else {
                g_app.state = STATE_SCORECARD;
            }
            draw_screen();
        }
    }
}

static void handle_penevt(VMINT event, VMINT x, VMINT y) {
    int i, cur_y, actual_idx, opt_card_h;

    if (event != VM_PEN_EVENT_RELEASE && event != VM_PEN_EVENT_TAP) return;

    if (y >= 290) {
        if (x < 80) {
            handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_LEFT_SOFTKEY);
        } else if (x >= 80 && x <= 160) {
            handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_OK);
        } else {
            handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_RIGHT_SOFTKEY);
        }
        return;
    }

    if (g_app.state == STATE_CONFIRM_EXIT) {
        if (y >= 180 && y <= 210) {
            if (x >= 28 && x <= 110) {
                handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_OK);
            } else if (x >= 130 && x <= 215) {
                handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_RIGHT_SOFTKEY);
            }
        }
        return;
    }

    if (g_app.state == STATE_FILE_LIST) {
        cur_y = 32;
        for (i = 0; i < g_app.filtered_count && i < 6; i++) {
            if (x >= 8 && x <= 232 && y >= cur_y && y <= cur_y + 40) {
                g_app.selected_file_idx = i;
                actual_idx = g_app.filtered_indices[i];
                open_selected_pak(g_app.pak_list[actual_idx].filepath);
                draw_screen();
                return;
            }
            cur_y += 44;
        }
    }

    if (g_app.state == STATE_MENU) {
        cur_y = 62;
        for (i = 0; i < TOTAL_MENU_ITEMS; i++) {
            if (x >= 18 && x <= 222 && y >= cur_y && y <= cur_y + 30) {
                g_app.menu_selected_idx = i;
                handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_OK);
                return;
            }
            cur_y += 34;
        }
    }

    if (g_app.state == STATE_QUESTION_MENU) {
        cur_y = 68;
        for (i = 0; i < TOTAL_QMENU_ITEMS; i++) {
            if (x >= 18 && x <= 222 && y >= cur_y && y <= cur_y + 30) {
                g_app.qmenu_selected_idx = i;
                handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_OK);
                return;
            }
            cur_y += 34;
        }
    }

    if (g_app.state == STATE_QUESTION) {
        cur_y = 30 + g_app.cur_entry.q_h + 10;
        for (i = 0; i < 4; i++) {
            opt_card_h = g_app.cur_entry.opt_h[i] + 6;
            if (x >= 8 && x <= 232 && y >= cur_y && y <= cur_y + opt_card_h) {
                g_app.selected_option = i;
                g_app.user_choice = i;
                if (g_app.read_mode != READING_MODE_STUDY) {
                    if (g_app.user_choice == g_app.cur_entry.correct_answer) g_app.score++;
                    g_app.state = STATE_FEEDBACK;
                }
                draw_screen();
                return;
            }
            cur_y += opt_card_h + 4;
        }
    } else if (g_app.state == STATE_FEEDBACK) {
        handle_keyevt(VM_KEY_EVENT_DOWN, VM_KEY_OK);
    }
}

static void handle_sysevt(VMINT message, VMINT param) {
    switch (message) {
        case VM_MSG_CREATE:
            g_app.layer_hdl[0] = vm_graphic_create_layer(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, -1);
            vm_graphic_set_clip(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
            g_app.buffer = vm_graphic_get_layer_buffer(g_app.layer_hdl[0]);
            g_app.read_mode = READING_MODE_QUIZ;
            scan_all_drives();
            break;

        case VM_MSG_PAINT:
            draw_screen();
            break;

        case VM_MSG_HIDE:
        case VM_MSG_QUIT:
            if (g_app.pak_file >= 0) {
                vm_file_close(g_app.pak_file);
                g_app.pak_file = -1;
            }
            if (g_app.layer_hdl[0] != -1) {
                vm_graphic_delete_layer(g_app.layer_hdl[0]);
                g_app.layer_hdl[0] = -1;
                g_app.buffer = NULL;
            }
            break;
    }
}

void vm_main(void) {
    g_app.layer_hdl[0] = -1;
    g_app.buffer = NULL;
    g_app.pak_file = -1;
    vm_reg_sysevt_callback(handle_sysevt);
    vm_reg_keyboard_callback(handle_keyevt);
    vm_reg_pen_callback(handle_penevt);
}