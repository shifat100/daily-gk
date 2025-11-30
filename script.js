"use strict";

var app = {
    data: [],           // All questions
    filteredData: [],   // Currently viewing
    treeData: {},       // Hierarchical data for sidebar
    
    // State
    currCat: null,
    currTopic: null,
    mode: 'quiz',
    shuffle: false,
    searchQuery: '',
    
    // Pagination
    page: 1,
    perPage: 10
};

window.onload = function() {
    initApp();
};

function initApp() {
    setupEventListeners();
    renderSkeleton(); // Show realtime load effect immediately
    startDataLoad();
}

// ========== 1. SETUP & EVENTS ==========

function setupEventListeners() {
    // Mobile Menu
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('appSidebar');
    var overlay = document.getElementById('sidebarOverlay');

    function closeMenu() {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    }

    toggle.onclick = function() {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
    };
    overlay.onclick = closeMenu;

    // View Mode
    document.getElementById('viewMode').onchange = function(e) {
        app.mode = e.target.value;
        app.page = 1; // Reset page but keep filter
        render();
    };

    // Search (Debounced)
    var timeout;
    document.getElementById('searchInput').onkeyup = function(e) {
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            app.searchQuery = e.target.value.toLowerCase();
            app.page = 1;
            runFilter();
        }, 300);
    };

    // Shuffle
    document.getElementById('shuffleCheck').onchange = function(e) {
        app.shuffle = e.target.checked;
        app.page = 1;
        runFilter();
    };
}

// ========== 2. DATA LOADING ==========

function startDataLoad() {
    ajaxGet('data/main.json', function(cats) {
        var queue = [];
        // Init Tree Structure
        for(var i=0; i<cats.length; i++) {
            app.treeData[cats[i].title] = {};
            queue.push({ path: cats[i].path, name: cats[i].title });
        }
        processQueue(queue, 0);
    });
}

function processQueue(list, index) {
    if (index >= list.length) {
        finishLoading();
        return;
    }
    
    var item = list[index];
    ajaxGet(item.path, function(files) {
        var fileQueue = [];
        for(var j=0; j<files.length; j++) {
            fileQueue.push({ url: files[j].path, cat: item.name });
        }
        loadMCQs(fileQueue, 0, function() {
            processQueue(list, index + 1);
        });
    });
}

function loadMCQs(queue, idx, doneCallback) {
    if (idx >= queue.length) {
        doneCallback();
        return;
    }

    // Extract Topic Name from filename (e.g. 'ancient_history.txt' -> 'ANCIENT HISTORY')
    var urlParts = queue[idx].url.split('/');
    var fileName = urlParts[urlParts.length - 1];
    var topic = fileName.replace('.txt','').replace(/_/g, ' ').toUpperCase();

    ajaxGet(queue[idx].url, function(text) {
        parseAndStore(text, queue[idx].cat, topic);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function() {
        loadMCQs(queue, idx + 1, doneCallback); // Skip error
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

        if(!isNaN(last)) {
            ans = parseInt(last);
            desc = null;
            opts = parts.slice(0, parts.length-1);
        } else {
            desc = last;
            ans = parseInt(secondLast);
            opts = parts.slice(0, parts.length-2);
        }

        app.data.push({
            id: app.data.length,
            cat: cat,
            topic: topic,
            title: line1.replace(/\*\*/g, ''),
            opts: opts,
            ans: ans,
            desc: desc
        });
        count++;
    }

    // Add to Tree Counts
    if(!app.treeData[cat][topic]) app.treeData[cat][topic] = 0;
    app.treeData[cat][topic] += count;
}

function finishLoading() {
    buildSidebarTree();
    runFilter();
}

// ========== 3. SIDEBAR TREE ==========

function buildSidebarTree() {
    var ul = document.getElementById('categoryTree');
    ul.innerHTML = '';

    // "All" Button
    var allLi = document.createElement('li');
    allLi.className = 'tree-item';
    allLi.innerHTML = '<div class="tree-parent"><span>All Questions</span> <span class="badge">'+app.data.length+'</span></div>';
    allLi.onclick = function() { 
        setFilter(null, null); 
        closeMobileMenu(); 
    };
    ul.appendChild(allLi);

    for (var cat in app.treeData) {
        var topics = app.treeData[cat];
        var catTotal = 0;
        for(var t in topics) catTotal += topics[t];

        var li = document.createElement('li');
        li.className = 'tree-item';

        // Parent Header
        var header = document.createElement('div');
        header.className = 'tree-parent';
        header.innerHTML = '<span>' + cat + '</span> <span class="badge">' + catTotal + '</span>';
        
        // Children Container
        var childUl = document.createElement('ul');
        childUl.className = 'tree-children';

        // "All in Category"
        var subAll = document.createElement('li');
        subAll.className = 'tree-child';
        subAll.textContent = "All " + cat;
        subAll.onclick = (function(c) {
            return function() { setFilter(c, null); closeMobileMenu(); };
        })(cat);
        childUl.appendChild(subAll);

        // Specific Topics
        for (var topic in topics) {
            var topicLi = document.createElement('li');
            topicLi.className = 'tree-child';
            topicLi.innerHTML = topic + ' <span style="font-size:0.8em; opacity:0.7;">(' + topics[topic] + ')</span>';
            
            topicLi.onclick = (function(c, t) {
                return function(e) {
                    // Highlight Active
                    var all = document.querySelectorAll('.tree-child');
                    for(var k=0; k<all.length; k++) all[k].classList.remove('active');
                    e.target.classList.add('active');
                    
                    setFilter(c, t);
                    closeMobileMenu();
                    e.stopPropagation();
                };
            })(cat, topic);
            childUl.appendChild(topicLi);
        }

        // Toggle Logic
        header.onclick = function() {
            var sibling = this.nextElementSibling;
            sibling.classList.toggle('open');
            this.style.backgroundColor = sibling.classList.contains('open') ? '#f0f0f0' : '#fff';
        };

        li.appendChild(header);
        li.appendChild(childUl);
        ul.appendChild(li);
    }
}

function closeMobileMenu() {
    document.getElementById('appSidebar').classList.remove('show');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// ========== 4. FILTERING & LOGIC ==========

function setFilter(cat, topic) {
    app.currCat = cat;
    app.currTopic = topic;
    app.page = 1;
    app.searchQuery = '';
    document.getElementById('searchInput').value = '';
    
    // Update Header
    var header = document.getElementById('topicHeader');
    var name = document.getElementById('topicName');
    header.style.display = 'block';
    if(!cat) name.textContent = "All Questions";
    else if(!topic) name.textContent = cat + " (All)";
    else name.textContent = cat + " > " + topic;

    runFilter();
}

function runFilter() {
    renderSkeleton(); // Show loading effect

    // Slight delay to simulate realtime load feeling
    setTimeout(function() {
        var res = app.data.filter(function(q) {
            if (app.currCat && q.cat !== app.currCat) return false;
            if (app.currTopic && q.topic !== app.currTopic) return false;
            if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
            return true;
        });

        if (app.shuffle) {
            // Fisher-Yates
            for (var i = res.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = res[i]; res[i] = res[j]; res[j] = temp;
            }
        } else {
            res.sort(function(a,b){ return a.id - b.id; });
        }

        app.filteredData = res;
        render();
    }, 200); // 200ms delay for smoothness
}

// ========== 5. RENDER & SKELETON ==========

function renderSkeleton() {
    var container = document.getElementById('questionList');
    var html = '';
    // Generate 3 skeleton cards
    for(var i=0; i<3; i++) {
        html += `
        <div class="skeleton-card">
            <div class="sk-line sk-title"></div>
            <div class="sk-line sk-opt"></div>
            <div class="sk-line sk-opt"></div>
            <div class="sk-line sk-opt"></div>
        </div>`;
    }
    container.innerHTML = html;
}

function render() {
    var container = document.getElementById('questionList');
    container.innerHTML = '';
    
    if(app.filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#777;">No questions found.</div>';
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    // Pagination Logic
    var totalPages = Math.ceil(app.filteredData.length / app.perPage);
    if(app.page > totalPages) app.page = totalPages;
    if(app.page < 1) app.page = 1;

    var start = (app.page - 1) * app.perPage;
    var end = start + app.perPage;
    var pageItems = app.filteredData.slice(start, end);

    // Render Cards
    for(var i=0; i<pageItems.length; i++) {
        createCard(pageItems[i], container, start + i + 1);
    }

    renderPagination(totalPages);
    
    // Scroll to top of Main Content
    document.getElementById('mainScroll').scrollTop = 0;
}

function createCard(q, container, index) {
    var div = document.createElement('div');
    div.className = 'q-card';

    // Header Meta
    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = `<span>${q.cat} &bull; ${q.topic}</span><span>Q: ${index}</span>`;
    div.appendChild(meta);

    // Title
    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    div.appendChild(h3);

    // Options Container
    var optsDiv = document.createElement('div');
    var feedback = document.createElement('div');
    feedback.style.cssText = "display:none; margin-top:15px; padding:10px; background:#f1f8ff; border-radius:5px; border:1px solid #d0e3ff; color:#333;";

    q.opts.forEach(function(opt, idx) {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        
        if(app.mode === 'study') {
            btn.textContent = opt;
            btn.disabled = true;
            if(idx === q.ans) {
                btn.classList.add('correct');
                btn.innerHTML += ' &#10004;';
            }
            // Show explanation immediately in study mode
            if(q.desc) {
                feedback.style.display = 'block';
                feedback.innerHTML = "<b>Explanation:</b> " + q.desc;
            }
        } else {
            // Quiz Mode
            btn.textContent = opt;
            btn.onclick = function() {
                var siblings = optsDiv.querySelectorAll('.opt-btn');
                siblings.forEach(function(sb, sIdx) {
                    sb.disabled = true;
                    if(sIdx === q.ans) {
                        sb.classList.add('correct');
                        sb.innerHTML += ' &#10004;';
                    }
                });

                if(idx !== q.ans) {
                    this.classList.add('wrong');
                    this.innerHTML += ' &#10006;';
                    // Show Correct Answer text if wrong
                    feedback.style.display = 'block';
                    feedback.innerHTML = "<b>Correct Answer:</b> " + q.opts[q.ans];
                    if(q.desc) feedback.innerHTML += "<br><br><b>Explanation:</b> " + q.desc;
                } else {
                    // Correct
                    if(q.desc) {
                        feedback.style.display = 'block';
                        feedback.innerHTML = "<b>Explanation:</b> " + q.desc;
                    }
                }
            };
        }
        optsDiv.appendChild(btn);
    });

    div.appendChild(optsDiv);
    div.appendChild(feedback);
    container.appendChild(div);
}

function renderPagination(total) {
    var box = document.getElementById('paginationControls');
    box.innerHTML = '';

    if(total <= 1) return;

    // Prev
    var prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '&laquo; Prev';
    prev.disabled = app.page === 1;
    prev.onclick = function() { app.page--; render(); };

    // Info
    var info = document.createElement('span');
    info.innerHTML = ` Page <b>${app.page}</b> of <b>${total}</b> `;

    // Next
    var next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = 'Next &raquo;';
    next.disabled = app.page === total;
    next.onclick = function() { app.page++; render(); };

    // Jump Input (Fixed & Restored)
    var jumpSpan = document.createElement('span');
    jumpSpan.style.marginLeft = "15px";
    jumpSpan.innerHTML = 'Go to: ';
    
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'jump-input';
    inp.min = 1; 
    inp.max = total;
    inp.placeholder = '#';
    
    var goBtn = document.createElement('button');
    goBtn.className = 'page-btn';
    goBtn.textContent = 'Go';
    goBtn.style.marginLeft = '5px';
    goBtn.onclick = function() {
        var val = parseInt(inp.value);
        if(val >= 1 && val <= total) {
            app.page = val;
            render();
        } else {
            alert('Enter page between 1 and ' + total);
        }
    };

    box.appendChild(prev);
    box.appendChild(info);
    box.appendChild(next);
    
    box.appendChild(jumpSpan);
    box.appendChild(inp);
    box.appendChild(goBtn);
}

// Helper
function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?t=' + Date.now(), true);
    xhr.onload = function() {
        if (xhr.status === 200) {
            success(isText ? xhr.responseText : JSON.parse(xhr.responseText));
        } else if(error) error();
    };
    xhr.onerror = function() { if(error) error(); };
    try { xhr.send(); } catch(e) {}
            }
