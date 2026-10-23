<?php

// Directories & Output configuration
$clientsDir = __DIR__ . '/clients';
$outputFile = __DIR__ . '/clients.json';

// Extension-to-Metadata mapping rules
$platformRules = [
    'apk' => [
        'id'       => 'android',
        'name'     => 'Android Package',
        'category' => 'Mobile'
    ],
    'bat' => [
        'id'       => 'windows',
        'name'     => 'Windows Desktop Launcher',
        'category' => 'Desktop'
    ],
    'sh' => [
        'id'       => 'linux',
        'name'     => 'Linux Shell Launcher',
        'category' => 'Desktop'
    ],
    'jar' => [
        'id'       => 'j2me',
        'name'     => 'Java Feature Phone MIDlet',
        'category' => 'Feature Phone'
    ],
    'vbm' => [
        'id'       => 'mre',
        'name'     => 'MediaTek MRE VXP Application',
        'category' => 'Feature Phone'
    ],
    'vxp' => [
        'id'       => 'mre',
        'name'     => 'MediaTek MRE VXP Application',
        'category' => 'Feature Phone'
    ]
];

if (!is_dir($clientsDir)) {
    die("Error: Directory '{$clientsDir}' not found.\n");
}

$results = [];

// Recursively traverse all subdirectories under 'clients'
$directoryIterator = new RecursiveDirectoryIterator(
    $clientsDir, 
    FilesystemIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS
);
$iterator = new RecursiveIteratorIterator($directoryIterator);

$baseDir = rtrim(__DIR__, '/\\') . DIRECTORY_SEPARATOR;

foreach ($iterator as $fileInfo) {
    if (!$fileInfo->isFile()) {
        continue;
    }

    $extension = strtolower($fileInfo->getExtension());

    if (isset($platformRules[$extension])) {
        $rule = $platformRules[$extension];
        
        // Calculate file size in KB
        $sizeBytes = $fileInfo->getSize();
        $sizeKb = round($sizeBytes / 1024, 1);

        // Normalize full relative path (e.g., clients/subfolder/file.ext)
        $fullPath = str_replace([$baseDir, '\\'], ['', '/'], $fileInfo->getRealPath());

        $results[] = [
            'id'       => $rule['id'],
            'name'     => $rule['name'],
            'category' => $rule['category'],
            'file'     => $fullPath,
            'size_kb'  => $sizeKb
        ];
    }
}

// Write to clients.json
$jsonData = json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

if (file_put_contents($outputFile, $jsonData) !== false) {
    echo "Successfully generated 'clients.json' (" . count($results) . " files found).\n";
} else {
    echo "Error writing to '{$outputFile}'.\n";
}
