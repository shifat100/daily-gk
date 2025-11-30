"use strict";

// Polyfill for older browsers (Object.assign)
if (typeof Object.assign !== 'function') {
  Object.assign = function(target) {
    if (target == null) throw new TypeError('Cannot convert undefined or null to object');
    target = Object(target);
    for (var index = 1; index < arguments.length; index++) {
      var source = arguments[index];
      if (source != null) {
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
    }
    return target;
  };
}

var app = {
    data: [],           // All questions
    filteredData: [],   // Currently visible questions (after search/filter)
    catFilter: 'all',
    searchQuery: '',
    mode: 'quiz',       // 'quiz' or 'study'
    shuffle: false,     // Randomize order
    loading: true,
    lastModified: null,
    
    // Pagination Settings
    currentPage: 1,
    itemsPerPage: 20,
    
    // Internal use for reset
    originalOrder: [] 
};

window.onload = function() {
    initApp();
};

function initApp() {
    loadSettings(); // Load saved state from LocalStorage
    createDynamicUI();
    setupEventListeners();
    startLoading();
}

// ========== SETTINGS & STORAGE ==========

function loadSettings() {
    var saved = localStorage.getItem('mcq_app_state');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            app.mode = parsed.mode || 'quiz';
            app.catFilter = parsed.catFilter || 'all';
            app.currentPage = parsed.currentPage || 1;
            app.shuffle = parsed.shuffle || false;
            
            // Set UI values if elements exist immediately (rare, usually dynamic)
            // We will sync UI in render/after loading
        } catch(e) { console.error("Save file corrupted"); }
    }
}

function saveSettings() {
    var state = {
        mode: app.mode,
        catFilter: app.catFilter,
        currentPage: app.currentPage,
        shuffle: app.shuffle
    };
    localStorage.setItem('mcq_app_state', JSON.stringify(state));
}

// ========== EVENTS ==========

function setupEventListeners() {
    var viewModeEl = document.getElementById('viewMode');
    if(viewModeEl) {
        viewModeEl.value = app.mode;
        viewModeEl.onchange = function(e) { 
            app.mode = e.target.value; 
            // We do not reset page on mode change, user might want to study same page
            saveSettings();
            render(); 
        };
    }

    var catSelectEl = document.getElementById('categorySelect');
    if(catSelectEl) {
        catSelectEl.onchange = function(e) { 
            app.catFilter = e.target.value; 
            document.getElementById('searchInput').value = ''; 
            app.searchQuery = '';
            app.currentPage = 1; 
            saveSettings();
            applyFilters(); 
        };
    }

    var searchInputEl = document.getElementById('searchInput');
    var searchTimeout;
    if(searchInputEl) {
        searchInputEl.onkeyup = function(e) { 
            clearTimeout(searchTimeout);
            var val = e.target.value.toLowerCase();
            // Debounce: Wait 300ms before searching
            searchTimeout = setTimeout(function(){
                app.searchQuery = val; 
                app.currentPage = 1; 
                applyFilters(); 
            }, 300);
        };
    }
}

// ========== DYNAMIC UI ==========

function createDynamicUI() {
    // 1. Floating Loader
    var loader = document.createElement('div');
    loader.id = 'floatingLoader';
    loader.style.cssText = "position: fixed; bottom: 15px; left: 15px; background: rgba(0, 0, 0, 0.9); color: #fff; padding: 10px 20px; border-radius: 30px; font-size: 13px; font-family: sans-serif; z-index: 9999; display: none; box-shadow: 0 4px 15px rgba(0,0,0,0.4);";
    loader.textContent = "Initializing...";
    document.body.appendChild(loader);

    // 2. Advanced Controls (Shuffle)
    var viewModeEl = document.getElementById('viewMode');
    if(viewModeEl && viewModeEl.parentNode) {
        var ctrlDiv = document.createElement('div');
        ctrlDiv.style.cssText = "margin-top: 10px; display: inline-block;";
        
        var shufLabel = document.createElement('label');
        shufLabel.style.cssText = "margin-left: 15px; cursor: pointer; user-select: none;";
        
        var shufCheck = document.createElement('input');
        shufCheck.type = "checkbox";
        shufCheck.checked = app.shuffle;
        shufCheck.style.marginRight = "5px";
        shufCheck.onchange = function(e) {
            app.shuffle = e.target.checked;
            app.currentPage = 1;
            saveSettings();
            applyFilters(); // Re-sort/shuffle
        };

        shufLabel.appendChild(shufCheck);
        shufLabel.appendChild(document.createTextNode(" Shuffle Questions"));
        
        // Insert after select
        viewModeEl.parentNode.appendChild(shufLabel);
    }

    // 3. Pagination Container
    var qList = document.getElementById('questionList');
    if(qList) {
        var pagDiv = document.createElement('div');
        pagDiv.id = 'paginationControls';
        pagDiv.style.cssText = "display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; margin: 30px 0; padding: 15px; background: #f9f9f9; border-radius: 8px;";
        qList.parentNode.appendChild(pagDiv);
    }

    // 4. Footer
    var footer = document.createElement('div');
    footer.id = 'appFooter';
    footer.style.cssText = "text-align: center; margin: 30px 0 20px 0; font-size: 0.85em; color: #777; border-top: 1px solid #eee; padding-top: 20px;";
    
    var currentYear = new Date().getFullYear();
    // Using concatenation for older browser support instead of template literals
    footer.innerHTML = "<div>&copy; " + currentYear + " All Rights Reserved.</div>" +
                       "<div style='margin-top: 5px;'>Last Updated: <span id='lastUpdateDate' style='font-weight: bold;'>Calculating...</span></div>";
    
    if(qList && qList.parentNode) {
        qList.parentNode.appendChild(footer);
    }
}

// ========== DATA LOADING ==========

function startLoading() {
    var bigLoader = document.getElementById('loader');
    if(bigLoader) bigLoader.style.display = 'none';

    updateStatus("Connecting to server...");
    
    ajaxGet('data/main.json', function(cats) {
        var manifestQueue = [];
        // Just store paths, we will populate Select after counting data
        for(var i=0; i<cats.length; i++) {
            manifestQueue.push({ path: cats[i].path, name: cats[i].title });
        }
        processManifestQueue(manifestQueue, 0);

    }, function(err) {
        showError("Failed to load 'data/main.json'. Check internet or path.", true);
    });
}

function processManifestQueue(list, index) {
    if (index >= list.length) {
        finishLoading();
        return;
    }

    var item = list[index];
    updateStatus("Checking: " + item.name + " (" + (index+1) + "/" + list.length + ")");

    ajaxGet(item.path, function(files) {
        var mcqQueue = [];
        for(var j=0; j<files.length; j++) {
            mcqQueue.push({ url: files[j].path, cat: item.name });
        }
        
        loadMCQs(mcqQueue, 0, function() {
            processManifestQueue(list, index + 1);
        });

    }, function(err) {
        console.warn("Skipping category: " + item.path);
        processManifestQueue(list, index + 1);
    });
}

function loadMCQs(queue, idx, doneCallback) {
    if (idx >= queue.length) {
        doneCallback();
        return;
    }

    updateStatus("Loading: " + queue[idx].url.split('/').pop());

    ajaxGet(queue[idx].url, function(text) {
        parseMCQ(text, queue[idx].cat);
        loadMCQs(queue, idx + 1, doneCallback);
    }, function(err) {
        loadMCQs(queue, idx + 1, doneCallback);
    }, true);
}

// ========== PARSER ==========

function parseMCQ(text, cat) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    
    for (var i = 0; i < lines.length; i += 2) {
        if (i + 1 >= lines.length) break;

        var line1 = lines[i].trim();
        var line2 = lines[i+1].trim();

        if(!line1 || !line2) continue;

        var title = line1.replace(/\*\*/g, '').trim(); 
        var parts = line2.split('|');

        if(parts.length > 0 && parts[parts.length - 1] === '') {
            parts.pop();
        }

        var desc = "";
        var ansIndex = 0;
        var options = [];

        var lastItem = parts[parts.length - 1];
        var secondLastItem = parts[parts.length - 2];

        if (!isNaN(lastItem)) {
            ansIndex = parseInt(lastItem); 
            desc = null;
            options = parts.slice(0, parts.length - 1);
        } else {
            desc = lastItem;
            ansIndex = parseInt(secondLastItem);
            options = parts.slice(0, parts.length - 2);
        }

        var qObj = {
            id: app.data.length, // Unique ID for stability
            cat: cat,
            title: title,
            opts: options,
            ans: ansIndex,
            desc: desc
        };
        app.data.push(qObj);
        app.originalOrder.push(qObj);
    }
}

function finishLoading() {
    var loader = document.getElementById('floatingLoader');
    if(loader) {
        loader.textContent = "Data Loaded!";
        loader.style.backgroundColor = "#28a745";
        setTimeout(function() { loader.style.display = 'none'; }, 2000);
    }
    
    if (app.data.length === 0) {
        showError("No questions found!", true);
        return;
    }

    populateCategories();
    applyFilters();
}

function populateCategories() {
    var catSelect = document.getElementById('categorySelect');
    if(!catSelect) return;

    // Clear existing (except first if needed, but we rebuild usually)
    catSelect.innerHTML = '<option value="all">All Categories (' + app.data.length + ')</option>';

    // Count categories
    var counts = {};
    for(var i=0; i<app.data.length; i++) {
        var c = app.data[i].cat;
        counts[c] = (counts[c] || 0) + 1;
    }

    for (var catName in counts) {
        var opt = document.createElement('option');
        opt.value = catName;
        opt.textContent = catName + " (" + counts[catName] + ")";
        catSelect.appendChild(opt);
    }
    
    // Restore selection
    catSelect.value = app.catFilter;
    // If saved category no longer exists, revert to all
    if(catSelect.value === "") {
        catSelect.value = "all";
        app.catFilter = "all";
    }
}

// ========== LOGIC & RENDERING ==========

function applyFilters() {
    // 1. Filter
    var temp = app.data.filter(function(q) {
        if (app.catFilter !== 'all' && q.cat !== app.catFilter) return false;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        return true;
    });

    // 2. Shuffle or Sort
    if(app.shuffle) {
        // Fisher-Yates Shuffle
        for (var i = temp.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = temp[i];
            temp[i] = temp[j];
            temp[j] = t;
        }
    } else {
        // Restore ID order if not shuffled
        temp.sort(function(a, b) { return a.id - b.id; });
    }

    app.filteredData = temp;
    render();
}

function render() {
    var container = document.getElementById('questionList');
    var pagContainer = document.getElementById('paginationControls');
    
    if(!container) return;
    container.innerHTML = '';
    pagContainer.innerHTML = '';

    if(app.filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#888; background:#fff; border-radius:8px;"><h3>No questions found.</h3><p>Try changing filters or search query.</p></div>';
        return;
    }

    // Pagination Calculation
    var totalPages = Math.ceil(app.filteredData.length / app.itemsPerPage);
    
    if (app.currentPage < 1) app.currentPage = 1;
    if (app.currentPage > totalPages) app.currentPage = totalPages;
    
    // Save state whenever we render (ensures page number is saved)
    saveSettings();

    var start = (app.currentPage - 1) * app.itemsPerPage;
    var end = start + app.itemsPerPage;
    var pageData = app.filteredData.slice(start, end);

    // Render Cards
    for (var i = 0; i < pageData.length; i++) {
        createCard(pageData[i], container, start + i + 1);
    }

    // Render Pagination
    renderPaginationControls(pagContainer, totalPages);
}

function renderPaginationControls(container, totalPages) {
    // --- Prev Button ---
    var prevBtn = document.createElement('button');
    prevBtn.innerHTML = "&laquo; Prev";
    prevBtn.className = "opt-btn";
    prevBtn.style.cssText = "width: auto; padding: 8px 15px; margin: 0;";
    prevBtn.disabled = app.currentPage === 1;
    prevBtn.onclick = function() {
        if(app.currentPage > 1) {
            goToPage(app.currentPage - 1);
        }
    };
    container.appendChild(prevBtn);

    // --- Page Info ---
    var info = document.createElement('span');
    info.textContent = " Page " + app.currentPage + " of " + totalPages + " ";
    info.style.cssText = "font-weight: bold; color: #444; font-size: 14px;";
    container.appendChild(info);

    // --- Next Button ---
    var nextBtn = document.createElement('button');
    nextBtn.innerHTML = "Next &raquo;";
    nextBtn.className = "opt-btn";
    nextBtn.style.cssText = "width: auto; padding: 8px 15px; margin: 0;";
    nextBtn.disabled = app.currentPage === totalPages;
    nextBtn.onclick = function() {
        if(app.currentPage < totalPages) {
            goToPage(app.currentPage + 1);
        }
    };
    container.appendChild(nextBtn);

    // --- Jump To Input (New Feature) ---
    if(totalPages > 1) {
        var jumpContainer = document.createElement('span');
        jumpContainer.style.cssText = "margin-left: 15px; padding-left: 15px; border-left: 1px solid #ccc; display: flex; align-items: center;";
        
        var jumpInput = document.createElement('input');
        jumpInput.type = 'number';
        jumpInput.min = 1;
        jumpInput.max = totalPages;
        jumpInput.placeholder = '#';
        jumpInput.style.cssText = "width: 50px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; text-align: center; margin-right: 5px;";
        
        // Enter key support
        jumpInput.onkeyup = function(e) {
            if(e.key === 'Enter' || e.keyCode === 13) {
                jumpBtn.click();
            }
        };

        var jumpBtn = document.createElement('button');
        jumpBtn.textContent = "Go";
        jumpBtn.className = "opt-btn";
        jumpBtn.style.cssText = "width: auto; padding: 6px 12px; margin: 0; background: #6c757d; font-size: 12px;";
        jumpBtn.onclick = function() {
            var val = parseInt(jumpInput.value);
            if(val >= 1 && val <= totalPages) {
                goToPage(val);
            } else {
                alert("Please enter a page between 1 and " + totalPages);
            }
        };

        jumpContainer.appendChild(jumpInput);
        jumpContainer.appendChild(jumpBtn);
        container.appendChild(jumpContainer);
    }
}

function goToPage(pageNum) {
    app.currentPage = pageNum;
    render();
    // Scroll to Top smoothly
    try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) {
        window.scrollTo(0, 0); // Fallback for really old browsers
    }
}

function createCard(q, container, absoluteIndex) {
    var card = document.createElement('div');
    card.className = 'q-card';

    // Header
    var header = document.createElement('div');
    header.className = 'q-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    
    var catLabel = document.createElement('span');
    catLabel.className = 'cat-label';
    catLabel.textContent = q.cat;
    
    var numLabel = document.createElement('span');
    numLabel.style.cssText = "font-size: 12px; color: #888;";
    numLabel.textContent = "#" + absoluteIndex;

    header.appendChild(catLabel);
    header.appendChild(numLabel);
    card.appendChild(header);

    // Title
    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.textContent = q.title;
    card.appendChild(h3);

    var optsDiv = document.createElement('div');
    
    // Feedback Box
    var feedBox = document.createElement('div');
    feedBox.className = 'feedback-box';
    feedBox.style.display = 'none'; 

    var hasDesc = (q.desc && q.desc.trim().length > 0);
    var feedbackHTML = '';

    // Logic for Correct Answer display
    var correctText = q.opts[q.ans] || "Unknown";

    if (app.mode === 'study') {
        feedbackHTML = '<div style="color: #155724; background-color: #d4edda; padding: 10px; border-left: 4px solid #28a745;"><b>Correct Answer:</b> ' + correctText + '</div>';
        if(hasDesc) {
            feedbackHTML += '<div style="margin-top:10px; color:#444;">' + q.desc + '</div>';
        }
        feedBox.style.display = 'block'; 
    } else {
        // Quiz Mode content (Hidden initially)
        if(hasDesc) {
            feedbackHTML = '<div style="margin-top:5px;"><b>Explanation:</b> ' + q.desc + '</div>';
        } else {
             // If no desc, show simple correct answer on error
             feedbackHTML = '<div style="margin-top:5px;"><b>Correct Answer was:</b> ' + correctText + '</div>';
        }
    }
    
    feedBox.innerHTML = feedbackHTML;

    // Generate Options
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
                    // Disable all siblings
                    var siblings = optsDiv.getElementsByTagName('button');
                    for(var k=0; k<siblings.length; k++) {
                        siblings[k].disabled = true;
                        if(k === q.ans) {
                            siblings[k].className += ' correct';
                            siblings[k].innerHTML += ' &#10004;';
                        }
                    }
                    
                    if(idx !== q.ans) {
                        this.className += ' wrong';
                        this.innerHTML += ' &#10006;';
                        // Show feedback only on wrong answer or if requested
                        feedBox.style.display = 'block';
                    } else {
                        // Correct answer: Show feedback if explanation exists
                        if(hasDesc) feedBox.style.display = 'block';
                    }
                };
            }
            optsDiv.appendChild(btn);
        })(j);
    }

    card.appendChild(optsDiv);
    card.appendChild(feedBox);
    container.appendChild(card);
}

// ========== UTILS ==========

function updateStatus(msg) {
    var el = document.getElementById('floatingLoader');
    if(el) {
        el.style.display = 'block';
        el.textContent = msg;
    }
}

function showError(msg, isFatal) {
    var loader = document.getElementById('floatingLoader');
    if(loader) loader.style.display = 'none';

    var errDiv = document.getElementById('errorMsg');
    if(errDiv) {
        errDiv.style.display = 'block';
        errDiv.innerHTML = "&#9888; " + msg;
    }

    if(isFatal) alert("Error: " + msg);
}

function checkLatestDate(headerDate) {
    if(!headerDate) return;
    var fileDate = new Date(headerDate);
    if (!app.lastModified || fileDate > app.lastModified) {
        app.lastModified = fileDate;
        updateFooterDate();
    }
}

function updateFooterDate() {
    var el = document.getElementById('lastUpdateDate');
    if(el && app.lastModified) {
        el.textContent = app.lastModified.toLocaleDateString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric' 
        });
    }
}

function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    // Cache busting
    var freshUrl = url + '?t=' + new Date().getTime(); 
    xhr.open('GET', freshUrl, true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            checkLatestDate(xhr.getResponseHeader("Last-Modified"));
            try {
                var data = isText ? xhr.responseText : JSON.parse(xhr.responseText);
                success(data);
            } catch (e) {
                if (error) error(e);
            }
        } else {
            if (error) error(new Error("Status: " + xhr.status));
        }
    };
    xhr.onerror = function() { if (error) error(new Error("Network Error")); };
    try { xhr.send(); } catch(e) { if(error) error(e); }
}

// Service Worker Logic
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(err) {
        console.log('SW Registration failed: ', err);
    });
}

var deferredPrompt;
var installBtn = document.getElementById('installBtn');

if(installBtn) {
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'block';
    });

    installBtn.addEventListener('click', function(e) {
        installBtn.style.display = 'none';
        if(deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function(choiceResult) {
                deferredPrompt = null;
            });
        }
    });
}
