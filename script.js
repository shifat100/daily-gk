"use strict";

var app = {
    data: [],           // All questions
    filteredData: [],   // Currently visible questions
    treeData: {},       // Hierarchy for Sidebar
    sortOrder: 'asc', 
    // Application State
    currCat: null,      // Current Category Filter
    currTopic: null,    // Current Topic Filter
    mode: 'quiz',       // 'quiz' or 'study'
    shuffle: false,     // Randomize order
    searchQuery: '',
    
    // Pagination
    page: 1,
    perPage: 10,
    
    // Meta
    lastModified: null
};

window.onload = function() {
    initApp();
};

function initApp() {
    setupEventListeners();
    setupPWA();
    renderSkeleton(); // Show placeholder immediately
    startDataLoad();
}

// ==========================================
// 1. SETUP & EVENT LISTENERS
// ==========================================

function setupEventListeners() {
    // Mobile Sidebar Toggle
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('appSidebar');
    var overlay = document.getElementById('sidebarOverlay');

    function closeMenu() {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    }

    if(toggle) {
        toggle.onclick = function() {
            sidebar.classList.toggle('show');
            overlay.classList.toggle('show');
        };
    }
    
    if(overlay) overlay.onclick = closeMenu;

    // View Mode (Quiz vs Study)
    var viewModeEl = document.getElementById('viewMode');
    if(viewModeEl) {
        viewModeEl.onchange = function(e) {
            app.mode = e.target.value;
            app.page = 1; // Reset to page 1
            render();     // Re-render without reloading data
        };
    }

    // Search Input (Debounced)
    var searchInput = document.getElementById('searchInput');
    var searchTimeout;
    if(searchInput) {
        searchInput.onkeyup = function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() {
                app.searchQuery = e.target.value.toLowerCase();
                app.page = 1;
                runFilter();
            }, 300);
        };
    }

    // Shuffle Checkbox
    var shuffleCheck = document.getElementById('shuffleCheck');
    if(shuffleCheck) {
        shuffleCheck.onchange = function(e) {
            app.shuffle = e.target.checked;
            app.page = 1;
            runFilter();
        };
    }

    var perPageSelect = document.getElementById('perPageSelect');
    if(perPageSelect) {
        perPageSelect.onchange = function(e) {
            // 1. Update the app state
            app.perPage = parseInt(e.target.value);
            
            // 2. Reset to page 1 to prevent empty pages
            app.page = 1; 
            
            // 3. Re-render the list
            render(); 
        };
    }


    var sortSelect = document.getElementById('sortSelect');
    if(sortSelect) {
        sortSelect.onchange = function(e) {
            app.sortOrder = e.target.value; // 'asc' or 'desc'
            
            // If user explicitly sorts, we usually want to turn off Shuffle
            app.shuffle = false; 
            document.getElementById('shuffleCheck').checked = false;
            
            app.page = 1;
            runFilter();
        };
    }
    
    // UPDATE SHUFFLE LISTENER (Optional but recommended):
    // When Shuffle is turned ON, it overrides the sort.
    document.getElementById('shuffleCheck').onchange = function(e) {
        app.shuffle = e.target.checked;
        app.page = 1;
        runFilter();
    };
    
    // === BACK TO TOP LOGIC ===
    var bttBtn = document.getElementById('backToTop');
    var scrollContainer = document.getElementById('mainScroll'); // The scrolling div

    if (bttBtn && scrollContainer) {
        // 1. Show/Hide on Scroll
        scrollContainer.onscroll = function() {
            // Show if scrolled down more than 300px
            if (scrollContainer.scrollTop > 300) {
                bttBtn.classList.add('show');
            } else {
                bttBtn.classList.remove('show');
            }
        };

        // 2. Click to Scroll Up
        bttBtn.onclick = function() {
            scrollContainer.scrollTo({
                top: 0,
                behavior: 'smooth' // Smooth animation
            });
        };
    }

    
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

        // === UPDATED SORTING LOGIC START ===
        if (app.shuffle) {
            // Random Shuffle
            for (var i = res.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = res[i]; res[i] = res[j]; res[j] = temp;
            }
        } else {
            // Sort based on ID (File order)
            if (app.sortOrder === 'desc') {
                // Descending (Newest/Last file first)
                res.sort(function(a, b) { return b.id - a.id; });
            } else {
                // Ascending (Oldest/First file first) - Default
                res.sort(function(a, b) { return a.id - b.id; });
            }
        }
        // === UPDATED SORTING LOGIC END ===

        app.filteredData = res;
        render();
    }, 150);
               }
// ==========================================
// 2. PWA INSTALLATION
// ==========================================

function setupPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function(err) {
            console.log('SW Registration failed:', err);
        });
    }

    // Handle Install Prompt
    var installBtn = document.getElementById('installBtn');
    var deferredPrompt;

    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        if(installBtn) installBtn.style.display = 'block';
    });

    if(installBtn) {
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
}

// ==========================================
// 3. DATA LOADING (UPDATED FOR TITLES)
// ==========================================

function startDataLoad() {
    // Load main categories
    ajaxGet('data/main.json', function(cats) {
        var queue = [];
        for(var i=0; i<cats.length; i++) {
            // Initialize tree container for this category
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
    
    var item = list[index]; // Category Item
    
    // Load the sub-json for this category
    ajaxGet(item.path, function(files) {
        var fileQueue = [];
        for(var j=0; j<files.length; j++) {
            // FIX APPLIED HERE:
            // We read "title" from the JSON (e.g., "December 2025") 
            // and pass it as "topic".
            fileQueue.push({ 
                url: files[j].path, 
                cat: item.name,
                topic: files[j].title // Using the title field
            });
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

    // FIX APPLIED HERE:
    // We use the topic we extracted in processQueue.
    // Fallback to filename if title is missing.
    var topicName = queue[idx].topic;
    
    if(!topicName) {
        var parts = queue[idx].url.split('/');
        topicName = parts[parts.length - 1]; // Fallback to filename
    }

    ajaxGet(queue[idx].url, function(text) {
        parseAndStore(text, queue[idx].cat, topicName);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function() {
        // Skip file on error
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

        // Parser logic to detect if description exists
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
            title: line1.replace(/\*\*/g, ''), // Remove markdown bold if present
            opts: opts,
            ans: ans,
            desc: desc
        });
        count++;
    }

    // Add count to Tree Data
    if(!app.treeData[cat][topic]) app.treeData[cat][topic] = 0;
    app.treeData[cat][topic] += count;
}

function finishLoading() {
    buildSidebarTree();
    runFilter();
    updateFooterDate();
}

// ==========================================
// 4. SIDEBAR & TREE VIEW
// ==========================================

function buildSidebarTree() {
    var ul = document.getElementById('categoryTree');
    if(!ul) return;
    ul.innerHTML = '';

    // "All Questions" Main Link
    var allLi = document.createElement('li');
    allLi.className = 'tree-item';
    allLi.innerHTML = '<div class="tree-parent"><span>All Questions</span> <span class="badge">'+app.data.length+'</span></div>';
    allLi.onclick = function() { setFilter(null, null); closeMobileMenu(); };
    ul.appendChild(allLi);

    // Loop through Categories
    for (var cat in app.treeData) {
        var topics = app.treeData[cat];
        var catTotal = 0;
        for(var t in topics) catTotal += topics[t];

        var li = document.createElement('li');
        li.className = 'tree-item';

        // Category Header
        var header = document.createElement('div');
        header.className = 'tree-parent';
        header.innerHTML = '<span>' + cat + '</span> <span class="badge">' + catTotal + '</span>';
        
        // Sub-menu (Topics)
        var childUl = document.createElement('ul');
        childUl.className = 'tree-children';

        // "All in [Category]" Link
        var subAll = document.createElement('li');
        subAll.className = 'tree-child';
        subAll.textContent = "All " + cat;
        subAll.onclick = (function(c) { return function() { setFilter(c, null); closeMobileMenu(); }; })(cat);
        childUl.appendChild(subAll);

        // Specific Topic Links
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

        // Expand/Collapse Logic
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
    var sidebar = document.getElementById('appSidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if(sidebar) sidebar.classList.remove('show');
    if(overlay) overlay.classList.remove('show');
}

// ==========================================
// 5. FILTERING & LOGIC
// ==========================================

function setFilter(cat, topic) {
    app.currCat = cat;
    app.currTopic = topic;
    app.page = 1;
    app.searchQuery = '';
    document.getElementById('searchInput').value = '';
    
    // Update "Viewing: ..." Header
    var header = document.getElementById('topicHeader');
    var name = document.getElementById('topicName');
    if(header) header.style.display = 'block';
    
    if(name) {
        if(!cat) name.textContent = "All Questions";
        else if(!topic) name.textContent = cat + " (All)";
        else name.textContent = cat + " > " + topic;
    }

    runFilter();
}

function runFilter() {
    renderSkeleton(); // Visual feedback

    // Slight delay to allow skeleton to render and simulate processing
    setTimeout(function() {
        var res = app.data.filter(function(q) {
            if (app.currCat && q.cat !== app.currCat) return false;
            if (app.currTopic && q.topic !== app.currTopic) return false;
            if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
            return true;
        });

        // Shuffle or Sort
        if (app.shuffle) {
            // Fisher-Yates Shuffle
            for (var i = res.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = res[i]; res[i] = res[j]; res[j] = temp;
            }
        } else {
            // Original Order
            res.sort(function(a,b){ return a.id - b.id; });
        }

        app.filteredData = res;
        render();
    }, 150);
}

// ==========================================
// 6. RENDERING
// ==========================================

function renderSkeleton() {
    var container = document.getElementById('questionList');
    if(!container) return;
    
    var html = '';
    // Create 3 skeleton cards
    for(var i=0; i<3; i++) {
        html += '<div class="skeleton-card">' +
                '<div class="sk-line sk-title"></div>' +
                '<div class="sk-line sk-opt"></div>' +
                '<div class="sk-line sk-opt"></div>' +
                '<div class="sk-line sk-opt"></div>' +
                '</div>';
    }
    container.innerHTML = html;
}

function render() {
    var container = document.getElementById('questionList');
    if(!container) return;
    container.innerHTML = '';
    
    if(app.filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#777;">No questions found.</div>';
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    // Pagination Calculation
    var totalPages = Math.ceil(app.filteredData.length / app.perPage);
    if(app.page > totalPages) app.page = totalPages;
    if(app.page < 1) app.page = 1;

    var start = (app.page - 1) * app.perPage;
    var end = start + app.perPage;
    var pageItems = app.filteredData.slice(start, end);

    // Create Cards
    for(var i=0; i<pageItems.length; i++) {
        createCard(pageItems[i], container, start + i + 1);
    }

    renderPagination(totalPages);
    
    // Scroll to top of content
    var mainScroll = document.getElementById('mainScroll');
    if(mainScroll) mainScroll.scrollTop = 0;
}

function createCard(q, container, index) {
    var div = document.createElement('div');
    div.className = 'q-card';
    
    // Meta (Category & Index)
    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = '<span>' + q.cat + ' &bull; ' + q.topic + '</span><span>#' + index + '</span>';
    div.appendChild(meta);

    // Question Title
    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    div.appendChild(h3);

    // Options Area
    var optsDiv = document.createElement('div');
    
    // Feedback Box (Hidden initially)
    var feedback = document.createElement('div');
    feedback.style.cssText = "display:none; margin-top:15px; padding:10px; background:#f1f8ff; border-radius:5px; border:1px solid #d0e3ff; color:#333; font-size: 0.95rem;";

    // Loop through options
    q.opts.forEach(function(opt, idx) {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        
        if(app.mode === 'study') {
            // STUDY MODE: Show answer immediately
            btn.textContent = opt;
            btn.disabled = true;
            if(idx === q.ans) { 
                btn.classList.add('correct'); 
                //btn.innerHTML += ' &#10004;';
                btn.innerHTML = '&#10004; ' + btn.innerHTML;
            }
            // Always show desc in study mode if it exists
            if(q.desc) { 
                feedback.style.display = 'block'; 
                feedback.innerHTML = "<b>Explanation:</b> " + q.desc; 
            }
        } else {
            // QUIZ MODE: Interactive
            btn.textContent = opt;
            btn.onclick = function() {
                // Disable all buttons in this card
                var siblings = optsDiv.querySelectorAll('.opt-btn');
                siblings.forEach(function(sb, sIdx) {
                    sb.disabled = true;
                    if(sIdx === q.ans) { 
                        sb.classList.add('correct'); 
                        sb.innerHTML += ' &#10004;'; 
                    }
                });

                if(idx !== q.ans) {
                    // User clicked Wrong
                    this.classList.add('wrong');
                    this.innerHTML += ' &#10006;';
                    
                    // Show Correct Answer text
                    feedback.style.display = 'block';
                    feedback.innerHTML = "<b>Correct Answer:</b> " + q.opts[q.ans];
                    if(q.desc) feedback.innerHTML += "<br><br><b>Explanation:</b> " + q.desc;
                } else {
                    // User clicked Correct
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

// ==========================================
// 7. PAGINATION
// ==========================================

function renderPagination(total) {
    var box = document.getElementById('paginationControls');
    if(!box) return;
    box.innerHTML = '';

    if(total <= 1) return; // Hide if only 1 page

    // Prev Button
    var prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '&laquo; Prev';
    prev.disabled = app.page === 1;
    prev.onclick = function() { app.page--; render(); };

    // Info Text
    var info = document.createElement('span');
    info.innerHTML = ' Page <b>' + app.page + '</b> of <b>' + total + '</b> ';

    // Next Button
    var next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = 'Next &raquo;';
    next.disabled = app.page === total;
    next.onclick = function() { app.page++; render(); };

    // Jump Input
    var jumpSpan = document.createElement('span');
    jumpSpan.style.marginLeft = "15px";
    jumpSpan.innerHTML = '';
    
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'jump-input';
    inp.min = 1; 
    inp.max = total;
    
    var goBtn = document.createElement('button');
    goBtn.className = 'page-btn';
    goBtn.textContent = 'Go';
    goBtn.onclick = function() {
        var val = parseInt(inp.value);
        if(val >= 1 && val <= total) { 
            app.page = val; 
            render(); 
        }
    };

    box.appendChild(prev); 
    box.appendChild(info); 
    box.appendChild(next);
    box.appendChild(jumpSpan); 
    box.appendChild(inp); 
    box.appendChild(goBtn);
}

// ==========================================
// 8. UTILITIES (Date & Ajax)
// ==========================================

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
        el.textContent = app.lastModified.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true 
        });
    }
}

function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    // Cache busting with timestamp
    xhr.open('GET', url + '?t=' + Date.now(), true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            checkLatestDate(xhr.getResponseHeader("Last-Modified"));
            try {
                success(isText ? xhr.responseText : JSON.parse(xhr.responseText));
            } catch(e) {
                if(error) error(e);
            }
        } else {
            if(error) error();
        }
    };
    xhr.onerror = function() { if(error) error(); };
    try { xhr.send(); } catch(e) { if(error) error(); }
}



    // 1. Disable Right-Click (Context Menu)
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    }, false);

    // 2. Disable Text Selection
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
    }, false);

    // 3. Disable Dragging (Images/Text)
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
    }, false);

    // 4. Disable Copy, Cut, Paste
    ['copy', 'cut', 'paste'].forEach(function(event) {
        document.addEventListener(event, function(e) {
            e.preventDefault();
        }, false);
    });

    // 5. Disable Keyboard Shortcuts (F12, Ctrl+Shift+I, Ctrl+C, Ctrl+U, etc.)
    document.addEventListener('keydown', function(e) {
        // Check for F12
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            return false;
        }

        // Check for Ctrl/Cmd combinations
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            
            // Block Ctrl+C (Copy), Ctrl+V (Paste), Ctrl+X (Cut)
            // Block Ctrl+S (Save), Ctrl+U (View Source), Ctrl+P (Print)
            if (['c', 'v', 'x', 's', 'u', 'p'].includes(key)) {
                e.preventDefault();
                return false;
            }

            // Block Ctrl+Shift+I (DevTools), Ctrl+Shift+C (Inspect), Ctrl+Shift+J (Console)
            if (e.shiftKey && ['i', 'c', 'j'].includes(key)) {
                e.preventDefault();
                return false;
            }
        }
    }, false);

    // 6. "Debugger" Loop (Freezes browser if DevTools is open)
    // Note: This can affect performance and is very aggressive.
    setInterval(function() {
        // The 'debugger' statement pauses execution if DevTools is open
        // Wrapping it in a closure makes it harder to locate
        (function() { debugger; })();
    }, 100);


