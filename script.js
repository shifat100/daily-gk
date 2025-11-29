"use strict";

var app = {
    data: [],
    catFilter: 'all',
    searchQuery: '',
    mode: 'quiz',
    loading: true,
    lastModified: null // সর্বশেষ আপডেটের তারিখ রাখার জন্য
};

window.onload = function() {
    initApp();
};

function initApp() {
    // ডাইনামিক UI এলিমেন্ট তৈরি (ফুটার এবং লোডার)
    createDynamicUI();

    // ইভেন্ট সেটআপ
    var viewModeEl = document.getElementById('viewMode');
    if(viewModeEl) {
        viewModeEl.onchange = function(e) { 
            app.mode = e.target.value; render(); 
        };
    }

    var catSelectEl = document.getElementById('categorySelect');
    if(catSelectEl) {
        catSelectEl.onchange = function(e) { 
            app.catFilter = e.target.value; 
            document.getElementById('searchInput').value = ''; 
            app.searchQuery = '';
            render(); 
        };
    }

    var searchInputEl = document.getElementById('searchInput');
    if(searchInputEl) {
        searchInputEl.onkeyup = function(e) { 
            app.searchQuery = e.target.value.toLowerCase(); render(); 
        };
    }

    // ডাটা লোড শুরু
    startLoading();
}

// ========== DYNAMIC UI GENERATION ==========

function createDynamicUI() {
    // ১. বটম লেফট লোডার তৈরি
    var loader = document.createElement('div');
    loader.id = 'floatingLoader';
    // ইনলাইন স্টাইল দিয়ে পজিশন সেট করা হলো
    loader.style.cssText = "position: fixed; bottom: 15px; left: 15px; background: rgba(0, 0, 0, 0.8); color: #fff; padding: 8px 12px; border-radius: 4px; font-size: 12px; font-family: sans-serif; z-index: 9999; display: none; box-shadow: 0 2px 5px rgba(0,0,0,0.3);";
    loader.textContent = "Initializing...";
    document.body.appendChild(loader);

    // ২. ফুটার তৈরি (কপিরাইট + লাস্ট আপডেট)
    var footer = document.createElement('div');
    footer.id = 'appFooter';
    footer.style.cssText = "text-align: center; margin: 40px 0 20px 0; font-size: 0.85em; color: #777; border-top: 1px solid #eee; padding-top: 20px;";
    
    var currentYear = new Date().getFullYear();
    footer.innerHTML = `
        <div>&copy; ${currentYear} All Rights Reserved.</div>
        <div style="margin-top: 5px;">Last Updated: <span id="lastUpdateDate" style="font-weight: bold;">Calculating...</span></div>
    `;
    
    // মেইন কন্টেইনারের পরে বা বডির শেষে যুক্ত করুন
    var container = document.getElementById('questionList');
    if(container && container.parentNode) {
        container.parentNode.appendChild(footer);
    } else {
        document.body.appendChild(footer);
    }
}

// ========== DATA LOADING ==========

function startLoading() {
    // আগের বড় লোডার হাইড করে দিন যদি থাকে
    var bigLoader = document.getElementById('loader');
    if(bigLoader) bigLoader.style.display = 'none';

    updateStatus("Connecting to server...");
    
    // মাদার ম্যানিফেস্ট লোড
    ajaxGet('data/main.json', function(cats) {
        var catSelect = document.getElementById('categorySelect');
        var manifestQueue = [];

        // ক্যাটাগরি ড্রপডাউন পপুলেট করা
        if(catSelect) {
            for(var i=0; i<cats.length; i++) {
                var opt = document.createElement('option');
                opt.value = cats[i].title;
                opt.textContent = cats[i].title;
                catSelect.appendChild(opt);
                manifestQueue.push({ path: cats[i].path, name: cats[i].title });
            }
        } else {
            // যদি সিলেক্ট বক্স না থাকে, তবুও লোড হবে
            for(var i=0; i<cats.length; i++) {
                manifestQueue.push({ path: cats[i].path, name: cats[i].title });
            }
        }

        // চেইন লোডিং শুরু
        processManifestQueue(manifestQueue, 0);

    }, function(err) {
        showError("Failed to load 'data/main.json'. Check file path.");
    });
}

function processManifestQueue(list, index) {
    if (index >= list.length) {
        finishLoading(); // সব শেষ
        return;
    }

    var item = list[index];
    updateStatus("Checking Category: " + item.name + "...");

    ajaxGet(item.path, function(files) {
        var mcqQueue = [];
        for(var j=0; j<files.length; j++) {
            mcqQueue.push({ url: files[j].path, cat: item.name });
        }
        
        loadMCQs(mcqQueue, 0, function() {
            processManifestQueue(list, index + 1);
        });

    }, function(err) {
        console.warn("Skipping category due to error: " + item.path);
        processManifestQueue(list, index + 1);
    });
}

function loadMCQs(queue, idx, doneCallback) {
    if (idx >= queue.length) {
        doneCallback();
        return;
    }

    // ইউজারকে রিয়েলটাইম দেখানো হচ্ছে কোন ফাইল লোড হচ্ছে
    updateStatus("Loading data: " + queue[idx].url.split('/').pop());

    ajaxGet(queue[idx].url, function(text) {
        parseMCQ(text, queue[idx].cat);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function(err) {
        console.warn("Skipping file: " + queue[idx].url);
        loadMCQs(queue, idx + 1, doneCallback);
    }, true); // true = isText
}

function parseMCQ(text, cat) {
    var lines = text.split('\n');
    if(lines.length < 2) return;

    var title = lines[0].replace(/\*\*/g, '').trim();
    var parts = lines[1].split('|');
    if(parts.length >= 6) {
        app.data.push({
            cat: cat,
            title: title,
            opts: [parts[0], parts[1], parts[2], parts[3]],
            ans: parseInt(parts[4]) - 1,
            desc: parts[5]
        });
    }
}

function finishLoading() {
    // লোডার লুকানো
    var loader = document.getElementById('floatingLoader');
    if(loader) {
        loader.textContent = "Done!";
        setTimeout(function() { loader.style.display = 'none'; }, 2000);
    }
    
    if (app.data.length === 0) {
        showError("No questions loaded. Please check your data folder.");
        return;
    }

    // Latest First
    app.data.reverse();
    render();
}

// ========== LAST MODIFIED LOGIC ==========

function checkLatestDate(headerDate) {
    if(!headerDate) return;

    var fileDate = new Date(headerDate);
    
    // যদি বর্তমান সেভ করা ডেটের চেয়ে নতুন ফাইলের ডেট বড় হয়
    if (!app.lastModified || fileDate > app.lastModified) {
        app.lastModified = fileDate;
        updateFooterDate();
    }
}

function updateFooterDate() {
    var el = document.getElementById('lastUpdateDate');
    if(el && app.lastModified) {
        // সুন্দর ফরম্যাটে ডেট দেখানো (যেমন: Nov 29, 2025)
        var options = { year: 'numeric', month: 'short', day: 'numeric' };
        el.textContent = app.lastModified.toLocaleDateString('en-US', options);
    }
}

// ========== UI RENDERING ==========

function render() {
    var container = document.getElementById('questionList');
    if(!container) return; // HTML এ আইডি না থাকলে এরর যাতে না দেয়

    container.innerHTML = '';
    var count = 0;
    
    for (var i = 0; i < app.data.length; i++) {
        var q = app.data[i];
        
        if (app.catFilter !== 'all' && q.cat !== app.catFilter) continue;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) continue;

        count++;
        createCard(q, container);
    }

    if(count === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No matching questions found.</div>';
    }
}

function createCard(q, container) {
    var card = document.createElement('div');
    card.className = 'q-card';

    var header = document.createElement('div');
    header.className = 'q-header';
    header.innerHTML = '<span class="cat-label">' + q.cat + '</span>';
    card.appendChild(header);

    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    card.appendChild(h3);

    var optsDiv = document.createElement('div');
    
    var feedBox = document.createElement('div');
    feedBox.className = 'feedback-box';
    feedBox.style.display = 'none';

    var feedbackHTML = '';
    if (app.mode === 'study') {
        feedbackHTML = '<b>Correct Answer: ' + q.opts[q.ans] + '</b><br><br>' + q.desc;
        feedBox.style.display = 'block'; 
    } else {
        feedbackHTML = '<b>Explanation:</b> ' + q.desc;
    }
    feedBox.innerHTML = feedbackHTML;

    for (var j = 0; j < q.opts.length; j++) {
        (function(idx) {
            var btn = document.createElement('button');
            btn.className = 'opt-btn';
            
            if (app.mode === 'study') {
                btn.textContent = q.opts[idx];
                btn.disabled = true;
                if (idx === q.ans) {
                    btn.className += ' correct';
                    btn.innerHTML += ' &#10004;';
                }
            } else {
                btn.textContent = q.opts[idx];
                btn.onclick = function() {
                    var siblings = optsDiv.getElementsByTagName('button');
                    for(var k=0; k<siblings.length; k++) {
                        siblings[k].disabled = true;
                        if(k === q.ans) siblings[k].className += ' correct';
                    }
                    
                    if(idx !== q.ans) this.className += ' wrong';
                    feedBox.style.display = 'block';
                };
            }
            optsDiv.appendChild(btn);
        })(j);
    }

    card.appendChild(optsDiv);
    card.appendChild(feedBox);
    container.appendChild(card);
}

// ========== UTILS & ERROR HANDLING ==========

function updateStatus(msg) {
    var el = document.getElementById('floatingLoader');
    if(el) {
        el.style.display = 'block';
        el.textContent = msg;
    }
}

function showError(msg) {
    // লোডার হাইড
    var loader = document.getElementById('floatingLoader');
    if(loader) loader.style.display = 'none';

    var errDiv = document.getElementById('errorMsg');
    if(errDiv) {
        errDiv.style.display = 'block';
        errDiv.textContent = "Error: " + msg;
    } else {
        alert("Error: " + msg);
    }
}

// AJAX function with Date Checking
function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    // Cache bust করার জন্য টাইমস্ট্যাম্প যোগ করা হলো যাতে ফ্রেশ ডেটা আসে
    var freshUrl = url + '?t=' + new Date().getTime(); 
    xhr.open('GET', freshUrl, true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            // ১. Last-Modified হেডার চেক করা
            var lastMod = xhr.getResponseHeader("Last-Modified");
            checkLatestDate(lastMod);

            try {
                var data = isText ? xhr.responseText : JSON.parse(xhr.responseText);
                success(data);
            } catch (e) {
                if (error) error(e);
            }
        } else {
            if (error) error(new Error("HTTP " + xhr.status));
        }
    };

    xhr.onerror = function() {
        if (error) error(new Error("Network Error"));
    };

    try {
        xhr.send();
    } catch(e) {
        if(error) error(e);
    }
                             }    // মাদার ম্যানিফেস্ট লোড
    ajaxGet('data/main.json', function(cats) {
        var catSelect = document.getElementById('categorySelect');
        var manifestQueue = [];

        // ক্যাটাগরি সেটআপ
        for(var i=0; i<cats.length; i++) {
            var opt = document.createElement('option');
            opt.value = cats[i].title;
            opt.textContent = cats[i].title;
            catSelect.appendChild(opt);

            manifestQueue.push({ path: cats[i].path, name: cats[i].title });
        }

        // চেইন লোডিং শুরু
        processManifestQueue(manifestQueue, 0);

    }, function(err) {
        // যদি মাদার ফাইলই না পাওয়া যায়
        showError("Failed to load 'data/mother.json'. Check file path.");
    });
}

// রিকার্সিভ ফাংশন যা থামবে না
function processManifestQueue(list, index) {
    if (index >= list.length) {
        finishLoading(); // সব শেষ
        return;
    }

    var item = list[index];
    updateStatus("Loading: " + item.name);

    ajaxGet(item.path, function(files) {
        // চাইল্ড ম্যানিফেস্ট পাওয়া গেছে, এখন এর ভেতরের MCQ ফাইলগুলো লোড হবে
        var mcqQueue = [];
        for(var j=0; j<files.length; j++) {
            mcqQueue.push({ url: files[j].path, cat: item.name });
        }
        
        loadMCQs(mcqQueue, 0, function() {
            // এই ক্যাটাগরি শেষ, পরেরটায় যান
            processManifestQueue(list, index + 1);
        });

    }, function(err) {
        // চাইল্ড ম্যানিফেস্ট মিসিং? সমস্যা নেই, পরেরটায় যান
        console.warn("Skipping category due to error: " + item.path);
        processManifestQueue(list, index + 1);
    });
}

function loadMCQs(queue, idx, doneCallback) {
    if (idx >= queue.length) {
        doneCallback();
        return;
    }

    ajaxGet(queue[idx].url, function(text) {
        // ফাইল সাকসেস
        parseMCQ(text, queue[idx].cat);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function(err) {
        // ফাইল ফেইল (404), স্কিপ করুন
        console.warn("Skipping file: " + queue[idx].url);
        loadMCQs(queue, idx + 1, doneCallback);
    }, true); // true = isText
}

function parseMCQ(text, cat) {
    var lines = text.split('\n');
    if(lines.length < 2) return;

    var title = lines[0].replace(/\*\*/g, '').trim();
    var parts = lines[1].split('|');
    if(parts.length >= 6) {
        app.data.push({
            cat: cat,
            title: title,
            opts: [parts[0], parts[1], parts[2], parts[3]],
            ans: parseInt(parts[4]) - 1,
            desc: parts[5]
        });
    }
}

function finishLoading() {
    document.getElementById('statusArea').style.display = 'none';
    
    if (app.data.length === 0) {
        showError("No questions loaded. Please check your data folder.");
        return;
    }

    // Latest First
    app.data.reverse();
    render();
}

// ========== UI RENDERING ==========

function render() {
    var container = document.getElementById('questionList');
    container.innerHTML = '';
    
    var count = 0;
    
    for (var i = 0; i < app.data.length; i++) {
        var q = app.data[i];
        
        // Filter
        if (app.catFilter !== 'all' && q.cat !== app.catFilter) continue;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) continue;

        count++;
        createCard(q, container);
    }

    if(count === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No matching questions found.</div>';
    }
}

function createCard(q, container) {
    var card = document.createElement('div');
    card.className = 'q-card';

    // Header
    var header = document.createElement('div');
    header.className = 'q-header';
    header.innerHTML = '<span class="cat-label">' + q.cat + '</span>';
    card.appendChild(header);

    // Title
    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    card.appendChild(h3);

    // Option Area
    var optsDiv = document.createElement('div');
    
    // Feedback Box
    var feedBox = document.createElement('div');
    feedBox.className = 'feedback-box';
    feedBox.style.display = 'none';

    // Set Feedback Content
    var feedbackHTML = '';
    if (app.mode === 'study') {
        feedbackHTML = '<b>Correct Answer: ' + q.opts[q.ans] + '</b><br><br>' + q.desc;
        feedBox.style.display = 'block'; // Always show in study mode
    } else {
        feedbackHTML = '<b>Explanation:</b> ' + q.desc;
    }
    feedBox.innerHTML = feedbackHTML;

    // Generate Buttons
    for (var j = 0; j < q.opts.length; j++) {
        (function(idx) {
            var btn = document.createElement('button');
            btn.className = 'opt-btn';
            
            if (app.mode === 'study') {
                btn.textContent = q.opts[idx];
                btn.disabled = true;
                if (idx === q.ans) {
                    btn.className += ' correct';
                    btn.innerHTML += ' &#10004;';
                }
            } else {
                // Quiz Mode
                btn.textContent = q.opts[idx];
                btn.onclick = function() {
                    // Disable siblings
                    var siblings = optsDiv.getElementsByTagName('button');
                    for(var k=0; k<siblings.length; k++) {
                        siblings[k].disabled = true;
                        if(k === q.ans) siblings[k].className += ' correct';
                    }
                    
                    if(idx !== q.ans) this.className += ' wrong';
                    
                    feedBox.style.display = 'block';
                };
            }
            optsDiv.appendChild(btn);
        })(j);
    }

    card.appendChild(optsDiv);
    card.appendChild(feedBox);
    container.appendChild(card);
}

// ========== UTILS & ERROR HANDLING ==========

function updateStatus(msg) {
    var el = document.getElementById('loadingText');
    if(el) el.textContent = msg;
}

function showError(msg) {
    document.getElementById('loader').style.display = 'none';
    var errDiv = document.getElementById('errorMsg');
    errDiv.style.display = 'block';
    errDiv.textContent = "Error: " + msg;
}

// Robust AJAX function
function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var data = isText ? xhr.responseText : JSON.parse(xhr.responseText);
                success(data);
            } catch (e) {
                if (error) error(e); // JSON Parse Error
            }
        } else {
            if (error) error(new Error("HTTP " + xhr.status)); // 404 Not Found
        }
    };

    xhr.onerror = function() {
        if (error) error(new Error("Network Error")); // Connection failed
    };

    try {
        xhr.send();
    } catch(e) {
        if(error) error(e);
    }
}
