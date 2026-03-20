"use strict";

// ============ CONFIGURATION ============
var REPO_CONFIG = {
    base_url: 'https://raw.githubusercontent.com/shifat100/daily-gk/main/' 
};

// ============ APP STATE ============
var app = {
    // Data Storage
    rawData: [],        // Flat array of all questions
    treeData: {},       // { "Category": { "Topic": count, "total": count } }
    
    // Filter State
    filteredData: [],
    currCat: null,      // Current Category Name
    currTopic: null,    // Current Topic Name
    searchQuery: '',

    // Settings
    mode: 'quiz',       // 'quiz' or 'study'
    shuffle: false,
    
    // Pagination (List View)
    currentPage: 1,
    itemsPerPage: 10,   // KaiOS safe limit per render
    
    // UI State
    menuOpen: false,
    menuLevel: 'root',  // 'root' (Categories) or 'topic' (Topics inside Cat)
    selectedCatInMenu: null // Temp store when diving into topics
};

window.onload = function() {
    initApp();
    setupKeypad();
};

function initApp() {
    startDataLoad();
}

// ==========================================
// 1. DATA LOADING & PARSING
// ==========================================

function startDataLoad() {
    // Load main categories
    ajaxGet(REPO_CONFIG.base_url + 'data/main.json', function(cats) {
        var queue = [];
        // Initialize Tree
        for(var i=0; i<cats.length; i++) {
            app.treeData[cats[i].title] = { total: 0, topics: {} };
            queue.push({ path: cats[i].path, name: cats[i].title });
        }
        processQueue(queue, 0);
    }, function() {
        document.getElementById('loaderText').innerHTML = "<center><br><br><b>Connection Error</b>: Please Check Your Internet Connection or Update To Latest Version.</center>";
    });
}

function processQueue(list, index) {
    if (index >= list.length) {
        finishLoading();
        return;
    }
    
    var item = list[index]; // Category Item
    var loader = document.getElementById('loaderText');
    if(loader) loader.textContent = "Loading: " + item.name;
    
    ajaxGet(REPO_CONFIG.base_url + item.path, function(files) {
        var fileQueue = [];
        for(var j=0; j<files.length; j++) {
            // Use title from JSON or fallback to filename
            var tName = files[j].title || files[j].path.split('/').pop();
            fileQueue.push({ 
                url: REPO_CONFIG.base_url + files[j].path, 
                cat: item.name,
                topic: tName 
            });
        }
        loadMCQs(fileQueue, 0, function() {
            processQueue(list, index + 1);
        });
    }, function() {
        processQueue(list, index + 1);
    });
}

function loadMCQs(queue, idx, doneCallback) {
    if (idx >= queue.length) {
        doneCallback();
        return;
    }

    ajaxGet(queue[idx].url, function(text) {
        parseAndStore(text, queue[idx].cat, queue[idx].topic);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function() {
        loadMCQs(queue, idx + 1, doneCallback); // Skip on error
    }, true);
}

function parseAndStore(text, cat, topic) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var count = 0;

    for (var i = 0; i < lines.length; i += 2) {
        if (i + 1 >= lines.length) break;
        var line1 = lines[i].trim();
        var line2 = lines[i+1].trim();
        if(!line1 || !line2) continue;

        var parts = line2.split('|');
        if(parts.length > 0 && parts[parts.length-1] === '') parts.pop();

        var ans, desc, opts;
        var last = parts[parts.length-1];
        var secondLast = parts[parts.length-2];

        // Robust Parser
        if(!isNaN(last)) {
            ans = parseInt(last);
            desc = null;
            opts = parts.slice(0, parts.length-1);
        } else {
            desc = last;
            ans = parseInt(secondLast);
            opts = parts.slice(0, parts.length-2);
        }

        app.rawData.push({
            id: app.rawData.length,
            cat: cat,
            topic: topic,
            title: line1.replace(/\*\*/g, ''), 
            opts: opts,
            ans: ans,
            desc: desc
        });
        count++;
    }

    // Update Tree Counts
    if(app.treeData[cat]) {
        if(!app.treeData[cat].topics[topic]) app.treeData[cat].topics[topic] = 0;
        app.treeData[cat].topics[topic] += count;
        app.treeData[cat].total += count;
    }
}

function finishLoading() {
    document.getElementById('loader').classList.add('hidden');
    // Reverse data so newest is first by default
    //app.rawData.reverse();
    runFilter(); // Initial Render
}

// ==========================================
// 2. FILTER & LOGIC
// ==========================================

function runFilter() {
    // 1. Filtering
    var res = app.rawData.filter(function(q) {
        if (app.currCat && q.cat !== app.currCat) return false;
        if (app.currTopic && q.topic !== app.currTopic) return false;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        return true;
    });

    // 2. Shuffling (Only if enabled)
    if (app.shuffle) {
        // Simple Fisher-Yates for display array
        // We clone to not mess up rawData order permanently
        res = res.slice(0); 
        for (var i = res.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = res[i]; res[i] = res[j]; res[j] = temp;
        }
    }

    app.filteredData = res;
    app.currentPage = 1;
    setTimeout(renderList, 100);
    updateTitle();
}

function updateTitle() {
    var t = document.getElementById('appTitle');
    if(app.currTopic) t.textContent = app.currTopic;
    else if(app.currCat) t.textContent = app.currCat;
    else t.textContent = "GK Quiz";
}

// ==========================================
// 3. RENDERING (LIST VIEW)
// ==========================================

function renderList() {
    var container = document.getElementById('questionList');
    container.innerHTML = '';
    
    var total = app.filteredData.length;
    
    if(total === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center;">No questions found.</div>';
        document.getElementById('pagination').classList.add('hidden');
        document.getElementById('pageIndicator').textContent = "0/0";
        return;
    }

    var totalPages = Math.ceil(total / app.itemsPerPage);
    if(app.currentPage > totalPages) app.currentPage = totalPages;
    
    var start = (app.currentPage - 1) * app.itemsPerPage;
    var end = start + app.itemsPerPage;
    var pageItems = app.filteredData.slice(start, end);

    document.getElementById('pageIndicator').textContent = app.currentPage + '/' + totalPages + ' (' + total + ')';

    // Generate Cards
    for(var i=0; i<pageItems.length; i++) {
        createCard(pageItems[i], container, start + i + 1);
    }

    // Pagination UI
    var pagi = document.getElementById('pagination');
    pagi.classList.remove('hidden');
    document.getElementById('pagiText').textContent = app.currentPage + " / " + totalPages;
    
    // Scroll top
    document.getElementById('mainContainer').scrollTop = 0;
    
    // Focus first element
    var firstQ = container.querySelector('.opt-btn');
    if(firstQ && !app.menuOpen) firstQ.focus();

    // ===============================================
    // KAIAD FIX: Create specific container & load ad
    // ===============================================
    
    // 1. Create a unique ID for this specific ad render
    var uniqueAdId = 'kaiad-container-' + Date.now();
    
    // 2. Create the div element and append it to the bottom of the list
    var adDiv = document.createElement('div');
    adDiv.id = uniqueAdId;
    adDiv.style.width = '100%';
    adDiv.style.minHeight = '60px'; // Reserve space to prevent layout jump
    adDiv.style.display = 'flex';
    adDiv.style.justifyContent = 'center';
    adDiv.style.marginTop = '10px';
    container.appendChild(adDiv);

    
    getKaiAd({
        publisher: '080b82ab-b33a-4763-a498-50f464567e49',
        app: 'Daily-GK',
        slot: 'gk-slot-' + Math.floor(Math.random() * 1000000), 
        onerror: function (err) { 
            console.error('KaiAd Error:', err); 
        },
        onready: function (ad) { 
            ad.call('display'); 
        }
    });
}

function createCard(q, container, index) {
    var card = document.createElement('div');
    card.className = 'q-card';

    // Meta
    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = '<span>' + q.cat + '</span><span>#' + index + '</span>';
    card.appendChild(meta);

    // Title
    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    card.appendChild(h3);

    // Options
    var optsDiv = document.createElement('div');
    var feedBox = document.createElement('div');
    feedBox.className = 'feedback-box';
    feedBox.style.display = 'none';

    q.opts.forEach(function(opt, idx) {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;

        if(app.mode === 'study') {
            // STUDY MODE
            if(idx === q.ans) {
                btn.classList.add('correct');
                btn.innerHTML = '&#10004; ' + opt;
            }
            if(q.desc) {
                feedBox.style.display = 'block';
                feedBox.innerHTML = '<b>Exp:</b> ' + q.desc;
            }
        } else {
            // QUIZ MODE
            btn.onclick = function() {
                // Prevent multiple clicks
                if(btn.disabled) return;
                
                // Disable siblings
                var sibs = optsDiv.querySelectorAll('.opt-btn');
                sibs.forEach(function(s, sIdx) {
                    // s.disabled = true; // Don't use disabled attribute as it ruins focus
                    s.setAttribute('data-clicked', 'true');
                    if(sIdx === q.ans) s.classList.add('correct');
                });

                if(idx !== q.ans) {
                    btn.classList.add('wrong');
                    if(q.desc) {
                        feedBox.style.display = 'block';
                        feedBox.innerHTML = '<b>Ans:</b> ' + q.opts[q.ans] + '<br><b>Exp:</b> ' + q.desc;
                    } else {
                        feedBox.style.display = 'block';
                        feedBox.innerHTML = '<b>Correct:</b> ' + q.opts[q.ans];
                    }
                } else {
                     if(q.desc) {
                        feedBox.style.display = 'block';
                        feedBox.innerHTML = '<b>Exp:</b> ' + q.desc;
                    }
                }
                btn.focus(); // Keep focus
            };
        }
        optsDiv.appendChild(btn);
    });

    card.appendChild(optsDiv);
    card.appendChild(feedBox);
    container.appendChild(card);
}

// ==========================================
// 4. MENU & SETTINGS LOGIC
// ==========================================

function renderMenuRoot() {
    var list = document.getElementById('menuList');
    list.innerHTML = '';
    app.menuLevel = 'root';
    
    // 1. All Questions Option
    var allBtn = document.createElement('div');
    allBtn.className = 'menu-btn';
    allBtn.tabIndex = 0;
    allBtn.innerHTML = '<span>All Questions</span> <span class="badge">'+app.rawData.length+'</span>';
    allBtn.onclick = function() {
        app.currCat = null; app.currTopic = null;
        toggleMenu();
        runFilter();
    };
    list.appendChild(allBtn);

    // 2. Categories
    for(var cat in app.treeData) {
        (function(c) {
            var btn = document.createElement('div');
            btn.className = 'menu-btn';
            btn.tabIndex = 0;
            btn.innerHTML = '<span>'+c+'</span> <span class="badge">'+app.treeData[c].total+'</span>';
            
            // Highlight if selected
            if(app.currCat === c) btn.classList.add('selected-cat');

            btn.onclick = function() {
                app.selectedCatInMenu = c;
                renderMenuTopics(c);
            };
            list.appendChild(btn);
        })(cat);
    }
}

function renderMenuTopics(cat) {
    var list = document.getElementById('menuList');
    list.innerHTML = '';
    app.menuLevel = 'topic';

    // Header Back Button
    var backBtn = document.createElement('div');
    backBtn.className = 'menu-btn';
    backBtn.style.background = '#eee';
    backBtn.tabIndex = 0;
    backBtn.innerHTML = '<b>&laquo; Back to Categories</b>';
    backBtn.onclick = function() { renderMenuRoot(); };
    list.appendChild(backBtn);

    // "All in [Category]"
    var allCatBtn = document.createElement('div');
    allCatBtn.className = 'menu-btn';
    allCatBtn.tabIndex = 0;
    allCatBtn.innerHTML = '<span>All '+cat+'</span>';
    allCatBtn.onclick = function() {
        app.currCat = cat; app.currTopic = null;
        toggleMenu();
        runFilter();
    };
    list.appendChild(allCatBtn);

    // Topics
    var topics = app.treeData[cat].topics;
    for(var t in topics) {
        (function(topicName) {
            var btn = document.createElement('div');
            btn.className = 'menu-btn';
            btn.tabIndex = 0;
            btn.innerHTML = '<span>'+topicName+'</span> <span class="badge">'+topics[topicName]+'</span>';
            
            if(app.currTopic === topicName) btn.classList.add('selected-cat');

            btn.onclick = function() {
                app.currCat = cat;
                app.currTopic = topicName;
                toggleMenu();
                runFilter();
            };
            list.appendChild(btn);
        })(t);
    }
    
    // Focus first item
    if(list.children.length > 1) list.children[1].focus();
}

// ==========================================
// 5. KEYPAD & NAVIGATION
// ==========================================

function setupKeypad() {
    // Search Input Logic
    document.getElementById('menuSearch').addEventListener('input', function(e) {
        app.searchQuery = e.target.value.toLowerCase();
        // If searching, we reset filters to show all matches
        if(app.searchQuery.length > 0) {
            app.currCat = null; app.currTopic = null;
        }
    });

    document.getElementById('menuSearch').addEventListener('keydown', function(e) {
        if(e.key === 'Enter') {
            toggleMenu();
            runFilter();
        }
    });

    // Toggle Buttons Click Events
    document.getElementById('btnMode').onclick = function() {
        app.mode = (app.mode === 'quiz') ? 'study' : 'quiz';
        updateToggleUI();
        // If menu is closed later, we need to re-render questions to show/hide answers
        app.pendingRender = true; 
    };

    document.getElementById('btnShuffle').onclick = function() {
        app.shuffle = !app.shuffle;
        updateToggleUI();
        app.pendingRender = true;
    };

    // Global Key Listener
    document.addEventListener('keydown', function(e) {
        switch(e.key) {
            case 'SoftLeft':
            case 'F1': 
                toggleMenu();
                break;
           
            case 'ArrowUp':
            case 'ArrowDown':
                handleNav(e.key === 'ArrowDown' ? 1 : -1);
                e.preventDefault();
                break;
            case 'ArrowLeft':
                // Pagination Prev
                if(!app.menuOpen) {
                    if(app.currentPage > 1) { app.currentPage--;  setTimeout(renderList, 100); }
                }
                break;
            case 'ArrowRight':
                // Pagination Next
                if(!app.menuOpen) {
                    var max = Math.ceil(app.filteredData.length / app.itemsPerPage);
                    if(app.currentPage < max) { app.currentPage++;  setTimeout(renderList, 100); }
                }
                break;
            case 'Enter':
            case 'NumpadEnter':
                document.activeElement.click();
                break;
            case 'F2': case 'SoftRight':
                if(app.menuOpen) {
                    e.preventDefault();
                    if(app.menuLevel === 'topic') renderMenuRoot();
                    else toggleMenu();
                }
                break;
        }
    });
}

var btnnext = document.getElementById('btnNext');
var btnprev = document.getElementById('btnPrev');
btnnext.addEventListener('click', function() {
    if(app.currentPage < Math.ceil(app.filteredData.length / app.itemsPerPage)) {
        app.currentPage++;
         setTimeout(renderList, 100);
    }
});

btnprev.addEventListener('click', function() {
    if(app.currentPage > 1) {
        app.currentPage--;
         setTimeout(renderList, 100);
    }
});

function handleNav(dir) {
    // Select all focusable elements based on context
    var selector = app.menuOpen 
        ? '#controlsArea .menu-input, #controlsArea .toggle-btn, #controlsArea .menu-btn'
        : '.opt-btn, .nav-btn'; // Question options + pagination buttons
        
    var els = document.querySelectorAll(selector);
    var arr = Array.prototype.slice.call(els); // Convert to array
    
    // Filter out hidden elements
    arr = arr.filter(function(el) { return el.offsetParent !== null; });

    if(arr.length === 0) return;

    var cur = document.activeElement;
    var idx = arr.indexOf(cur);
    var next = idx + dir;

    if(next < 0) next = 0;
    if(next >= arr.length) next = arr.length - 1;

    arr[next].focus();
    arr[next].scrollIntoView({block: 'center'});
}

function toggleMenu() {
    var el = document.getElementById('controlsArea');
    app.menuOpen = !app.menuOpen;
    
    if(app.menuOpen) {
        el.classList.remove('hidden');
        renderMenuRoot();
        updateToggleUI();
        document.getElementById('menuSearch').focus();
        updateSoftKeys("Close", "Select", "");
    } else {
        el.classList.add('hidden');
        updateSoftKeys("Menu", "Select", "");
        
        // If settings changed, re-render
        if(app.pendingRender || app.searchQuery.length > 0) {
            app.pendingRender = false;
            runFilter();
        } else {
            // Restore focus to list
            var btn = document.querySelector('.opt-btn');
            if(btn) btn.focus();
        }
    }
}

function updateToggleUI() {
    var mBtn = document.getElementById('btnMode');
    var sBtn = document.getElementById('btnShuffle');
    
    mBtn.textContent = app.mode.toUpperCase();
    mBtn.className = 'toggle-btn ' + (app.mode === 'study' ? 'on' : '');
    
    sBtn.textContent = app.shuffle ? 'ON' : 'OFF';
    sBtn.className = 'toggle-btn ' + (app.shuffle ? 'on' : '');
}

function updateSoftKeys(l, c, r) {
    document.getElementById('softLeft').textContent = l;
    document.getElementById('softCenter').textContent = c;
    document.getElementById('softRight').textContent = r;
}

function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?t=' + Date.now(), true);
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                success(isText ? xhr.responseText : JSON.parse(xhr.responseText));
            } catch(e) { if(error) error(e); }
        } else { if(error) error(); }
    };
    xhr.onerror = function() { if(error) error(); };
    try { xhr.send(); } catch(e) { if(error) error(); }
}