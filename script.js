"use strict";

var app = {
    data: [],           // সকল প্রশ্ন এখানে জমা হবে
    filteredData: [],   // ফিল্টার করা প্রশ্ন
    treeData: {},       // সাইডবার ট্রি স্ট্রাকচার
    cart: JSON.parse(localStorage.getItem('gk_cart')) || [], // কার্ট ডেটা (সেভড)
    isCartView: false,  // ইউজার কার্ট ভিউতে আছে কি না
    
    // ফিল্টার এবং সেটিংস
    currCat: null,
    currTopic: null,
    mode: 'quiz',
    shuffle: false,
    sortOrder: 'asc',
    searchQuery: '',
    
    // পেজিনেশন
    page: 1,
    perPage: 10,
    
    // মেটা তথ্য
    lastModified: null,
    filesLoaded: 0,
    totalFiles: 0
};

window.onload = function() {
    initApp();
};

function initApp() {
    setupEventListeners();
    setupPWA();
    setupSecurity(); // রাইট ক্লিক ও কপি প্রোটেকশন
    renderSkeleton();
    startIncrementalLoad(); // ইনক্রিমেন্টাল লোডিং শুরু
}

// ==========================================
// ১. ইভেন্ট লিসেনার সেটআপ
// ==========================================
function setupEventListeners() {
    // মোবাইল সাইডবার কন্ট্রোল
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('appSidebar');
    var overlay = document.getElementById('sidebarOverlay');

    if(toggle) {
        toggle.onclick = function() {
            sidebar.classList.toggle('show');
            overlay.classList.toggle('show');
        };
    }
    if(overlay) overlay.onclick = function() {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    };

    // ভিউ মোড (Quiz/Study)
    document.getElementById('viewMode').onchange = function(e) {
        app.mode = e.target.value;
        render();
    };

    // সার্চ ইনপুট
    var searchTimeout;
    document.getElementById('searchInput').onkeyup = function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
            app.searchQuery = e.target.value.toLowerCase();
            app.page = 1;
            runFilter();
        }, 300);
    };

    // সেটিংস কন্ট্রোল
    document.getElementById('shuffleCheck').onchange = function(e) {
        app.shuffle = e.target.checked;
        runFilter();
    };
    document.getElementById('sortSelect').onchange = function(e) {
        app.sortOrder = e.target.value;
        app.shuffle = false;
        document.getElementById('shuffleCheck').checked = false;
        runFilter();
    };
    document.getElementById('perPageSelect').onchange = function(e) {
        app.perPage = parseInt(e.target.value);
        app.page = 1;
        render();
    };

    // কার্ট ভিউ কন্ট্রোল
    document.getElementById('cartViewBtn').onclick = function() {
        app.isCartView = true;
        app.page = 1;
        render();
    };
    document.getElementById('exitCart').onclick = function() {
        app.isCartView = false;
        app.page = 1;
        render();
    };

    // ব্যাক টু টপ
    var bttBtn = document.getElementById('backToTop');
    var scrollContainer = document.getElementById('mainScroll');
    scrollContainer.onscroll = function() {
        if (scrollContainer.scrollTop > 300) bttBtn.classList.add('show');
        else bttBtn.classList.remove('show');
    };
    bttBtn.onclick = function() {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    };

    updateCartBadge();
}

// ==========================================
// ২. ইনক্রিমেন্টাল লোডিং (ব্যাকগ্রাউন্ডে লোড হবে)
// ==========================================
function startIncrementalLoad() {
    ajaxGet('data/main.json', function(cats) {
        var fileTasks = [];
        var pendingCats = cats.length;

        cats.forEach(function(cat) {
            app.treeData[cat.title] = {};
            // ক্যাটাগরির ফাইল লিস্ট আনা
            ajaxGet(cat.path, function(files) {
                files.forEach(function(f) {
                    fileTasks.push({ url: f.path, cat: cat.title, topic: f.title });
                });
                pendingCats--;
                
                // সব ক্যাটাগরির লিস্ট পাওয়া গেলে লোডিং শুরু
                if (pendingCats === 0) {
                    app.totalFiles = fileTasks.length;
                    processFilesSequentially(fileTasks, 0);
                }
            });
        });
    });
}

function processFilesSequentially(tasks, index) {
    if (index >= tasks.length) return;

    var task = tasks[index];
    ajaxGet(task.url, function(text) {
        parseAndStore(text, task.cat, task.topic);
        app.filesLoaded++;
        
        // UI আপডেট (অপেক্ষা করবে না, লোড হলেই দেখাবে)
        buildSidebarTree();
        if(!app.isCartView) runFilter();
        
        // পরবর্তী ফাইল লোড
        processFilesSequentially(tasks, index + 1);
    }, function() {
        processFilesSequentially(tasks, index + 1);
    }, true);
}

function parseAndStore(text, cat, topic) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    for (var i = 0; i < lines.length; i += 2) {
        var line1 = (lines[i] || "").trim();
        var line2 = (lines[i+1] || "").trim();
        if(!line1 || !line2) continue;

        var parts = line2.split('|');
        if(parts[parts.length-1] === '') parts.pop();

        var ans, desc = null, opts;
        var last = parts[parts.length-1];
        if(!isNaN(last) && last !== "") {
            ans = parseInt(last);
            opts = parts.slice(0, -1);
        } else {
            ans = parseInt(parts[parts.length-2]);
            desc = last;
            opts = parts.slice(0, -2);
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
        app.treeData[cat][topic] = (app.treeData[cat][topic] || 0) + 1;
    }
}

// ==========================================
// ৩. কার্ট লজিক
// ==========================================
function toggleCart(qId) {
    var index = app.cart.indexOf(qId);
    if (index === -1) {
        app.cart.push(qId);
    } else {
        app.cart.splice(index, 1);
    }
    localStorage.setItem('gk_cart', JSON.stringify(app.cart));
    updateCartBadge();
    
    if(app.isCartView) render();
    else {
        var btn = document.querySelector(`.cart-toggle-btn[data-qid="${qId}"]`);
        if(btn) {
            btn.innerHTML = (app.cart.indexOf(qId) === -1) ? '+' : '-';
            btn.classList.toggle('added');
        }
    }
}

function updateCartBadge() {
    document.getElementById('cartCount').textContent = app.cart.length;
}

// ==========================================
// ৪. ফিল্টার ও রেন্ডারিং
// ==========================================
function runFilter() {
    var res = app.data.filter(function(q) {
        if (app.currCat && q.cat !== app.currCat) return false;
        if (app.currTopic && q.topic !== app.currTopic) return false;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        return true;
    });

    if (app.shuffle) {
        res.sort(function() { return 0.5 - Math.random(); });
    } else {
        if (app.sortOrder === 'desc') res.sort(function(a, b) { return b.id - a.id; });
        else res.sort(function(a, b) { return a.id - b.id; });
    }

    app.filteredData = res;
    render();
}

function render() {
    var container = document.getElementById('questionList');
    var cartActions = document.getElementById('cartActions');
    var topicHeader = document.getElementById('topicHeader');
    var topicName = document.getElementById('topicName');

    container.innerHTML = '';
    
    // কার্ট মোড না কি সাধারণ মোড?
    var sourceData = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.filteredData;
    
    if(cartActions) cartActions.style.display = app.isCartView ? 'flex' : 'none';
    if(topicHeader) {
        topicHeader.style.display = 'block';
        topicName.textContent = app.isCartView ? "Selected Questions (Cart)" : (app.currTopic || app.currCat || "All Questions");
    }

    if(sourceData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#777;">${app.isCartView ? 'কার্ট খালি। প্রশ্ন যোগ করতে (+) বাটনে চাপ দিন।' : 'কোনো প্রশ্ন পাওয়া যায়নি।'}</div>`;
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    var totalPages = Math.ceil(sourceData.length / app.perPage);
    if(app.page > totalPages) app.page = totalPages;
    var start = (app.page - 1) * app.perPage;
    var pageItems = sourceData.slice(start, start + app.perPage);

    pageItems.forEach(function(q, i) {
        createCard(q, container, start + i + 1);
    });

    renderPagination(totalPages);
}

function createCard(q, container, index) {
    var div = document.createElement('div');
    div.className = 'q-card';
    
    var isAdded = app.cart.includes(q.id);
    var cartBtn = `<button class="cart-toggle-btn ${isAdded ? 'added' : ''}" data-qid="${q.id}" onclick="toggleCart(${q.id})">${isAdded ? '-' : '+'}</button>`;

    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = `<span>${q.cat} &bull; ${q.topic}</span> <div> <span style="margin-left:10px">#${index}</span></div>`;
    div.appendChild(meta);

    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.innerHTML = q.title + cartBtn;
    
    div.appendChild(h3);

    var optsDiv = document.createElement('div');
    var feedback = document.createElement('div');
    feedback.className = 'feedback';
    feedback.style.cssText = "display:none; margin-top:10px; padding:10px; background:#eef5ff; border-radius:5px; font-size:0.9rem;";

    q.opts.forEach(function(opt, idx) {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        
        if(app.mode === 'study') {
            btn.disabled = true;
            if(idx === q.ans) { 
                btn.classList.add('correct'); 
                btn.innerHTML = '&#10004; ' + btn.innerHTML;
            }
            if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>ব্যাখ্যা:</b> " + q.desc; }
        } else {
            btn.onclick = function() {
                var siblings = optsDiv.querySelectorAll('.opt-btn');
                siblings.forEach(sb => sb.disabled = true);
                siblings[q.ans].classList.add('correct');

                if(idx !== q.ans) {
                    this.classList.add('wrong');
                    feedback.style.display = 'block';
                    feedback.innerHTML = `<b>সঠিক উত্তর:</b> ${q.opts[q.ans]} ${q.desc ? '<br><b>ব্যাখ্যা:</b> ' + q.desc : ''}`;
                } else if(q.desc) {
                    feedback.style.display = 'block';
                    feedback.innerHTML = "<b>ব্যাখ্যা:</b> " + q.desc;
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
// ৫. সাইডবার ট্রি
// ==========================================
function buildSidebarTree() {
    var ul = document.getElementById('categoryTree');
    if(!ul) return;
    ul.innerHTML = '<li class="tree-parent" onclick="setFilter(null, null)"><span>All Questions</span></li>';

    for (var cat in app.treeData) {
        var topics = app.treeData[cat];
        var total = Object.values(topics).reduce((a, b) => a + b, 0);

        var li = document.createElement('li');
        li.className = 'tree-item';
        li.innerHTML = `<div class="tree-parent"><span>${cat}</span> <span class="badge">${total}</span></div>`;
        
        var childUl = document.createElement('ul');
        childUl.className = 'tree-children';

        for (var topic in topics) {
            var tLi = document.createElement('li');
            tLi.className = 'tree-child';
            tLi.innerHTML = `${topic} <small>(${topics[topic]})</small>`;
            tLi.onclick = (function(c, t) {
                return function(e) { e.stopPropagation(); setFilter(c, t); };
            })(cat, topic);
            childUl.appendChild(tLi);
        }

        li.onclick = function() {
            var cul = this.querySelector('.tree-children');
            if(cul) cul.classList.toggle('open');
        };

        li.appendChild(childUl);
        ul.appendChild(li);
    }
}

function setFilter(cat, topic) {
    app.currCat = cat;
    app.currTopic = topic;
    app.isCartView = false;
    app.page = 1;
    runFilter();
    // মোবাইলে সাইডবার বন্ধ করা
    if(window.innerWidth < 768) {
        document.getElementById('appSidebar').classList.remove('show');
        document.getElementById('sidebarOverlay').classList.remove('show');
    }
}

// ==========================================
// ৬. ইউটিলিটি (Pagination, AJAX, Security)
// ==========================================
function renderPagination(total) {
    var box = document.getElementById('paginationControls');
    box.innerHTML = '';
    if(total <= 1) return;

    var prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = "Prev";
    prev.disabled = app.page === 1;
    prev.onclick = function() { app.page--; render(); };

    var info = document.createElement('span');
    info.innerHTML = ` Page ${app.page} of ${total} `;

    var next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = "Next";
    next.disabled = app.page === total;
    next.onclick = function() { app.page++; render(); };

    box.appendChild(prev);
    box.appendChild(info);
    box.appendChild(next);
}

function renderSkeleton() {
    var container = document.getElementById('questionList');
    container.innerHTML = '<div class="skeleton-card" style="height:200px; background:#eee; margin-bottom:15px; border-radius:8px; animation: pulse 1.5s infinite;"></div>'.repeat(3);
}

function ajaxGet(url, success, error, isText) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?t=' + Date.now(), true);
    xhr.onload = function() {
        if (xhr.status === 200) success(isText ? xhr.responseText : JSON.parse(xhr.responseText));
        else if(error) error();
    };
    xhr.onerror = error;
    xhr.send();
}

function setupPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW fail', err));
    }
}

function setupSecurity() {
    // ১. রাইট ক্লিক বন্ধ
    document.addEventListener('contextmenu', e => e.preventDefault());
    // ২. টেক্সট সিলেকশন বন্ধ
    document.addEventListener('selectstart', e => e.preventDefault());
    // ৩. কি-বোর্ড শর্টকাট (F12, Ctrl+U, Ctrl+Shift+I) বন্ধ
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123 || (e.ctrlKey && (e.shiftKey && e.keyCode === 73)) || (e.ctrlKey && e.keyCode === 85)) {
            e.preventDefault();
        }
    });
    // ৪. ট্যাব পরিবর্তন করলে ব্লার করা
    document.addEventListener('visibilitychange', () => {
        document.body.style.filter = document.hidden ? 'blur(8px)' : 'none';
    });
}