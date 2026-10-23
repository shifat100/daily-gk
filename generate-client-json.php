<?php

// কনফিগারেশন
$clientsDir = __DIR__ . '/clients';
$outputFile = __DIR__ . '/clients.json';

// পরিচিত কিছু প্ল্যাটফর্মের রেফারেন্স (যদি মিলে যায় তাহলে সুন্দর নাম দেখাবে)
$knownPlatforms = [
    'apk' => ['id' => 'android', 'name' => 'Android Package', 'category' => 'Mobile'],
    'bat' => ['id' => 'windows', 'name' => 'Windows Desktop Launcher', 'category' => 'Desktop'],
    'sh'  => ['id' => 'linux',   'name' => 'Linux Shell Launcher',   'category' => 'Desktop'],
    'jar' => ['id' => 'j2me',    'name' => 'Java Feature Phone MIDlet', 'category' => 'Feature Phone'],
    'vbm' => ['id' => 'mre',     'name' => 'MediaTek MRE Application', 'category' => 'Feature Phone'],
    'vxp' => ['id' => 'mre',     'name' => 'MediaTek MRE Application', 'category' => 'Feature Phone'],
    'exe' => ['id' => 'windows', 'name' => 'Windows Executable', 'category' => 'Desktop'],
    'zip' => ['id' => 'archive', 'name' => 'Zip Archive', 'category' => 'Package'],
];

if (!is_dir($clientsDir)) {
    die("Error: '{$clientsDir}' ফোল্ডারটি পাওয়া যায়নি।\n");
}

$results = [];

// clients ফোল্ডারের ভেতর সব সাব-ফোল্ডার স্ক্যান করবে
$directoryIterator = new RecursiveDirectoryIterator(
    $clientsDir, 
    FilesystemIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS
);
$iterator = new RecursiveIteratorIterator($directoryIterator);

$baseDir = rtrim(__DIR__, '/\\') . DIRECTORY_SEPARATOR;

foreach ($iterator as $fileInfo) {
    // ফোল্ডার বাদ দিয়ে শুধু ফাইল নেবে
    if (!$fileInfo->isFile()) {
        continue;
    }

    $extension = strtolower($fileInfo->getExtension());
    $fileName = $fileInfo->getFilename();
    
    // ফুল রিলেটিভ পাথ তৈরি (যেমন: clients/sub/file.xyz)
    $fullPath = str_replace([$baseDir, '\\'], ['', '/'], $fileInfo->getRealPath());

    // সাইজ হিসাব (KB)
    $sizeKb = round($fileInfo->getSize() / 1024, 1);

    // কোনো ফিল্টারিং ছাড়া ডেটা সেট করা
    if (isset($knownPlatforms[$extension])) {
        // পরিচিত ফাইল হলে নির্দিষ্ট নাম ও ক্যাটাগরি
        $id = $knownPlatforms[$extension]['id'];
        $name = $knownPlatforms[$extension]['name'];
        $category = $knownPlatforms[$extension]['category'];
    } else {
        // যেকোনো অজানা ফাইল/এক্সটেনশনের জন্য ডায়নামিক ডেটা
        $id = !empty($extension) ? $extension : 'file';
        $name = pathinfo($fileName, PATHINFO_FILENAME); // এক্সটেনশন ছাড়া ফাইলের নাম

        // যে সাব-ফোল্ডারে আছে তার নাম ক্যাটেগরি হবে (না থাকলে 'General')
        $folderPath = dirname($fullPath);
        $pathParts = explode('/', $folderPath);
        $category = (count($pathParts) > 1) ? ucfirst(end($pathParts)) : 'General';
    }

    // প্রতিটা ফাইল লিস্টে যোগ হবে (কোনো ফাইল ড্রপ হবে না)
    $results[] = [
        'id'       => $id,
        'name'     => $name,
        'category' => $category,
        'file'     => $fullPath,
        'size_kb'  => $sizeKb
    ];
}

// JSON ফাইলে সেভ করা
$jsonData = json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

if (file_put_contents($outputFile, $jsonData) !== false) {
    echo "সফলভাবে 'clients.json' তৈরি হয়েছে! মোট ফাইল যোগ হয়েছে: " . count($results) . " টি।\n";
} else {
    echo "Error: '{$outputFile}' ফাইলে লিখতে সমস্যা হচ্ছে। পারমিশন চেক করুন।\n";
}
