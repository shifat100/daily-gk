"use strict";

var app = {
    data: [],
    filteredData: [],
    treeData: {},
    currCat: null,
    currTopic: null,
    mode: 'quiz',
    shuffle: false,
    searchQuery: '',
    page: 1,
    perPage: 10,
    lastModified: null
};

window.onload = function() {
    initApp();
};

function initApp() {
    setupEventListeners();
    setupPWA();
    renderSkeleton(); 
    startDataLoad();
}

// ========== 1. SETUP ==========

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
        app.page = 1;
        render();
    };

    // Search
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

// ========== 2. PWA INSTALL LOGIC ==========
function setupPWA() {
    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function(err) {
            console.log('SW Fail:', err);
        });
    }

    // Install Button
    var installBtn = document.getElementById('installBtn');
    var deferredPrompt;

    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'block'; // Show button
    });

    installBtn.addEventListener('click', function() {
        installBtn.style.display = 'none';
        if(deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function(result) {
                deferredPrompt = null;
            });
        }
    });
}

// ========== 3. DATA & DATE ==========

function startDataLoad() {
    ajaxGet('data/main.json', function(cats) {
        var queue = [];
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

    var urlParts = queue[idx].url.split('/');
    var fileName = urlParts[urlParts.length - 1];
    var topic = fileName.replace('.txt','').replace(/_/g, ' ').toUpperCase();

    ajaxGet(queue[idx].url, function(text) {
        parseAndStore(text, queue[idx].cat, topic);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function() {
        loadMCQs(queue, idx + 1, doneCallback);
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
    if(!app.treeData[cat][topic]) app.treeData[cat][topic] = 0;
    app.treeData[cat][topic] += count;
}

function finishLoading() {
    buildSidebarTree();
    runFilter();
    updateFooterDate();
}

// ========== 4. SIDEBAR & LOGIC ==========

function buildSidebarTree() {
    var ul = document.getElementById('categoryTree');
    ul.innerHTML = '';

    var allLi = document.createElement('li');
    allLi.className = 'tree-item';
    allLi.innerHTML = '<div class="tree-parent"><span>All Questions</span> <span class="badge">'+app.data.length+'</span></div>';
    allLi.onclick = function() { setFilter(null, null); closeMobileMenu(); };
    ul.appendChild(allLi);

    for (var cat in app.treeData) {
        var topics = app.treeData[cat];
        var catTotal = 0;
        for(var t in topics) catTotal += topics[t];

        var li = document.createElement('li');
        li.className = 'tree-item';
        var header = document.createElement('div');
        header.className = 'tree-parent';
        header.innerHTML = '<span>' + cat + '</span> <span class="badge">' + catTotal + '</span>';
        
        var childUl = document.createElement('ul');
        childUl.className = 'tree-children';

        var subAll = document.createElement('li');
        subAll.className = 'tree-child';
        subAll.textContent = "All " + cat;
        subAll.onclick = (function(c) { return function() { setFilter(c, null); closeMobileMenu(); }; })(cat);
        childUl.appendChild(subAll);

        for (var topic in topics) {
            var topicLi = document.createElement('li');
            topicLi.className = 'tree-child';
            topicLi.innerHTML = topic + ' <span style="font-size:0.8em; opacity:0.7;">(' + topics[topic] + ')</span>';
            topicLi.onclick = (function(c, t) {
                return function(e) {
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

function setFilter(cat, topic) {
    app.currCat = cat;
    app.currTopic = topic;
    app.page = 1;
    app.searchQuery = '';
    document.getElementById('searchInput').value = '';
    
    var header = document.getElementById('topicHeader');
    var name = document.getElementById('topicName');
    header.style.display = 'block';
    if(!cat) name.textContent = "All Questions";
    else if(!topic) name.textContent = cat + " (All)";
    else name.textContent = cat + " > " + topic;

    runFilter();
}

function runFilter() {
    renderSkeleton(); 
    setTimeout(function() {
        var res = app.data.filter(function(q) {
            if (app.currCat && q.cat !== app.currCat) return false;
            if (app.currTopic && q.topic !== app.currTopic) return false;
            if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
            return true;
        });

        if (app.shuffle) {
            for (var i = res.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = res[i]; res[i] = res[j]; res[j] = temp;
            }
        } else {
            res.sort(function(a,b){ return a.id - b.id; });
        }
        app.filteredData = res;
        render();
    }, 200);
}

// ========== 5. RENDER & UTILS ==========

function renderSkeleton() {
    var container = document.getElementById('questionList');
    var html = '';
    for(var i=0; i<3; i++) {
        html += `<div class="skeleton-card"><div class="sk-line sk-title"></div><div class="sk-line sk-opt"></div><div class="sk-line sk-opt"></div><div class="sk-line sk-opt"></div></div>`;
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

    var totalPages = Math.ceil(app.filteredData.length / app.perPage);
    if(app.page > totalPages) app.page = totalPages;
    if(app.page < 1) app.page = 1;

    var start = (app.page - 1) * app.perPage;
    var end = start + app.perPage;
    var pageItems = app.filteredData.slice(start, end);

    for(var i=0; i<pageItems.length; i++) {
        createCard(pageItems[i], container, start + i + 1);
    }
    renderPagination(totalPages);
    document.getElementById('mainScroll').scrollTop = 0;
}

function createCard(q, container, index) {
    var div = document.createElement('div');
    div.className = 'q-card';
    
    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = `<span>${q.cat} &bull; ${q.topic}</span><span>#${index}</span>`;
    div.appendChild(meta);

    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    div.appendChild(h3);

    var optsDiv = document.createElement('div');
    var feedback = document.createElement('div');
    feedback.style.cssText = "display:none; margin-top:15px; padding:10px; background:#f1f8ff; border-radius:5px; border:1px solid #d0e3ff; color:#333;";

    q.opts.forEach(function(opt, idx) {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        if(app.mode === 'study') {
            btn.textContent = opt;
            btn.disabled = true;
            if(idx === q.ans) { btn.classList.add('correct'); btn.innerHTML += ' &#10004;'; }
            if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>Explanation:</b> " + q.desc; }
        } else {
            btn.textContent = opt;
            btn.onclick = function() {
                var siblings = optsDiv.querySelectorAll('.opt-btn');
                siblings.forEach(function(sb, sIdx) {
                    sb.disabled = true;
                    if(sIdx === q.ans) { sb.classList.add('correct'); sb.innerHTML += ' &#10004;'; }
                });
                if(idx !== q.ans) {
                    this.classList.add('wrong');
                    this.innerHTML += ' &#10006;';
                    feedback.style.display = 'block';
                    feedback.innerHTML = "<b>Correct Answer:</b> " + q.opts[q.ans];
                    if(q.desc) feedback.innerHTML += "<br><br><b>Explanation:</b> " + q.desc;
                } else {
                    if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>Explanation:</b> " + q.desc; }
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

    var prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '&laquo; Prev';
    prev.disabled = app.page === 1;
    prev.onclick = function() { app.page--; render(); };

    var info = document.createElement('span');
    info.innerHTML = ` Page <b>${app.page}</b> of <b>${total}</b> `;

    var next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = 'Next &raquo;';
    next.disabled = app.page === total;
    next.onclick = function() { app.page++; render(); };

    var jumpSpan = document.createElement('span');
    jumpSpan.style.marginLeft = "15px";
    jumpSpan.innerHTML = '<hr>Go: ';
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'jump-input';
    inp.min = 1; inp.max = total;
    var goBtn = document.createElement('button');
    goBtn.className = 'page-btn';
    goBtn.textContent = 'Go';
    goBtn.onclick = function() {
        var val = parseInt(inp.value);
        if(val >= 1 && val <= total) { app.page = val; render(); }
    };

    box.appendChild(prev); box.appendChild(info); box.appendChild(next);
    box.appendChild(jumpSpan); box.appendChild(inp); box.appendChild(goBtn);
}

function checkLatestDate(headerDate) {
    if(!headerDate) return;
    var d = new Date(headerDate);
    if(!app.lastModified || d > app.lastModified) {
        app.lastModified = d;
    }
}

function updateFooterDate() {
    var el = document.getElementById('lastUpdateDate');
    if(el && app.lastModified) {
        el.textContent = app.lastModified.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
}

function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?t=' + Date.now(), true);
    xhr.onload = function() {
        if (xhr.status === 200) {
            checkLatestDate(xhr.getResponseHeader("Last-Modified"));
            success(isText ? xhr.responseText : JSON.parse(xhr.responseText));
        } else if(error) error();
    };
    xhr.onerror = function() { if(error) error(); };
    try { xhr.send(); } catch(e) {}
        }
