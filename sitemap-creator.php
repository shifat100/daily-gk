<?php
/**
 * Ultimate Deep Pagination Sitemap Generator for Daily GK
 * Automatically calculates exact question counts, total pages, and generates 
 * maximum possible deep links for Google SEO ranking.
 */

// ১. বেস কনফিগারেশন
$baseUrl = 'https://shifat100.github.io/daily-gk/';
$outputFile = __DIR__ . '/sitemap.xml';
$currentDate = date('Y-m-d');
$perPage = 10; // অ্যাপের ডিফল্ট পেজ লিমিট

// স্ক্রিপ্ট এক্সিকিউশন টাইম লিমিট বাড়ানো
set_time_limit(300);
ini_set('memory_limit', '256M');

echo "====================================================\n";
echo "🚀 Starting Exhaustive Deep Pagination Sitemap Builder\n";
echo "🌐 Base URL: {$baseUrl}\n";
echo "====================================================\n\n";

// হেল্পার ফাংশন: লাইভ সাইট বা লোকাল ফাইল থেকে ডেটা পড়া
function fetchData($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_USERAGENT, 'DailyGK-DeepCrawler/2.0');
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200 && $response) {
            return $response;
        }
    }
    
    return @file_get_contents($url);
}

// টেক্সট ফাইল পার্স করে মোট প্রশ্নের সংখ্যা বের করার ফাংশন
function countQuestionsFromText($rawText) {
    if (empty($rawText)) return 0;
    $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $rawText));
    $count = 0;
    for ($i = 0; $i < count($lines); $i += 2) {
        $line1 = isset($lines[$i]) ? trim($lines[$i]) : '';
        $line2 = isset($lines[$i+1]) ? trim($lines[$i+1]) : '';
        if (!empty($line1) && !empty($line2)) {
            $count++;
        }
    }
    return $count;
}

$urls = [];

// ফাংশন: নিরাপদে সাইটম্যাপ অ্যারেতে লিঙ্ক পুশ করা
function addSitemapUrl(&$urls, $fullUrl, $priority, $changefreq, $lastmod) {
    $urls[] = [
        'loc' => $fullUrl,
        'lastmod' => $lastmod,
        'changefreq' => $changefreq,
        'priority' => number_format((float)$priority, 1, '.', '')
    ];
}

// ২. হোম পেজ ও স্ট্যাটিক রুট যোগ করা
addSitemapUrl($urls, $baseUrl, 1.0, 'daily', $currentDate);
addSitemapUrl($urls, $baseUrl . 'fastmode.html', 0.8, 'weekly', $currentDate);

$totalGlobalQuestions = 0;
$categoriesTree = [];

// ৩. লাইভ সাইট থেকে `data/main.json` রিড করা
$mainJsonUrl = rtrim($baseUrl, '/') . '/data/main.json';
$mainJsonRaw = fetchData($mainJsonUrl);

if (!$mainJsonRaw && file_exists(__DIR__ . '/data/main.json')) {
    $mainJsonRaw = file_get_contents(__DIR__ . '/data/main.json');
}

$categories = json_decode($mainJsonRaw, true);

if ($categories && is_array($categories)) {
    foreach ($categories as $cat) {
        if (empty($cat['title'])) continue;
        $catTitle = trim($cat['title']);
        $catPath = isset($cat['path']) ? trim($cat['path']) : '';
        
        $categoriesTree[$catTitle] = [
            'total_questions' => 0,
            'topics' => []
        ];

        echo "📂 Processing Category: {$catTitle}...\n";

        if (!empty($catPath)) {
            $catFileUrl = (strpos($catPath, 'http') === 0) ? $catPath : rtrim($baseUrl, '/') . '/' . ltrim($catPath, '/');
            $topicJsonRaw = fetchData($catFileUrl);

            if (!$topicJsonRaw && file_exists(__DIR__ . '/' . ltrim($catPath, '/'))) {
                $topicJsonRaw = file_get_contents(__DIR__ . '/' . ltrim($catPath, '/'));
            }

            $topicFiles = json_decode($topicJsonRaw, true);

            if ($topicFiles && is_array($topicFiles)) {
                foreach ($topicFiles as $topic) {
                    if (empty($topic['title'])) continue;
                    $topicTitle = trim($topic['title']);
                    $topicPath = isset($topic['path']) ? trim($topic['path']) : '';

                    $qCount = 0;
                    if (!empty($topicPath)) {
                        $qFileUrl = (strpos($topicPath, 'http') === 0) ? $topicPath : rtrim($baseUrl, '/') . '/' . ltrim($topicPath, '/');
                        $qTextRaw = fetchData($qFileUrl);

                        if (!$qTextRaw && file_exists(__DIR__ . '/' . ltrim($topicPath, '/'))) {
                            $qTextRaw = file_get_contents(__DIR__ . '/' . ltrim($topicPath, '/'));
                        }

                        $qCount = countQuestionsFromText($qTextRaw);
                    }

                    // ডিফল্ট ব্যাকআপ প্রশ্ন সংখ্যা (যদি কোনো কারণে ফাইল ফেচ না হয়)
                    if ($qCount === 0) $qCount = 20;

                    $categoriesTree[$catTitle]['topics'][$topicTitle] = $qCount;
                    $categoriesTree[$catTitle]['total_questions'] += $qCount;
                    $totalGlobalQuestions += $qCount;

                    echo "   └── 📄 Topic: {$topicTitle} ({$qCount} Questions)\n";
                }
            }
        }
    }
} else {
    echo "⚠️ Warning: Could not fetch data/main.json. Using fallback count.\n";
    $totalGlobalQuestions = 100;
}

echo "\n📊 Total Questions Detected: {$totalGlobalQuestions}\n";
echo "⚙️ Generating all possible Paginated & Multi-Mode URLs...\n\n";

// ৪. মেইন হোম পেজের সকল পেজ জেনারেট করা (?page=1 to ?page=N)
$globalPages = max(1, (int)ceil($totalGlobalQuestions / $perPage));
for ($p = 1; $p <= $globalPages; $p++) {
    $pageQuery = ($p === 1) ? '' : '?page=' . $p;
    if ($p > 1) {
        addSitemapUrl($urls, $baseUrl . $pageQuery, 0.9, 'daily', $currentDate);
    }
    // মোড ভিত্তিক মেইন পেজ
    addSitemapUrl($urls, $baseUrl . '?mode=study' . ($p > 1 ? '&amp;page=' . $p : ''), 0.8, 'daily', $currentDate);
    addSitemapUrl($urls, $baseUrl . '?mode=quiz' . ($p > 1 ? '&amp;page=' . $p : ''), 0.8, 'daily', $currentDate);
}

// ৫. ক্যাটাগরি এবং টপিক ভিত্তিক ডিপ পেজিনেশন URL তৈরি
foreach ($categoriesTree as $catTitle => $catData) {
    $encodedCat = urlencode($catTitle);
    
    // ক) ক্যাটাগরি পেজিনেশন
    $catPages = max(1, (int)ceil($catData['total_questions'] / $perPage));
    for ($cp = 1; $cp <= $catPages; $cp++) {
        $catUrl = $baseUrl . '?cat=' . $encodedCat . ($cp > 1 ? '&amp;page=' . $cp : '');
        addSitemapUrl($urls, $catUrl, 0.85, 'weekly', $currentDate);
    }

    // খ) টপিক পেজিনেশন ও মাল্টি-মোড ইউআরএল
    foreach ($catData['topics'] as $topicTitle => $topicQCount) {
        $encodedTopic = urlencode($topicTitle);
        $topicPages = max(1, (int)ceil($topicQCount / $perPage));

        for ($tp = 1; $tp <= $topicPages; $tp++) {
            $pageSuffix = ($tp > 1) ? '&amp;page=' . $tp : '';

            // ১. ডিফল্ট কুইজ ভিউ পেজিনেশন লিঙ্ক
            $defaultTopicUrl = $baseUrl . '?cat=' . $encodedCat . '&amp;topic=' . $encodedTopic . $pageSuffix;
            addSitemapUrl($urls, $defaultTopicUrl, 0.8, 'weekly', $currentDate);

            // ২. স্পেসিফিক স্টাডি মোড লিঙ্ক (যেখানে উত্তর ও ব্যাখ্যা ওপেন থাকে - গুগলের জন্য সেরা)
            $studyTopicUrl = $baseUrl . '?mode=study&amp;cat=' . $encodedCat . '&amp;topic=' . $encodedTopic . $pageSuffix;
            addSitemapUrl($urls, $studyTopicUrl, 0.8, 'weekly', $currentDate);

            // ৩. স্পেসিফিক কুইজ মোড লিঙ্ক
            $quizTopicUrl = $baseUrl . '?mode=quiz&amp;cat=' . $encodedCat . '&amp;topic=' . $encodedTopic . $pageSuffix;
            addSitemapUrl($urls, $quizTopicUrl, 0.75, 'weekly', $currentDate);
        }

        // ৪. এই টপিকের মডেল টেস্ট এক্সাম মোড লিঙ্ক
        $examTopicUrl = $baseUrl . '?mode=exam&amp;cat=' . $encodedCat . '&amp;topic=' . $encodedTopic;
        addSitemapUrl($urls, $examTopicUrl, 0.75, 'weekly', $currentDate);
    }
}

// ৬. ডুপ্লিকেট লিঙ্ক ফিল্টার করা
$uniqueUrls = [];
$finalUrlList = [];
foreach ($urls as $u) {
    if (!isset($uniqueUrls[$u['loc']])) {
        $uniqueUrls[$u['loc']] = true;
        $finalUrlList[] = $u;
    }
}

// ৭. XML তৈরি ও সেভ করা
$xml = new DOMDocument('1.0', 'UTF-8');
$xml->formatOutput = true;

$urlset = $xml->createElement('urlset');
$urlset->setAttribute('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');
$urlset->setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
$urlset->setAttribute('xsi:schemaLocation', 'http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd');

foreach ($finalUrlList as $item) {
    $urlElem = $xml->createElement('url');

    $loc = $xml->createElement('loc', htmlspecialchars($item['loc'], ENT_XML1, 'UTF-8'));
    $urlElem->appendChild($loc);

    $lastmod = $xml->createElement('lastmod', $item['lastmod']);
    $urlElem->appendChild($lastmod);

    $changefreq = $xml->createElement('changefreq', $item['changefreq']);
    $urlElem->appendChild($changefreq);

    $priority = $xml->createElement('priority', $item['priority']);
    $urlElem->appendChild($priority);

    $urlset->appendChild($urlElem);
}

$xml->appendChild($urlset);

if ($xml->save($outputFile)) {
    $count = count($finalUrlList);
    echo "====================================================\n";
    echo "✅ [SUCCESS] MEGA Sitemap generated successfully!\n";
    echo "🔗 Total Deep Indexable URLs Added: {$count}\n";
    echo "📁 Saved file: {$outputFile}\n";
    echo "====================================================\n";
} else {
    echo "❌ [ERROR] Could not save sitemap.xml. Check write permissions.\n";
}