"use strict";

var app = {
    data: [],
    catFilter: 'all',
    searchQuery: '',
    mode: 'quiz',
    loading: true,
    lastModified: null,
    // Pagination Settings
    currentPage: 1,
    itemsPerPage: 20 // প্রতি পেজে কয়টি প্রশ্ন দেখাতে চান তা এখানে সেট করুন
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
            app.currentPage = 1; // মোড পাল্টালে প্রথম পেজে যাবে
            render(); 
        };
    }

    var catSelectEl = document.getElementById('categorySelect');
    if(catSelectEl) {
        catSelectEl.onchange = function(e) { 
            app.catFilter = e.target.value; 
            document.getElementById('searchInput').value = ''; 
            app.searchQuery = '';
            app.currentPage = 1; // ফিল্টার করলে প্রথম পেজে যাবে
            render(); 
        };
    }

    var searchInputEl = document.getElementById('searchInput');
    if(searchInputEl) {
        searchInputEl.onkeyup = function(e) { 
            app.searchQuery = e.target.value.toLowerCase(); 
            app.currentPage = 1; // সার্চ করলে প্রথম পেজে যাবে
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
    loader.style.cssText = "position: fixed; bottom: 15px; left: 15px; background: rgba(0, 0, 0, 0.85); color: #fff; padding: 10px 15px; border-radius: 30px; font-size: 13px; font-family: sans-serif; z-index: 9999; display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3);";
    loader.textContent = "Initializing...";
    document.body.appendChild(loader);

    // Pagination Container (Add below questionList)
    var qList = document.getElementById('questionList');
    if(qList) {
        var pagDiv = document.createElement('div');
        pagDiv.id = 'paginationControls';
        pagDiv.style.cssText = "display: flex; justify-content: center; gap: 10px; margin: 20px 0;";
        qList.parentNode.appendChild(pagDiv);
    }

    // Footer
    var footer = document.createElement('div');
    footer.id = 'appFooter';
    footer.style.cssText = "text-align: center; margin: 30px 0 20px 0; font-size: 0.85em; color: #777; border-top: 1px solid #eee; padding-top: 20px;";
    
    var currentYear = new Date().getFullYear();
    footer.innerHTML = `
        <div>&copy; ${currentYear} All Rights Reserved.</div>
        <div style="margin-top: 5px;">Last Updated: <span id="lastUpdateDate" style="font-weight: bold;">Calculating...</span></div>
    `;
    
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
        loadMCQs(queue, idx + 1, doneCallback);
    }, true);
}

// ========== PARSER (UPDATED) ==========
function parseMCQ(text, cat) {
    // Windows (\r\n) এবং Linux (\n) উভয় নিউলাইন হ্যান্ডেল করার জন্য
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    
    // প্রতি ২ লাইন মিলে একটি প্রশ্ন
    for (var i = 0; i < lines.length; i += 2) {
        if (i + 1 >= lines.length) break; // যদি পেয়ার না থাকে

        var line1 = lines[i].trim();
        var line2 = lines[i+1].trim();

        if(!line1 || !line2) continue;

        var title = line1.replace(/\*\*/g, '').trim(); // ** রিমুভ করা
        var parts = line2.split('|');

        // ট্রেলিং পাইপ (|) থাকলে লাস্ট এম্পটি এলিমেন্ট রিমুভ করি
        if(parts.length > 0 && parts[parts.length - 1] === '') {
            parts.pop();
        }

        // ডাটা এক্সট্রাকশন লজিক
        var desc = "";
        var ansIndex = 0;
        var options = [];

        // লাস্ট আইটেমটি কি উত্তর ইনডেক্স নাকি ডেসক্রিপশন?
        var lastItem = parts[parts.length - 1];
        var secondLastItem = parts[parts.length - 2];

        // যদি লাস্ট আইটেম নাম্বার হয়, তাহলে ডেসক্রিপশন নেই
        if (!isNaN(lastItem)) {
            ansIndex = parseInt(lastItem); // 0-based index (সরাসরি ব্যবহার)
            desc = null; // কোনো ডেসক্রিপশন নেই
            options = parts.slice(0, parts.length - 1); // ইনডেক্স ছাড়া বাকি সব অপশন
        } 
        // যদি লাস্ট আইটেম নাম্বার না হয়, তাহলে সেটা ডেসক্রিপশন
        else {
            desc = lastItem;
            ansIndex = parseInt(secondLastItem); // ডেসক্রিপশনের আগেরটা ইনডেক্স
            options = parts.slice(0, parts.length - 2); // ইনডেক্স ও ডেসক্রিপশন বাদে বাকি সব অপশন
        }

        app.data.push({
            cat: cat,
            title: title,
            opts: options,
            ans: ansIndex,
            desc: desc
        });
    }
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

    
    //app.data.reverse();
    render();
}

// ========== RENDERING & PAGINATION ==========

function render() {
    var container = document.getElementById('questionList');
    var pagContainer = document.getElementById('paginationControls');
    
    if(!container) return;
    container.innerHTML = '';
    pagContainer.innerHTML = '';

    // ১. ফিল্টারিং
    var filteredData = app.data.filter(function(q) {
        if (app.catFilter !== 'all' && q.cat !== app.catFilter) return false;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        return true;
    });

    if(filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">No matching questions found.</div>';
        return;
    }

    // ২. পেজিনেশন লজিক
    var totalPages = Math.ceil(filteredData.length / app.itemsPerPage);
    
    // বাউন্ডারি চেক
    if (app.currentPage < 1) app.currentPage = 1;
    if (app.currentPage > totalPages) app.currentPage = totalPages;

    var start = (app.currentPage - 1) * app.itemsPerPage;
    var end = start + app.itemsPerPage;
    var pageData = filteredData.slice(start, end);

    // ৩. প্রশ্ন রেন্ডার করা
    for (var i = 0; i < pageData.length; i++) {
        createCard(pageData[i], container);
    }

    // ৪. পেজিনেশন বাটন রেন্ডার করা
    renderPaginationControls(pagContainer, totalPages);
}

function renderPaginationControls(container, totalPages) {
    if(totalPages <= 1) return; // এক পেজ হলে বাটন দরকার নেই

    // Previous Button
    var prevBtn = document.createElement('button');
    prevBtn.innerHTML = "&laquo; Prev";
    prevBtn.className = "opt-btn"; // সেইম স্টাইল রিইউজ করা
    prevBtn.style.width = "auto";
    prevBtn.style.padding = "8px 20px";
    prevBtn.style.margin = "0";
    prevBtn.disabled = app.currentPage === 1;
    prevBtn.onclick = function() {
        if(app.currentPage > 1) {
            app.currentPage--;
            render();
            window.scrollTo(0, 0); // উপরে স্ক্রল করুন
        }
    };

    // Page Info
    var info = document.createElement('span');
    info.textContent = "Page " + app.currentPage + " of " + totalPages;
    info.style.cssText = "align-self: center; font-size: 14px; font-weight: bold; color: #555;";

    // Next Button
    var nextBtn = document.createElement('button');
    nextBtn.innerHTML = "Next &raquo;";
    nextBtn.className = "opt-btn";
    nextBtn.style.width = "auto";
    nextBtn.style.padding = "8px 20px";
    nextBtn.style.margin = "0";
    nextBtn.disabled = app.currentPage === totalPages;
    nextBtn.onclick = function() {
        if(app.currentPage < totalPages) {
            app.currentPage++;
            render();
            window.scrollTo(0, 0);
        }
    };

    container.appendChild(prevBtn);
    container.appendChild(info);
    container.appendChild(nextBtn);
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

    var optsDiv = document.createElement('div');
    
    // Feedback Box
    var feedBox = document.createElement('div');
    feedBox.className = 'feedback-box';
    feedBox.style.display = 'none'; // ডিফল্ট হাইড

    // --- Conditional Description Logic ---
    var hasDesc = (q.desc && q.desc.trim().length > 0);
    var feedbackHTML = '';

    if (app.mode === 'study') {
        feedbackHTML = '<b>Correct Answer: ' + q.opts[q.ans] + '</b>';
        if(hasDesc) {
            feedbackHTML += '<br><br>' + q.desc;
        }
        feedBox.style.display = 'block'; 
    } else {
        if(hasDesc) {
            feedbackHTML = '<b>Explanation:</b> ' + q.desc;
        } else {
            // যদি ডেসক্রিপশন না থাকে, কুইজ মোডে শুধু কারেক্ট বা রং দেখাবে, বক্স আসবে না (যদি ভুল হয়)
            // অথবা আমরা "Correct Answer is..." দেখাতে পারি।
            // রিকোয়ারমেন্ট অনুযায়ী "if desc is null not showing description"
            feedbackHTML = ''; 
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
                    // Disable all
                    var siblings = optsDiv.getElementsByTagName('button');
                    for(var k=0; k<siblings.length; k++) {
                        siblings[k].disabled = true;
                        if(k === q.ans) siblings[k].className += ' correct';
                    }
                    
                    if(idx !== q.ans) this.className += ' wrong';
                    
                    // Show feedback ONLY if there is description OR if we want to show correct ans
                    // রিকোয়ারমেন্ট: "if description is null not showing description"
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

// ========== UTILS & DATE ==========

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
        errDiv.innerHTML = "⚠️ " + msg;
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
            if (error) error(new Error(xhr.status));
        }
    };
    xhr.onerror = function() { if (error) error(new Error("Network")); };
    try { xhr.send(); } catch(e) { if(error) error(e); }
}

  // Service Worker রেজিস্টার করা
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');

  // ব্রাউজার যখন ইন্সটল প্রম্পট দিতে চাইবে তখন এই ইভেন্টটি ঘটবে
  window.addEventListener('beforeinstallprompt', (e) => {
    // ডিফল্ট প্রম্পট বন্ধ রাখা
    e.preventDefault();
    // ইভেন্টটি সেভ করে রাখা যাতে পরে ব্যবহার করা যায়
    deferredPrompt = e;
    // এবার বাটনটি দৃশ্যমান করা
    installBtn.style.display = 'block';
  });

  // বাটনে ক্লিক করলে যা হবে
  installBtn.addEventListener('click', (e) => {
    // বাটনটি আবার লুকিয়ে ফেলা
    installBtn.style.display = 'none';
    // ব্রাউজারের ইন্সটল পপ-আপ দেখানো
    deferredPrompt.prompt();
    // ইউজার ইন্সটল করল কি না তা চেক করা
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      deferredPrompt = null;
    });
  });

