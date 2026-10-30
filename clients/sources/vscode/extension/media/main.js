/**
 * Daily GK - High Capacity Engine & Webview Bridge
 */

// Safely acquire VS Code API once
var vscode = undefined;
if (typeof acquireVsCodeApi !== 'undefined') {
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {}
}

const QUESTION_W         = 224;
const QUESTION_BYTES_ROW = 28;
const OPTION_W           = 208;
const OPTION_BYTES_ROW   = 26;
const ENTRY_SIZE         = 20;
const DOWNLOAD_URL       = "https://shifat100.github.io/daily-gk/client-pack.html";

const DB_NAME = "DailyGK_Storage";
const DB_VERSION = 1;
const STORE_NAME = "pak_packages";

const runtime = {
  buffer: null,
  view: null,
  fileName: "",
  fileSize: 0,
  totalQuestions: 0,
  indexOffset: 0,
  searchOffset: 0,
  payloadBase: 0,
  batchStart: 0,
  renderedCount: 0,
  focusIdx: 0,
  batchSize: 10,
  layoutMode: "sheet",
  readingMode: "QUIZ",
  score: 0,
  userAnswers: {},
  entries: [],
  searchIndex: {},
  zoom: 1.0,
  currentFilter: "all",
  isAppending: false,
  cancelLoading: false
};

/* -------------------------------------------------------------------------
   INDEXEDDB STORAGE ENGINE
   ------------------------------------------------------------------------- */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storePakInIndexedDB(name, size, arrayBuffer) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      name: name,
      size: size,
      date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
      buffer: arrayBuffer
    });
  } catch (err) {
    console.warn("Save error:", err);
  }
}

async function getPakFromIndexedDB(name) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllRecentFromIndexedDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromIndexedDB(name) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearAllIndexedDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* -------------------------------------------------------------------------
   INITIALIZATION & FILE PICKING
   ------------------------------------------------------------------------- */
function loadPersistedSettings() {
  const savedTheme = localStorage.getItem("dgk_theme") || "light";
  setTheme(savedTheme, false);

  const savedZoom = localStorage.getItem("dgk_zoom");
  if (savedZoom) {
    runtime.zoom = parseFloat(savedZoom) || 1.0;
    applyZoom();
  }

  const savedLayout = localStorage.getItem("dgk_layout");
  if (savedLayout) {
    setLayout(savedLayout, false);
  }
}

function triggerFileInput() {
  if (vscode) {
    vscode.postMessage({ command: 'selectPakFile' });
  } else {
    document.getElementById('binary-file-input').click();
  }
}

function handleFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  readPakFile(file);
}

function readPakFile(file) {
  const reader = new FileReader();
  reader.onload = function(evt) {
    const buffer = evt.target.result;
    storePakInIndexedDB(file.name, file.size, buffer);
    loadPakFromBuffer(buffer, file.name);
  };
  reader.readAsArrayBuffer(file);
  closeModals();
}

/* DRAG & DROP */
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("dropzone-active");
});
window.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) document.body.classList.remove("dropzone-active");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dropzone-active");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    readPakFile(e.dataTransfer.files[0]);
  }
});

/* VS CODE HOST COMMUNICATION LISTENER */
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.command === 'loadPakBuffer') {
    const uint8 = new Uint8Array(msg.buffer);
    storePakInIndexedDB(msg.filename, uint8.byteLength, uint8.buffer);
    loadPakFromBuffer(uint8.buffer, msg.filename);
  }
});

/* -------------------------------------------------------------------------
   BINARY PARSER
   ------------------------------------------------------------------------- */
function loadPakFromBuffer(arrayBuffer, name) {
  const view = new DataView(arrayBuffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

  if (magic !== "DGK1") {
    alert("Invalid file: Header magic 'DGK1' not found.");
    return;
  }

  runtime.buffer = arrayBuffer;
  runtime.view = view;
  runtime.fileName = name;
  runtime.fileSize = arrayBuffer.byteLength;

  runtime.totalQuestions = view.getUint32(4, true);
  runtime.indexOffset    = view.getUint32(8, true);
  runtime.searchOffset   = view.getUint32(12, true);
  runtime.payloadBase    = view.getUint32(16, true);

  runtime.batchStart = 0;
  runtime.renderedCount = 0;
  runtime.focusIdx = 0;
  runtime.score = 0;
  runtime.userAnswers = {};
  runtime.entries = [];
  runtime.searchIndex = {};

  for (let i = 0; i < runtime.totalQuestions; i++) {
    const pos = runtime.indexOffset + (i * ENTRY_SIZE);
    runtime.entries.push({
      payloadOffset: view.getUint32(pos, true),
      q_h: view.getUint16(pos + 4, true),
      opt_h: [
        view.getUint16(pos + 6, true),
        view.getUint16(pos + 8, true),
        view.getUint16(pos + 10, true),
        view.getUint16(pos + 12, true)
      ],
      correct: view.getUint8(pos + 14)
    });
  }

  // Read Search Index
  if (runtime.searchOffset > 0 && runtime.searchOffset < runtime.fileSize) {
    let sPos = runtime.searchOffset;
    const decoder = new TextDecoder("utf-8");
    for (let i = 0; i < runtime.totalQuestions; i++) {
      if (sPos + 4 > runtime.fileSize) break;
      const qId = view.getUint16(sPos, true);
      const tLen = view.getUint16(sPos + 2, true);
      if (sPos + 4 + tLen > runtime.fileSize) break;
      const textBytes = new Uint8Array(arrayBuffer, sPos + 4, tLen);
      runtime.searchIndex[qId] = decoder.decode(textBytes);
      sPos += 4 + tLen;
    }
  }

  updateOnDemandVisibility(true);
  updateUIStatus();
  buildNavigatorGrid();
  renderActiveView();
}

function updateOnDemandVisibility(hasActivePack) {
  const loadActions = document.getElementById('demand-load-actions');
  const navActions  = document.getElementById('demand-nav-actions');
  const emptyPrompt = document.getElementById('view-empty-prompt');
  const activeSheet = document.getElementById('view-active-sheet');

  if (hasActivePack) {
    loadActions.classList.add('ondemand-hidden');
    navActions.classList.remove('ondemand-hidden');
    emptyPrompt.classList.add('ondemand-hidden');
    activeSheet.classList.remove('ondemand-hidden');
  } else {
    loadActions.classList.remove('ondemand-hidden');
    navActions.classList.add('ondemand-hidden');
    emptyPrompt.classList.remove('ondemand-hidden');
    activeSheet.classList.add('ondemand-hidden');
  }
}

/* 1-BIT RASTER ENGINE */
function blitMaskToCanvas(canvas, width, height, bytesPerRow, byteData) {
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const data = img.data;

  const computed = getComputedStyle(document.body);
  const hexColor = computed.getPropertyValue('--canvas-fg').trim() || "#1f1f1f";
  const rgb = parseHex(hexColor);

  for (let r = 0; r < height; r++) {
    for (let b = 0; b < bytesPerRow; b++) {
      const byteVal = byteData[r * bytesPerRow + b];
      if (byteVal === 0) continue;

      for (let bit = 0; bit < 8; bit++) {
        if (byteVal & (0x80 >> bit)) {
          const sx = (b * 8) + bit;
          if (sx < width) {
            const idx = (r * width + sx) * 4;
            data[idx]     = rgb.r;
            data[idx + 1] = rgb.g;
            data[idx + 2] = rgb.b;
            data[idx + 3] = 255;
          }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function parseHex(h) {
  let c = h.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* -------------------------------------------------------------------------
   DOM RENDERING & NAVIGATION
   ------------------------------------------------------------------------- */
function createQuestionBlock(qIdx) {
  const entry = runtime.entries[qIdx];
  let offset = runtime.payloadBase + entry.payloadOffset;

  const block = document.createElement('div');
  block.className = 'exam-q-block';
  block.id = `q-block-${qIdx}`;

  const header = document.createElement('div');
  header.className = 'exam-q-header';
  header.innerHTML = `
    <span class="q-num-label">Question ${qIdx + 1} of ${runtime.totalQuestions}</span>
    <span style="font-size:11px; color:var(--text-dim);">${entry.q_h}px</span>
  `;
  block.appendChild(header);

  const qHolder = document.createElement('div');
  qHolder.className = 'q-canvas-holder';
  const qCanvas = document.createElement('canvas');
  qCanvas.className = 'pak-canvas';

  const qBytes = entry.q_h * QUESTION_BYTES_ROW;
  const qData = new Uint8Array(runtime.buffer, offset, qBytes);
  blitMaskToCanvas(qCanvas, QUESTION_W, entry.q_h, QUESTION_BYTES_ROW, qData);
  offset += qBytes;

  qHolder.appendChild(qCanvas);
  block.appendChild(qHolder);

  const optList = document.createElement('div');
  optList.className = 'opt-list';

  for (let i = 0; i < 4; i++) {
    const optCard = document.createElement('div');
    optCard.className = 'opt-card';
    optCard.id = `opt-card-${qIdx}-${i}`;
    optCard.onclick = () => handleMultiOptionSelect(qIdx, i);

    const optIdxSpan = document.createElement('div');
    optIdxSpan.className = 'opt-index';
    optIdxSpan.textContent = (i + 1);
    optCard.appendChild(optIdxSpan);

    const optCanvas = document.createElement('canvas');
    optCanvas.className = 'pak-canvas';
    const optLen = entry.opt_h[i] * OPTION_BYTES_ROW;
    const optData = new Uint8Array(runtime.buffer, offset, optLen);
    blitMaskToCanvas(optCanvas, OPTION_W, entry.opt_h[i], OPTION_BYTES_ROW, optData);
    offset += optLen;

    optCard.appendChild(optCanvas);
    optList.appendChild(optCard);
  }

  block.appendChild(optList);

  if (runtime.layoutMode === 'focus') {
    const focusNav = document.createElement('div');
    focusNav.className = 'focus-card-nav';
    focusNav.innerHTML = `
      <button class="tb-btn" onclick="goToPrevFocusCard()" ${qIdx === 0 ? 'disabled' : ''}>
        <svg class="icon-svg" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span>Previous</span>
      </button>
      <span style="font-size:12px; font-weight:600; color:var(--text-muted);">${qIdx + 1} / ${runtime.totalQuestions}</span>
      <button class="tb-btn primary" onclick="goToNextFocusCard()" ${qIdx >= runtime.totalQuestions - 1 ? 'disabled' : ''}>
        <span>Next</span>
        <svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `;
    block.appendChild(focusNav);
  }

  return block;
}

function renderActiveView(startAt = 0) {
  if (!runtime.entries || runtime.entries.length === 0) return;
  
  const sheet = document.getElementById('view-active-sheet');
  sheet.innerHTML = "";
  runtime.batchStart = startAt;
  runtime.renderedCount = 0;

  if (runtime.layoutMode === 'focus') {
    runtime.focusIdx = startAt;
    const block = createQuestionBlock(startAt);
    sheet.appendChild(block);
    refreshQuestionColors(startAt);
    updateNavigationIndicators();
    updateCurrentBadgeHighlight(startAt);
    return;
  }

  if (runtime.batchStart > 0) {
    const topBanner = document.createElement('div');
    topBanner.className = 'jump-header-banner';
    topBanner.innerHTML = `
      <span>Viewing from Question <b>${runtime.batchStart + 1}</b></span>
      <button class="tb-btn" onclick="loadPreviousBatchRange()">↑ Load Earlier Questions</button>
    `;
    sheet.appendChild(topBanner);
  }

  if (runtime.batchSize >= 9999) {
    renderBatchWithProgress(runtime.batchStart, runtime.totalQuestions);
  } else {
    appendNextBatch();
  }
}

function appendNextBatch() {
  if (!runtime.entries || runtime.entries.length === 0) return;
  if (runtime.isAppending) return;

  const currentTotalLoaded = runtime.batchStart + runtime.renderedCount;
  if (currentTotalLoaded >= runtime.totalQuestions) return;

  runtime.isAppending = true;
  const container = document.getElementById('view-active-sheet');

  const oldLoader = document.getElementById('sheet-loader-note');
  if (oldLoader) oldLoader.remove();

  const batchToLoad = Math.min(runtime.batchSize, runtime.totalQuestions - currentTotalLoaded);
  const startIdx = currentTotalLoaded;
  const endIdx = startIdx + batchToLoad;

  const fragment = document.createDocumentFragment();
  for (let qIdx = startIdx; qIdx < endIdx; qIdx++) {
    const block = createQuestionBlock(qIdx);
    fragment.appendChild(block);
  }
  container.appendChild(fragment);

  for (let qIdx = startIdx; qIdx < endIdx; qIdx++) {
    refreshQuestionColors(qIdx);
  }

  runtime.renderedCount += batchToLoad;

  const loaderNote = document.createElement('div');
  loaderNote.id = 'sheet-loader-note';
  loaderNote.className = 'sheet-scroll-loader';
  if ((runtime.batchStart + runtime.renderedCount) < runtime.totalQuestions) {
    loaderNote.textContent = `Displaying up to Question ${runtime.batchStart + runtime.renderedCount} of ${runtime.totalQuestions} — Scroll down or click to load more`;
    loaderNote.onclick = appendNextBatch;
  } else {
    loaderNote.textContent = `All ${runtime.totalQuestions} questions displayed`;
    loaderNote.style.cursor = "default";
  }
  container.appendChild(loaderNote);

  updateNavigationIndicators();
  runtime.isAppending = false;
}

function renderBatchWithProgress(startIdx, targetTotal) {
  runtime.cancelLoading = false;
  const progressModal  = document.getElementById('modal-progress');
  const progressFill   = document.getElementById('progress-modal-fill');
  const progressMsg    = document.getElementById('progress-modal-msg');
  const progressDetail = document.getElementById('progress-modal-detail');

  progressModal.classList.add('open');

  const container = document.getElementById('view-active-sheet');
  let curr = startIdx;
  const totalToLoad = targetTotal - startIdx;
  const chunkSize = 20;

  function processChunk() {
    if (runtime.cancelLoading || curr >= targetTotal) {
      progressModal.classList.remove('open');
      updateNavigationIndicators();
      return;
    }

    const chunkEnd = Math.min(curr + chunkSize, targetTotal);
    const fragment = document.createDocumentFragment();

    for (let qIdx = curr; qIdx < chunkEnd; qIdx++) {
      const block = createQuestionBlock(qIdx);
      fragment.appendChild(block);
    }
    container.appendChild(fragment);

    for (let qIdx = curr; qIdx < chunkEnd; qIdx++) {
      refreshQuestionColors(qIdx);
    }

    runtime.renderedCount += (chunkEnd - curr);
    curr = chunkEnd;

    const processed = curr - startIdx;
    const pct = Math.round((processed / totalToLoad) * 100);
    progressFill.style.width = pct + '%';
    progressMsg.textContent = `Rendering Question ${curr} of ${targetTotal}...`;
    progressDetail.textContent = `${processed} of ${totalToLoad} loaded (${pct}%)`;

    requestAnimationFrame(processChunk);
  }

  requestAnimationFrame(processChunk);
}

function cancelProgressLoading() {
  runtime.cancelLoading = true;
  document.getElementById('modal-progress').classList.remove('open');
  updateNavigationIndicators();
}

function loadPreviousBatchRange() {
  const newStart = Math.max(0, runtime.batchStart - runtime.batchSize);
  renderActiveView(newStart);
}

function handleStageScroll() {
  if (!runtime.entries || runtime.entries.length === 0) return;
  const stage = document.getElementById('stage-viewport');

  if (runtime.layoutMode === 'focus') {
    if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 30) {
      if (!runtime.isAppending && runtime.focusIdx < runtime.totalQuestions - 1) {
        runtime.isAppending = true;
        goToNextFocusCard();
        setTimeout(() => { runtime.isAppending = false; }, 300);
      }
    }
    return;
  }

  if ((runtime.batchStart + runtime.renderedCount) >= runtime.totalQuestions) return;
  if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 200) {
    appendNextBatch();
  }
}

function updateNavigationIndicators() {
  const start = runtime.batchStart + 1;
  const end = (runtime.layoutMode === 'focus') ? (runtime.focusIdx + 1) : Math.min(runtime.totalQuestions, runtime.batchStart + runtime.renderedCount);
  document.getElementById('status-q-idx').textContent = (runtime.layoutMode === 'focus') ? `${end} of ${runtime.totalQuestions}` : `${start} - ${end} of ${runtime.totalQuestions}`;
  document.getElementById('sb-progress').textContent = `${Object.keys(runtime.userAnswers).length} / ${runtime.totalQuestions}`;
  
  const activeIdx = (runtime.layoutMode === 'focus') ? runtime.focusIdx : runtime.batchStart;
  updateCurrentBadgeHighlight(activeIdx);
}

function updateCurrentBadgeHighlight(activeIdx) {
  document.querySelectorAll('.q-badge').forEach((b, i) => {
    if (runtime.layoutMode === 'focus') {
      b.classList.toggle('current', i === activeIdx);
    } else {
      b.classList.toggle('current', i >= runtime.batchStart && i < runtime.batchStart + runtime.renderedCount);
    }
  });
}

function goToNextFocusCard() {
  if (runtime.focusIdx < runtime.totalQuestions - 1) {
    runtime.focusIdx++;
    renderActiveView(runtime.focusIdx);
    document.getElementById('stage-viewport').scrollTop = 0;
  }
}

function goToPrevFocusCard() {
  if (runtime.focusIdx > 0) {
    runtime.focusIdx--;
    renderActiveView(runtime.focusIdx);
    document.getElementById('stage-viewport').scrollTop = 0;
  }
}

function refreshQuestionColors(qIdx) {
  const entry = runtime.entries[qIdx];
  const answered = runtime.userAnswers[qIdx];

  for (let i = 0; i < 4; i++) {
    const card = document.getElementById(`opt-card-${qIdx}-${i}`);
    if (!card) continue;
    card.className = 'opt-card';

    if (runtime.readingMode === "STUDY") {
      if (i === entry.correct) card.classList.add('correct-answer');
    } else {
      if (answered !== undefined) {
        if (i === entry.correct) card.classList.add('correct-answer');
        else if (i === answered) card.classList.add('wrong-answer');
      }
    }
  }
}

function handleMultiOptionSelect(qIdx, optIdx) {
  if (runtime.readingMode === "STUDY") return;
  const entry = runtime.entries[qIdx];

  if (runtime.userAnswers[qIdx] === undefined) {
    runtime.userAnswers[qIdx] = optIdx;
    const isRight = (optIdx === entry.correct);
    if (isRight) runtime.score++;

    refreshQuestionColors(qIdx);
    updateScoreStatus();

    const badge = document.querySelector(`.q-badge[data-idx="${qIdx}"]`);
    if (badge) {
      badge.classList.remove('correct', 'wrong');
      badge.classList.add(isRight ? 'correct' : 'wrong');
    }

    applySidebarFilter();

    if (Object.keys(runtime.userAnswers).length === runtime.totalQuestions) {
      setTimeout(showScorecard, 500);
    }
  }
}

function prevBatch() {
  if (runtime.layoutMode === 'focus') {
    goToPrevFocusCard();
  } else {
    const stage = document.getElementById('stage-viewport');
    if (stage.scrollTop <= 10 && runtime.batchStart > 0) {
      loadPreviousBatchRange();
    } else {
      stage.scrollTop = Math.max(0, stage.scrollTop - stage.clientHeight * 0.85);
    }
  }
}

function nextBatch() {
  if (runtime.layoutMode === 'focus') {
    goToNextFocusCard();
  } else {
    const stage = document.getElementById('stage-viewport');
    if (runtime.batchStart + runtime.renderedCount < runtime.totalQuestions) {
      appendNextBatch();
    }
    stage.scrollTop = stage.scrollTop + stage.clientHeight * 0.85;
  }
}

function changeBatchSize(val) {
  runtime.batchSize = parseInt(val);
  renderActiveView(runtime.batchStart);
}

function setLayout(mode, persist = true) {
  runtime.layoutMode = mode;
  const sheet = document.getElementById('view-active-sheet');
  sheet.className = 'viewer-sheet';
  if (mode === 'dual') sheet.classList.add('layout-dual');
  else if (mode === 'focus') sheet.classList.add('layout-focus');

  document.getElementById('select-layout-mode').value = mode;
  if (persist) localStorage.setItem("dgk_layout", mode);

  const batchSelect = document.getElementById('select-batch-size');
  const batchLabel  = document.getElementById('label-batch-size');
  if (mode === 'focus') {
    batchSelect.style.display = 'none';
    batchLabel.style.display = 'none';
    document.getElementById('btn-prev-label').textContent = 'Prev Card';
    document.getElementById('btn-next-label').textContent = 'Next Card';
  } else {
    batchSelect.style.display = '';
    batchLabel.style.display = '';
    document.getElementById('btn-prev-label').textContent = 'Prev';
    document.getElementById('btn-next-label').textContent = 'Next';
  }

  renderActiveView(runtime.layoutMode === 'focus' ? runtime.focusIdx : runtime.batchStart);
  applyZoom();
  closeModals();
}

function toggleReadingMode() {
  runtime.readingMode = (runtime.readingMode === "QUIZ") ? "STUDY" : "QUIZ";
  const btn = document.getElementById('btn-mode-toggle');
  const optMenuText = document.getElementById('m-opt-mode-text');
  const pill = document.getElementById('status-mode-pill');

  if (runtime.readingMode === "STUDY") {
    btn.textContent = "Mode: Study";
    optMenuText.textContent = "Switch Mode: Quiz";
    pill.textContent = "STUDY";
    pill.style.color = "var(--status-correct)";
  } else {
    btn.textContent = "Mode: Quiz";
    optMenuText.textContent = "Switch Mode: Study";
    pill.textContent = "QUIZ";
    pill.style.color = "var(--accent)";
  }

  for (let i = runtime.batchStart; i < runtime.batchStart + runtime.renderedCount; i++) {
    refreshQuestionColors(i);
  }
  closeModals();
}

function resetQuizScore() {
  runtime.score = 0;
  runtime.userAnswers = {};
  updateScoreStatus();
  document.querySelectorAll('.q-badge').forEach(b => b.classList.remove('correct', 'wrong'));
  for (let i = runtime.batchStart; i < runtime.batchStart + runtime.renderedCount; i++) {
    refreshQuestionColors(i);
  }
  applySidebarFilter();
}

function updateScoreStatus() {
  document.getElementById('status-score').textContent = `${runtime.score} / ${runtime.totalQuestions}`;
  document.getElementById('sb-progress').textContent = `${Object.keys(runtime.userAnswers).length} / ${runtime.totalQuestions}`;
}

/* SIDEBAR MATRIX */
function buildNavigatorGrid() {
  const container = document.getElementById('q-access-grid');
  container.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (let i = 0; i < runtime.totalQuestions; i++) {
    const badge = document.createElement('div');
    badge.className = 'q-badge';
    badge.dataset.idx = i;
    badge.textContent = (i + 1);
    frag.appendChild(badge);
  }
  container.appendChild(frag);

  container.onclick = function(e) {
    const badge = e.target.closest('.q-badge');
    if (badge) {
      const idx = parseInt(badge.dataset.idx, 10);
      jumpToQuestionIndex(idx);
    }
  };

  applySidebarFilter();
}

function jumpToQuestionIndex(targetIdx) {
  if (runtime.layoutMode === 'focus') {
    runtime.focusIdx = targetIdx;
    renderActiveView(targetIdx);
    return;
  }

  const existing = document.getElementById(`q-block-${targetIdx}`);
  if (existing) {
    existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    existing.classList.add('active-focus');
    setTimeout(() => existing.classList.remove('active-focus'), 1200);
    return;
  }

  renderActiveView(targetIdx);

  setTimeout(() => {
    const targetBlock = document.getElementById(`q-block-${targetIdx}`);
    if (targetBlock) {
      targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetBlock.classList.add('active-focus');
      setTimeout(() => targetBlock.classList.remove('active-focus'), 1200);
    }
  }, 60);
}

function setSidebarFilter(filterName) {
  runtime.currentFilter = filterName;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-filter-' + filterName).classList.add('active');
  applySidebarFilter();
}

function applySidebarFilter() {
  const query = (document.getElementById('sidebar-search-input').value || '').trim().toLowerCase();
  document.querySelectorAll('.q-badge').forEach((badge) => {
    const idx = parseInt(badge.dataset.idx, 10);
    let visible = true;
    const entry = runtime.entries[idx];
    const ans = runtime.userAnswers[idx];

    if (runtime.currentFilter === 'wrong') {
      visible = (ans !== undefined && ans !== entry.correct);
    } else if (runtime.currentFilter === 'unanswered') {
      visible = (ans === undefined);
    }

    if (visible && query) {
      const numMatch = (idx + 1).toString().includes(query);
      const textMatch = runtime.searchIndex[idx] && runtime.searchIndex[idx].toLowerCase().includes(query);
      visible = (numMatch || textMatch);
    }

    badge.style.display = visible ? 'flex' : 'none';
  });
}

function handleSearchInput(val) {
  applySidebarFilter();
}

function toggleSidebar() {
  document.getElementById('sidebar-navigator').classList.toggle('hidden');
}

function updateUIStatus() {
  document.getElementById('titlebar-file-label').textContent = runtime.fileName;
  document.getElementById('status-filename').textContent = runtime.fileName;
  document.getElementById('status-filesize').textContent = Math.round(runtime.fileSize / 1024) + ' KB';
  document.getElementById('jump-max-display').textContent = runtime.totalQuestions;
  updateScoreStatus();
}

function stepZoom(delta) {
  runtime.zoom = Math.min(Math.max(0.6, runtime.zoom + delta), 2.2);
  applyZoom();
}

function resetZoom() {
  runtime.zoom = 1.0;
  applyZoom();
}

function applyZoom() {
  const sheet = document.getElementById('view-active-sheet');
  if (!sheet) return;

  let baseWidth = 880;
  if (runtime.layoutMode === 'dual') baseWidth = 1300;
  else if (runtime.layoutMode === 'focus') baseWidth = 660;

  sheet.style.zoom = runtime.zoom;
  sheet.style.width = `${Math.round(baseWidth * runtime.zoom)}px`;

  document.getElementById('status-zoom').textContent = Math.round(runtime.zoom * 100) + '%';
  localStorage.setItem("dgk_zoom", runtime.zoom);
}

/* DEMO GENERATOR */
function synthesizeTextMask(text, width, height, bytesPerRow) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(text, 6, Math.floor((height - 14) / 2));

  const imgData = ctx.getImageData(0, 0, width, height).data;
  const buffer = new Uint8Array(height * bytesPerRow);

  for (let r = 0; r < height; r++) {
    for (let x = 0; x < width; x++) {
      const pixelBrightness = imgData[(r * width + x) * 4];
      if (pixelBrightness > 120) {
        const byteIdx = r * bytesPerRow + (x >> 3);
        const bitIdx = 7 - (x & 7);
        buffer[byteIdx] |= (1 << bitIdx);
      }
    }
  }
  return buffer;
}

function loadSampleDemoPack() {
  const demoData = [
    { q: "What is the capital city of France?", opts: ["London", "Paris", "Berlin", "Rome"], ans: 1 },
    { q: "Which element has chemical symbol 'O'?", opts: ["Gold", "Silver", "Oxygen", "Iron"], ans: 2 },
    { q: "How many planets are in Solar System?", opts: ["Seven", "Eight", "Nine", "Ten"], ans: 1 },
    { q: "Which ocean is the largest on Earth?", opts: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic"], ans: 0 },
    { q: "What is the speed of light in vacuum?", opts: ["300,000 km/s", "150,000 km/s", "10,000 km/s", "Sound speed"], ans: 0 },
    { q: "Who painted the Mona Lisa masterpiece?", opts: ["Michelangelo", "Leonardo da Vinci", "Raphael", "Picasso"], ans: 1 },
    { q: "Which gas do plants absorb from atmosphere?", opts: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Argon"], ans: 1 },
    { q: "What is the largest mammal alive today?", opts: ["African Elephant", "Blue Whale", "Giraffe", "Hippopotamus"], ans: 1 },
    { q: "In what year did the Apollo 11 moon landing occur?", opts: ["1965", "1969", "1972", "1975"], ans: 1 },
    { q: "Which is the smallest prime number?", opts: ["Zero", "One", "Two", "Three"], ans: 2 }
  ];

  const count = demoData.length;
  const qH = 34;
  const optH = 24;
  const qBytes = qH * QUESTION_BYTES_ROW;
  const optBytes = optH * OPTION_BYTES_ROW;
  const singlePayload = qBytes + (4 * optBytes);

  const headerSize = 20;
  const indexSize = count * ENTRY_SIZE;
  const payloadBase = headerSize + indexSize;

  const encoder = new TextEncoder();
  let searchBufLen = 0;
  const encodedSearchTexts = demoData.map(d => {
    const encoded = encoder.encode(d.q);
    searchBufLen += 4 + encoded.length;
    return encoded;
  });

  const searchOffset = payloadBase + (count * singlePayload);
  const totalSize = searchOffset + searchBufLen;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  u8[0] = 68; u8[1] = 71; u8[2] = 75; u8[3] = 49;
  view.setUint32(4, count, true);
  view.setUint32(8, headerSize, true);
  view.setUint32(12, searchOffset, true);
  view.setUint32(16, payloadBase, true);

  for (let i = 0; i < count; i++) {
    const payloadOffset = i * singlePayload;
    const entryPos = headerSize + (i * ENTRY_SIZE);

    view.setUint32(entryPos, payloadOffset, true);
    view.setUint16(entryPos + 4, qH, true);
    view.setUint16(entryPos + 6, optH, true);
    view.setUint16(entryPos + 8, optH, true);
    view.setUint16(entryPos + 10, optH, true);
    view.setUint16(entryPos + 12, optH, true);
    view.setUint8(entryPos + 14, demoData[i].ans);

    const qMask = synthesizeTextMask(demoData[i].q, QUESTION_W, qH, QUESTION_BYTES_ROW);
    u8.set(qMask, payloadBase + payloadOffset);

    let currentOptOffset = payloadBase + payloadOffset + qBytes;
    for (let o = 0; o < 4; o++) {
      const optMask = synthesizeTextMask(demoData[i].opts[o], OPTION_W, optH, OPTION_BYTES_ROW);
      u8.set(optMask, currentOptOffset);
      currentOptOffset += optBytes;
    }
  }

  let sPos = searchOffset;
  for (let i = 0; i < count; i++) {
    const bytes = encodedSearchTexts[i];
    view.setUint16(sPos, i, true);
    view.setUint16(sPos + 2, bytes.length, true);
    u8.set(bytes, sPos + 4);
    sPos += 4 + bytes.length;
  }

  const sampleName = "Sample_Standard_Exam_10Q.pak";
  storePakInIndexedDB(sampleName, totalSize, buffer);
  loadPakFromBuffer(buffer, sampleName);
  closeModals();
}

/* THEMES & MODALS */
function setTheme(t, persist = true) {
  document.body.setAttribute('data-theme', t);
  if (persist) localStorage.setItem("dgk_theme", t);
  if (runtime.buffer) {
    renderActiveView(runtime.batchStart);
  }
  closeModals();
}

function toggleMenu(id) {
  const el = document.getElementById(id);
  const was = el.classList.contains('active');
  closeAllMenus();
  if (!was) el.classList.add('active');
}

function closeAllMenus() {
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
}

window.onclick = function(e) {
  if (!e.target.closest('.menu-item')) closeAllMenus();
};

function openModal(id) {
  closeAllMenus();
  document.getElementById(id).classList.add('open');
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
  closeAllMenus();
}

async function openRecentModal() {
  openModal('modal-recent');
  const container = document.getElementById('recent-list-container');
  container.innerHTML = `<span style="color:var(--text-muted)">Querying database...</span>`;

  try {
    const list = await getAllRecentFromIndexedDB();
    if (!list || list.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:18px; color:var(--text-muted);">No packages stored.</div>`;
      return;
    }

    container.innerHTML = list.map(item => `
      <div class="recent-item">
        <div>
          <div style="font-weight:600;">${item.name}</div>
          <div style="font-size:11px; color:var(--text-dim);">${Math.round(item.size / 1024)} KB — Saved: ${item.date}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="tb-btn primary" onclick="loadRecentItem('${item.name}')">Open</button>
          <button class="tb-btn" onclick="removeRecentItem('${item.name}')" style="color:var(--status-wrong);">&times;</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<span style="color:var(--status-wrong)">Failed to read database: ${err.message}</span>`;
  }
}

async function loadRecentItem(name) {
  try {
    const record = await getPakFromIndexedDB(name);
    if (record && record.buffer) {
      loadPakFromBuffer(record.buffer, record.name);
      closeModals();
    } else {
      alert("File data not found.");
    }
  } catch (e) {
    alert("Error loading Data: " + e.message);
  }
}

async function removeRecentItem(name) {
  await deleteFromIndexedDB(name);
  openRecentModal();
}

async function clearAllRecentFiles() {
  if (confirm("Are you sure you want to clear all stored recent files?")) {
    await clearAllIndexedDB();
    openRecentModal();
  }
}

function openDownloadLink() {
  if (vscode) {
    vscode.postMessage({
      command: 'openExternal',
      url: DOWNLOAD_URL
    });
  } else {
    window.open(DOWNLOAD_URL, "_blank");
  }
  closeModals();
}

function showJumpDialog() {
  if (!runtime.totalQuestions) return;
  document.getElementById('input-jump-number').max = runtime.totalQuestions;
  document.getElementById('input-jump-number').value = (runtime.layoutMode === 'focus') ? runtime.focusIdx + 1 : runtime.batchStart + 1;
  openModal('modal-jump');
}

function submitJump() {
  const val = parseInt(document.getElementById('input-jump-number').value);
  if (!isNaN(val) && val >= 1 && val <= runtime.totalQuestions) {
    jumpToQuestionIndex(val - 1);
    closeModals();
  }
}

function showScorecard() {
  document.getElementById('scorecard-number').textContent = `${runtime.score} / ${runtime.totalQuestions}`;
  const pct = (runtime.score / runtime.totalQuestions) * 100;
  let text = "Full test evaluation complete.";
  if (pct === 100) text = "Flawless score: 100% correct across all items.";
  else if (pct >= 60) text = "Passing score achieved.";
  else text = "Practice recommended via Study Mode.";
  document.getElementById('scorecard-text').textContent = text;
  openModal('modal-scorecard');
}

function confirmExit() {
  if (vscode) {
    vscode.postMessage({ command: 'closePanel' });
  } else if (confirm("Close Daily GK?")) {
    window.close();
  }
}

/* KEYBOARD SHORTCUTS */
window.addEventListener('keydown', function(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
    if (e.key === "Enter" && e.target.id === "input-jump-number") submitJump();
    return;
  }

  if (e.key === "PageDown" || (e.shiftKey && e.key === " ")) {
    e.preventDefault();
    nextBatch();
  } else if (e.key === "PageUp") {
    e.preventDefault();
    prevBatch();
  } else if (runtime.layoutMode === 'focus' && e.key === "ArrowRight") {
    e.preventDefault();
    goToNextFocusCard();
  } else if (runtime.layoutMode === 'focus' && e.key === "ArrowLeft") {
    e.preventDefault();
    goToPrevFocusCard();
  } else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    triggerFileInput();
  } else if (e.ctrlKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    showJumpDialog();
  } else if (e.key.toLowerCase() === 'm') {
    toggleReadingMode();
  } else if (e.key === "+" || e.key === "=") {
    stepZoom(0.1);
  } else if (e.key === "-") {
    stepZoom(-0.1);
  } else if (e.key === "F1") {
    e.preventDefault();
    openModal('modal-guide');
  } else if (e.key === "Escape") {
    closeModals();
  }
});

// Boot Application
loadPersistedSettings();
updateOnDemandVisibility(false);