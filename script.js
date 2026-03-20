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
    startLoad(); 
}

// --- 1. Dark Mode Logic ---
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

// --- 2. Text-to-Speech (TTS) ---
function readAloud(text) {
    if (!window.speechSynthesis) return alert('আপনার ব্রাউজার Text-to-Speech সাপোর্ট করে না।');
    window.speechSynthesis.cancel(); // Stop current playing
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'bn-BD'; // Bengali Language
    utterance.rate = 0.9;     // Normal speed
    window.speechSynthesis.speak(utterance);
}

// --- 3. Setup Listeners ---
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
        if(app.mode === 'exam') startExam();
        else endExam();
        render();
    };

    let searchTimeout;
    document.getElementById('searchInput').onkeyup = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { app.searchQuery = e.target.value.toLowerCase(); app.page = 1; runFilter(); }, 300);
    };

    document.getElementById('shuffleCheck').onchange = (e) => { app.shuffle = e.target.checked; runFilter(); };
    document.getElementById('sortSelect').onchange = (e) => { app.sortOrder = e.target.value; app.shuffle = false; document.getElementById('shuffleCheck').checked = false; runFilter(); };
    document.getElementById('perPageSelect').onchange = (e) => { app.perPage = parseInt(e.target.value); app.page = 1; render(); };

    document.getElementById('cartViewBtn').onclick = () => { app.isCartView = true; app.page = 1; render(); };
    document.getElementById('exitCart').onclick = () => { app.isCartView = false; app.page = 1; render(); };
    document.getElementById('submitExamBtn').onclick = submitExam;

    var bttBtn = document.getElementById('backToTop');
    var scrollContainer = document.getElementById('mainScroll');
    scrollContainer.onscroll = () => {
        if (scrollContainer.scrollTop > 300) bttBtn.classList.add('show');
        else bttBtn.classList.remove('show');
    };
    bttBtn.onclick = () => scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById('cartCount').textContent = app.cart.length;
}

// --- 4. Dummy Data Loader (Replace with your AJAX logix) ---
// Note: Kept simplified for demonstration. Replace with your actual AJAX parser.
function startLoad() {
    // Demo Data
    app.data = [
        { id: 1, cat: 'বাংলাদেশ', topic: 'ইতিহাস', title: 'বাংলাদেশের স্বাধীনতা যুদ্ধ কবে শুরু হয়?', opts: ['১৯৭০', '১৯৭১', '১৯৫২', '১৯৬৯'], ans: 1, desc: '২৬শে মার্চ ১৯৭১ সালে।' },
        { id: 2, cat: 'ভূগোল', topic: 'নদী', title: 'পদ্মা নদীর উৎপত্তিস্থল কোথায়?', opts: ['হিমালয়', 'গঙ্গোত্রী হিমবাহ', 'মানস সরোবর', 'ভিক্টোরিয়া হ্রদ'], ans: 1, desc: 'গঙ্গোত্রী হিমবাহ থেকে গঙ্গা নামে উৎপন্ন হয়ে বাংলাদেশে পদ্মা নামে প্রবেশ করেছে।' }
    ];
    // In real app, call your startIncrementalLoad() here.
    setTimeout(() => {
        buildSidebarTree();
        runFilter();
    }, 500);
}

// --- 5. Exam Mode Logic ---
function startExam() {
    app.examActive = true;
    app.userAnswers = {};
    document.getElementById('mainControls').style.display = 'none'; // Hide controls
    document.getElementById('examHeader').style.display = 'flex';
    document.getElementById('examResultBox').style.display = 'none';
    
    // 30 seconds per question on current page
    let currentQuestionsCount = Math.min(app.perPage, app.filteredData.length - ((app.page - 1) * app.perPage));
    app.examTimeLeft = currentQuestionsCount * 30; 
    
    clearInterval(app.examTimer);
    updateTimerDisplay();
    app.examTimer = setInterval(() => {
        app.examTimeLeft--;
        updateTimerDisplay();
        if(app.examTimeLeft <= 0) submitExam(); // Auto submit
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
    
    // Re-render to show correct/wrong colors
    render(); 
}

// --- 6. Render Engine ---
function runFilter() {
    var res = app.data.filter(q => {
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
    container.innerHTML = '';
    
    var sourceData = app.isCartView ? app.data.filter(q => app.cart.includes(q.id)) : app.filteredData;
    if(cartActions) cartActions.style.display = app.isCartView ? 'block' : 'none';

    if(sourceData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px;">কোনো প্রশ্ন পাওয়া যায়নি।</div>`;
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    var totalPages = Math.ceil(sourceData.length / app.perPage);
    if(app.page > totalPages) app.page = totalPages;
    var start = (app.page - 1) * app.perPage;
    var pageItems = sourceData.slice(start, start + app.perPage);

    pageItems.forEach((q, i) => createCard(q, container, start + i + 1));
    renderPagination(totalPages);
}

function createCard(q, container, index) {
    var div = document.createElement('div');
    div.className = 'q-card';
    
    // Meta (Category & Number)
    var meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.innerHTML = `<span>${q.cat} &bull; ${q.topic}</span><span>#${index}</span>`;
    div.appendChild(meta);

    // Title & TTS Button
    var h3 = document.createElement('div');
    h3.className = 'q-title';
    
    // TTS SVG Icon Button
    let fullTextToRead = q.title + " অপশনগুলো হলো: " + q.opts.join(", ");
    let ttsBtn = `<button class="tts-btn" onclick="readAloud('${fullTextToRead}')" title="Read Aloud">
        <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
    </button>`;
    
    h3.innerHTML = `<span>${q.title} ${ttsBtn}</span>`;
    div.appendChild(h3);

    var optsDiv = document.createElement('div');
    var feedback = document.createElement('div');
    feedback.style.cssText = "display:none; margin-top:10px; padding:10px; background:var(--hover-bg); border-radius:5px; font-size:0.9rem;";

    q.opts.forEach((opt, idx) => {
        var btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        
        // Handling states based on mode
        if(app.mode === 'study') {
            btn.disabled = true;
            if(idx === q.ans) { btn.classList.add('correct'); btn.innerHTML = '✔ ' + opt; }
            if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>ব্যাখ্যা:</b> " + q.desc; }
        } 
        else if (app.mode === 'exam') {
            // Exam Mode Logic
            if (app.examActive) {
                // During Exam: Highlight selection, don't show correct/wrong
                if (app.userAnswers[q.id] === idx) btn.classList.add('exam-selected');
                btn.onclick = function() {
                    let siblings = optsDiv.querySelectorAll('.opt-btn');
                    siblings.forEach(sb => sb.classList.remove('exam-selected'));
                    this.classList.add('exam-selected');
                    app.userAnswers[q.id] = idx;
                };
            } else {
                // After Exam Submit: Show correct/wrong
                btn.disabled = true;
                if(idx === q.ans) btn.classList.add('correct');
                else if (app.userAnswers[q.id] === idx) btn.classList.add('wrong');
                
                if(q.desc) { feedback.style.display = 'block'; feedback.innerHTML = "<b>ব্যাখ্যা:</b> " + q.desc; }
            }
        }
        else { // Quiz Mode
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

// --- 7. Sidebar & Utils ---
function buildSidebarTree() {
    app.treeData['বাংলাদেশ'] = {'ইতিহাস': 1}; // Demo
    app.treeData['ভূগোল'] = {'নদী': 1}; // Demo
    var ul = document.getElementById('categoryTree');
    ul.innerHTML = '<li class="tree-parent" onclick="app.currCat=null;app.currTopic=null;app.page=1;runFilter();"><span>All Questions</span></li>';
    
    for (var cat in app.treeData) {
        var li = document.createElement('li');
        li.innerHTML = `<div class="tree-parent"><span>${cat}</span></div>`;
        ul.appendChild(li);
    }
}

function renderPagination(total) {
    var box = document.getElementById('paginationControls');
    box.innerHTML = '';
    if(total <= 1 || app.examActive) return; // Hide pagination during active exam

    var prev = document.createElement('button');
    prev.className = 'page-btn'; prev.textContent = "Prev";
    prev.disabled = app.page === 1;
    prev.onclick = () => { app.page--; render(); window.scrollTo(0,0); };

    var info = document.createElement('span');
    info.innerHTML = ` Page ${app.page} of ${total} `;

    var next = document.createElement('button');
    next.className = 'page-btn'; next.textContent = "Next";
    next.disabled = app.page === total;
    next.onclick = () => { app.page++; render(); window.scrollTo(0,0); };

    box.appendChild(prev); box.appendChild(info); box.appendChild(next);
}

function renderSkeleton() {
    document.getElementById('questionList').innerHTML = '<div style="height:150px; background:var(--card-bg); margin-bottom:15px; border-radius:8px; opacity:0.5;"></div>'.repeat(3);
}
