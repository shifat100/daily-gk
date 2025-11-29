"use strict";

var app = {
    data: [],
    filteredData: [], // ফিল্টার করা ডাটা রাখার জন্য
    catFilter: 'all',
    searchQuery: '',
    mode: 'quiz',
    loading: true,
    lastModified: null,
    
    // Pagination Config
    currentPage: 1,
    itemsPerPage: 5 // প্রতি পেজে কয়টি প্রশ্ন দেখাতে চান তা এখানে সেট করুন
};

window.onload = function() {
    initApp();
};

function initApp() {
    createDynamicUI();

    var viewModeEl = document.getElementById('viewMode');
    if(viewModeEl) {
        viewModeEl.onchange = function(e) { 
            app.mode = e.target.value; 
            render(); 
        };
    }

    var catSelectEl = document.getElementById('categorySelect');
    if(catSelectEl) {
        catSelectEl.onchange = function(e) { 
            app.catFilter = e.target.value; 
            document.getElementById('searchInput').value = ''; 
            app.searchQuery = '';
            app.currentPage = 1; // ক্যাটাগরি বদলালে প্রথম পেজে যান
            render(); 
        };
    }

    var searchInputEl = document.getElementById('searchInput');
    if(searchInputEl) {
        searchInputEl.onkeyup = function(e) { 
            app.searchQuery = e.target.value.toLowerCase();
            app.currentPage = 1; // সার্চ করলে প্রথম পেজে যান
            render(); 
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
    var bigLoader = document.getElementById('loader');
    if(bigLoader) bigLoader.style.display = 'none';

    updateStatus("Connecting to server...");
    
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
        showError("Failed to load 'data/main.json'. Check internet or path.", true);
    });
}

function processManifestQueue(list, index) {
    if (index >= list.length) {
        finishLoading();
        return;
    }

    var item = list[index];
    updateStatus("Checking: " + item.name);

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
        console.warn("Skipping file: " + queue[idx].url);
        loadMCQs(queue, idx + 1, doneCallback);
    }, true);
}

// ========== UPDATED PARSER ==========
function parseMCQ(text, cat) {
    var lines = text.split('\n');
    if(lines.length < 2) return;

    // ১. টাইটেল থেকে ** এবং স্পেস পরিষ্কার করা
    var title = lines[0].replace(/\*\*/g, '').trim();
    
    // ২. অপশন এবং উত্তর পার্স করা
    var rawParts = lines[1].split('|');
    
    // শেষের এম্পটি স্ট্রিং থাকলে ফেলে দিন (User format: ...|2|)
    if (rawParts.length > 0 && rawParts[rawParts.length - 1] === '') {
        rawParts.pop();
    }

    if(rawParts.length < 3) return; // অন্তত ২টা অপশন ১টা উত্তর থাকা চাই

    var options = [];
    var ansIndex = -1;
    var desc = "";

    // লজিক: চেক করি শেষের আইটেমটা কি নাম্বার?
    // যদি নাম্বার হয়, তবে ডেসক্রিপশন নেই।
    // যদি নাম্বার না হয়, তবে শেষেরটা ডেসক্রিপশন, তার আগেরটা উত্তর।
    
    var lastItem = rawParts[rawParts.length - 1];
    var isLastNumber = !isNaN(lastItem) && lastItem.trim() !== '';

    if (isLastNumber) {
        // ফরম্যাট: Option | Option | Ans
        ansIndex = parseInt(lastItem); // ইউজার বলেছে 0 based, তাই বিয়োগ করছি না
        desc = ""; // ডেসক্রিপশন নেই
        options = rawParts.slice(0, rawParts.length - 1);
    } else {
        // ফরম্যাট: Option | Option | Ans | Desc
        // চেক করি সেকেন্ড লাস্ট আইটেম নাম্বার কিনা
        var secondLast = rawParts[rawParts.length - 2];
        if (!isNaN(secondLast)) {
            ansIndex = parseInt(secondLast);
            desc = lastItem;
            options = rawParts.slice(0, rawParts.length - 2);
        } else {
            return; // ফরম্যাট ঠিক নেই
        }
    }

    app.data.push({
        cat: cat,
        title: title,
        opts: options,
        ans: ansIndex,
        desc: desc
    });
}

function finishLoading() {
    var loader = document.getElementById('floatingLoader');
    if(loader) {
        loader.textContent = "Done!";
        loader.style.backgroundColor = "#28a745";
        setTimeout(function() { loader.style.display = 'none'; }, 2000);
    }
    
    if (app.data.length === 0) {
        showError("No questions found!", true);
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

// ========== RENDER & PAGINATION ==========

function render() {
    var container = document.getElementById('questionList');
    if(!container) return;

    // ১. ফিল্টারিং
    app.filteredData = app.data.filter(function(q) {
        if (app.catFilter !== 'all' && q.cat !== app.catFilter) return false;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        return true;
    });

    container.innerHTML = '';

    if(app.filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">No matching questions found.</div>';
        return;
    }

    // ২. পেজিনেশন লজিক
    var totalPages = Math.ceil(app.filteredData.length / app.itemsPerPage);
    
    // পেজ নাম্বার ভ্যালিডেট করা
    if (app.currentPage > totalPages) app.currentPage = totalPages;
    if (app.currentPage < 1) app.currentPage = 1;

    var startIdx = (app.currentPage - 1) * app.itemsPerPage;
    var endIdx = startIdx + app.itemsPerPage;
    var pageItems = app.filteredData.slice(startIdx, endIdx);

    // ৩. কার্ড রেন্ডার
    for (var i = 0; i < pageItems.length; i++) {
        createCard(pageItems[i], container);
    }

    // ৪. পেজিনেশন কন্ট্রোল রেন্ডার
    renderPaginationControls(container, totalPages);
}

function renderPaginationControls(container, totalPages) {
    if (totalPages <= 1) return;

    var navDiv = document.createElement('div');
    navDiv.style.cssText = "display:flex; justify-content:center; gap:10px; margin-top:20px; padding: 10px;";

    // Previous Button
    var prevBtn = document.createElement('button');
    prevBtn.innerHTML = "&#8592; Prev"; // Left Arrow
    prevBtn.className = "opt-btn"; // Reuse existing style
    prevBtn.style.width = "auto";
    prevBtn.style.background = app.currentPage === 1 ? "#eee" : "#fff";
    prevBtn.disabled = app.currentPage === 1;
    prevBtn.onclick = function() {
        if(app.currentPage > 1) {
            app.currentPage--;
            render();
            window.scrollTo(0, 0);
        }
    };

    // Page Info
    var infoSpan = document.createElement('span');
    infoSpan.textContent = "Page " + app.currentPage + " of " + totalPages;
    infoSpan.style.alignSelf = "center";
    infoSpan.style.fontSize = "14px";
    infoSpan.style.fontWeight = "bold";

    // Next Button
    var nextBtn = document.createElement('button');
    nextBtn.innerHTML = "Next &#8594;"; // Right Arrow
    nextBtn.className = "opt-btn"; // Reuse existing style
    nextBtn.style.width = "auto";
    nextBtn.style.background = app.currentPage === totalPages ? "#eee" : "#fff";
    nextBtn.disabled = app.currentPage === totalPages;
    nextBtn.onclick = function() {
        if(app.currentPage < totalPages) {
            app.currentPage++;
            render();
            window.scrollTo(0, 0);
        }
    };

    navDiv.appendChild(prevBtn);
    navDiv.appendChild(infoSpan);
    navDiv.appendChild(nextBtn);
    container.appendChild(navDiv);
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

    // ডেসক্রিপশন হ্যান্ডলিং (Null Check)
    var hasDesc = q.desc && q.desc.trim() !== "";
    
    var feedbackHTML = '';
    if (app.mode === 'study') {
        feedbackHTML = '<b>Correct Answer: ' + q.opts[q.ans] + '</b>';
        if(hasDesc) feedbackHTML += '<br><br>' + q.desc;
        feedBox.style.display = 'block'; 
    } else {
        if(hasDesc) {
            feedbackHTML = '<b>Explanation:</b> ' + q.desc;
        } else {
            feedbackHTML = ''; // কুইজ মোডে ডেসক্রিপশন না থাকলে বক্স খালি থাকবে
        }
    }
    feedBox.innerHTML = feedbackHTML;

    // ডাইনামিক অপশন লুপ
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
                    
                    // কুইজ মোডে ডেসক্রিপশন থাকলে দেখাবে, না থাকলে দেখাবে না
                    if(hasDesc) {
                        feedBox.style.display = 'block';
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

// ========== ERROR & UTILS ==========

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
        errDiv.innerHTML = "⚠️ <b>Error:</b> " + msg;
        errDiv.style.background = "#ffe6e6";
        errDiv.style.color = "#d63031";
        errDiv.style.padding = "15px";
        errDiv.style.border = "1px solid #ff7675";
        errDiv.style.borderRadius = "5px";
    }
    if(isFatal) alert("CRITICAL ERROR:\n\n" + msg);
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
}    if(searchInputEl) {
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
