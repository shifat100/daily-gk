"use strict";

var app = {
    data: [],
    filteredData: [],
    treeData: {}, // Structure: { "Category": { "Topic": count } }
    
    // State
    currentCategory: null,
    currentTopic: null, // Sub-category
    searchQuery: '',
    mode: 'quiz',
    shuffle: false,
    currentPage: 1,
    itemsPerPage: 20
};

window.onload = function() {
    initApp();
};

function initApp() {
    setupUI();
    startLoading();
}

// ========== UI SETUP ==========

function setupUI() {
    // 1. Mobile Menu Toggles
    var btn = document.getElementById('menuToggle');
    var sidebar = document.getElementById('appSidebar');
    var overlay = document.getElementById('sidebarOverlay');

    function toggleMenu() {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
    }

    if(btn) btn.onclick = toggleMenu;
    if(overlay) overlay.onclick = toggleMenu;

    // 2. View Mode
    document.getElementById('viewMode').onchange = function(e) {
        app.mode = e.target.value;
        render();
    };

    // 3. Search
    var searchTimeout;
    document.getElementById('searchInput').onkeyup = function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
            app.searchQuery = e.target.value.toLowerCase();
            app.currentPage = 1;
            runFilter();
        }, 300);
    };
    
    // 4. Shuffle Checkbox (Add to filter bar)
    var filterBar = document.querySelector('.filter-bar');
    var shufLabel = document.createElement('label');
    shufLabel.style.cssText = "display: flex; align-items: center; gap: 5px; font-size: 0.9rem; cursor: pointer;";
    shufLabel.innerHTML = '<input type="checkbox" id="shuffleCheck"> Shuffle';
    filterBar.appendChild(shufLabel);
    
    document.getElementById('shuffleCheck').onchange = function(e) {
        app.shuffle = e.target.checked;
        app.currentPage = 1;
        runFilter();
    };
}

// ========== DATA LOADING & PARSING ==========

function startLoading() {
    ajaxGet('data/main.json', function(cats) {
        var queue = [];
        for(var i=0; i<cats.length; i++) {
            // Initialize Tree Category
            app.treeData[cats[i].title] = {}; 
            queue.push({ path: cats[i].path, name: cats[i].title });
        }
        processManifestQueue(queue, 0);
    });
}

function processManifestQueue(list, index) {
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
        loadMCQFiles(fileQueue, 0, function() {
            processManifestQueue(list, index + 1);
        });
    });
}

function loadMCQFiles(queue, idx, doneCallback) {
    if (idx >= queue.length) {
        doneCallback();
        return;
    }

    // Extract "Topic" from filename (e.g., "data/history/ancient.txt" -> "ancient")
    var urlParts = queue[idx].url.split('/');
    var fileName = urlParts[urlParts.length - 1];
    var topicName = fileName.replace('.txt', '').replace(/_/g, ' ').toUpperCase(); // Clean name

    ajaxGet(queue[idx].url, function(text) {
        parseMCQ(text, queue[idx].cat, topicName);
        loadMCQFiles(queue, idx + 1, doneCallback);
    }, function() {
        // Skip on error
        loadMCQFiles(queue, idx + 1, doneCallback);
    }, true);
}

function parseMCQ(text, cat, topic) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var count = 0;

    for (var i = 0; i < lines.length; i += 2) {
        if (i + 1 >= lines.length) break;
        var line1 = lines[i].trim();
        var line2 = lines[i+1].trim();
        if(!line1 || !line2) continue;

        // Simple Parser logic
        var parts = line2.split('|');
        if(parts.length > 0 && parts[parts.length-1] === '') parts.pop();

        var ansIndex, desc, opts;
        var last = parts[parts.length-1];
        var secondLast = parts[parts.length-2];

        if(!isNaN(last)) {
            ansIndex = parseInt(last);
            desc = null;
            opts = parts.slice(0, parts.length-1);
        } else {
            desc = last;
            ansIndex = parseInt(secondLast);
            opts = parts.slice(0, parts.length-2);
        }

        app.data.push({
            id: app.data.length,
            cat: cat,
            topic: topic, // Store the sub-category
            title: line1.replace(/\*\*/g, ''),
            opts: opts,
            ans: ansIndex,
            desc: desc
        });
        count++;
    }

    // Update Tree Counts
    if(!app.treeData[cat][topic]) app.treeData[cat][topic] = 0;
    app.treeData[cat][topic] += count;
}

function finishLoading() {
    document.getElementById('loader').style.display = 'none';
    document.getElementById('totalCount').textContent = app.data.length;
    renderTree();
    runFilter();
}

// ========== TREE VIEW LOGIC ==========

function renderTree() {
    var treeContainer = document.getElementById('categoryTree');
    treeContainer.innerHTML = '';

    for (var catName in app.treeData) {
        var topics = app.treeData[catName];
        var totalInCat = 0;
        
        // Calculate total for category
        for(var t in topics) totalInCat += topics[t];

        // 1. Create Category Header (Parent)
        var li = document.createElement('li');
        li.className = 'tree-item';

        var header = document.createElement('div');
        header.className = 'tree-header';
        header.innerHTML = '<span>' + catName + '</span> <span class="count">' + totalInCat + '</span>';
        
        // 2. Create Sub-menu (Children)
        var subUl = document.createElement('ul');
        subUl.className = 'tree-sub';

        // Add "All in [Category]" option
        var allLi = document.createElement('li');
        allLi.className = 'sub-item';
        allLi.textContent = "All " + catName;
        allLi.onclick = (function(c) { 
            return function() { app.filterByTopic(c, null); closeMobileMenu(); }; 
        })(catName);
        subUl.appendChild(allLi);

        // Add specific topics
        for (var topicName in topics) {
            var topicLi = document.createElement('li');
            topicLi.className = 'sub-item';
            topicLi.innerHTML = topicName + ' <span style="font-size:0.8em; color:#999;">(' + topics[topicName] + ')</span>';
            
            // Closure to capture variables
            topicLi.onclick = (function(c, t) {
                return function(e) { 
                    // Remove active from all others
                    var all = document.querySelectorAll('.sub-item');
                    for(var k=0; k<all.length; k++) all[k].classList.remove('active');
                    e.target.classList.add('active');

                    app.filterByTopic(c, t);
                    closeMobileMenu();
                };
            })(catName, topicName);

            subUl.appendChild(topicLi);
        }

        // Toggle Expand/Collapse
        header.onclick = function() {
            var sibling = this.nextElementSibling;
            if (sibling.style.display === "block") {
                sibling.style.display = "none";
                this.style.backgroundColor = "#fff";
            } else {
                sibling.style.display = "block";
                this.style.backgroundColor = "#f0f0f0";
            }
        };

        li.appendChild(header);
        li.appendChild(subUl);
        treeContainer.appendChild(li);
    }
}

function closeMobileMenu() {
    document.getElementById('appSidebar').classList.remove('show');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// ========== FILTERING ==========

app.filterByTopic = function(cat, topic) {
    app.currentCategory = cat;
    app.currentTopic = topic;
    app.currentPage = 1;
    app.searchQuery = ''; // Optional: clear search on nav click
    document.getElementById('searchInput').value = '';

    // Update Display
    var display = document.getElementById('currentTopicDisplay');
    var nameEl = document.getElementById('topicName');
    display.style.display = 'block';
    
    if(!cat) {
        nameEl.textContent = "All Questions";
    } else if (!topic) {
        nameEl.textContent = cat + " (All)";
    } else {
        nameEl.textContent = cat + " > " + topic;
    }

    runFilter();
};

function runFilter() {
    var temp = app.data.filter(function(q) {
        // Tree Filter
        if (app.currentCategory && q.cat !== app.currentCategory) return false;
        if (app.currentTopic && q.topic !== app.currentTopic) return false;
        
        // Search Filter
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        
        return true;
    });

    // Shuffle logic
    if (app.shuffle) {
        for (var i = temp.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = temp[i]; temp[i] = temp[j]; temp[j] = t;
        }
    } else {
        temp.sort(function(a,b){ return a.id - b.id; });
    }

    app.filteredData = temp;
    render();
}

// ========== RENDERING (Card & Pagination) ==========

function render() {
    var container = document.getElementById('questionList');
    var pagContainer = document.getElementById('paginationControls');
    container.innerHTML = '';
    pagContainer.innerHTML = '';

    if (app.filteredData.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No questions found.</div>';
        return;
    }

    var totalPages = Math.ceil(app.filteredData.length / app.itemsPerPage);
    if(app.currentPage > totalPages) app.currentPage = totalPages;
    if(app.currentPage < 1) app.currentPage = 1;

    var start = (app.currentPage - 1) * app.itemsPerPage;
    var end = start + app.itemsPerPage;
    var pageData = app.filteredData.slice(start, end);

    for (var i = 0; i < pageData.length; i++) {
        createCard(pageData[i], container, start + i + 1);
    }
    
    createPagination(pagContainer, totalPages);
}

function createCard(q, container, index) {
    var card = document.createElement('div');
    card.className = 'q-card';
    
    var html = '<div style="margin-bottom:10px; font-size:12px; color:#888; display:flex; justify-content:space-between;">';
    html += '<span>' + q.cat + ' > ' + q.topic + '</span><span>#' + index + '</span></div>';
    html += '<div style="font-weight:600; font-size:1.1em; margin-bottom:15px;">' + q.title + '</div>';
    
    var optsDiv = document.createElement('div');
    var feedDiv = document.createElement('div');
    feedDiv.style.display = 'none';
    feedDiv.style.marginTop = "15px";
    feedDiv.style.padding = "10px";
    feedDiv.style.background = "#eef";
    feedDiv.style.borderRadius = "5px";

    // Options
    for(var j=0; j<q.opts.length; j++) {
        (function(idx) {
            var btn = document.createElement('button');
            btn.className = 'opt-btn';
            
            // Study Mode
            if(app.mode === 'study') {
                btn.textContent = q.opts[idx];
                btn.disabled = true;
                if(idx === q.ans) {
                    btn.classList.add('correct');
                    btn.innerHTML += ' &#10004;';
                }
                // Show desc immediately
                if(q.desc) {
                   feedDiv.style.display = 'block';
                   feedDiv.innerHTML = "<b>Explanation:</b> " + q.desc;
                }
            } 
            // Quiz Mode
            else {
                btn.textContent = q.opts[idx];
                btn.onclick = function() {
                    // Disable all
                    var allBtns = optsDiv.querySelectorAll('.opt-btn');
                    allBtns.forEach(function(b, bIdx) {
                        b.disabled = true;
                        if(bIdx === q.ans) {
                            b.classList.add('correct');
                            b.innerHTML += ' &#10004;';
                        }
                    });

                    if(idx !== q.ans) {
                        this.classList.add('wrong');
                        this.innerHTML += ' &#10006;';
                    }
                    
                    // Show explanation
                    if(q.desc) {
                        feedDiv.style.display = 'block';
                        feedDiv.innerHTML = "<b>Explanation:</b> " + q.desc;
                    } else if (idx !== q.ans) {
                         feedDiv.style.display = 'block';
                         feedDiv.innerHTML = "<b>Correct Answer:</b> " + q.opts[q.ans];
                    }
                };
            }
            optsDiv.appendChild(btn);
        })(j);
    }

    card.appendChild(document.createRange().createContextualFragment(html)); // Title
    card.appendChild(optsDiv);
    card.appendChild(feedDiv);
    container.appendChild(card);
}

function createPagination(container, total) {
    if(total <= 1) return;

    var prev = document.createElement('button');
    prev.textContent = "Prev";
    prev.className = "opt-btn";
    prev.style.width = "auto";
    prev.style.display = "inline-block";
    prev.disabled = app.currentPage === 1;
    prev.onclick = function() { app.currentPage--; render(); window.scrollTo(0,0); };

    var next = document.createElement('button');
    next.textContent = "Next";
    next.className = "opt-btn";
    next.style.width = "auto";
    next.style.display = "inline-block";
    next.disabled = app.currentPage === total;
    next.onclick = function() { app.currentPage++; render(); window.scrollTo(0,0); };

    var span = document.createElement('span');
    span.textContent = " Page " + app.currentPage + " of " + total + " ";
    span.style.margin = "0 10px";

    container.appendChild(prev);
    container.appendChild(span);
    container.appendChild(next);
}

// Ajax Helper
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
