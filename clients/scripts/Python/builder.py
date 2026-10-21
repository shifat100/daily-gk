#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Daily GK Universal CLI & PAK Builder for MediaTek MRE
- Auto-dependency checker & installer
- 100% Perfect Complex Text Layout (Zero-memory clean DIB section)
- No noise, no distorted dashes on long multi-line options
- Auto-calculated Year & Month from file dates
Data Source: https://github.com/shifat100/daily-gk
"""

import sys
import subprocess
import os
import json
import struct
import urllib.request
import re
import time
import datetime
from email.utils import parsedate_to_datetime

REQUIRED_PACKAGES = ["pillow"]

def check_and_install_dependencies():
    missing = []
    for pkg in REQUIRED_PACKAGES:
        import_name = "PIL" if pkg == "pillow" else pkg
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pkg)

    if missing:
        print("[*] Missing dependencies detected:", missing)
        print("[*] Automatically installing dependencies via pip, please wait...")
        for pkg in missing:
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
                print(f"[✓] Successfully installed {pkg}")
            except Exception as e:
                print(f"[!] Failed to install {pkg}: {e}")
                sys.exit(1)
        print("[✓] All dependencies are ready! Launching application...\n")

check_and_install_dependencies()

from PIL import Image, ImageDraw, ImageFont

if sys.platform == "win32":
    os.system('chcp 65001 > nul')
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

C_RESET   = "\033[0m"
C_BOLD    = "\033[1m"
C_BLUE    = "\033[94m"
C_CYAN    = "\033[96m"
C_GREEN   = "\033[92m"
C_RED     = "\033[91m"
C_YELLOW  = "\033[93m"
C_MUTED   = "\033[90m"
C_BG_BLUE = "\033[44m\033[97m"

CACHE_FILE = "daily_gk_cache.json"
BASE_URL = "https://raw.githubusercontent.com/shifat100/daily-gk/main/"

QUESTION_W = 224  # 224 px (28 bytes per row)
OPTION_W   = 208  # 208 px (26 bytes per row)

# Height budgets
MAX_QUESTION_HEIGHT = 65
MAX_OPTION_HEIGHT   = 42

FONT_CANDIDATES = [
    ("kalpurush.ttf", "Kalpurush"),
    ("Kalpurush.ttf", "Kalpurush"),
    ("SolaimanLipi.ttf", "SolaimanLipi"),
    ("Siyamrupali.ttf", "Siyam Rupali"),
    ("C:/Windows/Fonts/Nirmala.ttf", "Nirmala UI"),
    ("C:/Windows/Fonts/segoeui.ttf", "Segoe UI"),
    ("C:/Windows/Fonts/arial.ttf", "Arial"),
    ("C:/Windows/Fonts/vrinda.ttf", "Vrinda")
]

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    DT_LEFT      = 0x00000000
    DT_WORDBREAK = 0x00000010
    DT_NOPREFIX  = 0x00000800
    DT_CALCRECT  = 0x00000400

    class RECT(ctypes.Structure):
        _fields_ = [
            ("left", wintypes.LONG),
            ("top", wintypes.LONG),
            ("right", wintypes.LONG),
            ("bottom", wintypes.LONG)
        ]

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", wintypes.DWORD),
            ("biWidth", wintypes.LONG),
            ("biHeight", wintypes.LONG),
            ("biPlanes", wintypes.WORD),
            ("biBitCount", wintypes.WORD),
            ("biCompression", wintypes.DWORD),
            ("biSizeImage", wintypes.DWORD),
            ("biXPelsPerMeter", wintypes.LONG),
            ("biYPelsPerMeter", wintypes.LONG),
            ("biClrUsed", wintypes.DWORD),
            ("biClrImportant", wintypes.DWORD)
        ]


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_banner():
    print(f"\n{C_BG_BLUE}   ========================================   {C_RESET}")
    print(f"{C_BG_BLUE}      DAILY GK UNIVERSAL PAK BUILDER V3.0      {C_RESET}")
    print(f"{C_BG_BLUE}   ========================================   {C_RESET}")
    print(f"{C_MUTED}Data Source: github.com/shifat100/daily-gk{C_RESET}\n")


def find_and_register_font():
    if sys.platform != "win32":
        return None, "Default"

    for f_path, f_name in FONT_CANDIDATES:
        if os.path.exists(f_path):
            try:
                FR_PRIVATE = 0x10
                ctypes.windll.gdi32.AddFontResourceExW(os.path.abspath(f_path), FR_PRIVATE, 0)
            except Exception:
                pass
            return f_path, f_name

    return None, "Segoe UI"


ACTIVE_FONT_PATH, ACTIVE_FONT_NAME = find_and_register_font()


def render_text_windows_gdi(text, font_name, font_size, target_width):
    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32

    hdc = user32.GetDC(0)
    memdc = gdi32.CreateCompatibleDC(hdc)

    hfont = gdi32.CreateFontW(
        -font_size, 0, 0, 0, 500, False, False, False,
        1, 0, 0, 4, 0, font_name
    )
    old_font = gdi32.SelectObject(memdc, hfont)

    rect = RECT(0, 0, target_width - 4, 1000)
    gdi32.SetMapMode(memdc, 1)
    user32.DrawTextW(memdc, text, -1, ctypes.byref(rect), DT_LEFT | DT_WORDBREAK | DT_NOPREFIX | DT_CALCRECT)

    total_h = rect.bottom - rect.top + 4
    if total_h < 16:
        total_h = 16

    bmi = BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.biWidth = target_width
    bmi.biHeight = -total_h
    bmi.biPlanes = 1
    bmi.biBitCount = 32
    bmi.biCompression = 0

    pBits = ctypes.c_void_p()
    hbmp = gdi32.CreateDIBSection(memdc, ctypes.byref(bmi), 0, ctypes.byref(pBits), 0, 0)
    old_bmp = gdi32.SelectObject(memdc, hbmp)

    # 1. Zero out entire memory buffer to prevent residual noise/dashes
    ctypes.memset(pBits, 0, target_width * total_h * 4)

    gdi32.SetBkColor(memdc, 0x000000)
    gdi32.SetTextColor(memdc, 0xFFFFFF)
    gdi32.SetBkMode(memdc, 1)  # TRANSPARENT mode

    draw_rect = RECT(2, 1, target_width - 2, total_h + 1)
    user32.DrawTextW(memdc, text, -1, ctypes.byref(draw_rect), DT_LEFT | DT_WORDBREAK | DT_NOPREFIX)

    bytes_per_row = target_width // 8
    raw_bitmap = bytearray(bytes_per_row * total_h)
    pixel_data = (ctypes.c_uint32 * (target_width * total_h)).from_address(pBits.value)

    for y in range(total_h):
        row_offset = y * target_width
        for b_idx in range(bytes_per_row):
            byte_val = 0
            base_x = b_idx * 8
            for bit in range(8):
                px = base_x + bit
                if px < target_width:
                    if (pixel_data[row_offset + px] & 0x00FFFFFF) > 0x00222222:
                        byte_val |= (0x80 >> bit)
            raw_bitmap[y * bytes_per_row + b_idx] = byte_val

    gdi32.SelectObject(memdc, old_font)
    gdi32.SelectObject(memdc, old_bmp)
    gdi32.DeleteObject(hfont)
    gdi32.DeleteObject(hbmp)
    gdi32.DeleteDC(memdc)
    user32.ReleaseDC(0, hdc)

    return bytes(raw_bitmap), total_h


def render_adaptive_1bit(text, target_width, is_option=False):
    clean_text = str(text).strip()
    if is_option:
        start_sz = 12
        min_sz = 9
        max_h = MAX_OPTION_HEIGHT
    else:
        start_sz = 13
        min_sz = 10
        max_h = MAX_QUESTION_HEIGHT

    best_bytes = None
    best_h = 0
    for fsize in range(start_sz, min_sz - 1, -1):
        if sys.platform == "win32":
            raw_bytes, total_h = render_text_windows_gdi(clean_text, ACTIVE_FONT_NAME, fsize, target_width)
        else:
            font = ImageFont.load_default()
            img = Image.new("1", (target_width, 24), color=0)
            d = ImageDraw.Draw(img)
            d.text((2, 2), clean_text, font=font, fill=1)
            raw_bytes = img.tobytes()
            total_h = 24

        best_bytes = raw_bytes
        best_h = total_h
        if total_h <= max_h:
            return raw_bytes, total_h

    return best_bytes, best_h


def fetch_url_data(rel_path, is_json=True):
    local_path = rel_path.replace("/", os.sep)
    file_dt = None

    if os.path.exists(local_path):
        try:
            mtime = os.path.getmtime(local_path)
            file_dt = datetime.datetime.fromtimestamp(mtime)
            with open(local_path, "r", encoding="utf-8") as f:
                content = json.load(f) if is_json else f.read()
                return content, file_dt
        except Exception:
            pass

    full_url = BASE_URL + rel_path.lstrip("./")
    try:
        req = urllib.request.Request(full_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            last_mod = resp.headers.get("Last-Modified")
            if last_mod:
                try:
                    file_dt = parsedate_to_datetime(last_mod)
                except Exception:
                    file_dt = datetime.datetime.now()
            else:
                file_dt = datetime.datetime.now()

            content_text = resp.read().decode('utf-8')
            content = json.loads(content_text) if is_json else content_text
            return content, file_dt
    except Exception:
        return None, None


def extract_year_month(title, path, file_dt):
    year = None
    month = None
    combined_str = f"{title} {path}".lower()

    y_match = re.search(r'\b(20[0-2]\d)\b', combined_str)
    if y_match:
        year = int(y_match.group(1))

    for m_name in MONTH_NAMES:
        if m_name.lower() in combined_str:
            month = m_name
            break

    if not year and file_dt:
        year = file_dt.year
    if not month and file_dt:
        month = file_dt.strftime("%B")

    if not year:
        year = datetime.datetime.now().year
    if not month:
        month = datetime.datetime.now().strftime("%B")

    return year, month


def parse_pipe_text(text, cat, topic, year, month):
    questions = []
    lines = [l.strip() for l in text.replace("\r\n", "\n").split("\n")]
    i = 0
    while i < len(lines):
        line1 = lines[i]
        if not line1:
            i += 1
            continue
        if i + 1 >= len(lines):
            break
        line2 = lines[i + 1]
        i += 2

        if not line2 or "|" not in line2:
            continue

        parts = [p.strip() for p in line2.split("|")]
        if parts and parts[-1] == "":
            parts.pop()

        if len(parts) < 2:
            continue

        ans = 0
        desc = ""
        opts = []

        last = parts[-1]
        if last.isdigit():
            ans = int(last)
            opts = parts[:-1]
        elif len(parts) >= 2 and parts[-2].isdigit():
            ans = int(parts[-2])
            desc = last
            opts = parts[:-2]
        else:
            continue

        while len(opts) < 4:
            opts.append("-")

        clean_q = line1.replace("**", "").strip()

        questions.append({
            "cat": cat,
            "topic": topic,
            "q": clean_q,
            "opts": opts[:4],
            "ans": ans,
            "desc": desc,
            "year": year,
            "month": month
        })
    return questions


def load_dataset():
    if os.path.exists(CACHE_FILE):
        print(f"{C_GREEN}[✓] Loading cached questions from {CACHE_FILE}...{C_RESET}")
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    print(f"{C_YELLOW}[*] Downloading question bank & calculating file modification dates...{C_RESET}")
    cats_index, _ = fetch_url_data("data/main.json", is_json=True)
    if not cats_index:
        print(f"{C_RED}[!] Could not load data/main.json. Check internet connection!{C_RESET}")
        return None

    dataset = []
    for c in cats_index:
        cat_title = c.get("title", "General")
        cat_path = c.get("path", "")
        print(f"    --> Fetching category: {cat_title}")

        topics, _ = fetch_url_data(cat_path, is_json=True)
        if not topics:
            continue

        for top in topics:
            top_title = top.get("title", "")
            top_path = top.get("path", "")

            raw_txt, file_dt = fetch_url_data(top_path, is_json=False)
            if raw_txt:
                year, month = extract_year_month(top_title, top_path, file_dt)
                q_list = parse_pipe_text(raw_txt, cat_title, top_title, year, month)
                if q_list:
                    dataset.extend(q_list)

    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(dataset, f, ensure_ascii=False, indent=2)
        print(f"{C_GREEN}[✓] Download finished and cached to {CACHE_FILE}!{C_RESET}\n")
    except Exception:
        pass

    return dataset


def sanitize_filename(name):
    mapping = {
        "সাধারণ জ্ঞান": "General_Knowledge",
        "সাধারণ বিজ্ঞান": "General_Science",
        "বিসিএস প্রশ্ন ব্যাংক": "BCS_Question_Bank",
        "বাংলাদেশ বিষয়াবলি": "Bangladesh_Affairs",
        "আন্তর্জাতিক বিষয়াবলি": "International_Affairs",
        "ভূগোল": "Geography",
        "কম্পিউটার": "Computer_IT"
    }
    for k, v in mapping.items():
        if k in name:
            return v
    cleaned = re.sub(r'[^\w\-_]', '_', name).strip('_')
    return cleaned if cleaned else "Quiz_Package"


def build_pak_file(questions, output_pak_path):
    total = len(questions)
    if total == 0:
        print(f"{C_RED}[!] No questions to pack.{C_RESET}")
        return

    print(f"\n{C_YELLOW}[*] Building PAK: {output_pak_path} ({total} questions)...{C_RESET}")
    print(f"{C_MUTED}    Engine: Universal Multilingual (Active Font: {ACTIVE_FONT_NAME}){C_RESET}")

    index_records = []
    payload_stream = bytearray()
    search_stream = bytearray()

    for i, q in enumerate(questions):
        if (i + 1) % 50 == 0 or i == total - 1:
            print(f"    Processing questions: {i + 1}/{total} ({(i + 1) * 100 // total}%)")

        q_bytes, q_h = render_adaptive_1bit(q["q"], QUESTION_W, is_option=False)

        opt_bytes_list = []
        opt_h_list = []
        opt_labels = ["1", "2", "3", "4"]

        for opt_idx, opt in enumerate(q["opts"]):
            label = opt_labels[opt_idx]
            opt_str = f"[{label}] {str(opt).strip()}"
            ob, oh = render_adaptive_1bit(opt_str, OPTION_W, is_option=True)
            opt_bytes_list.append(ob)
            opt_h_list.append(oh)

        offset = len(payload_stream)
        payload_stream.extend(q_bytes)
        for ob in opt_bytes_list:
            payload_stream.extend(ob)

        ans = q.get("ans", 0)
        if not (0 <= ans <= 3):
            ans = 0

        # Exact 20-byte C struct match
        rec = struct.pack(
            "<IHHHHHB5s",
            offset,
            q_h,
            opt_h_list[0],
            opt_h_list[1],
            opt_h_list[2],
            opt_h_list[3],
            ans,
            b"\x00" * 5
        )
        index_records.append(rec)

        clean_text = q["q"].replace("\n", " ")[:60].encode('utf-8')
        search_stream.extend(struct.pack("<HH", i, len(clean_text)))
        search_stream.extend(clean_text)

    HEADER_SIZE = 20
    index_offset = HEADER_SIZE
    index_size = len(index_records) * 20
    search_offset = index_offset + index_size
    payload_base = search_offset + len(search_stream)

    with open(output_pak_path, "wb") as f:
        f.write(b"DGK1")
        f.write(struct.pack("<IIII", total, index_offset, search_offset, payload_base))
        for r in index_records:
            f.write(r)
        f.write(search_stream)
        f.write(payload_stream)

    size_kb = os.path.getsize(output_pak_path) // 1024
    print(f"{C_GREEN}[✓] Successfully built: {output_pak_path} ({size_kb} KB){C_RESET}")


def play_terminal_quiz(question_list):
    score = 0
    total = len(question_list)
    skipped = 0

    for idx, q in enumerate(question_list):
        clear_screen()
        print(f"{C_BOLD}{C_BG_BLUE}  Question [{idx + 1}/{total}] | {q['cat']} ({q['month']} {q['year']})  {C_RESET}\n")
        print(f"{C_BOLD}{C_CYAN}{idx + 1}. {q['q']}{C_RESET}\n")

        for opt_idx, opt_text in enumerate(q['opts']):
            print(f"   {C_BOLD}[{opt_idx + 1}]{C_RESET} {opt_text}")

        print(f"\n{C_MUTED}" + "-" * 55 + f"{C_RESET}")

        while True:
            choice = input(f"Select option {C_BOLD}(1, 2, 3, 4){C_RESET} | [S] Skip | [Q] Quit: ").strip().lower()

            if choice in ['1', '2', '3', '4']:
                user_ans = int(choice) - 1
                print(f"{C_MUTED}" + "-" * 55 + f"{C_RESET}")

                if user_ans == q['ans']:
                    print(f"\n{C_BOLD}{C_GREEN}[✓] Correct Answer!{C_RESET}")
                    score += 1
                else:
                    correct_text = q['opts'][q['ans']]
                    print(f"\n{C_BOLD}{C_RED}[✗] Wrong Answer!{C_RESET}")
                    print(f"Correct Answer: {C_BOLD}{C_GREEN}[{q['ans'] + 1}] {correct_text}{C_RESET}")

                if q['desc']:
                    print(f"{C_YELLOW}Explanation: {q['desc']}{C_RESET}")

                input(f"\n{C_MUTED}Press [ENTER] for next question...{C_RESET}")
                break
            elif choice == 's':
                skipped += 1
                print(f"\n{C_YELLOW}[-] Question skipped.{C_RESET}")
                time.sleep(0.5)
                break
            elif choice == 'q':
                return score, idx, skipped
            else:
                print(f"{C_RED}Please enter 1, 2, 3, 4, S, or Q!{C_RESET}")

    return score, total, skipped


def main():
    dataset = load_dataset()
    if not dataset:
        print(f"{C_RED}[!] Could not load dataset. Exiting.{C_RESET}")
        sys.exit(1)

    years_map = {}
    categories_map = {}

    for q in dataset:
        y = q.get("year", 2024)
        m = q.get("month", "General")
        c = q.get("cat", "General")

        if y not in years_map:
            years_map[y] = {}
        if m not in years_map[y]:
            years_map[y][m] = []
        years_map[y][m].append(q)

        if c not in categories_map:
            categories_map[c] = []
        categories_map[c].append(q)

    sorted_years = sorted(years_map.keys(), reverse=True)

    while True:
        clear_screen()
        print_banner()
        print(f"Total Questions Available: {C_BOLD}{len(dataset)}{C_RESET}")
        print(f"Detected Years Range     : {C_BOLD}{sorted_years[-1] if sorted_years else ''} - {sorted_years[0] if sorted_years else ''}{C_RESET}")
        print(f"Total Categories         : {C_BOLD}{len(categories_map)}{C_RESET}")
        print(f"Active Font Engine       : {C_GREEN}{ACTIVE_FONT_NAME}{C_RESET}\n")

        print(f"{C_BOLD}SELECT AN OPTION (1-5):{C_RESET}\n")
        print(f"   {C_BOLD}[1]{C_RESET} Build Master PAK ({C_GREEN}daily_gk.pak{C_RESET} with ALL questions & categories)")
        print(f"   {C_BOLD}[2]{C_RESET} {C_CYAN}Build by Year & Month (Auto-calculated from modification dates){C_RESET}")
        print(f"   {C_BOLD}[3]{C_RESET} Build Separate PAKs (One .pak per category)")
        print(f"   {C_BOLD}[4]{C_RESET} Play / Test Quiz in Terminal (By Year/Month or All)")
        print(f"   {C_BOLD}[5]{C_RESET} Refresh / Redownload Cache (Recalculate dates)")
        print(f"   {C_BOLD}[0]{C_RESET} Exit")

        choice = input(f"\nEnter choice [0-5]: ").strip()

        if choice == '0':
            print(f"\n{C_GREEN}Goodbye!{C_RESET}")
            sys.exit(0)

        elif choice == '1':
            build_pak_file(dataset, "daily_gk.pak")
            input(f"\n{C_MUTED}Press [ENTER] to return to menu...{C_RESET}")

        elif choice == '2':
            clear_screen()
            print_banner()
            print(f"{C_BOLD}SELECT A YEAR:{C_RESET}\n")
            for y_idx, y_val in enumerate(sorted_years):
                total_y = sum(len(q_l) for q_l in years_map[y_val].values())
                print(f"   {C_BOLD}[{y_idx + 1}]{C_RESET} Year {y_val} ({total_y} questions)")
            print(f"   {C_BOLD}[0]{C_RESET} Back")

            y_choice = input(f"\nEnter number [0-{len(sorted_years)}]: ").strip()
            if not y_choice.isdigit() or not (1 <= int(y_choice) <= len(sorted_years)):
                continue

            selected_year = sorted_years[int(y_choice) - 1]

            clear_screen()
            print_banner()
            print(f"{C_BOLD}SELECT A MONTH FOR {selected_year}:{C_RESET}\n")
            months_in_year = list(years_map[selected_year].keys())
            for m_idx, m_val in enumerate(months_in_year):
                cnt = len(years_map[selected_year][m_val])
                print(f"   {C_BOLD}[{m_idx + 1}]{C_RESET} {m_val} ({cnt} questions)")
            print(f"   {C_BOLD}[A]{C_RESET} {C_GREEN}ALL Months of {selected_year}{C_RESET}")
            print(f"   {C_BOLD}[0]{C_RESET} Back")

            m_choice = input(f"\nEnter choice: ").strip().lower()
            if m_choice == '0':
                continue

            selected_questions = []
            pak_output_name = ""

            if m_choice == 'a':
                for m_val in months_in_year:
                    selected_questions.extend(years_map[selected_year][m_val])
                pak_output_name = f"daily_gk_{selected_year}_All.pak"
            elif m_choice.isdigit() and (1 <= int(m_choice) <= len(months_in_year)):
                selected_month = months_in_year[int(m_choice) - 1]
                selected_questions = years_map[selected_year][selected_month]
                pak_output_name = f"daily_gk_{selected_year}_{selected_month}.pak"

            if selected_questions:
                build_pak_file(selected_questions, pak_output_name)
                input(f"\n{C_MUTED}Press [ENTER] to return...{C_RESET}")

        elif choice == '3':
            for cat_name, cat_qs in categories_map.items():
                if cat_qs:
                    clean_name = sanitize_filename(cat_name)
                    pak_name = f"{clean_name}.pak"
                    build_pak_file(cat_qs, pak_name)
            input(f"\n{C_MUTED}All category packages built! Press [ENTER] to return...{C_RESET}")

        elif choice == '4':
            clear_screen()
            print_banner()
            print(f"{C_BOLD}SELECT QUIZ FILTER:{C_RESET}\n")
            print(f"   {C_BOLD}[1]{C_RESET} Play by Year & Month")
            print(f"   {C_BOLD}[2]{C_RESET} Play by Category")
            print(f"   {C_BOLD}[A]{C_RESET} Play ALL Questions ({len(dataset)} questions)")
            print(f"   {C_BOLD}[0]{C_RESET} Back")

            q_mode = input("\nEnter choice: ").strip().lower()
            target_list = []

            if q_mode == 'a':
                target_list = dataset
            elif q_mode == '1':
                clear_screen()
                print_banner()
                for y_idx, y_val in enumerate(sorted_years):
                    print(f"   {C_BOLD}[{y_idx + 1}]{C_RESET} Year {y_val}")
                y_in = input(f"\nSelect year [1-{len(sorted_years)}]: ").strip()
                if y_in.isdigit() and 1 <= int(y_in) <= len(sorted_years):
                    sel_y = sorted_years[int(y_in) - 1]
                    for m_val in years_map[sel_y]:
                        target_list.extend(years_map[sel_y][m_val])
            elif q_mode == '2':
                clear_screen()
                print_banner()
                cats = list(categories_map.keys())
                for c_idx, c_val in enumerate(cats):
                    print(f"   {C_BOLD}[{c_idx + 1}]{C_RESET} {c_val} ({len(categories_map[c_val])} questions)")
                c_in = input(f"\nSelect category: ").strip()
                if c_in.isdigit() and 1 <= int(c_in) <= len(cats):
                    target_list = categories_map[cats[int(c_in) - 1]]

            if target_list:
                score, attempted, skipped = play_terminal_quiz(target_list)
                clear_screen()
                print_banner()
                ans_cnt = attempted - skipped
                pct = (score / ans_cnt * 100) if ans_cnt > 0 else 0
                print(f"{C_BOLD}QUIZ SCORECARD:{C_RESET}")
                print(f"Total Questions : {attempted}")
                print(f"Answered        : {ans_cnt}")
                print(f"Correct         : {C_GREEN}{score}{C_RESET}")
                print(f"Wrong           : {C_RED}{ans_cnt - score}{C_RESET}")
                print(f"Skipped         : {C_YELLOW}{skipped}{C_RESET}")
                print(f"Accuracy        : {C_CYAN}{pct:.1f}%{C_RESET}")
                input(f"\n{C_MUTED}Press [ENTER] to return to menu...{C_RESET}")

        elif choice == '5':
            if os.path.exists(CACHE_FILE):
                os.remove(CACHE_FILE)
            dataset = load_dataset()
            input(f"\n{C_MUTED}Cache refreshed & dates recalculated! Press [ENTER] to return...{C_RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{C_YELLOW}Exiting builder.{C_RESET}")
        sys.exit(0)