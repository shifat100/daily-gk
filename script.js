"use strict";

var app = {
    data: [],
    catFilter: 'all',
    searchQuery: '',
    mode: 'quiz',
    loading: true
};

window.onload = function() {
    initApp();
};

function initApp() {
    // ইভেন্ট সেটআপ
    document.getElementById('viewMode').onchange = function(e) { 
        app.mode = e.target.value; render(); 
    };
    document.getElementById('categorySelect').onchange = function(e) { 
        app.catFilter = e.target.value; 
        document.getElementById('searchInput').value = ''; 
        app.searchQuery = '';
        render(); 
    };
    document.getElementById('searchInput').onkeyup = function(e) { 
        app.searchQuery = e.target.value.toLowerCase(); render(); 
    };

    // ডাটা লোড শুরু
    startLoading();
}

function startLoading() {
    updateStatus("Loading Categories...");
    
    // মাদার ম্যানিফেস্ট লোড
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
