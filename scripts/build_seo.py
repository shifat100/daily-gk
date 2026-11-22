import html
import json
import os
import re
from datetime import datetime, timezone

ROOT = os.getcwd()
BASE_URL = "https://shifat100.github.io/daily-gk"
MAIN_JSON = os.path.join(ROOT, "data", "main.json")
TOPICS_DIR = os.path.join(ROOT, "topics")

BN_TRANSLIT = {
    "অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri",
    "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
    "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri",
    "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou",
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
    "চ": "c", "ছ": "ch", "জ": "j", "ঝ": "jh", "ঞ": "n",
    "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
    "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
    "প": "p", "ফ": "f", "ব": "b", "ভ": "v", "ম": "m",
    "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh", "স": "s", "হ": "h",
    "ড়": "r", "ঢ়": "rh", "য়": "y", "ৎ": "t", "ং": "ng", "ঃ": "h", "ঁ": "n", "্": "",
    "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
    "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
}


def slugify(text: str) -> str:
    translit = "".join(BN_TRANSLIT.get(ch, ch) for ch in str(text or "").strip())
    slug = re.sub(r"[^a-z0-9]+", "-", translit.lower()).strip("-")
    return slug or "topic"


def has_bangla(text: str) -> bool:
    return any("\u0980" <= ch <= "\u09ff" for ch in text)


def safe_path(rel_path: str) -> str:
    cleaned = str(rel_path or "").lstrip("/\\")
    return os.path.join(ROOT, cleaned)


def parse_mcq_file(raw_text: str) -> list:
    lines = raw_text.replace("\r\n", "\n").split("\n")
    questions = []
    for i in range(0, len(lines), 2):
        line1 = (lines[i] if i < len(lines) else "").strip()
        line2 = (lines[i + 1] if i + 1 < len(lines) else "").strip()
        if not line1 or not line2:
            continue

        parts = line2.split("|")
        if parts and parts[-1] == "":
            parts.pop()
        if len(parts) < 2:
            continue

        last = parts[-1].strip()
        desc = None
        try:
            if last.isdigit():
                ans = int(last)
                opts = [p.strip() for p in parts[:-1]]
            else:
                if len(parts) < 3:
                    continue
                ans = int(parts[-2].strip())
                desc = last
                opts = [p.strip() for p in parts[:-2]]
        except ValueError:
            continue

        if not opts:
            continue

        questions.append({
            "title": line1.replace("**", ""),
            "opts": opts,
            "ans": ans,
            "desc": desc,
        })
    return questions


def safe_json_ld(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def build_topic_page(entry: dict, all_entries: list) -> str:
    cat = entry["cat"]
    topic = entry["topic"]
    slug = entry["slug"]
    questions = entry["questions"]
    page_url = f"{BASE_URL}/topics/{slug}.html"
    from urllib.parse import quote
    interactive_url = f"../?cat={quote(cat)}&topic={quote(topic)}"

    sample_text = f"{cat} {topic} " + " ".join(q["title"] for q in questions[:5])
    lang = "bn" if has_bangla(sample_text) else "en"
    letters = ["A", "B", "C", "D", "E"]

    quiz_parts = []
    for q in questions[:30]:
        ans_text = q["opts"][q["ans"]] if 0 <= q["ans"] < len(q["opts"]) else ""
        quiz_parts.append({
            "@type": "Question",
            "name": q["title"],
            "acceptedAnswer": {
                "@type": "Answer",
                "text": ans_text,
            },
        })

    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Quiz",
                "name": f"{topic} ({cat}) MCQ",
                "url": page_url,
                "inLanguage": lang,
                "educationalAlignment": {
                    "@type": "AlignmentObject",
                    "alignmentType": "educationalSubject",
                    "targetName": cat,
                },
                "hasPart": quiz_parts,
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Daily GK", "item": f"{BASE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Topics", "item": f"{BASE_URL}/topics/"},
                    {"@type": "ListItem", "position": 3, "name": topic, "item": page_url},
                ],
            },
        ],
    }

    cards_html = []
    for idx, q in enumerate(questions, start=1):
        opts_html = []
        for oi, opt in enumerate(q["opts"]):
            is_correct = (oi == q["ans"])
            cls = "opt correct" if is_correct else "opt"
            badge = letters[oi] if oi < len(letters) else str(oi + 1)
            mark = " <strong>&#10003;</strong>" if is_correct else ""
            opts_html.append(
                f'<li class="{cls}"><span>{badge}.</span> {html.escape(opt)}{mark}</li>'
            )
        desc_html = (
            f'<p class="desc"><strong>ব্যাখ্যা / Explanation:</strong> {html.escape(q["desc"])}</p>'
            if q["desc"]
            else ""
        )
        cards_html.append(
            f"""<article class="card">
            <div class="meta"><span>{html.escape(cat)} &bull; {html.escape(topic)}</span><span>#{idx}</span></div>
            <h2>{html.escape(q["title"])}</h2>
            <ul class="opts">{"".join(opts_html)}</ul>
            {desc_html}
        </article>"""
        )

    related = [
        f'<a href="{e["slug"]}.html">{html.escape(e["topic"])} ({len(e["questions"])})</a>'
        for e in all_entries
        if e["slug"] != slug
    ][:18]

    desc_meta = f"{topic} ({cat}) এর {len(questions)}টি গুরুত্বপূর্ণ সাধারণ জ্ঞান MCQ প্রশ্ন, উত্তর ও ব্যাখ্যা পড়ুন অথবা Quiz ও Exam মোডে অনুশীলন করুন।"

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(topic)} MCQ | {html.escape(cat)} | Daily GK</title>
    <meta name="description" content="{html.escape(desc_meta)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <link rel="canonical" href="{page_url}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{html.escape(topic)} MCQ | Daily GK">
    <meta property="og:description" content="{html.escape(desc_meta)}">
    <meta property="og:url" content="{page_url}">
    <meta property="og:image" content="{BASE_URL}/thumb.png">
    <script type="application/ld+json">{safe_json_ld(json_ld)}</script>
    <style>
        body {{ font-family: system-ui, -apple-system, Roboto, sans-serif; background: #f8f9fd; color: #1b1c1f; margin: 0; padding: 14px; line-height: 1.55; }}
        .wrap {{ max-width: 820px; margin: 0 auto; }}
        .box {{ background: #fff; padding: 18px; border-radius: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 14px; }}
        .crumb {{ font-size: 13px; color: #44474e; margin-bottom: 8px; }}
        .crumb a {{ color: #0b57d0; text-decoration: none; font-weight: 600; }}
        h1 {{ font-size: 1.3rem; margin: 0 0 8px; color: #0b57d0; }}
        .cta {{ display: inline-block; margin-top: 10px; background: #0b57d0; color: #fff; padding: 9px 18px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px; }}
        .card {{ background: #fff; padding: 16px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }}
        .meta {{ display: flex; justify-content: space-between; font-size: 12px; color: #44474e; margin-bottom: 6px; }}
        .card h2 {{ font-size: 1rem; margin: 0 0 10px; }}
        .opts {{ list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }}
        .opt {{ padding: 8px 12px; background: #f1f4fa; border-radius: 10px; font-size: 14px; }}
        .opt.correct {{ background: #d7f7dc; color: #146c2e; font-weight: 600; }}
        .desc {{ margin: 10px 0 0; padding: 9px 12px; background: #eaeff7; border-left: 3px solid #0b57d0; border-radius: 6px; font-size: 13.5px; }}
        .related {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }}
        .related a {{ background: #eaeff7; color: #1b1c1f; padding: 5px 11px; border-radius: 999px; font-size: 13px; text-decoration: none; }}
    </style>
</head>
<body>
    <main class="wrap">
        <header class="box">
            <nav class="crumb" aria-label="Breadcrumb">
                <a href="../">Daily GK</a> &rsaquo;
                <a href="./">All Topics</a> &rsaquo;
                <span>{html.escape(topic)}</span>
            </nav>
            <h1>{html.escape(topic)} &ndash; {html.escape(cat)} ({len(questions)} MCQs)</h1>
            <p style="margin:0;color:#44474e;font-size:14px;">{html.escape(desc_meta)}</p>
            <a class="cta" href="{interactive_url}">Quiz / Exam মোডে প্র্যাকটিস করুন</a>
        </header>
        {"".join(cards_html)}
        <section class="box">
            <h2 style="font-size:1rem;margin:0;">অন্যান্য টপিকসমূহ</h2>
            <div class="related">{"".join(related)}</div>
        </section>
    </main>
</body>
</html>
"""


def build_topics_index(entries: list) -> str:
    total_q = sum(len(e["questions"]) for e in entries)
    grouped = {}
    for e in entries:
        grouped.setdefault(e["cat"], []).append(e)

    sections = []
    for cat, items in grouped.items():
        links = "".join(
            f'<li><a href="{e["slug"]}.html">{html.escape(e["topic"])} <span>({len(e["questions"])})</span></a></li>'
            for e in items
        )
        sections.append(f'<section class="box"><h2>{html.escape(cat)}</h2><ul class="list">{links}</ul></section>')

    return f"""<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All GK Topics &amp; Categories | Daily GK MCQ</title>
    <meta name="description" content="Browse all {len(entries)} GK topics and {total_q}+ MCQ questions with answers and explanations on Daily GK.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{BASE_URL}/topics/">
    <style>
        body {{ font-family: system-ui, -apple-system, Roboto, sans-serif; background: #f8f9fd; color: #1b1c1f; margin: 0; padding: 14px; line-height: 1.5; }}
        .wrap {{ max-width: 820px; margin: 0 auto; }}
        .box {{ background: #fff; padding: 18px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 12px; }}
        h1 {{ font-size: 1.35rem; margin: 0 0 6px; color: #0b57d0; }}
        h2 {{ font-size: 1.05rem; margin: 0 0 10px; color: #1b1c1f; }}
        .list {{ list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }}
        .list a {{ display: flex; justify-content: space-between; padding: 9px 12px; background: #f1f4fa; border-radius: 10px; color: #0b57d0; text-decoration: none; font-weight: 600; font-size: 14px; }}
        .list a span {{ color: #44474e; font-weight: 500; }}
        .cta {{ display: inline-block; margin-top: 8px; color: #0b57d0; font-weight: 600; text-decoration: none; font-size: 14px; }}
    </style>
</head>
<body>
    <main class="wrap">
        <header class="box">
            <h1>Daily GK &ndash; All Topics ({len(entries)})</h1>
            <p style="margin:0;color:#44474e;font-size:14px;">Total {total_q} General Knowledge MCQ questions organized by topic.</p>
            <a class="cta" href="../">&larr; Back to Interactive Quiz App</a>
        </header>
        {"".join(sections)}
    </main>
</body>
</html>
"""


def main():
    if not os.path.exists(MAIN_JSON):
        print("data/main.json not found. Skipping SEO build.")
        return

    with open(MAIN_JSON, "r", encoding="utf-8") as f:
        categories = json.load(f)

    entries = []
    used_slugs = set()

    for cat in categories:
        cat_file = safe_path(cat.get("path", ""))
        if not os.path.exists(cat_file):
            continue
        with open(cat_file, "r", encoding="utf-8") as f:
            topics = json.load(f)

        for t in topics:
            q_file = safe_path(t.get("path", ""))
            if not os.path.exists(q_file):
                continue
            with open(q_file, "r", encoding="utf-8", errors="replace") as f:
                questions = parse_mcq_file(f.read())
            if not questions:
                continue

            base_slug = f"{slugify(cat.get('title', 'cat'))}-{slugify(t.get('title', 'topic'))}"
            slug = base_slug
            counter = 2
            while slug in used_slugs:
                slug = f"{base_slug}-{counter}"
                counter += 1
            used_slugs.add(slug)

            entries.append({
                "cat": cat.get("title", ""),
                "topic": t.get("title", ""),
                "slug": slug,
                "questions": questions,
            })

    os.makedirs(TOPICS_DIR, exist_ok=True)
    # Remove stale generated HTML files
    for fname in os.listdir(TOPICS_DIR):
        if fname.endswith(".html"):
            os.remove(os.path.join(TOPICS_DIR, fname))

    for entry in entries:
        out_path = os.path.join(TOPICS_DIR, f"{entry['slug']}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(build_topic_page(entry, entries))

    with open(os.path.join(TOPICS_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_topics_index(entries))

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    url_nodes = [
        f"""  <url>
    <loc>{BASE_URL}/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>""",
        f"""  <url>
    <loc>{BASE_URL}/topics/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>""",
    ]
    for e in entries:
        url_nodes.append(
            f"""  <url>
    <loc>{BASE_URL}/topics/{e["slug"]}.html</loc>
    <lastmod>{today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>"""
        )

    sitemap_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(url_nodes)
        + "\n</urlset>\n"
    )
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap_xml)

    robots_txt = f"User-agent: *\nAllow: /\n\nSitemap: {BASE_URL}/sitemap.xml\n"
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots_txt)

    # Inject crawlable links into index.html only if SEO-DIR markers exist
    index_path = os.path.join(ROOT, "index.html")
    if os.path.exists(index_path) and entries:
        with open(index_path, "r", encoding="utf-8") as f:
            index_html = f.read()
        if "<!-- SEO-DIR-START -->" in index_html and "<!-- SEO-DIR-END -->" in index_html:
            dir_links = "\n                            ".join(
                f'<a href="topics/{e["slug"]}.html">{html.escape(e["topic"])} ({len(e["questions"])})</a>'
                for e in entries
            )
            dir_block = (
                "<!-- SEO-DIR-START -->\n"
                '                        <details class="seo-dir-details">\n'
                f"                            <summary>Browse All GK Topics ({len(entries)} Pages)</summary>\n"
                '                            <div class="seo-dir-links">\n'
                f"                            {dir_links}\n"
                "                            </div>\n"
                "                        </details>\n"
                "                        <!-- SEO-DIR-END -->"
            )
            updated_html = re.sub(
                r"<!-- SEO-DIR-START -->[\s\S]*?<!-- SEO-DIR-END -->",
                lambda _: dir_block,
                index_html,
            )
            with open(index_path, "w", encoding="utf-8") as f:
                f.write(updated_html)

    print(f"SEO Build Complete: {len(entries)} topic pages, topics/index.html, sitemap.xml, robots.txt ready.")


if __name__ == "__main__":
    main()
