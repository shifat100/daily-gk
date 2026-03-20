"use strict";

var app = {
    data: [],
    filteredData: [],
    treeData: {},
    cart: JSON.parse(localStorage.getItem('gk_cart')) || [],
    isCartView: false,
    
    currCat: null,
    currTopic: null,
    mode: 'quiz', // 'quiz', 'study', 'exam'
    shuffle: false,
    sortOrder: 'asc',
    searchQuery: '',
    
    page: 1,
    perPage: 10,
    
    // Exam Mode State
    examActive: false,
    examTimer: null,
    examTimeLeft: 0,
    userAnswers: {} // { questionId: selectedOptionIndex }
};

window.onload = function() {
    initApp();
};

function initApp() {
    initDarkMode();
    setupEventListeners();
    renderSkeleton();
    startIncrementalLoad();
}

// ==========================================
// ১. নতুন ফিচার: ডার্ক মোড, TTS এবং এক্সাম মোড
// ==========================================
function initDarkMode() {
    let isDark = localStorage.getItem('gk_dark_mode') === 'true';
    const moon = document.getElementById('moonIcon');
    const sun = document.getElementById('sunIcon');
    
    const applyTheme = (dark) => {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        moon.style.display = dark ? 'none' : 'block';
        sun.style.display = dark ? 'block' : 'none';
    };
    applyTheme(isDark);

    document.getElementById('darkModeBtn').onclick = () => {
        isDark = !isDark;
        localStorage.setItem('gk_dark_mode', isDark);
        applyTheme(isDark);
    };
}

function readAloud(text) {
    if (!window.speechSynthesis) return alert('Your browser does not support Text-to-Speech.');
    window.speechSynthesis.cancel(); // Stop any currently playing utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'bn-BD'; // Bengali (Bangladesh)
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

function startExam() {
    if (app.filteredData.length === 0 && !app.isCartView) {
        alert("Please select a topic with questions to start an exam.");
        document.getElementById('viewMode').value = 'quiz'; // Revert dropdown
        return;
    }
    app.examActive = true;
    app.userAnswers = {};
    document.getElementById('mainControls').style.display = 'none';
    document.getElementById('examHeader').style.display = 'flex';
    document.getElementById('examResultBox').style.display = 'none';
    
    const sourceData = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.filteredData;
    const pageItems = sourceData.slice((app.page - 1) * app.perPage, app.page * app.perPage);
    app.examTimeLeft = pageItems.length * 30; // 30 seconds per question
    
    clearInterval(app.examTimer);
    updateTimerDisplay();
    app.examTimer = setInterval(() => {
        app.examTimeLeft--;
        updateTimerDisplay();
        if (app.examTimeLeft <= 0) submitExam();
    }, 1000);
    render();
}

function endExam(shouldRender = true) {
    app.examActive = false;
    clearInterval(app.examTimer);
    document.getElementById('mainControls').style.display = 'flex';
    document.getElementById('examHeader').style.display = 'none';
    if(shouldRender) render();
}

function submitExam() {
    endExam(false); // End exam but don't re-render yet
    
    const sourceData = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.filteredData;
    const pageItems = sourceData.slice((app.page - 1) * app.perPage, app.page * app.perPage);
    
    let correct = 0, wrong = 0, skipped = 0;
    
    pageItems.forEach(q => {
        const userAns = app.userAnswers[q.id];
        if (userAns === undefined) skipped++;
        else if (userAns === q.ans) correct++;
        else wrong++;
    });

    const resBox = document.getElementById('examResultBox');
    resBox.innerHTML = `
        <h2 style="margin:0 0 10px 0;">Exam Completed!</h2>
        <div style="display:flex; justify-content:center; gap:20px; font-weight:bold; flex-wrap:wrap;">
            <span style="color:var(--correct-text);">✅ Correct: ${correct}</span>
            <span style="color:var(--wrong-text);">❌ Wrong: ${wrong}</span>
            <span style="color:var(--text-muted);">⏭ Skipped: ${skipped}</span>
        </div>`;
    resBox.style.display = 'block';
    render(); // Now re-render to show answers
}

function updateTimerDisplay() {
    const m = Math.floor(app.examTimeLeft / 60).toString().padStart(2, '0');
    const s = (app.examTimeLeft % 60).toString().padStart(2, '0');
    document.getElementById('examTimerDisplay').textContent = `${m}:${s}`;
}


// ==========================================
// ২. ইভেন্ট লিসেনার ও মূল ফাংশন (আগের সব ফিচারসহ)
// ==========================================
function setupEventListeners() {
    document.getElementById('menuToggle').onclick = () => {
        document.getElementById('appSidebar').classList.toggle('show');
        document.getElementById('sidebarOverlay').classList.toggle('show');
    };
    document.getElementById('sidebarOverlay').onclick = () => {
        document.getElementById('appSidebar').classList.remove('show');
        document.getElementById('sidebarOverlay').classList.remove('show');
    };

    document.getElementById('viewMode').onchange = (e) => {
        app.mode = e.target.value;
        if (app.mode === 'exam') startExam();
        else endExam();
    };

    let searchTimeout;
    document.getElementById('searchInput').onkeyup = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { app.searchQuery = e.target.value.toLowerCase(); app.page = 1; runFilter(); }, 300);
    };

    document.getElementById('shuffleCheck').onchange = (e) => { app.shuffle = e.target.checked; runFilter(); };
    document.getElementById('sortSelect').onchange = (e) => { app.sortOrder = e.target.value; app.shuffle = false; document.getElementById('shuffleCheck').checked = false; runFilter(); };
    document.getElementById('perPageSelect').onchange = (e) => { app.perPage = parseInt(e.target.value); app.page = 1; if(app.examActive) startExam(); else render(); };

    document.getElementById('cartViewBtn').onclick = () => { if(app.examActive) return; app.isCartView = true; app.page = 1; runFilter(); };
    document.getElementById('exitCart').onclick = () => { app.isCartView = false; app.page = 1; runFilter(); };
    document.getElementById('submitExamBtn').onclick = submitExam;

    const bttBtn = document.getElementById('backToTop');
    const scrollContainer = document.getElementById('mainScroll');
    scrollContainer.onscroll = () => bttBtn.classList.toggle('show', scrollContainer.scrollTop > 300);
    bttBtn.onclick = () => scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });

    updateCartBadge();
}

function ajaxGet(url, success, error, isText) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${url}?t=${Date.now()}`, true);
    xhr.onload = () => {
        if (xhr.status === 200) success(isText ? xhr.responseText : JSON.parse(xhr.responseText));
        else if (error) error();
    };
    xhr.onerror = error;
    xhr.send();
}

function startIncrementalLoad() {
    ajaxGet('data/main.json', (cats) => {
        const fileTasks = [];
        let pendingCats = cats.length;
        if (pendingCats === 0) runFilter();

        cats.forEach(cat => {
            app.treeData[cat.title] = {};
            ajaxGet(cat.path, (files) => {
                files.forEach(f => fileTasks.push({ url: f.path, cat: cat.title, topic: f.title }));
                if (--pendingCats === 0) {
                    processFilesSequentially(fileTasks, 0);
                }
            }, () => { if (--pendingCats === 0 && fileTasks.length > 0) processFilesSequentially(fileTasks, 0); });
        });
    }, () => {
        document.getElementById('questionList').innerHTML = `<div style="text-align:center; padding:40px; color:var(--wrong-text);">Error loading data. Please check your network connection.</div>`;
    });
}

function processFilesSequentially(tasks, index) {
    if (index >= tasks.length) return;
    const task = tasks[index];
    ajaxGet(task.url, (text) => {
        parseAndStore(text, task.cat, task.topic);
        buildSidebarTree();
        if (!app.isCartView) runFilter();
        processFilesSequentially(tasks, index + 1);
    }, () => processFilesSequentially(tasks, index + 1), true);
}

function parseAndStore(text, cat, topic) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 2) {
        const line1 = (lines[i] || "").trim();
        const line2 = (lines[i+1] || "").trim();
        if (!line1 || !line2) continue;

        try {
            const parts = line2.split('|').filter(p => p.trim() !== '');
            let ans, desc = null, opts;
            const lastPart = parts[parts.length-1];
            if (!isNaN(lastPart)) {
                ans = parseInt(lastPart);
                opts = parts.slice(0, -1);
            } else {
                ans = parseInt(parts[parts.length-2]);
                desc = lastPart;
                opts = parts.slice(0, -2);
            }
            if (opts.length < 2 || isNaN(ans)) continue;
            app.data.push({ id: app.data.length, cat, topic, title: line1.replace(/\*\*/g, ''), opts, ans, desc });
            app.treeData[cat][topic] = (app.treeData[cat][topic] || 0) + 1;
        } catch (e) {
            console.error(`Parsing error in ${cat}/${topic}:`, line1);
        }
    }
}

// ==========================================
// ৩. ফিল্টার ও রেন্ডারিং ইঞ্জিন
// ==========================================
function runFilter() {
    document.getElementById('examResultBox').style.display = 'none';
    const source = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.data;
    let res = source.filter(q => 
        (!app.currCat || q.cat === app.currCat) &&
        (!app.currTopic || q.topic === app.currTopic) &&
        (!app.searchQuery || q.title.toLowerCase().includes(app.searchQuery))
    );

    if (app.shuffle) res.sort(() => 0.5 - Math.random());
    else res.sort((a, b) => app.sortOrder === 'desc' ? b.id - a.id : a.id - b.id);
    
    app.filteredData = res;
    render();
}

function render() {
    const container = document.getElementById('questionList');
    container.innerHTML = '';
    
    document.getElementById('cartActions').style.display = app.isCartView ? 'flex' : 'none';
    document.getElementById('topicHeader').style.display = 'block';
    document.getElementById('topicName').textContent = app.isCartView ? "My Saved Questions" : (app.currTopic || app.currCat || "All Questions");

    const sourceData = app.isCartView ? app.filteredData : app.filteredData;
    if (sourceData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px;">${app.isCartView ? 'Your cart is empty. Add questions to see them here.' : 'No questions found for this filter.'}</div>`;
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(sourceData.length / app.perPage);
    app.page = Math.min(app.page, totalPages) || 1;
    const start = (app.page - 1) * app.perPage;
    const pageItems = sourceData.slice(start, start + app.perPage);

    pageItems.forEach((q, i) => createCard(q, container, start + i + 1));
    renderPagination(totalPages);
}

function createCard(q, container, index) {
    const div = document.createElement('div');
    div.className = 'q-card';

    const isAdded = app.cart.includes(q.id);
    const fullTextToRead = `${q.title}. অপশনগুলো হলো: ${q.opts.join(', ')}.`;
    
    div.innerHTML = `
        <div class="q-meta">
            <span>${q.cat} &bull; ${q.topic}</span>
            <span>#${index}</span>
        </div>
        <div class="q-title">${q.title}</div>
        <div class="card-actions">
            <button class="tts-btn" onclick="readAloud(\`${fullTextToRead.replace(/'/g, "\\'")}\`)" title="Read Aloud">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            </button>
            <button class="cart-toggle-btn ${isAdded ? 'added' : ''}" data-qid="${q.id}" title="Add to Cart">
                ${isAdded ? '−' : '+'}
            </button>
        </div>
        <div class="options-container"></div>
        <div class="feedback" style="display:none;"></div>
    `;

    const optsDiv = div.querySelector('.options-container');
    const feedback = div.querySelector('.feedback');
    const cartBtn = div.querySelector('.cart-toggle-btn');
    cartBtn.onclick = () => toggleCart(q.id, cartBtn);

    q.opts.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        
        if (app.mode === 'study') {
            btn.disabled = true;
            if (idx === q.ans) { btn.classList.add('correct'); btn.innerHTML = '✔ ' + opt; }
            if (q.desc) { feedback.style.display = 'block'; feedback.innerHTML = `<b>ব্যাখ্যা:</b> ${q.desc}`; }
        } else if (app.mode === 'exam') {
            if (app.examActive) {
                if (app.userAnswers[q.id] === idx) btn.classList.add('exam-selected');
                btn.onclick = () => {
                    optsDiv.querySelectorAll('.opt-btn').forEach(sb => sb.classList.remove('exam-selected'));
                    btn.classList.add('exam-selected');
                    app.userAnswers[q.id] = idx;
                };
            } else {
                btn.disabled = true;
                if (idx === q.ans) btn.classList.add('correct');
                else if (app.userAnswers[q.id] === idx) btn.classList.add('wrong');
                if (q.desc && (idx === q.ans || app.userAnswers[q.id] === idx)) {
                    feedback.style.display = 'block'; feedback.innerHTML = `<b>ব্যাখ্যা:</b> ${q.desc}`;
                }
            }
        } else { // Quiz Mode
            btn.onclick = () => {
                optsDiv.querySelectorAll('.opt-btn').forEach(sb => sb.disabled = true);
                optsDiv.children[q.ans].classList.add('correct');
                if (idx !== q.ans) {
                    btn.classList.add('wrong');
                    feedback.style.display = 'block';
                    feedback.innerHTML = `<b>সঠিক উত্তর:</b> ${q.opts[q.ans]}${q.desc ? `<br><b>ব্যাখ্যা:</b> ${q.desc}` : ''}`;
                } else if (q.desc) {
                    feedback.style.display = 'block'; feedback.innerHTML = `<b>ব্যাখ্যা:</b> ${q.desc}`;
                }
            };
        }
        optsDiv.appendChild(btn);
    });
    container.appendChild(div);
}

// ==========================================
// ৪. সাইডবার, কার্ট এবং অন্যান্য ইউটিলিটি
// ==========================================
function toggleCart(qId, btn) {
    const index = app.cart.indexOf(qId);
    if (index === -1) app.cart.push(qId);
    else app.cart.splice(index, 1);
    
    localStorage.setItem('gk_cart', JSON.stringify(app.cart));
    updateCartBadge();
    
    if (app.isCartView) runFilter();
    else if (btn) {
        const isAdded = app.cart.includes(qId);
        btn.classList.toggle('added', isAdded);
        btn.innerHTML = isAdded ? '−' : '+';
    }
}

function updateCartBadge() {
    document.getElementById('cartCount').textContent = app.cart.length;
}

function buildSidebarTree() {
    const ul = document.getElementById('categoryTree');
    ul.innerHTML = '<li class="tree-parent" onclick="setFilter(null, null)"><span>All Questions</span></li>';

    for (const cat in app.treeData) {
        const total = Object.values(app.treeData[cat]).reduce((a, b) => a + b, 0);
        const li = document.createElement('li');
        li.className = 'tree-item';
        li.innerHTML = `<div class="tree-parent"><span>${cat}</span><span class="badge">${total}</span></div>`;
        const childUl = document.createElement('ul');
        childUl.className = 'tree-children';
        for (const topic in app.treeData[cat]) {
            const tLi = document.createElement('li');
            tLi.className = 'tree-child';
            tLi.innerHTML = `${topic} <small>(${app.treeData[cat][topic]})</small>`;
            tLi.onclick = (e) => { e.stopPropagation(); setFilter(cat, topic); };
            childUl.appendChild(tLi);
        }
        li.onclick = function() { this.querySelector('.tree-children').classList.toggle('open'); };
        li.appendChild(childUl);
        ul.appendChild(li);
    }
}

function setFilter(cat, topic) {
    if(app.examActive) return;
    app.currCat = cat;
    app.currTopic = topic;
    app.isCartView = false;
    app.page = 1;
    runFilter();
    if (window.innerWidth < 768) {
        document.getElementById('appSidebar').classList.remove('show');
        document.getElementById('sidebarOverlay').classList.remove('show');
    }
}

function renderPagination(total) {
    const box = document.getElementById('paginationControls');
    box.innerHTML = '';
    if (total <= 1 || app.examActive) return;

    const createBtn = (text, action, disabled) => {
        const btn = document.createElement('button');
        btn.className = 'page-btn';
        btn.textContent = text;
        btn.disabled = disabled;
        btn.onclick = action;
        return btn;
    };
    
    const changePage = (newPage) => {
        app.page = newPage;
        if(app.examActive) startExam();
        else render();
        document.getElementById('mainScroll').scrollTop = 0;
    };

    box.appendChild(createBtn("Prev", () => changePage(app.page - 1), app.page === 1));
    box.appendChild(document.createElement('span')).innerHTML = ` Page ${app.page} of ${total} `;
    box.appendChild(createBtn("Next", () => changePage(app.page + 1), app.page === total));
}

function renderSkeleton() {
    document.getElementById('questionList').innerHTML = Array(3).fill('<div style="height:200px; background:var(--card-bg); margin-bottom:15px; border-radius:8px; opacity:0.5;"></div>').join('');
}
