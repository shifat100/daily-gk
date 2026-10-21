#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated headless PAK builder for GitHub Actions
Builds:
  1. data/master.pak (All questions)
  2. data/<folder>/<folder>.pak (Per subfolder / category)
  3. packs.json (Catalog index in root)
"""

import os
import json
import datetime
import builder  # Uses your existing builder.py raster engine and build_pak_file()

def run_automated_build():
    print("[*] Loading questions dataset...")
    dataset = builder.load_dataset()
    if not dataset:
        print("[!] No questions found! Exiting.")
        return

    os.makedirs("data", exist_ok=True)
    packs_catalog = []
    today_str = datetime.date.today().isoformat()

    # ---------------------------------------------------------
    # 1. BUILD MASTER PAK (under data/master.pak)
    # ---------------------------------------------------------
    master_pak_path = os.path.join("data", "master.pak").replace("\\", "/")
    print(f"\n[*] Creating Master PAK with {len(dataset)} questions...")
    builder.build_pak_file(dataset, master_pak_path)

    if os.path.exists(master_pak_path):
        size_kb = round(os.path.getsize(master_pak_path) / 1024, 2)
        packs_catalog.append({
            "id": "master",
            "name": "Master Question Bank",
            "category": "All",
            "file": master_pak_path,
            "questions": len(dataset),
            "size_kb": size_kb,
            "updated_at": today_str
        })

    # ---------------------------------------------------------
    # 2. GROUP BY CATEGORY / SUBFOLDER
    # ---------------------------------------------------------
    categories = {}
    for q in dataset:
        cat = q.get("cat", "General").strip()
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(q)

    # ---------------------------------------------------------
    # 3. BUILD SUBFOLDER PAKs: data/<folder>/<folder>.pak
    # ---------------------------------------------------------
    for cat_name, q_list in categories.items():
        folder_slug = builder.sanitize_filename(cat_name).lower()
        subfolder_path = os.path.join("data", folder_slug)
        os.makedirs(subfolder_path, exist_ok=True)

        pak_filename = f"{folder_slug}.pak"
        pak_full_path = os.path.join(subfolder_path, pak_filename).replace("\\", "/")

        print(f"\n[*] Building subfolder package for '{cat_name}' ({len(q_list)} items)...")
        builder.build_pak_file(q_list, pak_full_path)

        if os.path.exists(pak_full_path):
            size_kb = round(os.path.getsize(pak_full_path) / 1024, 2)
            packs_catalog.append({
                "id": folder_slug,
                "name": cat_name,
                "category": cat_name,
                "file": pak_full_path,
                "questions": len(q_list),
                "size_kb": size_kb,
                "updated_at": today_str
            })

    # ---------------------------------------------------------
    # 4. GENERATE packs.json IN REPOSITORY ROOT
    # ---------------------------------------------------------
    catalog_path = "packs.json"
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(packs_catalog, f, ensure_ascii=False, indent=2)

    print(f"\n[✓] Generated root catalog index: {catalog_path}")
    print(f"[✓] Total packages cataloged: {len(packs_catalog)}")


if __name__ == "__main__":
    run_automated_build()
