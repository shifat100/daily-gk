#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Daily GK Automated PAK Generator (Hybrid: Binary Images + Full Text Footer)
- Backward Compatible: Existing binary display systems remain 100% intact.
- Full Text Support: Injects clean full-text JSON payload at the file footer (DGTX).
"""

import sys
import os
import json
import struct
import urllib.request
import re
import datetime
from email.utils import parsedate_to_datetime
from PIL import Image, ImageDraw, ImageFont

if sys.platform == "win32":
    os.system('chcp 65001 > nul')
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

QUESTION_W = 224  # 28 bytes per row
OPTION_W   = 208  # 26 bytes per row
MAX_QUESTION_HEIGHT = 65
MAX_OPTION_HEIGHT   = 42

BASE_URL = "https://raw.githubusercontent.com/shifat100/daily-gk/main/"
MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

FONT_CANDIDATES = [
    ("kalpurush.ttf", "Kalpurush"),
    ("Kalpurush.ttf", "Kalpurush"),
    ("SolaimanLipi.ttf", "SolaimanLipi"),
    ("Siyamrupali.ttf", "Siyam Rupali"),
    ("/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf", "Noto Sans Bengali"),
    ("C:/Windows/Fonts/Nirmala.ttf", "Nirmala UI"),
    ("C:/Windows/Fonts/segoeui.ttf", "Segoe UI"),
    ("C:/Windows/Fonts/arial.ttf", "Arial"),
    ("C:/Windows/Fonts/vrinda.ttf", "Vrinda")
]

# Windows GDI Setup
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


def find_and_register_font():
    for f_path, f_name in FONT_CANDIDATES:
        if os.path.exists(f_path):
            if sys.platform == "win32":
                try:
                    FR_PRIVATE = 0x10
                    ctypes.windll.gdi32.AddFontResourceExW(os.path.abspath(f_path), FR_PRIVATE, 0)
                except Exception:
                    pass
            return f_path, f_name

    return None, "Nirmala UI" if sys.platform == "win32" else "DejaVuSans"


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

    ctypes.memset(pBits, 0, target_width * total_h * 4)

    gdi32.SetBkColor(memdc, 0x000000)
    gdi32.SetTextColor(memdc, 0xFFFFFF)
    gdi32.SetBkMode(memdc, 1)

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
        start_sz, min_sz, max_h = 12, 9, MAX_OPTION_HEIGHT
    else:
        start_sz, min_sz, max_h = 13, 10, MAX_QUESTION_HEIGHT

    best_bytes = None
    best_h = 0
    for fsize in range(start_sz, min_sz - 1, -1):
        if sys.platform == "win32":
            raw_bytes, total_h = render_text_windows_gdi(clean_text, ACTIVE_FONT_NAME, fsize, target_width)
        else:
            # Linux / GitHub Actions fallback using Pillow
            try:
                font = ImageFont.truetype(ACTIVE_FONT_PATH, fsize) if ACTIVE_FONT_PATH else ImageFont.load_default()
            except Exception:
                font = ImageFont.load_default()
            
            # Simple 1-bit monochrome canvas
            total_h = 24
            img = Image.new("1", (target_width, total_h), color=0)
            d = ImageDraw.Draw(img)
            d.text((2, 2), clean_text, font=font, fill=1)
            raw_bytes = img.tobytes()

        best_bytes = raw_bytes
        best_h = total_h
        if total_h <= max_h:
            return raw_bytes, total_h

    return best_bytes, best_h


def fetch_data_file(rel_path, is_json=True):
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
            file_dt = parsedate_to_datetime(last_mod) if last_mod else datetime.datetime.now()
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


def parse_pipe_text(text, cat, topic, year, month, source_path):
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
            "month": month,
            "source_path": source_path
        })
    return questions


def load_all_questions():
    cats_index, _ = fetch_data_file("data/main.json", is_json=True)
    if not cats_index:
        print("[!] Could not load data/main.json")
        return []

    dataset = []
    for c in cats_index:
        cat_title = c.get("title", "General")
        cat_path = c.get("path", "")
        topics, _ = fetch_data_file(cat_path, is_json=True)
        if not topics:
            continue

        for top in topics:
            top_title = top.get("title", "")
            top_path = top.get("path", "")

            raw_txt, file_dt = fetch_data_file(top_path, is_json=False)
            if raw_txt:
                year, month = extract_year_month(top_title, top_path, file_dt)
                q_list = parse_pipe_text(raw_txt, cat_title, top_title, year, month, top_path)
                if q_list:
                    dataset.extend(q_list)

    return dataset


def sanitize_slug(name):
    mapping = {
        "সাধারণ জ্ঞান": "general_knowledge",
        "সাধারণ বিজ্ঞান": "general_science",
        "বিসিএস প্রশ্ন ব্যাংক": "bcs_question_bank",
        "বাংলাদেশ বিষয়াবলি": "bangladesh_affairs",
        "আন্তর্জাতিক বিষয়াবলি": "international_affairs",
        "ভূগোল": "geography",
        "কম্পিউটার": "computer_it"
    }
    for k, v in mapping.items():
        if k in name:
            return v
    cleaned = re.sub(r'[^\w\-_]', '_', name.lower()).strip('_')
    return cleaned if cleaned else "package"


def build_pak_file(questions, output_pak_path):
    total = len(questions)
    if total == 0:
        return 0

    os.makedirs(os.path.dirname(output_pak_path), exist_ok=True)
    print(f"[*] Building PAK: {output_pak_path} ({total} questions)...")

    index_records = []
    payload_stream = bytearray()
    search_stream = bytearray()

    for i, q in enumerate(questions):
        # 1. বিটম্যাপ রেন্ডারিং (অপরিবর্তিত)
        q_bytes, q_h = render_adaptive_1bit(q["q"], QUESTION_W, is_option=False)

        opt_bytes_list = []
        opt_h_list = []
        for opt_idx, opt in enumerate(q["opts"]):
            opt_str = f"[{opt_idx + 1}] {str(opt).strip()}"
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

        # ইনডেক্স রেকর্ড (২০ বাইট - অপরিবর্তিত)
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

        # সার্চ স্ট্রিম (৬০ ক্যারেক্টার - অপরিবর্তিত)
        clean_text = q["q"].replace("\n", " ")[:60].encode('utf-8')
        search_stream.extend(struct.pack("<HH", i, len(clean_text)))
        search_stream.extend(clean_text)

    HEADER_SIZE = 20
    index_offset = HEADER_SIZE
    index_size = len(index_records) * 20
    search_offset = index_offset + index_size
    payload_base = search_offset + len(search_stream)

    # ========================================================
    # পদ্ধতি ১: সম্পূর্ণ টেক্সট পে-লোড ফুটার তৈরি করা
    # ========================================================
    clean_text_records = []
    for idx, q in enumerate(questions):
        clean_text_records.append({
            "id": idx,
            "q": q.get("q", ""),
            "opts": q.get("opts", []),
            "ans": q.get("ans", 0),
            "desc": q.get("desc", ""),
            "cat": q.get("cat", ""),
            "topic": q.get("topic", ""),
            "year": q.get("year", ""),
            "month": q.get("month", "")
        })

    full_text_bytes = json.dumps(clean_text_records, ensure_ascii=False).encode('utf-8')
    text_size = len(full_text_bytes)

    with open(output_pak_path, "wb") as f:
        # [ক] হেডার (২০ বাইট)
        f.write(b"DGK1")
        f.write(struct.pack("<IIII", total, index_offset, search_offset, payload_base))
        
        # [খ] ইনডেক্স রেকর্ড
        for r in index_records:
            f.write(r)
            
        # [গ] সার্চ স্ট্রিম
        f.write(search_stream)
        
        # [ঘ] বিটম্যাপ ইমেজ পেলোড
        f.write(payload_stream)

        # [ঙ] পদ্ধতি ১ - নতুন ফুটার যুক্ত করা (আসল টেক্সট + সাইজ + DGTX ট্যাগ)
        f.write(full_text_bytes)
        f.write(struct.pack("<I", text_size))  # টেক্সট ব্লকের দৈর্ঘ্য (৪ বাইট)
        f.write(b"DGTX")                       # ফুটার মার্কার (৪ বাইট)

    size_kb = round(os.path.getsize(output_pak_path) / 1024, 2)
    print(f"[✓] Created: {output_pak_path} ({size_kb} KB)")
    return size_kb


def main():
    print("==================================================")
    print("   DAILY GK AUTOMATED PAK & CATALOG GENERATOR     ")
    print(f"   Active Font: {ACTIVE_FONT_NAME}")
    print("==================================================")

    all_questions = load_all_questions()
    if not all_questions:
        print("[!] No questions loaded. Exiting.")
        sys.exit(1)

    print(f"[✓] Total Questions Loaded: {len(all_questions)}\n")

    catalog = []
    today_str = datetime.date.today().isoformat()

    # 1. BUILD MASTER PAK: data/master.pak
    master_path = "data/master.pak"
    master_size = build_pak_file(all_questions, master_path)
    catalog.append({
        "id": "master",
        "name": "Master Question Bank (All Questions)",
        "category": "All",
        "file": master_path,
        "questions": len(all_questions),
        "size_kb": master_size,
        "updated_at": today_str
    })

    # 2. GROUP QUESTIONS BY SUBFOLDER
    subfolder_groups = {}
    for q in all_questions:
        src = q.get("source_path", "").replace("\\", "/")
        parts = src.split("/")
        
        if len(parts) >= 3 and parts[0] == "data":
            folder_key = parts[1]
        else:
            folder_key = sanitize_slug(q.get("cat", "general"))

        if folder_key not in subfolder_groups:
            subfolder_groups[folder_key] = {
                "display_name": q.get("cat", folder_key.replace("_", " ").title()),
                "questions": []
            }
        subfolder_groups[folder_key]["questions"].append(q)

    # 3. BUILD SUBFOLDER PAK: data/<subfolder>/<subfolder>.pak
    for folder_name, group_data in subfolder_groups.items():
        subfolder_dir = os.path.join("data", folder_name)
        os.makedirs(subfolder_dir, exist_ok=True)
        pak_path = os.path.join(subfolder_dir, f"{folder_name}.pak").replace("\\", "/")

        qs = group_data["questions"]
        size_kb = build_pak_file(qs, pak_path)

        catalog.append({
            "id": folder_name,
            "name": group_data["display_name"],
            "category": group_data["display_name"],
            "file": pak_path,
            "questions": len(qs),
            "size_kb": size_kb,
            "updated_at": today_str
        })

    # 4. WRITE SINGLE packs.json IN ROOT DIRECTORY
    with open("packs.json", "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    print("\n==================================================")
    print(f"[✓] Created root index: packs.json ({len(catalog)} packages)")
    print("==================================================")


if __name__ == "__main__":
    main()
