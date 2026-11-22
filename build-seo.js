const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BASE_URL = 'https://shifat100.github.io/daily-gk';
const MAIN_JSON = path.join(ROOT, 'data', 'main.json');
const TOPICS_DIR = path.join(ROOT, 'topics');

// Bengali + ASCII safe URL slugifier
const BN_MAP = {
    'অ':'o','আ':'a','ই':'i','ঈ':'i','উ':'u','ঊ':'u','ঋ':'ri','এ':'e','ঐ':'oi','ও':'o','ঔ':'ou',
    'া':'a','ি':'i','ী':'i','ু':'u','ূ':'u','ৃ':'ri','ে':'e','ৈ':'oi','ো':'o','ৌ':'ou',
    'ক':'k','খ':'kh','গ':'g','ঘ':'gh','ঙ':'ng','চ':'c','ছ':'ch','জ':'j','ঝ':'jh','ঞ':'n',
    'ট':'t','ঠ':'th','ড':'d','ঢ':'dh','ণ':'n','ত':'t','থ':'th','দ':'d','ধ':'dh','ন':'n',
    'প':'p','ফ':'f','ব':'b','ভ':'v','ম':'m','য':'j','র':'r','ল':'l','শ':'sh','ষ':'sh',
    'স':'s','হ':'h','ড়':'r','ঢ়':'rh','য়':'y','ৎ':'t','ং':'ng','ঃ':'h','ঁ':'n','্':'',
    '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'
};

function slugify(str) {
    let out = '';
    for (const ch of String(str || '').trim()) {
        out += (BN_MAP[ch] !== undefined) ? BN_MAP[ch] : ch;
    }
    return out
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'topic';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeJsonLd(obj) {
    return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>');
}

function parseMcqFile(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const items = [];
    for (let i = 0; i < lines.length; i += 2) {
        const line1 = (lines[i] || '').trim();
        const line2 = (lines[i + 1] || '').trim();
        if (!line1 || !line2) continue;

        const parts = line2.split('|');
        if (parts[parts.length - 1] === '') parts.pop();

        let ans, desc = null, opts;
        const last = parts[parts.length - 1];
        if (!isNaN(last) && last !== '') {
            ans = parseInt(last, 10);
            opts = parts.slice(0, -1);
        } else {
            ans = parseInt(parts[parts.length - 2], 10);
            desc = last;
            opts = parts.slice(0, -2);
        }
        items.push({
            title: line1.replace(/\*\*/g, ''),
            opts,
            ans,
            desc
        });
    }
    return items;
}

function buildTopicHtml(entry, allEntries) {
    const pageUrl = `${BASE_URL}/topics/${entry.slug}.html`;
    const interactiveUrl = `../?cat=${encodeURIComponent(entry.cat)}&topic=${encodeURIComponent(entry.topic)}`;
    const letters = ['A', 'B', 'C', 'D', 'E'];

    const quizQuestionsLd = entry.questions.slice(0, 30).map(q => ({
        "@type": "Question",
        "name": q.title,
        "acceptedAnswer": {
            "@type": "Answer",
            "text": q.opts[q.ans] || ""
        }
    }));

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Quiz",
                "name": `${entry.topic} (${entry.cat}) MCQ Questions & Answers`,
                "url": pageUrl,
                "educationalAlignment": {
                    "@type": "AlignmentObject",
                    "alignmentType": "educationalSubject",
                    "targetName": entry.cat
                },
                "hasPart": quizQuestionsLd
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Daily GK MCQ", "item": `${BASE_URL}/` },
                    { "@type": "ListItem", "position": 2, "name": entry.cat, "item": `${BASE_URL}/?cat=${encodeURIComponent(entry.cat)}` },
                    { "@type": "ListItem", "position": 3, "name": entry.topic, "item": pageUrl }
                ]
            }
        ]
    };

    const cardsHtml = entry.questions.map((q, idx) => {
        const optsHtml = q.opts.map((o, oi) => {
            const isCorrect = oi === q.ans;
            return `<li class="${isCorrect ? 'opt correct' : 'opt'}"><span>${letters[oi] || (oi + 1)}.</span> ${escapeHtml(o)} ${isCorrect ? '<strong>(Correct)</strong>' : ''}</li>`;
        }).join('');
        const descHtml = q.desc ? `<p class="desc"><strong>Explanation:</strong> ${escapeHtml(q.desc)}</p>` : '';
        return `
        <article class="card">
            <div class="meta">${escapeHtml(entry.cat)} &bull; ${escapeHtml(entry.topic)} <span>#${idx + 1}</span></div>
            <h2>${escapeHtml(q.title)}</h2>
            <ul class="opts">${optsHtml}</ul>
            ${descHtml}
        </article>`;
    }).join('\n');

    const relatedLinks = allEntries
        .filter(e => e.slug !== entry.slug)
        .slice(0, 15)
        .map(e => `<a href="${e.slug}.html">${escapeHtml(e.topic)} (${e.questions.length})</a>`)
        .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(entry.topic)} MCQ | ${escapeHtml(entry.cat)} | Daily GK</title>
    <meta name="description" content="Practice ${entry.questions.length} ${escapeHtml(entry.topic)} (${escapeHtml(entry.cat)}) GK MCQs with answers and explanations for competitive exams.">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(entry.topic)} MCQ | Daily GK">
    <meta property="og:description" content="Practice ${entry.questions.length} ${escapeHtml(entry.topic)} questions with answers and explanations.">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${BASE_URL}/thumb.png">
    <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
    <style>
        body { font-family: system-ui, -apple-system, Roboto, sans-serif; background: #f8f9fd; color: #1b1c1f; margin: 0; padding: 16px; line-height: 1.5; }
        .wrap { max-width: 820px; margin: 0 auto; }
        .top { background: #fff; padding: 18px; border-radius: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 14px; }
        .crumb { font-size: 13px; color: #44474e; margin-bottom: 8px; }
        .crumb a { color: #0b57d0; text-decoration: none; }
        h1 { font-size: 1.35rem; margin: 0 0 8px; color: #0b57d0; }
        .cta { display: inline-block; margin-top: 8px; background: #0b57d0; color: #fff; padding: 9px 18px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px; }
        .card { background: #fff; padding: 16px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
        .meta { display: flex; justify-content: space-between; font-size: 12px; color: #44474e; margin-bottom: 6px; }
        .card h2 { font-size: 1rem; margin: 0 0 10px; }
        .opts { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
        .opt { padding: 8px 12px; background: #f1f4fa; border-radius: 10px; font-size: 14px; }
        .opt.correct { background: #d7f7dc; color: #146c2e; font-weight: 600; }
        .desc { margin: 10px 0 0; padding: 9px 12px; background: #eaeff7; border-left: 3px solid #0b57d0; border-radius: 6px; font-size: 13.5px; }
        .related { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
        .related a { background: #eaeff7; color: #1b1c1f; padding: 5px 11px; border-radius: 999px; font-size: 13px; text-decoration: none; }
    </style>
</head>
<body>
    <main class="wrap">
        <header class="top">
            <nav class="crumb" aria-label="Breadcrumb">
                <a href="../">Daily GK Home</a> &rsaquo;
                <a href="../?cat=${encodeURIComponent(entry.cat)}">${escapeHtml(entry.cat)}</a> &rsaquo;
                <span>${escapeHtml(entry.topic)}</span>
            </nav>
            <h1>${escapeHtml(entry.topic)} &ndash; ${escapeHtml(entry.cat)} MCQs (${entry.questions.length})</h1>
            <p style="margin:0;color:#44474e;font-size:14px;">Read all ${entry.questions.length} ${escapeHtml(entry.topic)} questions with answers and explanations, or open interactive Quiz &amp; Exam mode.</p>
            <a class="cta" href="${interactiveUrl}">Practice in Quiz / Exam Mode</a>
        </header>
        ${cardsHtml}
        <section class="top">
            <h2 style="font-size:1rem;margin:0 0 8px;">More GK Topics</h2>
            <div class="related">${relatedLinks}</div>
        </section>
    </main>
</body>
</html>`;
}

function main() {
    if (!fs.existsSync(MAIN_JSON)) {
        console.log('data/main.json not found, skipping SEO build.');
        return;
    }

    const categories = JSON.parse(fs.readFileSync(MAIN_JSON, 'utf8'));
    const entries = [];
    const usedSlugs = new Set();

    for (const cat of categories) {
        const catPath = path.join(ROOT, cat.path);
        if (!fs.existsSync(catPath)) continue;
        const topics = JSON.parse(fs.readFileSync(catPath, 'utf8'));

        for (const t of topics) {
            const txtPath = path.join(ROOT, t.path);
            if (!fs.existsSync(txtPath)) continue;
            const raw = fs.readFileSync(txtPath, 'utf8');
            const questions = parseMcqFile(raw);
            if (!questions.length) continue;

            let baseSlug = `${slugify(cat.title)}-${slugify(t.title)}`;
            let slug = baseSlug;
            let count = 2;
            while (usedSlugs.has(slug)) {
                slug = `${baseSlug}-${count++}`;
            }
            usedSlugs.add(slug);

            entries.push({
                cat: cat.title,
                topic: t.title,
                slug,
                questions
            });
        }
    }

    if (!fs.existsSync(TOPICS_DIR)) fs.mkdirSync(TOPICS_DIR, { recursive: true });
    for (const entry of entries) {
        fs.writeFileSync(path.join(TOPICS_DIR, `${entry.slug}.html`), buildTopicHtml(entry, entries), 'utf8');
    }

    // Generate sitemap.xml
    const today = new Date().toISOString().split('T')[0];
    const urls = [
        { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'daily' },
        ...entries.map(e => ({
            loc: `${BASE_URL}/topics/${e.slug}.html`,
            priority: '0.8',
            changefreq: 'weekly'
        }))
    ];

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>\n`;
    fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml, 'utf8');

    // Generate robots.txt
    const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`;
    fs.writeFileSync(path.join(ROOT, 'robots.txt'), robotsTxt, 'utf8');

    // Inject crawlable topic links inside index.html
    const indexPath = path.join(ROOT, 'index.html');
    if (fs.existsSync(indexPath) && entries.length > 0) {
        let indexHtml = fs.readFileSync(indexPath, 'utf8');
        const dirLinks = entries
            .map(e => `<a href="topics/${e.slug}.html">${escapeHtml(e.topic)} (${e.questions.length})</a>`)
            .join('\n                            ');
        const dirBlock = `<!-- SEO-DIR-START -->
                        <details class="seo-dir-details">
                            <summary>Browse All GK Topics (${entries.length} Pages)</summary>
                            <div class="seo-dir-links">
                            ${dirLinks}
                            </div>
                        </details>
                        <!-- SEO-DIR-END -->`;

        indexHtml = indexHtml.replace(/<!-- SEO-DIR-START -->[\s\S]*?<!-- SEO-DIR-END -->/, dirBlock);
        fs.writeFileSync(indexPath, indexHtml, 'utf8');
    }

    console.log(`SEO Build Complete: ${entries.length} topic pages + sitemap.xml + robots.txt generated.`);
}

main();