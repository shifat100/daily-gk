/**
 * Daily GK - Responsive Universal Engine
 * Pure ES5 (Dual Screen: 320x480 in Popup, 100% Fullscreen in Tab)
 */

// 1. DGK1 Binary Parser
function PakParser(arrayBuffer, filename) {
  this.buffer = arrayBuffer;
  this.filename = filename || '';
  this.view = new DataView(arrayBuffer);
  this.bytes = new Uint8Array(arrayBuffer);

  var magic = String.fromCharCode(this.bytes[0], this.bytes[1], this.bytes[2], this.bytes[3]);
  if (magic !== 'DGK1') {
    throw new Error('Not a valid DGK1 package!');
  }

  this.totalQuestions = this.view.getUint32(4, true);
  this.indexOffset = this.view.getUint32(8, true);
  this.searchOffset = this.view.getUint32(12, true);
  this.payloadBase = this.view.getUint32(16, true);
}

PakParser.prototype.getEntry = function(qId) {
  if (qId < 0 || qId >= this.totalQuestions) return null;

  var entryPos = this.indexOffset + (qId * 20);
  var payloadOffset = this.view.getUint32(entryPos, true);
  var qH = this.view.getUint16(entryPos + 4, true);
  var optH = [
    this.view.getUint16(entryPos + 6, true),
    this.view.getUint16(entryPos + 8, true),
    this.view.getUint16(entryPos + 10, true),
    this.view.getUint16(entryPos + 12, true)
  ];
  var correctAnswer = this.view.getUint8(entryPos + 14);

  var curOffset = this.payloadBase + payloadOffset;
  var qBytes = qH * 28;
  var qBitmap = this.bytes.subarray(curOffset, curOffset + qBytes);
  curOffset += qBytes;

  var optBitmaps = [];
  for (var i = 0; i < 4; i++) {
    var optBytes = optH[i] * 26;
    optBitmaps.push(this.bytes.subarray(curOffset, curOffset + optBytes));
    curOffset += optBytes;
  }

  return {
    qId: qId,
    qH: qH,
    optH: optH,
    correctAnswer: correctAnswer,
    qBitmap: qBitmap,
    optBitmaps: optBitmaps
  };
};

PakParser.prototype.searchKeyword = function(keyword) {
  if (!keyword) return -1;
  var sPos = this.searchOffset;
  var key = keyword.toLowerCase();

  for (var i = 0; i < this.totalQuestions; i++) {
    var qId = this.view.getUint16(sPos, true);
    var tLen = this.view.getUint16(sPos + 2, true);
    sPos += 4;

    var str = '';
    for (var j = 0; j < tLen; j++) {
      str += String.fromCharCode(this.bytes[sPos + j]);
    }
    sPos += tLen;

    if (str.toLowerCase().indexOf(key) !== -1) {
      return qId;
    }
  }
  return -1;
};

// Auto-adjusts pixel color for Light/Dark mode
PakParser.renderMask = function(canvas, width, height, bytesPerRow, maskData, colorHex) {
  canvas.width = width;
  canvas.height = height > 0 ? height : 1;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  if (!maskData || height <= 0) return;

  var imgData = ctx.createImageData(width, height);
  var data = imgData.data;
  var color = colorHex || '#ffffff';
  var r = parseInt(color.slice(1, 3), 16);
  var g = parseInt(color.slice(3, 5), 16);
  var b = parseInt(color.slice(5, 7), 16);

  for (var row = 0; row < height; row++) {
    for (var byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      var val = maskData[row * bytesPerRow + byteIdx];
      if (val === 0) continue;

      for (var bit = 0; bit < 8; bit++) {
        if (val & (0x80 >> bit)) {
          var px = (byteIdx * 8) + bit;
          if (px < width) {
            var pIdx = (row * width + px) * 4;
            data[pIdx] = r;
            data[pIdx + 1] = g;
            data[pIdx + 2] = b;
            data[pIdx + 3] = 255;
          }
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
};

// 2. High-Performance IndexedDB Storage (Separates Metadata from Payload)
var PakStore = {
  openDB: function(callback) {
    var req = indexedDB.open('DailyGKStore_v2', 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('pak_meta')) {
        db.createObjectStore('pak_meta', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('pak_blobs')) {
        db.createObjectStore('pak_blobs', { keyPath: 'name' });
      }
    };
    req.onsuccess = function() { callback(null, req.result); };
    req.onerror = function() { callback(req.error); };
  },

  save: function(name, arrayBuffer, callback) {
    this.openDB(function(err, db) {
      if (err) { if (callback) callback(err); return; }
      try {
        var view = new DataView(arrayBuffer);
        var totalQ = view.getUint32(4, true);

        var tx = db.transaction(['pak_meta', 'pak_blobs'], 'readwrite');
        tx.objectStore('pak_meta').put({
          name: name,
          size: arrayBuffer.byteLength,
          totalQuestions: totalQ
        });
        tx.objectStore('pak_blobs').put({
          name: name,
          buffer: arrayBuffer
        });
        tx.oncomplete = function() { if (callback) callback(null); };
        tx.onerror = function() { if (callback) callback(tx.error); };
      } catch (ex) {
        if (callback) callback(ex);
      }
    });
  },

  getMetaList: function(callback) {
    this.openDB(function(err, db) {
      if (err) { callback(err, []); return; }
      var tx = db.transaction('pak_meta', 'readonly');
      var req = tx.objectStore('pak_meta').getAll();
      req.onsuccess = function() { callback(null, req.result || []); };
      req.onerror = function() { callback(req.error, []); };
    });
  },

  getBlob: function(name, callback) {
    this.openDB(function(err, db) {
      if (err) { callback(err, null); return; }
      var tx = db.transaction('pak_blobs', 'readonly');
      var req = tx.objectStore('pak_blobs').get(name);
      req.onsuccess = function() {
        if (req.result) callback(null, req.result.buffer);
        else callback(new Error('File not found'), null);
      };
      req.onerror = function() { callback(req.error, null); };
    });
  },

  delete: function(name, callback) {
    this.openDB(function(err, db) {
      if (err) { if (callback) callback(err); return; }
      var tx = db.transaction(['pak_meta', 'pak_blobs'], 'readwrite');
      tx.objectStore('pak_meta').delete(name);
      tx.objectStore('pak_blobs').delete(name);
      tx.oncomplete = function() { if (callback) callback(null); };
      tx.onerror = function() { if (callback) callback(tx.error); };
    });
  }
};

// 3. Application State & Controller
var g_app = {
  state: 'STATE_NO_FILES',
  prev_state: 'STATE_NO_FILES',
  read_mode: 0, // 0: QUIZ, 1: STUDY
  theme: 'dark', // 'dark' or 'light'

  pak_list: [],
  filtered_indices: [],
  selected_file_idx: 0,
  search_filter: '',

  menu_selected_idx: 0,
  qmenu_selected_idx: 0,
  help_slide_idx: 0,

  cur_parser: null,
  cur_entry: null,
  current_q_id: 0,
  selected_option: 0,
  user_choice: -1,
  score: 0,

  input_target: 0
};

var dom = {
  views: {
    STATE_FILE_LIST: document.getElementById('view-file-list'),
    STATE_NO_FILES: document.getElementById('view-no-files'),
    STATE_MENU: document.getElementById('view-menu'),
    STATE_QUESTION_MENU: document.getElementById('view-qmenu'),
    STATE_QUESTION: document.getElementById('view-question'),
    STATE_FEEDBACK: document.getElementById('view-question'),
    STATE_HELP_CAROUSEL: document.getElementById('view-help'),
    STATE_ABOUT: document.getElementById('view-about'),
    STATE_CONFIRM_EXIT: document.getElementById('view-confirm-exit'),
    STATE_INPUT_DIALOG: document.getElementById('view-input-dialog'),
    STATE_SCORECARD: document.getElementById('view-scorecard')
  },
  headerText: document.getElementById('header-text'),
  headerSub: document.getElementById('header-sub'),
  btnToggleTheme: document.getElementById('btn-toggle-theme'),
  btnOpenTab: document.getElementById('btn-open-tab'),
  softLeft: document.getElementById('soft-left'),
  softCenter: document.getElementById('soft-center'),
  softRight: document.getElementById('soft-right'),

  fileList: document.getElementById('file-items-list'),
  fileInput: document.getElementById('pak-file-input'),
  fileInputAlt: document.getElementById('pak-file-input-alt'),

  mainMenuList: document.getElementById('main-menu-list'),
  qMenuList: document.getElementById('q-menu-list'),

  qCanvas: document.getElementById('canvas-question'),
  optRows: document.querySelectorAll('.option-row'),
  optCanvases: document.querySelectorAll('.canvas-option'),

  helpTitle: document.getElementById('help-title'),
  helpBody: document.getElementById('help-body'),

  dlgTitle: document.getElementById('input-dialog-title'),
  dlgSub: document.getElementById('input-dialog-sub'),
  dlgInput: document.getElementById('dlg-text-input'),

  scoreText: document.getElementById('score-summary-text')
};

// Softbar titles matching daily-gk.c lines 446 - 631
function draw_softbar(left, center, right) {
  dom.softLeft.textContent = left || '';
  dom.softCenter.textContent = center || '';
  dom.softRight.textContent = right || '';
}

function update_softbar() {
  switch (g_app.state) {
    case 'STATE_FILE_LIST':
      draw_softbar("Menu", "Play", "Exit");
      break;
    case 'STATE_NO_FILES':
      draw_softbar("Menu", "Rescan", "Exit");
      break;
    case 'STATE_MENU':
    case 'STATE_QUESTION_MENU':
      draw_softbar("Select", "", "Back");
      break;
    case 'STATE_INPUT_DIALOG':
      draw_softbar("Done", "Clear", "Cancel");
      break;
    case 'STATE_CONFIRM_EXIT':
      draw_softbar("Exit", "", "Cancel");
      break;
    case 'STATE_QUESTION':
      if (g_app.read_mode === 1) {
        draw_softbar("Menu", "Next >", "Packs");
      } else {
        draw_softbar("Menu", "OK", "Back");
      }
      break;
    case 'STATE_FEEDBACK':
      if (g_app.read_mode === 1) {
        draw_softbar("Menu", "Next >", "Packs");
      } else {
        draw_softbar("Menu", "Next", "Packs");
      }
      break;
    case 'STATE_HELP_CAROUSEL':
      draw_softbar(g_app.help_slide_idx === 3 ? "Download" : "< Prev", "Next >", "Back");
      break;
    case 'STATE_ABOUT':
      draw_softbar("", "", "Back");
      break;
    case 'STATE_SCORECARD':
      draw_softbar("Again", "", "Packs");
      break;
  }
}

function draw_screen() {
  for (var key in dom.views) {
    if (dom.views.hasOwnProperty(key)) {
      dom.views[key].className = 'state-view';
    }
  }
  if (dom.views[g_app.state]) {
    dom.views[g_app.state].className = 'state-view active';
  }

  switch (g_app.state) {
    case 'STATE_FILE_LIST':
      dom.headerText.textContent = "Daily GK (" + g_app.filtered_indices.length + " Found)";
      dom.headerSub.textContent = '';
      render_file_list();
      break;
    case 'STATE_NO_FILES':
      dom.headerText.textContent = 'No Packages Found!';
      dom.headerSub.textContent = '';
      break;
    case 'STATE_MENU':
      dom.headerText.textContent = 'Options Menu';
      dom.headerSub.textContent = '';
      render_menu();
      break;
    case 'STATE_QUESTION_MENU':
      dom.headerText.textContent = 'Reading Options';
      dom.headerSub.textContent = '';
      render_qmenu();
      break;
    case 'STATE_QUESTION':
    case 'STATE_FEEDBACK':
      var total = g_app.cur_parser ? g_app.cur_parser.totalQuestions : 0;
      var modeStr = g_app.read_mode === 1 ? 'Study' : 'Quiz';
      dom.headerText.textContent = "Q " + (g_app.current_q_id + 1) + "/" + total + " (" + modeStr + ")";
      dom.headerSub.textContent = g_app.read_mode === 0 ? "Score: " + g_app.score : '';
      render_question_view();
      break;
    case 'STATE_HELP_CAROUSEL':
      dom.headerText.textContent = "Help Guide (" + (g_app.help_slide_idx + 1) + "/4)";
      dom.headerSub.textContent = '';
      render_help();
      break;
    case 'STATE_ABOUT':
      dom.headerText.textContent = 'About Daily GK';
      dom.headerSub.textContent = '';
      break;
    case 'STATE_CONFIRM_EXIT':
      dom.headerText.textContent = 'Exit Application?';
      dom.headerSub.textContent = '';
      break;
    case 'STATE_INPUT_DIALOG':
      dom.headerSub.textContent = '';
      if (g_app.input_target === 0) {
        dom.headerText.textContent = 'Search PAK Files';
        dom.dlgTitle.textContent = 'Search PAK Files';
        dom.dlgSub.textContent = 'Enter keyword:';
      } else if (g_app.input_target === 2) {
        dom.headerText.textContent = 'Jump to Question';
        dom.dlgTitle.textContent = 'Jump to Question';
        dom.dlgSub.textContent = "Enter Number (1 - " + (g_app.cur_parser ? g_app.cur_parser.totalQuestions : 1) + "):";
      } else {
        dom.headerText.textContent = 'Search Question';
        dom.dlgTitle.textContent = 'Search Question';
        dom.dlgSub.textContent = 'Enter search keyword:';
      }
      break;
    case 'STATE_SCORECARD':
      dom.headerText.textContent = 'Quiz Completed!';
      dom.headerSub.textContent = '';
      dom.scoreText.textContent = "Final Score: " + g_app.score + " / " + g_app.cur_parser.totalQuestions;
      break;
  }
  update_softbar();
}

function apply_file_filter() {
  g_app.filtered_indices = [];
  for (var i = 0; i < g_app.pak_list.length; i++) {
    if (!g_app.search_filter || g_app.pak_list[i].name.toLowerCase().indexOf(g_app.search_filter.toLowerCase()) !== -1) {
      g_app.filtered_indices.push(i);
    }
  }
  if (g_app.selected_file_idx >= g_app.filtered_indices.length) {
    g_app.selected_file_idx = 0;
  }
}

function render_file_list() {
  dom.fileList.innerHTML = '';
  for (var i = 0; i < g_app.filtered_indices.length; i++) {
    (function(displayIdx) {
      var actualIdx = g_app.filtered_indices[displayIdx];
      var item = g_app.pak_list[actualIdx];
      var el = document.createElement('div');
      el.className = 'menu-item ' + (displayIdx === g_app.selected_file_idx ? 'selected' : '');
      var numKey = displayIdx < 9 ? displayIdx + 1 : 0;
      el.innerHTML = '<div><strong>[' + numKey + '] ' + item.name + '</strong><br>' +
                     '<small class="muted-text">Size: ' + (item.size / 1024).toFixed(0) + ' KB | Q: ' + (item.totalQuestions || '?') + '</small></div>' +
                     '<button class="btn-delete" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>';

      el.onclick = function(e) {
        if (e.target.closest && e.target.closest('.btn-delete')) return;
        g_app.selected_file_idx = displayIdx;
        open_selected_pak(actualIdx);
      };
      el.querySelector('.btn-delete').onclick = function(e) {
        e.stopPropagation();
        PakStore.delete(item.name, function() { scan_all(); });
      };
      dom.fileList.appendChild(el);
    })(i);
  }
}

function render_menu() {
  var titles = ["1. Search Files", "2. Download More PAKs", "3. Help Guide", "4. About Daily GK", "5. Rescan Storage", "6. Exit App"];
  dom.mainMenuList.innerHTML = '';
  for (var i = 0; i < titles.length; i++) {
    (function(idx) {
      var el = document.createElement('div');
      el.className = 'menu-item ' + (idx === g_app.menu_selected_idx ? 'selected' : '');
      el.textContent = titles[idx];
      el.onclick = function() {
        g_app.menu_selected_idx = idx;
        menu_action();
      };
      dom.mainMenuList.appendChild(el);
    })(i);
  }
}

function render_qmenu() {
  var modeText = g_app.read_mode === 1 ? "3. Mode: [Study -> Quiz]" : "3. Mode: [Quiz -> Study]";
  var titles = ["1. Search Question", "2. Jump To Question", modeText, "4. Download *.pak", "5. Return to Main Menu"];
  dom.qMenuList.innerHTML = '';
  for (var i = 0; i < titles.length; i++) {
    (function(idx) {
      var el = document.createElement('div');
      el.className = 'menu-item ' + (idx === g_app.qmenu_selected_idx ? 'selected' : '');
      el.textContent = titles[idx];
      el.onclick = function() {
        g_app.qmenu_selected_idx = idx;
        qmenu_action();
      };
      dom.qMenuList.appendChild(el);
    })(i);
  }
}

function render_question_view() {
  var entry = g_app.cur_entry;
  if (!entry) return;

  var inkColor = (g_app.theme === 'light') ? '#111827' : '#ffffff';

  PakParser.renderMask(dom.qCanvas, 224, entry.qH, 28, entry.qBitmap, inkColor);

  for (var i = 0; i < 4; i++) {
    var row = dom.optRows[i];
    row.className = 'option-row';
    PakParser.renderMask(dom.optCanvases[i], 208, entry.optH[i], 26, entry.optBitmaps[i], inkColor);

    if (g_app.read_mode === 1) {
      if (i === entry.correctAnswer) row.className += ' correct';
      else if (i === g_app.selected_option) row.className += ' selected';
    } else {
      if (g_app.state === 'STATE_QUESTION') {
        if (i === g_app.selected_option) row.className += ' selected';
      } else if (g_app.state === 'STATE_FEEDBACK') {
        if (i === entry.correctAnswer) row.className += ' correct';
        else if (i === g_app.user_choice) row.className += ' wrong';
      }
    }
  }
}

function render_help() {
  var slides = [
    { title: "[1. About .PAK Files]", html: "Daily GK uses .PAK packages.<br>Each package contains pre-rendered MCQs.<br><br><span style='color:var(--color-green)'>No font needed on device!</span><br><span class='muted-text'>Zero CPU load, zero lag.</span>" },
    { title: "[2. Storage & Folders]", html: "Put .pak anywhere on storage.<br><br><span style='color:var(--color-orange)'>Excluded folders:</span><br><span style='color:var(--color-red)'>Videos, Audio, Music, Photos, DCIM, System Volume.</span>" },
    { title: "[3. Dual Touch & Keys]", html: "<span style='color:var(--color-green)'>Touch any option to select.</span><br>Keys 1-4: Select Option directly<br>D-Pad Up/Down: Highlight<br>Key 1-9 in List: Jump file<br><br><span style='color:var(--color-orange)'>Study Mode available in menu!</span>" },
    { title: "[4. Download More]", html: "Need more quiz questions?<br>Download packages from:<br><br><a href='https://shifat100.github.io/daily-gk/client-pack.html' target='_blank' style='color:var(--color-green)'>shifat100.github.io/daily-gk</a><br><br>Click [Download] to open web." }
  ];
  dom.helpTitle.textContent = slides[g_app.help_slide_idx].title;
  dom.helpBody.innerHTML = slides[g_app.help_slide_idx].html;
}

function scan_all() {
  PakStore.getMetaList(function(err, items) {
    g_app.pak_list = items || [];
    g_app.selected_file_idx = 0;
    g_app.search_filter = '';
    apply_file_filter();
    g_app.state = g_app.pak_list.length > 0 ? 'STATE_FILE_LIST' : 'STATE_NO_FILES';
    draw_screen();
  });
}

function open_selected_pak(actualIdx) {
  var record = g_app.pak_list[actualIdx];
  if (!record) return;

  PakStore.getBlob(record.name, function(err, buffer) {
    if (err || !buffer) {
      alert("Failed to load PAK: " + (err ? err.message : 'Unknown'));
      return;
    }
    try {
      g_app.cur_parser = new PakParser(buffer, record.name);
      if (g_app.cur_parser.totalQuestions === 0) {
        alert("Package contains 0 questions!");
        return;
      }
      g_app.score = 0;
      g_app.selected_option = 0;
      g_app.user_choice = -1;
      g_app.state = 'STATE_QUESTION';
      load_q(0);
      draw_screen();
    } catch (e) {
      alert("Invalid PAK: " + e.message);
    }
  });
}

function load_q(qId) {
  if (!g_app.cur_parser) return;
  g_app.cur_entry = g_app.cur_parser.getEntry(qId);
  g_app.current_q_id = qId;
  g_app.user_choice = -1;
  g_app.selected_option = 0;
}

function open_input(target) {
  g_app.input_target = target;
  dom.dlgInput.value = '';
  g_app.prev_state = g_app.state;
  g_app.state = 'STATE_INPUT_DIALOG';
  draw_screen();
  setTimeout(function() { dom.dlgInput.focus(); }, 50);
}

function submit_input() {
  var val = dom.dlgInput.value.trim();
  if (g_app.input_target === 0) {
    g_app.search_filter = val;
    apply_file_filter();
    g_app.state = 'STATE_FILE_LIST';
  } else if (g_app.input_target === 2) {
    var q = parseInt(val, 10);
    if (!isNaN(q) && q >= 1 && q <= g_app.cur_parser.totalQuestions) {
      load_q(q - 1);
    }
    g_app.state = 'STATE_QUESTION';
  } else if (g_app.input_target === 1) {
    var found = g_app.cur_parser.searchKeyword(val);
    if (found !== -1) {
      load_q(found);
    } else {
      alert("Keyword not found!");
    }
    g_app.state = 'STATE_QUESTION';
  }
  draw_screen();
}

function menu_action() {
  switch (g_app.menu_selected_idx) {
    case 0: open_input(0); break;
    case 1: window.open('https://shifat100.github.io/daily-gk/client-pack.html', '_blank'); break;
    case 2: g_app.help_slide_idx = 0; g_app.state = 'STATE_HELP_CAROUSEL'; draw_screen(); break;
    case 3: g_app.state = 'STATE_ABOUT'; draw_screen(); break;
    case 4: scan_all(); break;
    case 5: g_app.prev_state = 'STATE_MENU'; g_app.state = 'STATE_CONFIRM_EXIT'; draw_screen(); break;
  }
}

function qmenu_action() {
  switch (g_app.qmenu_selected_idx) {
    case 0: open_input(1); break;
    case 1: open_input(2); break;
    case 2:
      g_app.read_mode = g_app.read_mode === 0 ? 1 : 0;
      g_app.state = 'STATE_QUESTION';
      draw_screen();
      break;
    case 3: window.open('https://shifat100.github.io/daily-gk/client-pack.html', '_blank'); break;
    case 4: g_app.state = 'STATE_FILE_LIST'; draw_screen(); break;
  }
}

// 4. Keyboard Controller with Dual e.key + e.keyCode Fallback
function handle_key(code, keyCode) {
  var isEnter = (code === 'Enter' || keyCode === 13);
  var isEsc = (code === 'Escape' || keyCode === 27);
  var isUp = (code === 'ArrowUp' || code === 'Up' || keyCode === 38);
  var isDown = (code === 'ArrowDown' || code === 'Down' || keyCode === 40);
  var isLeft = (code === 'ArrowLeft' || code === 'Left' || keyCode === 37);
  var isRight = (code === 'ArrowRight' || code === 'Right' || keyCode === 39);

  if (g_app.state === 'STATE_CONFIRM_EXIT') {
    if (isEnter || code === 'SoftLeft') { window.close(); return; }
    if (code === 'SoftRight' || isEsc) { g_app.state = g_app.prev_state; draw_screen(); return; }
  }

  if (g_app.state === 'STATE_INPUT_DIALOG') {
    if (isEnter || code === 'SoftLeft') { submit_input(); }
    else if (code === 'SoftCenter') { dom.dlgInput.value = ''; }
    else if (code === 'SoftRight' || isEsc) { g_app.state = g_app.prev_state; draw_screen(); }
    return;
  }

  if (code === 'SoftRight' || isEsc) {
    if (g_app.state === 'STATE_FILE_LIST' || g_app.state === 'STATE_NO_FILES') {
      g_app.prev_state = g_app.state;
      g_app.state = 'STATE_CONFIRM_EXIT';
    } else if (g_app.state === 'STATE_MENU' || g_app.state === 'STATE_HELP_CAROUSEL' || g_app.state === 'STATE_ABOUT') {
      g_app.state = g_app.pak_list.length > 0 ? 'STATE_FILE_LIST' : 'STATE_NO_FILES';
    } else if (g_app.state === 'STATE_QUESTION_MENU') {
      g_app.state = 'STATE_QUESTION';
    } else if (g_app.state === 'STATE_QUESTION' || g_app.state === 'STATE_FEEDBACK' || g_app.state === 'STATE_SCORECARD') {
      g_app.state = 'STATE_FILE_LIST';
    }
    draw_screen();
    return;
  }

  if (code === 'SoftLeft') {
    if (g_app.state === 'STATE_FILE_LIST' || g_app.state === 'STATE_NO_FILES') {
      g_app.menu_selected_idx = 0; g_app.state = 'STATE_MENU'; draw_screen();
    } else if (g_app.state === 'STATE_QUESTION' || g_app.state === 'STATE_FEEDBACK') {
      g_app.qmenu_selected_idx = 0; g_app.state = 'STATE_QUESTION_MENU'; draw_screen();
    } else if (g_app.state === 'STATE_HELP_CAROUSEL') {
      if (g_app.help_slide_idx === 3) window.open('https://shifat100.github.io/daily-gk/client-pack.html', '_blank');
      else if (g_app.help_slide_idx > 0) { g_app.help_slide_idx--; draw_screen(); }
    } else if (g_app.state === 'STATE_MENU') {
      menu_action();
    } else if (g_app.state === 'STATE_QUESTION_MENU') {
      qmenu_action();
    } else if (g_app.state === 'STATE_SCORECARD') {
      g_app.score = 0; g_app.selected_option = 0; g_app.user_choice = -1;
      g_app.state = 'STATE_QUESTION'; load_q(0); draw_screen();
    }
    return;
  }

  if (g_app.state === 'STATE_QUESTION_MENU') {
    if (isUp && g_app.qmenu_selected_idx > 0) { g_app.qmenu_selected_idx--; draw_screen(); }
    else if (isDown && g_app.qmenu_selected_idx < 4) { g_app.qmenu_selected_idx++; draw_screen(); }
    else if (isEnter || code === 'SoftCenter') { qmenu_action(); }
    return;
  }

  if (g_app.state === 'STATE_MENU') {
    if (isUp && g_app.menu_selected_idx > 0) { g_app.menu_selected_idx--; draw_screen(); }
    else if (isDown && g_app.menu_selected_idx < 5) { g_app.menu_selected_idx++; draw_screen(); }
    else if (isEnter || code === 'SoftCenter') { menu_action(); }
    return;
  }

  if (g_app.state === 'STATE_FILE_LIST') {
    if (isUp && g_app.selected_file_idx > 0) { g_app.selected_file_idx--; draw_screen(); }
    else if (isDown && g_app.selected_file_idx < g_app.filtered_indices.length - 1) { g_app.selected_file_idx++; draw_screen(); }
    else if (isEnter || code === 'SoftCenter') {
      if (g_app.filtered_indices.length > 0) open_selected_pak(g_app.filtered_indices[g_app.selected_file_idx]);
    } else if (keyCode >= 49 && keyCode <= 57) { // 1-9 Keys
      var t = keyCode - 49;
      if (t < g_app.filtered_indices.length) { g_app.selected_file_idx = t; draw_screen(); }
    } else if (keyCode === 48 && 9 < g_app.filtered_indices.length) { // 0 Key
      g_app.selected_file_idx = 9; draw_screen();
    }
    return;
  }

  if (g_app.state === 'STATE_HELP_CAROUSEL') {
    if (isLeft && g_app.help_slide_idx > 0) { g_app.help_slide_idx--; draw_screen(); }
    else if (isRight || isEnter || code === 'SoftCenter') {
      if (g_app.help_slide_idx < 3) { g_app.help_slide_idx++; }
      else { window.open('https://shifat100.github.io/daily-gk/client-pack.html', '_blank'); }
      draw_screen();
    }
    return;
  }

  if (g_app.state === 'STATE_QUESTION') {
    if (g_app.read_mode === 1) {
      if (isRight || isEnter || code === 'SoftCenter') {
        if (g_app.current_q_id + 1 < g_app.cur_parser.totalQuestions) load_q(g_app.current_q_id + 1);
        draw_screen(); return;
      } else if (isLeft && g_app.current_q_id > 0) {
        load_q(g_app.current_q_id - 1); draw_screen(); return;
      }
    }

    if (keyCode >= 49 && keyCode <= 52) { // 1-4 Keys
      g_app.user_choice = keyCode - 49;
      if (g_app.user_choice === g_app.cur_entry.correctAnswer) g_app.score++;
      g_app.state = 'STATE_FEEDBACK';
      draw_screen(); return;
    }

    if (isUp && g_app.selected_option > 0) { g_app.selected_option--; draw_screen(); }
    else if (isDown && g_app.selected_option < 3) { g_app.selected_option++; draw_screen(); }
    else if (isEnter || code === 'SoftCenter') {
      g_app.user_choice = g_app.selected_option;
      if (g_app.user_choice === g_app.cur_entry.correctAnswer) g_app.score++;
      g_app.state = 'STATE_FEEDBACK'; draw_screen();
    }
    return;
  }

  if (g_app.state === 'STATE_FEEDBACK') {
    if (isEnter || code === 'SoftCenter' || isRight || isDown) {
      if (g_app.current_q_id + 1 < g_app.cur_parser.totalQuestions) {
        load_q(g_app.current_q_id + 1); g_app.state = 'STATE_QUESTION';
      } else {
        g_app.state = 'STATE_SCORECARD';
      }
      draw_screen();
    }
  }
}

// 5. Global Listeners & Fullscreen Detection
function checkScreenMode() {
  var isTab = window.location.search.indexOf('mode=fullscreen') !== -1;
  var isExpanded = window.innerWidth > 360 || window.innerHeight > 520;

  var currentThemeClass = (g_app.theme === 'light') ? 'theme-light' : 'theme-dark';

  if (isTab || isExpanded) {
    document.body.className = currentThemeClass + ' fullscreen-mode';
    if (dom.btnOpenTab) dom.btnOpenTab.style.display = 'none';
  } else {
    document.body.className = currentThemeClass;
    if (dom.btnOpenTab) dom.btnOpenTab.style.display = 'flex';
  }
}

window.onresize = checkScreenMode;

window.onkeydown = function(e) {
  var key = e.key || '';
  var code = e.keyCode || e.which || 0;

  if (key === 'F1' || code === 112 || key === 'q' || key === 'Q' || code === 81) {
    if (e.preventDefault) e.preventDefault();
    handle_key('SoftLeft', code);
  } else if (key === 'F2' || code === 113) {
    if (e.preventDefault) e.preventDefault();
    handle_key('SoftRight', code);
  } else if ((key === ' ' || key === 'Spacebar' || code === 32) && g_app.state !== 'STATE_INPUT_DIALOG') {
    if (e.preventDefault) e.preventDefault();
    handle_key('SoftCenter', code);
  } else {
    handle_key(key, code);
  }
};

dom.softLeft.onclick = function() { handle_key('SoftLeft', 0); };
dom.softCenter.onclick = function() { handle_key('SoftCenter', 0); };
dom.softRight.onclick = function() { handle_key('SoftRight', 0); };

// Theme Toggle Functionality
function applyTheme(theme) {
  g_app.theme = theme;
  try {
    localStorage.setItem('dgk_theme', theme);
  } catch (e) {}
  checkScreenMode();
  draw_screen();
}

dom.btnToggleTheme.onclick = function() {
  applyTheme(g_app.theme === 'dark' ? 'light' : 'dark');
};

// Open in Full Tab
dom.btnOpenTab.onclick = function(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  var extAPI = (typeof chrome !== 'undefined' && chrome.tabs) ? chrome : (typeof browser !== 'undefined' ? browser : null);
  var targetUrl = 'popup.html?mode=fullscreen';
  if (extAPI && extAPI.tabs && extAPI.tabs.create) {
    extAPI.tabs.create({ url: targetUrl });
  } else {
    window.open(targetUrl, '_blank');
  }
};

function import_files(fileList) {
  var arr = [];
  for (var i = 0; i < fileList.length; i++) arr.push(fileList[i]);
  function processNext() {
    if (arr.length === 0) { scan_all(); return; }
    var f = arr.shift();
    var reader = new FileReader();
    reader.onload = function(e) {
      PakStore.save(f.name, e.target.result, function() { processNext(); });
    };
    reader.readAsArrayBuffer(f);
  }
  processNext();
}

dom.fileInput.onchange = function(e) { import_files(e.target.files); };
dom.fileInputAlt.onchange = function(e) { import_files(e.target.files); };

for (var k = 0; k < 4; k++) {
  (function(idx) {
    dom.optRows[idx].onclick = function() {
      g_app.selected_option = idx;
      g_app.user_choice = idx;
      if (g_app.read_mode !== 1) {
        if (g_app.user_choice === g_app.cur_entry.correctAnswer) g_app.score++;
        g_app.state = 'STATE_FEEDBACK';
      }
      draw_screen();
    };
  })(k);
}

document.getElementById('btn-modal-exit').onclick = function() { window.close(); };
document.getElementById('btn-modal-cancel').onclick = function() { g_app.state = g_app.prev_state; draw_screen(); };

// Restore saved theme
try {
  var savedTheme = localStorage.getItem('dgk_theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    g_app.theme = savedTheme;
  }
} catch (e) {}

// Boot Application
checkScreenMode();
scan_all();