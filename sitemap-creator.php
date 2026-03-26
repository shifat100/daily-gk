<?php
/**
 * Auto Sitemap Generator for SPA
 * Fetches JSON structure and text files from GitHub to generate SEO-friendly URLs.
 */

// ==========================================
// CONFIGURATION
// ==========================================
$SITE_URL = "https://shifat100.github.io/daily-gk"; // Must include the trailing slash
$GITHUB_USERNAME = "shifat100";
$GITHUB_REPO = "daily-gk";
$GITHUB_BRANCH = "main"; // Usually 'main' or 'master'
$PER_PAGE = 10; // Must match the 'app.perPage' in your script.js
$SITEMAP_FILE = "sitemap.xml"; // Output file

// Build the base RAW GitHub URL
$RAW_BASE_URL = "https://raw.githubusercontent.com/{$GITHUB_USERNAME}/{$GITHUB_REPO}/{$GITHUB_BRANCH}/";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Fetch content using cURL (Better than file_get_contents for external URLs)
 */
function fetchFromGithub($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Sitemap-Generator-Bot');
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $data = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return ($http_code == 200) ? $data : false;
}

/**
 * Calculate total pages for a topic by counting questions in the txt file
 */
function calculateTotalPages($txt_url, $per_page) {
    $content = fetchFromGithub($txt_url);
    if (!$content) return 1; // Default to 1 page if fail

    // Split text into lines, ignoring empty lines
    $lines = explode("\n", str_replace("\r", "", trim($content)));
    $valid_lines = 0;
    
    foreach($lines as $line) {
        if (trim($line) !== '') {
            $valid_lines++;
        }
    }

    // Your JS parses 2 lines = 1 Question
    $total_questions = floor($valid_lines / 2);
    if ($total_questions == 0) return 1;

    return ceil($total_questions / $per_page);
}

// ==========================================
// MAIN LOGIC
// ==========================================

$urls = [];
$current_date = date('Y-m-d');

echo "Starting sitemap generation...<br>";

// 1. Add the Homepage URL
$urls[] = [
    'loc' => $SITE_URL,
    'priority' => '1.0'
];

// 2. Fetch the Root main.json
$main_json_url = $RAW_BASE_URL . "data/main.json";
$main_data = fetchFromGithub($main_json_url);

if ($main_data) {
    $categories = json_decode($main_data, true);
    
    foreach ($categories as $cat) {
        // Encode URL parameters (e.g., "General Science" becomes "General+Science")
        $cat_title = urlencode($cat['title']);
        
        // Add Category URL
        $urls[] = [
            'loc' => $SITE_URL . "?cat=" . $cat_title,
            'priority' => '0.8'
        ];

        // 3. Fetch Category Topics JSON
        $cat_json_url = $RAW_BASE_URL . $cat['path'];
        $cat_data = fetchFromGithub($cat_json_url);
        
        if ($cat_data) {
            $topics = json_decode($cat_data, true);
            
            foreach ($topics as $topic) {
                $topic_title = urlencode($topic['title']);
                
                // Add Base Topic URL (Implicitly Page 1)
                $urls[] = [
                    'loc' => $SITE_URL . "?cat=" . $cat_title . "&topic=" . $topic_title,
                    'priority' => '0.9'
                ];
                
                // 4. Calculate Pagination
                // Fetch the actual text file to count lines and generate paginated URLs
                $txt_url = $RAW_BASE_URL . $topic['path'];
                $total_pages = calculateTotalPages($txt_url, $PER_PAGE);
                
                // Add page=2, page=3, etc.
                for ($p = 2; $p <= $total_pages; $p++) {
                    $urls[] = [
                        'loc' => $SITE_URL . "?cat=" . $cat_title . "&topic=" . $topic_title . "&page=" . $p,
                        'priority' => '0.6' // Lower priority for deep pagination
                    ];
                }
            }
        }
    }
} else {
    die("Error: Could not fetch data/main.json from GitHub.");
}

// ==========================================
// GENERATE XML
// ==========================================
$xml = '<?xml version="1.0" encoding="UTF-8"?>' . PHP_EOL;
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . PHP_EOL;

foreach ($urls as $u) {
    $xml .= "  <url>\n";
    $xml .= "    <loc>" . htmlspecialchars($u['loc']) . "</loc>\n";
    $xml .= "    <lastmod>" . $current_date . "</lastmod>\n";
    $xml .= "    <changefreq>weekly</changefreq>\n";
    $xml .= "    <priority>" . $u['priority'] . "</priority>\n";
    $xml .= "  </url>\n";
}

$xml .= '</urlset>';

// Save to root directory
if (file_put_contents(__DIR__ . '/' . $SITEMAP_FILE, $xml)) {
    echo "<h2>✅ Success!</h2>";
    echo "<p>Sitemap generated with <strong>" . count($urls) . "</strong> URLs.</p>";
    echo "<p><a href='{$SITEMAP_FILE}' target='_blank'>View sitemap.xml</a></p>";
} else {
    echo "<h2>❌ Error!</h2>";
    echo "<p>Failed to save sitemap.xml. Please check folder permissions.</p>";
}
?>
