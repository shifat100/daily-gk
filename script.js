"use strict";

var app = {
    data: [],
    catFilter: 'all',
    searchQuery: '',
    mode: 'quiz',
    loading: true,
    lastModified: null
};

window.onload = function() {
    initApp();
};

function initApp() {
    createDynamicUI();

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

    startLoading();
}

// ========== DYNAMIC UI ==========

function createDynamicUI() {
    // Floating Loader
    var loader = document.createElement('div');
    loader.id = 'floatingLoader';
    loader.style.cssText = "position: fixed; bottom: 15px; left: 15px; background: rgba(0, 0, 0, 0.85); color: #fff; padding: 10px 15px; border-radius: 30px; font-size: 13px; font-family: sans-serif; z-index: 9999; display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: opacity 0.3s;";
    loader.textContent = "Initializing...";
    document.body.appendChild(loader);

    // Footer
    var footer = document.createElement('div');
    footer.id = 'appFooter';
    footer.style.cssText = "text-align: center; margin: 40px 0 20px 0; font-size: 0.85em; color: #777; border-top: 1px solid #eee; padding-top: 20px;";
    
    var currentYear = new Date().getFullYear();
    footer.innerHTML = `
        <div>&copy; ${currentYear} All Rights Reserved.</div>
        <div style="margin-top: 5px;">Last Updated: <span id="lastUpdateDate" style="font-weight: bold;">Calculating...</span></div>
    `;
    
    var container = document.getElementById('questionList');
    if(container && container.parentNode) {
        container.parentNode.appendChild(footer);
    } else {
        document.body.appendChild(footer);
    }
}

// ========== DATA LOADING ==========

function startLoading() {
    // Hide static loader if exists
    var bigLoader = document.getElementById('loader');
    if(bigLoader) bigLoader.style.display = 'none';

    updateStatus("Connecting to server...");
    
    // মেইন ফাইল লোড করার চেষ্টা
    ajaxGet('data/main.json', function(cats) {
        var catSelect = document.getElementById('categorySelect');
        var manifestQueue = [];

        if(catSelect) {
            for(var i=0; i<cats.length; i++) {
                var opt = document.createElement('option');
                opt.value = cats[i].title;
                opt.textContent = cats[i].title;
                catSelect.appendChild(opt);
                manifestQueue.push({ path: cats[i].path, name: cats[i].title });
            }
        } else {
            for(var i=0; i<cats.length; i++) {
                manifestQueue.push({ path: cats[i].path, name: cats[i].title });
            }
        }

        processManifestQueue(manifestQueue, 0);

    }, function(err) {
        // CRITICAL ERROR: মেইন ফাইল পাওয়া যায়নি
        showError("Failed to load 'data/main.json'.\nPlease check your internet connection or file path.", true);
    });
}

function processManifestQueue(list, index) {
    if (index >= list.length) {
        finishLoading();
        return;
    }

    var item = list[index];
    updateStatus("Checking: " + item.name + "...");

    ajaxGet(item.path, function(files) {
        var mcqQueue = [];
        for(var j=0; j<files.length; j++) {
            mcqQueue.push({ url: files[j].path, cat: item.name });
        }
        
        loadMCQs(mcqQueue, 0, function() {
            processManifestQueue(list, index + 1);
        });

    }, function(err) {
        // এখানে Alert দিচ্ছি না, শুধু কনসোলে ওয়ার্নিং দিচ্ছি যাতে অ্যাপ বন্ধ না হয়
        console.warn("Skipping category due to error: " + item.path);
        updateStatus("Skipping: " + item.name + " (Not Found)");
        setTimeout(function() {
            processManifestQueue(list, index + 1);
        }, 1000);
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
        console.warn("Skipping file: " + queue[idx].url);
        loadMCQs(queue, idx + 1, doneCallback);
    }, true);
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
    var loader = document.getElementById('floatingLoader');
    if(loader) {
        loader.textContent = "Done!";
        loader.style.backgroundColor = "#28a745"; // Green success
        setTimeout(function() { loader.style.display = 'none'; }, 2000);
    }
    
    // ডাটা না থাকলে এরর অ্যালার্ট
    if (app.data.length === 0) {
        showError("No questions found!\nPlease check your data folder structure.", true);
        return;
    }

    app.data.reverse();
    render();
}

// ========== DATE LOGIC ==========

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
        var options = { year: 'numeric', month: 'short', day: 'numeric' };
        el.textContent = app.lastModified.toLocaleDateString('en-US', options);
    }
}

// ========== RENDERING ==========

function render() {
    var container = document.getElementById('questionList');
    if(!container) return;

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
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#888; font-size:16px;">No matching questions found.</div>';
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

// ========== ERROR & UTILS ==========

function updateStatus(msg) {
    var el = document.getElementById('floatingLoader');
    if(el) {
        el.style.display = 'block';
        el.textContent = msg;
    }
}

/**
 * ইউজারকে এরর দেখানোর ফাংশন
 * @param {string} msg - এরর মেসেজ
 * @param {boolean} isFatal - যদি true হয়, তবে ব্রাউজার Alert দিবে
 */
function showError(msg, isFatal) {
    // লোডার হাইড
    var loader = document.getElementById('floatingLoader');
    if(loader) loader.style.display = 'none';

    // HTML এরর বক্সে মেসেজ দেখানো
    var errDiv = document.getElementById('errorMsg');
    if(errDiv) {
        errDiv.style.display = 'block';
        errDiv.innerHTML = "⚠️ <b>Error:</b> " + msg;
        errDiv.style.background = "#ffe6e6";
        errDiv.style.color = "#d63031";
        errDiv.style.padding = "15px";
        errDiv.style.border = "1px solid #ff7675";
        errDiv.style.borderRadius = "5px";
    }

    // যদি ফ্যাটাল এরর হয়, তাহলে পপ-আপ অ্যালার্ট দিন
    if(isFatal) {
        alert("CRITICAL ERROR:\n\n" + msg);
    }
}

function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    var freshUrl = url + '?t=' + new Date().getTime(); 
    xhr.open('GET', freshUrl, true);
    
    xhr.onload = function() {
        if (xhr.status === 200) {
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
}
