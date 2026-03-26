"use strict";

var app = {
    data: [],           // All questions
    filteredData: [],   // Filtered questions
    treeData: {},       // Sidebar Tree
    cart: JSON.parse(localStorage.getItem('gk_cart')) || [],
    isCartView: false,  
    
    // Filters & Settings
    currCat: null,
    currTopic: null,
    mode: 'quiz', // 'quiz', 'study', 'exam'
    shuffle: false,
    sortOrder: 'asc',
    searchQuery: '',
    
    // Pagination
    page: 1,
    perPage: 10,
    
    // Meta loading variables
    filesLoaded: 0,
    totalFiles: 0,

    // Exam Mode State
    examActive: false,
    examTimer: null,
    examTimeLeft: 0,
    userAnswers: {}
};

window.onload = function() {
    initApp();
};

function initApp() {
    initDarkMode();
    readURLParams(); // <-- Read URL on load for SPA/SEO
    setupEventListeners();
    setupPWA();
    setupSecurity(); 
    renderSkeleton();
    startIncrementalLoad(); 
}

// ==========================================
// 1. Dark Mode Theme Logic
// ==========================================
function initDarkMode() {
    let isDark = localStorage.getItem('gk_dark_mode') === 'true';
    const moon = document.getElementById('moonIcon');
    const sun = document.getElementById('sunIcon');
    
    function applyTheme(dark) {
        if(dark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            moon.style.display = 'none';
            sun.style.display = 'block';
        } else {
            document.documentElement.removeAttribute('data-theme');
            moon.style.display = 'block';
            sun.style.display = 'none';
        }
    }
    applyTheme(isDark);

    document.getElementById('darkModeBtn').onclick = () => {
        isDark = !isDark;
        localStorage.setItem('gk_dark_mode', isDark);
        applyTheme(isDark);
    };
}

// ==========================================
// 2. Text-to-Speech (TTS)
// ==========================================
function readAloud(text) {
    if (!window.speechSynthesis) return alert('আপনার ব্রাউজার Text-to-Speech সাপোর্ট করে না।');
    window.speechSynthesis.cancel(); 
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'bn-BD'; 
    utterance.rate = 0.9;     
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 3. SPA Routing & SEO Logic (NEW)
// ==========================================
function readURLParams() {
    const params = new URLSearchParams(window.location.search);
    app.currCat = params.get('cat') || null;
    app.currTopic = params.get('topic') || null;
    app.page = parseInt(params.get('page')) || 1;
    app.mode = params.get('mode') || 'quiz';
    app.isCartView = params.get('cart') === 'true';

    // Sync UI Dropdowns based on URL
    var modeSelect = document.getElementById('viewMode');
    if(modeSelect) modeSelect.value = app.mode;
    
    updateSEO();
}

function updateURL() {
    const params = new URLSearchParams();
    if (app.currCat) params.set('cat', app.currCat);
    if (app.currTopic) params.set('topic', app.currTopic);
    if (app.page > 1) params.set('page', app.page); // Only add page if > 1 to keep URL clean
    if (app.mode !== 'quiz') params.set('mode', app.mode);
    if (app.isCartView) params.set('cart', 'true');

    const queryString = params.toString();
    const newUrl = window.location.pathname + (queryString ? '?' + queryString : '');
    
    // Only push if URL actually changed
    if (newUrl !== window.location.pathname + window.location.search) {
        window.history.pushState({ path: newUrl }, '', newUrl);
        updateSEO();
    }
}

function updateSEO() {
    let titleParts = [];
    if (app.isCartView) titleParts.push("My Saved Questions");
    else {
        if (app.currTopic) titleParts.push(app.currTopic);
        if (app.currCat) titleParts.push(app.currCat);
    }
    
    let baseTitle = "General Knowledge App"; // Your base site name
    document.title = titleParts.length > 0 ? `${titleParts.join(' - ')} | ${baseTitle}` : baseTitle;

    // Optional: Dynamically update Meta Description for SEO
    let metaDesc = document.querySelector('meta[name="description"]');
    if(metaDesc) {
        let descText = titleParts.length > 0 ? `Practice MCQs and Quiz for ${titleParts.join(', ')}.` : "Best app for General Knowledge and Exam Preparation.";
        metaDesc.setAttribute("content", descText);
    }
}

// ==========================================
// 4. Event Listeners Setup
// ==========================================
function setupEventListeners() {
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('appSidebar');
    var overlay = document.getElementById('sidebarOverlay');

    if(toggle) toggle.onclick = () => { sidebar.classList.toggle('show'); overlay.classList.toggle('show'); };
    if(overlay) overlay.onclick = () => { sidebar.classList.remove('show'); overlay.classList.remove('show'); };

    document.getElementById('viewMode').onchange = function(e) {
        app.mode = e.target.value;
        updateURL(); // <-- SPA Update
        if(app.mode === 'exam') startExam();
        else endExam();
        render();
    };

    var searchTimeout;
    document.getElementById('searchInput').onkeyup = function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { app.searchQuery = e.target.value.toLowerCase(); app.page = 1; runFilter(); }, 300);
    };

    document.getElementById('shuffleCheck').onchange = (e) => { app.shuffle = e.target.checked; runFilter(); };
    document.getElementById('sortSelect').onchange = (e) => { app.sortOrder = e.target.value; app.shuffle = false; document.getElementById('shuffleCheck').checked = false; runFilter(); };
    document.getElementById('perPageSelect').onchange = (e) => { app.perPage = parseInt(e.target.value); app.page = 1; render(); };

    document.getElementById('cartViewBtn').onclick = () => { app.isCartView = true; app.page = 1; updateURL(); render(); };
    document.getElementById('exitCart').onclick = () => { app.isCartView = false; app.page = 1; updateURL(); render(); };
    document.getElementById('submitExamBtn').onclick = submitExam;

    var bttBtn = document.getElementById('backToTop');
    var scrollContainer = document.getElementById('mainScroll');
    scrollContainer.onscroll = () => {
        if (scrollContainer.scrollTop > 300) bttBtn.classList.add('show');
        else bttBtn.classList.remove('show');
    };
    bttBtn.onclick = () => scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });

    // Handle Browser Back/Forward Buttons for SPA
    window.addEventListener('popstate', function() {
        readURLParams(); // Read state from the URL we just popped back to
        runFilter();     // Apply the filters and re-render
    });

    updateCartBadge();
}

// ==========================================
// 5. Incremental AJAX Loading
// ==========================================
function startIncrementalLoad() {
    ajaxGet('data/main.json', function(cats) {
        var fileTasks = [];
        var pendingCats = cats.length;

        cats.forEach(function(cat) {
            app.treeData[cat.title] = {};
            ajaxGet(cat.path, function(files) {
                files.forEach(function(f) {
                    fileTasks.push({ url: f.path, cat: cat.title, topic: f.title });
                });
                pendingCats--;
                if (pendingCats === 0) {
                    app.totalFiles = fileTasks.length;
                    processFilesSequentially(fileTasks, 0);
                }
            });
        });
    });
}

function processFilesSequentially(tasks, index) {
    if (index >= tasks.length) {
        document.getElementById('lastUpdateDate').textContent = new Date().toLocaleDateString();
        return;
    }

    var task = tasks[index];
    ajaxGet(task.url, function(text) {
        parseAndStore(text, task.cat, task.topic);
        app.filesLoaded++;
        
        buildSidebarTree();
        if(!app.isCartView) runFilter();
        
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
// 6. Cart Logic
// ==========================================
window.toggleCart = function(qId) {
    var index = app.cart.indexOf(qId);
    if (index === -1) app.cart.push(qId);
    else app.cart.splice(index, 1);
    
    localStorage.setItem('gk_cart', JSON.stringify(app.cart));
    updateCartBadge();
    
    if(app.isCartView) {
        render(); 
    } else {
        var btn = document.querySelector(`.cart-toggle-btn[data-qid="${qId}"]`);
        if(btn) {
            btn.classList.toggle('added');
            btn.innerHTML = app.cart.includes(qId) ? '&minus;' : '&plus;';
            btn.title = app.cart.includes(qId) ? 'Remove from cart' : 'Add to cart';
        }
    }
}

function updateCartBadge() {
    document.getElementById('cartCount').textContent = app.cart.length;
}

// ==========================================
// 7. Exam Mode Logic
// ==========================================
function startExam() {
    app.examActive = true;
    app.userAnswers = {};
    document.getElementById('mainControls').style.display = 'none'; 
    document.getElementById('seoTextSec').style.display = 'none'; 
    document.getElementById('examHeader').style.display = 'flex';
    document.getElementById('examResultBox').style.display = 'none';
    
    let currentQuestionsCount = Math.min(app.perPage, app.filteredData.length - ((app.page - 1) * app.perPage));
    app.examTimeLeft = currentQuestionsCount * 30; 
    
    clearInterval(app.examTimer);
    updateTimerDisplay();
    app.examTimer = setInterval(() => {
        app.examTimeLeft--;
        updateTimerDisplay();
        if(app.examTimeLeft <= 0) submitExam(); 
    }, 1000);
}

function updateTimerDisplay() {
    let m = Math.floor(app.examTimeLeft / 60).toString().padStart(2, '0');
    let s = (app.examTimeLeft % 60).toString().padStart(2, '0');
    document.getElementById('examTimerDisplay').textContent = `${m}:${s}`;
}

function endExam() {
    app.examActive = false;
    clearInterval(app.examTimer);
    document.getElementById('mainControls').style.display = 'flex';
    document.getElementById('seoTextSec').style.display = 'block';
    document.getElementById('examHeader').style.display = 'none';
    document.getElementById('examResultBox').style.display = 'none';
}

function submitExam() {
    app.examActive = false;
    clearInterval(app.examTimer);
    
    let sourceData = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.filteredData;
    let start = (app.page - 1) * app.perPage;
    let pageItems = sourceData.slice(start, start + app.perPage);
    
    let correct = 0, wrong = 0, skipped = 0;
    
    pageItems.forEach(q => {
        let userAns = app.userAnswers[q.id];
        if (userAns === undefined) skipped++;
        else if (userAns === q.ans) correct++;
        else wrong++;
    });

    let resBox = document.getElementById('examResultBox');
    resBox.innerHTML = `
        <h2 style="margin:0 0 10px 0;">Exam Completed!</h2>
        <div style="display:flex; justify-content:center; gap:20px; font-weight:bold;">
            <span style="color:var(--correct-text);">✅ Correct: ${correct}</span>
            <span style="color:var(--wrong-text);">❌ Wrong: ${wrong}</span>
            <span style="color:var(--text-muted);">⏭ Skipped: ${skipped}</span>
        </div>
        <p style="margin-top:10px;">Review your answers below.</p>
    `;
    resBox.style.display = 'block';
    document.getElementById('examHeader').style.display = 'none';
    document.getElementById('mainControls').style.display = 'flex';
    
    render(); 
}

// ==========================================
// 8. Render & Filter Engine
// ==========================================
function runFilter() {
    var res = app.data.filter(function(q) {
        if (app.currCat && q.cat !== app.currCat) return false;
        if (app.currTopic && q.topic !== app.currTopic) return false;
        if (app.searchQuery && q.title.toLowerCase().indexOf(app.searchQuery) === -1) return false;
        return true;
    });

    if (app.shuffle) res.sort(() => 0.5 - Math.random());
    else {
        if (app.sortOrder === 'desc') res.sort((a, b) => b.id - a.id);
        else res.sort((a, b) => a.id - b.id);
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
    var sourceData = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.filteredData;
    
    if(cartActions) cartActions.style.display = app.isCartView ? 'block' : 'none';
    if(topicHeader) {
        topicHeader.style.display = 'block';
        topicName.textContent = app.isCartView ? "Selected Questions (Cart)" : (app.currTopic || app.currCat || "All Questions");
    }

    if(sourceData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">${app.isCartView ? 'কার্ট খালি। প্রশ্ন যোগ করতে (+) বাটনে চাপ দিন।' : 'কোনো প্রশ্ন পাওয়া যায়নি।'}</div>`;
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    var totalPages = Math.ceil(sourceData.length / app.perPage);
    if(app.page > totalPages) { app.page = totalPages; updateURL(); } // Sync URL if page exceeds limit
    
    var start = (app.page - 1) * app.perPage;
    var pageItems = sourceData.slice(start, start + app.perPage);

    pageItems.forEach((q, i) => createCard(q, container, start + i + 1));
    renderPagination(totalPages);
}

function createCard(q, container, index) {
    var div = document.createElement('div');
    div.className = 'q-card';
    
    var isAdded = app.cart.includes(q.id);
    var cartBtn = `<button class="cart-toggle-btn ${isAdded ? 'added' : ''}" data-qid="${q.id}" onclick="toggleCart(${q.id})" title="${isAdded ? 'Remove from cart' : 'Add to cart'}">
        ${isAdded ? '&minus;' : '&plus;'}
    </button>`;

    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = `<span>${q.cat} &bull; ${q.topic}</span> <span>#${index}</span>`;
    div.appendChild(meta);

    let fullTextToRead = q.title + " অপশনগুলো হলো: " + q.opts.join(", ");
    let ttsBtn = `<button class="tts-btn" onclick="readAloud('${fullTextToRead.replace(/'/g, "\\'")}')" title="Read Aloud">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
    </button>`;

    var h3 = document.createElement('div');
    h3.className = 'q-title';
    h3.innerHTML = `<span>${q.title}</span> <div class="title-actions">${ttsBtn} ${cartBtn}</div>`;
    div.appendChild(h3);

    var optsDiv = document.createElement('div');
    var feedback = document.createElement('div');
    feedback.style.cssText = "display:none; margin-top:10px; padding:10px; background:var(--hover-bg); border-radius:5px; font-size:0.9rem;";

    q.opts.forEach((opt, idx) => {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        
        if(app.mode === 'study') {
            btn.disabled = true;
            if(idx === q.ans) { btn.classList.add('correct'); btn.innerHTML = '✔ ' + opt; }
            if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>ব্যাখ্যা:</b> " + q.desc; }
        } 
        else if (app.mode === 'exam') {
            if (app.examActive) {
                if (app.userAnswers[q.id] === idx) btn.classList.add('exam-selected');
                btn.onclick = function() {
                    let siblings = optsDiv.querySelectorAll('.opt-btn');
                    siblings.forEach(sb => sb.classList.remove('exam-selected'));
                    this.classList.add('exam-selected');
                    app.userAnswers[q.id] = idx;
                };
            } else {
                btn.disabled = true;
                if(idx === q.ans) btn.classList.add('correct');
                else if (app.userAnswers[q.id] === idx) btn.classList.add('wrong');
                if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>ব্যাখ্যা:</b> " + q.desc; }
            }
        }
        else { 
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
// 9. Sidebar Tree Logic
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
        
        // Highlight active category
        var isActiveCat = (app.currCat === cat) ? 'style="color:var(--primary-color); font-weight:bold;"' : '';
        li.innerHTML = `<div class="tree-parent" ${isActiveCat}><span>${cat}</span> <span class="badge">${total}</span></div>`;
        
        var childUl = document.createElement('ul');
        childUl.className = 'tree-children';
        if (app.currCat === cat) childUl.classList.add('open');

        for (var topic in topics) {
            var tLi = document.createElement('li');
            tLi.className = 'tree-child';
            if(app.currTopic === topic) tLi.style.cssText = "color:var(--primary-color); font-weight:bold; border-left: 2px solid var(--primary-color);";
            tLi.innerHTML = `${topic} <small>(${topics[topic]})</small>`;
            tLi.onclick = (function(c, t) { return function(e) { e.stopPropagation(); setFilter(c, t); }; })(cat, topic);
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
    
    updateURL();  // <-- Update URL immediately when filtering
    runFilter();
    buildSidebarTree(); // Refresh Sidebar highlighting
    
    if(window.innerWidth < 768) {
        document.getElementById('appSidebar').classList.remove('show');
        document.getElementById('sidebarOverlay').classList.remove('show');
    }
}

// ==========================================
// 10. Utilities (Pagination, AJAX, Security)
// ==========================================
function renderPagination(total) {
    var box = document.getElementById('paginationControls');
    box.innerHTML = '';
    if(total <= 1 || app.examActive) return; 

    var prev = document.createElement('button');
    prev.className = 'page-btn'; prev.textContent = "Prev";
    prev.disabled = app.page === 1;
    prev.onclick = () => { app.page--; updateURL(); render(); document.getElementById('mainScroll').scrollTo(0,0); };

    var info = document.createElement('span');
    info.innerHTML = ` Page ${app.page} of ${total} `;

    var next = document.createElement('button');
    next.className = 'page-btn'; next.textContent = "Next";
    next.disabled = app.page === total;
    next.onclick = () => { app.page++; updateURL(); render(); document.getElementById('mainScroll').scrollTo(0,0); };

    var jumpContainer = document.createElement('div');
    jumpContainer.style.display = "flex";
    jumpContainer.style.gap = "5px";
    jumpContainer.style.alignItems = "center";
    jumpContainer.style.marginLeft = "10px";

    var jumpInput = document.createElement('input');
    jumpInput.type = "number";
    jumpInput.className = "jump-input";
    jumpInput.min = 1;
    jumpInput.max = total;
    jumpInput.placeholder = "Page";

    var jumpBtn = document.createElement('button');
    jumpBtn.className = 'page-btn';
    jumpBtn.textContent = "Go";
    
    var goToPage = () => {
        var p = parseInt(jumpInput.value);
        if(p >= 1 && p <= total) {
            app.page = p;
            updateURL(); // <-- Update URL on jump
            render();
            document.getElementById('mainScroll').scrollTo(0,0);
        } else {
            alert(`দয়া করে ১ থেকে ${total} এর মধ্যে একটি পেজ নম্বর দিন।`);
        }
    };

    jumpBtn.onclick = goToPage;
    jumpInput.onkeypress = (e) => { if(e.key === 'Enter') goToPage(); };

    jumpContainer.appendChild(jumpInput);
    jumpContainer.appendChild(jumpBtn);
    
    box.appendChild(prev); 
    box.appendChild(info); 
    box.appendChild(next);
    box.appendChild(jumpContainer); 
}

function renderSkeleton() {
    var container = document.getElementById('questionList');
    container.innerHTML = '<div class="skeleton-card" style="height:200px;"></div>'.repeat(3);
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
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123 || (e.ctrlKey && (e.shiftKey && e.keyCode === 73)) || (e.ctrlKey && e.keyCode === 85)) {
            e.preventDefault();
        }
    });
    document.addEventListener('visibilitychange', () => {
        document.body.style.filter = document.hidden ? 'blur(8px)' : 'none';
    });
}

// ==========================================
// 11. Advanced Print Formatting
// ==========================================
function printQuestions() {
    var format = document.getElementById('printFormatSelect').value;
    var body = document.body;

    body.classList.remove('print-simple', 'print-grid', 'print-twocol');
    body.classList.add('print-' + format);
    window.print();
    
    setTimeout(() => {
        body.classList.remove('print-' + format);
    }, 1000);
}
