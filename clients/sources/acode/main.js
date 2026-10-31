/**
 * Daily GK - Acode Editor Plugin
 * Compatible with Acode for Android
 */

(function () {
  if (typeof window.acode === "undefined") {
    console.warn("[Daily GK] Acode API not detected. Plugins must be installed via Acode Settings > Plugins.");
    return;
  }

  var sideButton = null;
  var isInitialized = false;

  function showToast(msg) {
    try {
      var toast = window.toast || acode.require("toast");
      if (toast) {
        if (typeof toast === "function") toast(msg);
        else if (typeof toast.show === "function") toast.show(msg);
        return;
      }
    } catch (e) {}
    console.log("[Daily GK]", msg);
  }

  // 1. Binary Parser (DGK1)
  function PakParser(arrayBuffer, filename) {
    if (!arrayBuffer || arrayBuffer.byteLength < 20) {
      throw new Error("File too small to be a valid .PAK");
    }
    this.buffer = arrayBuffer;
    this.filename = filename || "";
    this.view = new DataView(arrayBuffer);
    this.bytes = new Uint8Array(arrayBuffer);

    var magic = String.fromCharCode(this.bytes[0], this.bytes[1], this.bytes[2], this.bytes[3]);
    if (magic !== "DGK1") {
      throw new Error("Invalid PAK: Magic header mismatch");
    }

    this.totalQuestions = this.view.getUint32(4, true);
    this.indexOffset = this.view.getUint32(8, true);
    this.searchOffset = this.view.getUint32(12, true);
    this.payloadBase = this.view.getUint32(16, true);
  }

  PakParser.prototype.getEntry = function (qId) {
    if (qId < 0 || qId >= this.totalQuestions) return null;

    var entryPos = this.indexOffset + qId * 20;
    if (entryPos + 15 > this.bytes.length) return null;

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

  PakParser.prototype.searchKeyword = function (keyword) {
    if (!keyword) return -1;
    var sPos = this.searchOffset;
    var key = keyword.toLowerCase().trim();

    for (var i = 0; i < this.totalQuestions; i++) {
      if (sPos + 4 > this.bytes.length) break;
      var qId = this.view.getUint16(sPos, true);
      var tLen = this.view.getUint16(sPos + 2, true);
      sPos += 4;

      if (sPos + tLen > this.bytes.length) break;

      var str = "";
      try {
        str = new TextDecoder("utf-8").decode(this.bytes.subarray(sPos, sPos + tLen));
      } catch (e) {
        for (var j = 0; j < tLen; j++) str += String.fromCharCode(this.bytes[sPos + j]);
      }
      sPos += tLen;

      if (str.toLowerCase().indexOf(key) !== -1) {
        return qId;
      }
    }
    return -1;
  };

  PakParser.renderMask = function (canvas, width, height, bytesPerRow, maskData, colorHex) {
    if (!canvas) return;
    var h = height > 0 ? height : 1;
    canvas.width = width;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, h);

    if (!maskData || height <= 0) return;

    var imgData = ctx.createImageData(width, h);
    var data = imgData.data;
    var color = colorHex || "#ffffff";
    var r = parseInt(color.slice(1, 3), 16) || 255;
    var g = parseInt(color.slice(3, 5), 16) || 255;
    var b = parseInt(color.slice(5, 7), 16) || 255;

    for (var row = 0; row < height; row++) {
      var rowOffset = row * bytesPerRow;
      for (var byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        var val = maskData[rowOffset + byteIdx];
        if (!val) continue;

        for (var bit = 0; bit < 8; bit++) {
          if (val & (0x80 >> bit)) {
            var px = byteIdx * 8 + bit;
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

  // 2. IndexedDB Storage
  var PakStore = {
    openDB: function (callback) {
      var req = indexedDB.open("DailyGK_Store_DB", 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "name" });
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "name" });
      };
      req.onsuccess = function () { callback(null, req.result); };
      req.onerror = function () { callback(req.error); };
    },

    save: function (name, arrayBuffer, callback) {
      if (!arrayBuffer || arrayBuffer.byteLength < 20) {
        if (callback) callback(new Error("File too small"));
        return;
      }
      var b = new Uint8Array(arrayBuffer, 0, 4);
      if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== "DGK1") {
        if (callback) callback(new Error("Not a DGK1 file"));
        return;
      }

      this.openDB(function (err, db) {
        if (err) { if (callback) callback(err); return; }
        try {
          var view = new DataView(arrayBuffer);
          var totalQ = view.getUint32(4, true);

          var tx = db.transaction(["meta", "blobs"], "readwrite");
          tx.objectStore("meta").put({ name: name, size: arrayBuffer.byteLength, totalQuestions: totalQ });
          tx.objectStore("blobs").put({ name: name, buffer: arrayBuffer });
          tx.oncomplete = function () { if (callback) callback(null); };
          tx.onerror = function () { if (callback) callback(tx.error); };
        } catch (ex) {
          if (callback) callback(ex);
        }
      });
    },

    getMetaList: function (callback) {
      this.openDB(function (err, db) {
        if (err) { callback(err, []); return; }
        var tx = db.transaction("meta", "readonly");
        var req = tx.objectStore("meta").getAll();
        req.onsuccess = function () { callback(null, req.result || []); };
        req.onerror = function () { callback(req.error, []); };
      });
    },

    getBlob: function (name, callback) {
      this.openDB(function (err, db) {
        if (err) { callback(err, null); return; }
        var tx = db.transaction("blobs", "readonly");
        var req = tx.objectStore("blobs").get(name);
        req.onsuccess = function () {
          if (req.result) callback(null, req.result.buffer);
          else callback(new Error("File not found"), null);
        };
        req.onerror = function () { callback(req.error, null); };
      });
    },

    delete: function (name, callback) {
      this.openDB(function (err, db) {
        if (err) { if (callback) callback(err); return; }
        var tx = db.transaction(["meta", "blobs"], "readwrite");
        tx.objectStore("meta").delete(name);
        tx.objectStore("blobs").delete(name);
        tx.oncomplete = function () { if (callback) callback(null); };
        tx.onerror = function () { if (callback) callback(tx.error); };
      });
    }
  };

  // 3. UI Setup
  function setupDailyGkApp($page) {
    if ($page.settitle) $page.settitle("Daily GK");
    else if ($page.setTitle) $page.setTitle("Daily GK");

    $page.innerHTML =
      '<style>' +
      '  #dgk-wrap { width: 100%; height: 100%; display: flex; flex-direction: column; background: #12161e; color: #ffffff; font-family: sans-serif; box-sizing: border-box; }' +
      '  #dgk-wrap * { box-sizing: border-box; }' +
      '  #dgk-header { height: 42px; background: #1e90ff; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; font-weight: bold; font-size: 14px; flex-shrink: 0; }' +
      '  #dgk-body { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; align-items: center; width: 100%; }' +
      '  .dgk-view { display: none; width: 100%; max-width: 600px; flex-direction: column; align-items: center; }' +
      '  .dgk-view.active { display: flex; }' +
      '  .dgk-card { background: #1c222e; border: 1px solid #2d3441; border-radius: 6px; padding: 12px; width: 100%; margin-bottom: 8px; font-size: 13px; line-height: 1.5; }' +
      '  .dgk-btn { background: #1e90ff; color: #fff; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; font-weight: bold; cursor: pointer; }' +
      '  .dgk-menu-item { background: #1c222e; border: 1px solid #2d3441; border-radius: 5px; padding: 12px; margin-bottom: 6px; width: 100%; display: flex; justify-content: space-between; align-items: center; font-size: 14px; cursor: pointer; user-select: none; }' +
      '  .dgk-menu-item.selected { background: #1e90ff !important; }' +
      '  .dgk-opt-row { background: #1c222e; border: 1px solid #2d3441; border-radius: 5px; padding: 8px 12px; margin-bottom: 6px; width: 100%; min-height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; }' +
      '  .dgk-opt-row.selected { background: #1e90ff !important; }' +
      '  .dgk-opt-row.correct { background: #2ecc71 !important; }' +
      '  .dgk-opt-row.wrong { background: #e74c3c !important; }' +
      '  #dgk-softbar { height: 40px; background: #0e1219; border-top: 1px solid #2d3441; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; font-size: 13px; font-weight: bold; flex-shrink: 0; }' +
      '  .dgk-soft-btn { cursor: pointer; padding: 6px 10px; user-select: none; }' +
      '  #dgk-canvas-q { display: block; margin: 0 auto; max-width: 100%; height: auto; image-rendering: pixelated; }' +
      '  .dgk-canvas-opt { display: block; margin: 0 auto; max-width: 100%; height: auto; image-rendering: pixelated; }' +
      '  .dgk-input { width: 100%; background: #12161e; border: 1px solid #2d3441; color: #2ecc71; padding: 8px 10px; font-size: 15px; border-radius: 4px; font-family: monospace; margin-top: 6px; outline: none; }' +
      '</style>' +
      '<div id="dgk-wrap">' +
      '  <div id="dgk-header"><span id="dgk-title">Daily GK</span><span id="dgk-sub"></span></div>' +
      '  <div id="dgk-body">' +
      '    <input type="file" id="dgk-file-input" accept=".pak" multiple style="display:none;">' +
      '    <div id="dgk-view-list" class="dgk-view">' +
      '      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:8px;">' +
      '        <span style="color:#aaafb9; font-size:12px;">Saved Packages</span>' +
      '        <button id="dgk-btn-import" class="dgk-btn">+ Import .PAK</button>' +
      '      </div>' +
      '      <div id="dgk-items" style="width:100%;"></div>' +
      '    </div>' +
      '    <div id="dgk-view-nofiles" class="dgk-view">' +
      '      <div class="dgk-card" style="text-align:center; padding:24px 12px;">' +
      '        <h3 style="color:#f39c12; margin-bottom:8px;">No Packages Found!</h3>' +
      '        <p style="color:#aaafb9; margin-bottom:14px;">Select .PAK files to start practicing.</p>' +
      '        <button id="dgk-btn-import-alt" class="dgk-btn">Select .PAK Files</button>' +
      '      </div>' +
      '    </div>' +
      '    <div id="dgk-view-menu" class="dgk-view"><div class="dgk-card"><h4 style="color:#1e90ff; margin-bottom:8px;">Options</h4><div id="dgk-main-menu"></div></div></div>' +
      '    <div id="dgk-view-qmenu" class="dgk-view"><div class="dgk-card"><h4 style="color:#1e90ff; margin-bottom:8px;">Reading Options</h4><div id="dgk-q-menu"></div></div></div>' +
      '    <div id="dgk-view-q" class="dgk-view">' +
      '      <div class="dgk-card" style="display:flex; justify-content:center; align-items:center;"><canvas id="dgk-canvas-q" width="224" height="40"></canvas></div>' +
      '      <div style="width:100%;" id="dgk-opts-box">' +
      '        <div class="dgk-opt-row" data-idx="0"><canvas class="dgk-canvas-opt" width="208" height="20"></canvas></div>' +
      '        <div class="dgk-opt-row" data-idx="1"><canvas class="dgk-canvas-opt" width="208" height="20"></canvas></div>' +
      '        <div class="dgk-opt-row" data-idx="2"><canvas class="dgk-canvas-opt" width="208" height="20"></canvas></div>' +
      '        <div class="dgk-opt-row" data-idx="3"><canvas class="dgk-canvas-opt" width="208" height="20"></canvas></div>' +
      '      </div>' +
      '    </div>' +
      '    <div id="dgk-view-input" class="dgk-view">' +
      '      <div class="dgk-card">' +
      '        <h4 id="dgk-dlg-title" style="color:#1e90ff; margin-bottom:4px;">Search</h4>' +
      '        <input type="text" id="dgk-dlg-input" class="dgk-input" placeholder="Type here...">' +
      '      </div>' +
      '    </div>' +
      '    <div id="dgk-view-score" class="dgk-view">' +
      '      <div class="dgk-card" style="text-align:center; padding:20px;">' +
      '        <h3 id="dgk-score-title" style="color:#2ecc71; margin-bottom:12px;">Quiz Completed!</h3>' +
      '        <p id="dgk-score-text" style="font-size:16px; font-weight:bold;"></p>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div id="dgk-softbar">' +
      '    <div id="dgk-soft-l" class="dgk-soft-btn" style="color:#1e90ff;"></div>' +
      '    <div id="dgk-soft-c" class="dgk-soft-btn" style="color:#2ecc71;"></div>' +
      '    <div id="dgk-soft-r" class="dgk-soft-btn" style="color:#aaafb9;"></div>' +
      '  </div>' +
      '</div>';

    var app = {
      state: "STATE_NO_FILES",
      prev_state: "STATE_NO_FILES",
      read_mode: 0,
      pak_list: [],
      filtered_indices: [],
      selected_file_idx: 0,
      menu_selected_idx: 0,
      qmenu_selected_idx: 0,
      cur_parser: null,
      cur_entry: null,
      current_q_id: 0,
      selected_option: 0,
      user_choice: -1,
      score: 0,
      input_target: 0
    };

    var views = {
      STATE_FILE_LIST: document.getElementById("dgk-view-list"),
      STATE_NO_FILES: document.getElementById("dgk-view-nofiles"),
      STATE_MENU: document.getElementById("dgk-view-menu"),
      STATE_QUESTION_MENU: document.getElementById("dgk-view-qmenu"),
      STATE_QUESTION: document.getElementById("dgk-view-q"),
      STATE_FEEDBACK: document.getElementById("dgk-view-q"),
      STATE_INPUT_DIALOG: document.getElementById("dgk-view-input"),
      STATE_SCORECARD: document.getElementById("dgk-view-score")
    };

    var dom = {
      title: document.getElementById("dgk-title"),
      sub: document.getElementById("dgk-sub"),
      items: document.getElementById("dgk-items"),
      mainMenu: document.getElementById("dgk-main-menu"),
      qMenu: document.getElementById("dgk-q-menu"),
      canvasQ: document.getElementById("dgk-canvas-q"),
      optRows: document.querySelectorAll(".dgk-opt-row"),
      optCanvases: document.querySelectorAll(".dgk-canvas-opt"),
      softL: document.getElementById("dgk-soft-l"),
      softC: document.getElementById("dgk-soft-c"),
      softR: document.getElementById("dgk-soft-r"),
      fileInput: document.getElementById("dgk-file-input"),
      dlgTitle: document.getElementById("dgk-dlg-title"),
      dlgInput: document.getElementById("dgk-dlg-input"),
      scoreTitle: document.getElementById("dgk-score-title"),
      scoreText: document.getElementById("dgk-score-text")
    };

    function draw_softbar(l, c, r) {
      dom.softL.textContent = l || "";
      dom.softC.textContent = c || "";
      dom.softR.textContent = r || "";
    }

    function update_softbar() {
      switch (app.state) {
        case "STATE_FILE_LIST": draw_softbar("Menu", "Play", "Exit"); break;
        case "STATE_NO_FILES": draw_softbar("Menu", "Rescan", "Exit"); break;
        case "STATE_MENU":
        case "STATE_QUESTION_MENU": draw_softbar("Select", "", "Back"); break;
        case "STATE_INPUT_DIALOG": draw_softbar("Done", "Clear", "Cancel"); break;
        case "STATE_QUESTION": draw_softbar("Menu", app.read_mode === 1 ? "Next >" : "Ans", "Pack List"); break;
        case "STATE_FEEDBACK": draw_softbar("Menu", "Next Q", "Pack List"); break;
        case "STATE_SCORECARD": draw_softbar("Again", "", "Pack List"); break;
      }
    }

    function draw_screen() {
      for (var k in views) {
        if (views.hasOwnProperty(k)) views[k].className = "dgk-view";
      }
      if (views[app.state]) views[app.state].className = "dgk-view active";

      switch (app.state) {
        case "STATE_FILE_LIST":
          dom.title.textContent = "Daily GK (" + app.filtered_indices.length + " Found)";
          dom.sub.textContent = "";
          render_list();
          break;
        case "STATE_NO_FILES":
          dom.title.textContent = "No Packages Found!";
          dom.sub.textContent = "";
          break;
        case "STATE_MENU":
          dom.title.textContent = "Options Menu";
          dom.sub.textContent = "";
          render_main_menu();
          break;
        case "STATE_QUESTION_MENU":
          dom.title.textContent = "Reading Options";
          dom.sub.textContent = "";
          render_q_menu();
          break;
        case "STATE_QUESTION":
        case "STATE_FEEDBACK":
          var tot = app.cur_parser ? app.cur_parser.totalQuestions : 0;
          dom.title.textContent = "Q " + (app.current_q_id + 1) + "/" + tot + " (" + (app.read_mode === 1 ? "Study" : "Quiz") + ")";
          dom.sub.textContent = app.read_mode === 0 ? "Score: " + app.score : "Study Mode";
          render_question();
          break;
        case "STATE_SCORECARD":
          var isStudy = app.read_mode === 1;
          dom.title.textContent = isStudy ? "Study Completed!" : "Quiz Completed!";
          dom.scoreTitle.textContent = isStudy ? "Session Completed!" : "Quiz Completed!";
          dom.scoreText.textContent = isStudy
            ? "Reviewed all " + (app.cur_parser ? app.cur_parser.totalQuestions : 0) + " questions."
            : "Final Score: " + app.score + " / " + (app.cur_parser ? app.cur_parser.totalQuestions : 0);
          break;
      }
      update_softbar();
    }

    function render_list() {
      dom.items.innerHTML = "";
      for (var i = 0; i < app.filtered_indices.length; i++) {
        (function (idx) {
          var item = app.pak_list[app.filtered_indices[idx]];
          var el = document.createElement("div");
          el.className = "dgk-menu-item " + (idx === app.selected_file_idx ? "selected" : "");
          el.innerHTML =
            "<div><strong>" + item.name + "</strong><br><small style='color:#aaafb9;'>" +
            (item.size / 1024).toFixed(0) + " KB | Q: " + (item.totalQuestions || "?") + "</small></div>" +
            "<button style='background:#e74c3c; color:#fff; border:none; padding:4px 8px; border-radius:3px;'>✕</button>";

          el.onclick = function (e) {
            if (e.target.tagName === "BUTTON") return;
            app.selected_file_idx = idx;
            open_pak(app.filtered_indices[idx]);
          };
          el.querySelector("button").onclick = function (e) {
            e.stopPropagation();
            PakStore.delete(item.name, function () { scan_all(); });
          };
          dom.items.appendChild(el);
        })(i);
      }
    }

    function execute_main_menu(idx) {
      if (idx === 0) {
        app.prev_state = "STATE_MENU";
        app.input_target = 0;
        dom.dlgTitle.textContent = "Search Files";
        dom.dlgInput.value = "";
        app.state = "STATE_INPUT_DIALOG";
        draw_screen();
        dom.dlgInput.focus();
      } else if (idx === 1) {
        window.open("https://shifat100.github.io/daily-gk/", "_blank");
      } else if (idx === 2) {
        scan_all();
      } else if (idx === 3) {
        $page.hide();
      }
    }

    function render_main_menu() {
      var titles = ["1. Search Files", "2. Download PAKs", "3. Rescan", "4. Close"];
      dom.mainMenu.innerHTML = "";
      for (var i = 0; i < titles.length; i++) {
        (function (idx) {
          var el = document.createElement("div");
          el.className = "dgk-menu-item " + (idx === app.menu_selected_idx ? "selected" : "");
          el.textContent = titles[idx];
          el.onclick = function () {
            app.menu_selected_idx = idx;
            execute_main_menu(idx);
          };
          dom.mainMenu.appendChild(el);
        })(i);
      }
    }

    function execute_q_menu(idx) {
      if (idx === 0) {
        app.prev_state = "STATE_QUESTION";
        app.input_target = 1;
        dom.dlgTitle.textContent = "Search Question";
        dom.dlgInput.value = "";
        app.state = "STATE_INPUT_DIALOG";
        draw_screen();
        dom.dlgInput.focus();
      } else if (idx === 1) {
        app.prev_state = "STATE_QUESTION";
        app.input_target = 2;
        dom.dlgTitle.textContent = "Jump to Question (1-" + app.cur_parser.totalQuestions + ")";
        dom.dlgInput.value = "";
        app.state = "STATE_INPUT_DIALOG";
        draw_screen();
        dom.dlgInput.focus();
      } else if (idx === 2) {
        app.read_mode = app.read_mode === 0 ? 1 : 0;
        app.state = "STATE_QUESTION";
        draw_screen();
      } else if (idx === 3) {
        app.state = "STATE_FILE_LIST";
        draw_screen();
      }
    }

    function render_q_menu() {
      var titles = [
        "1. Search Question",
        "2. Jump Question",
        app.read_mode === 1 ? "3. Mode: [Study -> Quiz]" : "3. Mode: [Quiz -> Study]",
        "4. Return to Pack List"
      ];
      dom.qMenu.innerHTML = "";
      for (var i = 0; i < titles.length; i++) {
        (function (idx) {
          var el = document.createElement("div");
          el.className = "dgk-menu-item " + (idx === app.qmenu_selected_idx ? "selected" : "");
          el.textContent = titles[idx];
          el.onclick = function () {
            app.qmenu_selected_idx = idx;
            execute_q_menu(idx);
          };
          dom.qMenu.appendChild(el);
        })(i);
      }
    }

    function render_question() {
      var entry = app.cur_entry;
      if (!entry) return;

      PakParser.renderMask(dom.canvasQ, 224, entry.qH, 28, entry.qBitmap, "#ffffff");

      for (var i = 0; i < 4; i++) {
        var row = dom.optRows[i];
        row.className = "dgk-opt-row";
        PakParser.renderMask(dom.optCanvases[i], 208, entry.optH[i], 26, entry.optBitmaps[i], "#ffffff");

        if (app.read_mode === 1) {
          if (i === entry.correctAnswer) row.className += " correct";
        } else {
          if (app.state === "STATE_QUESTION") {
            if (i === app.selected_option) row.className += " selected";
          } else if (app.state === "STATE_FEEDBACK") {
            if (i === entry.correctAnswer) row.className += " correct";
            else if (i === app.user_choice) row.className += " wrong";
          }
        }
      }
    }

    function scan_all() {
      PakStore.getMetaList(function (err, items) {
        app.pak_list = items || [];
        app.filtered_indices = [];
        for (var i = 0; i < app.pak_list.length; i++) app.filtered_indices.push(i);
        app.selected_file_idx = 0;
        app.state = app.pak_list.length > 0 ? "STATE_FILE_LIST" : "STATE_NO_FILES";
        draw_screen();
      });
    }

    function open_pak(actualIdx) {
      var record = app.pak_list[actualIdx];
      if (!record) return;

      PakStore.getBlob(record.name, function (err, buf) {
        if (err || !buf) {
          showToast("Error opening package.");
          return;
        }
        try {
          app.cur_parser = new PakParser(buf, record.name);
          app.score = 0;
          app.selected_option = 0;
          app.user_choice = -1;
          app.state = "STATE_QUESTION";
          load_q(0);
          draw_screen();
        } catch (e) {
          showToast("Invalid PAK: " + e.message);
        }
      });
    }

    function load_q(qId) {
      if (!app.cur_parser) return;
      app.cur_entry = app.cur_parser.getEntry(qId);
      app.current_q_id = qId;
      app.user_choice = -1;
      app.selected_option = 0;
    }

    function next_q() {
      if (!app.cur_parser) return;
      if (app.current_q_id + 1 < app.cur_parser.totalQuestions) {
        load_q(app.current_q_id + 1);
        app.state = "STATE_QUESTION";
      } else {
        app.state = "STATE_SCORECARD";
      }
      draw_screen();
    }

    function handle_dialog_done() {
      var val = dom.dlgInput.value.trim();
      if (app.input_target === 0) {
        var filter = val.toLowerCase();
        app.filtered_indices = [];
        for (var i = 0; i < app.pak_list.length; i++) {
          if (!filter || app.pak_list[i].name.toLowerCase().indexOf(filter) !== -1) {
            app.filtered_indices.push(i);
          }
        }
        app.selected_file_idx = 0;
        app.state = app.filtered_indices.length > 0 ? "STATE_FILE_LIST" : "STATE_NO_FILES";
      } else if (app.input_target === 1) {
        if (val && app.cur_parser) {
          var found = app.cur_parser.searchKeyword(val);
          if (found !== -1) {
            load_q(found);
            showToast("Jumped to Q: " + (found + 1));
          } else {
            showToast("Question not found.");
          }
        }
        app.state = "STATE_QUESTION";
      } else if (app.input_target === 2) {
        var qNum = parseInt(val, 10);
        if (!isNaN(qNum) && app.cur_parser && qNum >= 1 && qNum <= app.cur_parser.totalQuestions) {
          load_q(qNum - 1);
          showToast("Jumped to Q: " + qNum);
        } else {
          showToast("Invalid question number.");
        }
        app.state = "STATE_QUESTION";
      }
      draw_screen();
    }

    dom.dlgInput.onkeydown = function (e) {
      if (e.key === "Enter") handle_dialog_done();
    };

    // Softbar
    dom.softL.onclick = function () {
      if (app.state === "STATE_FILE_LIST" || app.state === "STATE_NO_FILES") {
        app.prev_state = app.state;
        app.state = "STATE_MENU";
      } else if (app.state === "STATE_MENU") {
        execute_main_menu(app.menu_selected_idx);
        return;
      } else if (app.state === "STATE_QUESTION_MENU") {
        execute_q_menu(app.qmenu_selected_idx);
        return;
      } else if (app.state === "STATE_QUESTION" || app.state === "STATE_FEEDBACK") {
        app.prev_state = "STATE_QUESTION";
        app.state = "STATE_QUESTION_MENU";
      } else if (app.state === "STATE_SCORECARD") {
        app.score = 0;
        app.state = "STATE_QUESTION";
        load_q(0);
      } else if (app.state === "STATE_INPUT_DIALOG") {
        handle_dialog_done();
        return;
      }
      draw_screen();
    };

    dom.softC.onclick = function () {
      if (app.state === "STATE_FILE_LIST") {
        if (app.filtered_indices.length > 0 && app.selected_file_idx < app.filtered_indices.length) {
          open_pak(app.filtered_indices[app.selected_file_idx]);
        }
      } else if (app.state === "STATE_NO_FILES") {
        scan_all();
      } else if (app.state === "STATE_QUESTION") {
        if (app.read_mode === 1) {
          next_q();
        } else {
          app.user_choice = app.selected_option;
          if (app.user_choice === app.cur_entry.correctAnswer) app.score++;
          app.state = "STATE_FEEDBACK";
          draw_screen();
        }
      } else if (app.state === "STATE_FEEDBACK") {
        next_q();
      } else if (app.state === "STATE_INPUT_DIALOG") {
        dom.dlgInput.value = "";
        dom.dlgInput.focus();
      }
    };

    dom.softR.onclick = function () {
      if (app.state === "STATE_FILE_LIST" || app.state === "STATE_NO_FILES") {
        $page.hide();
      } else if (app.state === "STATE_MENU") {
        app.state = app.prev_state || "STATE_FILE_LIST";
        draw_screen();
      } else if (app.state === "STATE_QUESTION_MENU") {
        app.state = "STATE_QUESTION";
        draw_screen();
      } else if (app.state === "STATE_INPUT_DIALOG") {
        app.state = app.prev_state || "STATE_FILE_LIST";
        draw_screen();
      } else {
        app.state = "STATE_FILE_LIST";
        draw_screen();
      }
    };

    // Option rows
    for (var k = 0; k < 4; k++) {
      (function (idx) {
        dom.optRows[idx].onclick = function () {
          if (app.state === "STATE_FEEDBACK") {
            next_q();
            return;
          }
          if (app.state !== "STATE_QUESTION") return;

          app.selected_option = idx;
          app.user_choice = idx;
          if (app.read_mode !== 1) {
            if (app.user_choice === app.cur_entry.correctAnswer) app.score++;
            app.state = "STATE_FEEDBACK";
          }
          draw_screen();
        };
      })(k);
    }

    // File input
    function openFilePicker() {
      dom.fileInput.value = "";
      dom.fileInput.click();
    }
    document.getElementById("dgk-btn-import").onclick = openFilePicker;
    document.getElementById("dgk-btn-import-alt").onclick = openFilePicker;

    dom.fileInput.onchange = function (e) {
      var files = e.target.files;
      if (!files || files.length === 0) return;

      var total = files.length;
      var completed = 0;
      var failed = 0;

      for (var i = 0; i < total; i++) {
        (function (file) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            PakStore.save(file.name, evt.target.result, function (err) {
              completed++;
              if (err) failed++;
              if (completed === total) {
                dom.fileInput.value = "";
                scan_all();
                if (failed > 0) showToast("Loaded " + (completed - failed) + " files (" + failed + " failed)");
                else showToast("Loaded " + completed + " .PAK file(s)");
              }
            });
          };
          reader.onerror = function () {
            completed++;
            failed++;
            if (completed === total) {
              dom.fileInput.value = "";
              scan_all();
            }
          };
          reader.readAsArrayBuffer(file);
        })(files[i]);
      }
    };

    // Back handling
    $page.handleBack = function () {
      if (app.state === "STATE_INPUT_DIALOG") {
        app.state = app.prev_state || "STATE_FILE_LIST";
        draw_screen();
        return true;
      }
      if (app.state === "STATE_MENU" || app.state === "STATE_QUESTION_MENU") {
        app.state = app.prev_state || "STATE_FILE_LIST";
        draw_screen();
        return true;
      }
      if (app.state === "STATE_FEEDBACK") {
        app.state = "STATE_QUESTION";
        draw_screen();
        return true;
      }
      if (app.state === "STATE_QUESTION" || app.state === "STATE_SCORECARD") {
        app.state = "STATE_FILE_LIST";
        draw_screen();
        return true;
      }
      return false;
    };

    scan_all();
  }

  // 4. Lifecycle Hooks
  acode.setPluginInit("com.shifat100.dailygk", function (baseUrl, $page, options) {
    var commands = null;
    try {
      commands = acode.require("commands");
    } catch (e) {}

    var actionStack = null;
    try {
      actionStack = acode.require("actionStack");
    } catch (e) {}

    function handleBackAction() {
      if ($page.handleBack && $page.handleBack()) {
        if (actionStack) {
          actionStack.push({
            id: "com.shifat100.dailygk",
            action: handleBackAction
          });
        }
      } else {
        $page.hide();
      }
    }

    function openPlugin() {
      $page.show();
      if (!isInitialized) {
        setupDailyGkApp($page);
        isInitialized = true;
      }

      if (actionStack) {
        actionStack.remove("com.shifat100.dailygk");
        actionStack.push({
          id: "com.shifat100.dailygk",
          action: handleBackAction
        });
      }
    }

    if (commands) {
      commands.addCommand({
        name: "daily-gk:open",
        description: "Daily GK: Open Quiz Player",
        exec: openPlugin
      });
    }

    try {
      var SideButton = acode.require("sideButton");
      if (typeof SideButton === "function") {
        sideButton = SideButton({
          text: "Daily GK",
          icon: "help",
          onclick: openPlugin
        });
        if (sideButton && sideButton.show) sideButton.show();
      }
    } catch (e) {}
  });

  acode.setPluginUnmount("com.shifat100.dailygk", function () {
    try {
      var commands = acode.require("commands");
      if (commands) commands.removeCommand("daily-gk:open");
    } catch (e) {}

    try {
      var actionStack = acode.require("actionStack");
      if (actionStack) actionStack.remove("com.shifat100.dailygk");
    } catch (e) {}

    if (sideButton) {
      if (typeof sideButton.destroy === "function") sideButton.destroy();
      else if (typeof sideButton.hide === "function") sideButton.hide();
      sideButton = null;
    }
    isInitialized = false;
  });
})();