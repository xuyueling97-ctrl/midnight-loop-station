(function () {
  "use strict";

  const DATA = window.MidnightData;
  const Engine = window.MidnightEngine;
  const SAVE_KEY = "midnight-station-save-v1";

  if (!DATA || !Engine) {
    const el = document.getElementById("bootError");
    el.classList.remove("hidden");
    document.getElementById("bootErrorText").textContent = "脚本加载失败：请确认 scripts/data.js 与 scripts/engine.js 与 index.html 在同一目录。";
    return;
  }

  const $ = (id) => document.getElementById(id);
  const ui = {
    titleScreen: $("titleScreen"), helpScreen: $("helpScreen"), game: $("game"),
    sceneBg: $("sceneBg"), hotspotLayer: $("hotspotLayer"), banner: $("banner"),
    loopBadge: $("loopBadge"), sceneName: $("sceneName"), clock: $("clock"), objective: $("objective"),
    dialogPanel: $("dialogPanel"), dialogTitle: $("dialogTitle"), dialogLines: $("dialogLines"),
    dialogPortrait: $("dialogPortrait"),
    dialogChoices: $("dialogChoices"), keypadArea: $("keypadArea"), keypadHint: $("keypadHint"),
    keypadDisplay: $("keypadDisplay"), keypadGrid: $("keypadGrid"),
    inventoryPanel: $("inventoryPanel"), inventoryList: $("inventoryList"),
    cluesPanel: $("cluesPanel"), cluesList: $("cluesList"),
    menuPanel: $("menuPanel"), saveHint: $("saveHint"),
    loopScreen: $("loopScreen"), loopKept: $("loopKept"),
    endingScreen: $("endingScreen"), endingEyebrow: $("endingEyebrow"), endingTitle: $("endingTitle"),
    endingSub: $("endingSub"), endingLines: $("endingLines"),
    btnSound: $("btnSound"),
  };

  let engine = null;
  let timerId = null;
  let keypadValue = "";
  let keypadTarget = null; // "locker" | "phone"
  let bannerTimer = null;

  function audio(name) { if (window.MidnightAudio) window.MidnightAudio.sfx(name); }
  document.addEventListener("pointerdown", function () { if (window.MidnightAudio) window.MidnightAudio.init(); }, { once: true, capture: true });

  /* ---------- 存档 ---------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, engine.serialize());
      ui.saveHint.textContent = "已自动保存 · 第 " + engine.state.loop + " 夜";
      return true;
    } catch (_) {
      ui.saveHint.textContent = "保存失败：浏览器存储不可用（隐私模式？）";
      return false;
    }
  }
  function loadSave() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return null;
      const state = JSON.parse(json);
      if (!state || state.version !== 1) return null;
      return state;
    } catch (_) { return null; }
  }

  /* ---------- 计时 ---------- */
  function panelsOpen() {
    return !ui.dialogPanel.classList.contains("hidden")
      || !ui.inventoryPanel.classList.contains("hidden")
      || !ui.cluesPanel.classList.contains("hidden")
      || !ui.menuPanel.classList.contains("hidden")
      || !ui.endingScreen.classList.contains("hidden")
      || !ui.loopScreen.classList.contains("hidden")
      || document.hidden;
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (!engine || panelsOpen()) return;
      const r = engine.tick(1);
      updateHud();
      if (r.trainArrived) { showBanner("列车进站了"); audio("train"); }
      if (r.reset) showLoopCinematic();
    }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  /* ---------- HUD ---------- */
  function fmt(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function updateHud() {
    if (!engine) return;
    const s = engine.state;
    ui.loopBadge.textContent = "第 " + s.loop + " 夜";
    ui.sceneName.textContent = DATA.SCENES[s.scene].name;
    ui.clock.textContent = fmt(s.timeLeft);
    ui.clock.classList.toggle("urgent", s.timeLeft <= 30 && s.status === "playing");
    ui.objective.textContent = s.status === "playing" ? "目标：" + engine.getObjective() : "";
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.scene === s.scene);
    });
  }

  /* ---------- 场景渲染 ---------- */
  function renderScene() {
    const scene = DATA.SCENES[engine.state.scene];
    ui.sceneBg.src = scene.image;
    ui.hotspotLayer.innerHTML = "";
    for (const h of scene.hotspots) {
      const btn = document.createElement("button");
      btn.className = "hotspot";
      btn.style.left = h.x + "%";
      btn.style.top = h.y + "%";
      btn.style.width = h.w + "%";
      btn.style.height = h.h + "%";
      btn.setAttribute("aria-label", h.label);
      const label = document.createElement("span");
      label.className = "hs-label";
      label.textContent = h.label;
      btn.appendChild(label);
      btn.addEventListener("click", () => onHotspot(h.id));
      ui.hotspotLayer.appendChild(btn);
      if (h.character) {
        const fig = document.createElement("div");
        fig.className = "character char-" + h.character;
        fig.style.left = h.x + "%"; fig.style.top = h.y + "%";
        fig.style.width = h.w + "%"; fig.style.height = h.h + "%";
        fig.innerHTML = '<div class="char-figure"><div class="char-head"></div><div class="char-body"></div><div class="char-scarf"></div></div>';
        ui.hotspotLayer.appendChild(fig);
      }
    }
  }

  function showBanner(text) {
    ui.banner.textContent = text;
    ui.banner.classList.remove("hidden");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui.banner.classList.add("hidden"), 2600);
  }

  /* ---------- 游戏流程 ---------- */
  function newGame() {
    engine = new Engine();
    enterGame();
  }
  function continueGame() {
    const saved = loadSave();
    engine = saved ? new Engine(saved) : new Engine();
    enterGame();
  }
  function enterGame() {
    ui.titleScreen.classList.add("hidden");
    ui.endingScreen.classList.add("hidden");
    ui.loopScreen.classList.add("hidden");
    ui.game.classList.remove("hidden");
    closeDialog();
    [ui.inventoryPanel, ui.cluesPanel, ui.menuPanel].forEach((panel) => panel.classList.add("hidden"));
    renderScene();
    updateHud();
    if (restoreEnding()) return;
    save();
    startTimer();
  }
  function toTitle() {
    stopTimer();
    ui.game.classList.add("hidden");
    ui.titleScreen.classList.remove("hidden");
    $("btnContinue").disabled = !loadSave();
  }

  function showLoopCinematic() {
    audio("loop");
    ui.loopKept.textContent = "线索与记忆已保留（" + engine.state.clues.length + " 条线索）";
    ui.loopScreen.classList.remove("hidden");
    save();
    setTimeout(() => {
      ui.loopScreen.classList.add("hidden");
      renderScene();
      updateHud();
    }, 2200);
  }

  function restoreEnding() {
    const { status, ending } = engine.state;
    if (status !== "ended" || !ending) return false;
    ui.menuPanel.classList.add("hidden");
    showEnding(engine.endingResult(ending));
    return true;
  }

  function showEnding(result) {
    stopTimer();
    audio("reveal");
    const d = result.endingData || DATA.ENDINGS[engine.state.ending];
    ui.endingScreen.className = "overlay ending-screen " + (d.className || "");
    ui.endingScreen.classList.remove("hidden");
    ui.endingEyebrow.textContent = d.eyebrow;
    ui.endingTitle.textContent = d.title;
    ui.endingSub.textContent = d.subtitle;
    ui.endingLines.textContent = (result.lines || []).join("\n");
    save();
  }

  /* ---------- 热点与对话 ---------- */
  function onHotspot(id) {
    const r = engine.interact(id);
    openDialog(r);
    save();
  }

  function closeDialog() {
    ui.dialogPanel.classList.add("hidden");
    ui.keypadArea.classList.add("hidden");
    keypadValue = "";
    keypadTarget = null;
  }

  function openDialog(r) {
    if (!r) return;
    audio(r.effect || "open");
    const PORTRAITS = { "黄围巾女孩": "assets/portrait-girl.webp", "值班员钟叔": "assets/portrait-attendant.webp" };
    if (PORTRAITS[r.title]) {
      ui.dialogPortrait.src = PORTRAITS[r.title];
      ui.dialogPortrait.classList.remove("hidden");
    } else {
      ui.dialogPortrait.classList.add("hidden");
    }
    if (r.ending) { closeDialog(); showEnding(r); return; }
    if (r.sceneChanged && (!r.lines || !r.lines.length)) { renderScene(); updateHud(); return; }
    if (r.close) { closeDialog(); updateHud(); return; }
    ui.dialogTitle.textContent = r.title || "";
    ui.dialogLines.textContent = (r.lines || []).join("\n");
    ui.dialogChoices.innerHTML = "";
    // 键盘输入面板
    if (r.keypad) {
      keypadTarget = r.title.includes("寄存柜") ? "locker" : "phone";
      ui.keypadHint.textContent = r.keypad.hint || "";
      ui.keypadDisplay.textContent = "____";
      keypadValue = "";
      buildKeypad();
      ui.keypadArea.classList.remove("hidden");
    } else {
      keypadTarget = null;
      ui.keypadArea.classList.add("hidden");
    }
    // 选项按钮
    for (const c of (r.choices || [])) {
      if (c.action === "__keypad__") continue;
      const btn = document.createElement("button");
      btn.className = "btn" + (c.primary ? " btn-primary" : "");
      btn.textContent = c.label;
      btn.addEventListener("click", () => runChoice(c));
      ui.dialogChoices.appendChild(btn);
    }
    if (!(r.choices || []).length && !r.keypad) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "继续";
      btn.addEventListener("click", closeDialog);
      ui.dialogChoices.appendChild(btn);
    }
    ui.dialogPanel.classList.remove("hidden");
  }

  function runChoice(c) {
    const r = engine.dispatch(c.action, c.args);
    save();
    if (r.ending) { closeDialog(); showEnding(r); return; }
    if (r.close) { closeDialog(); updateHud(); save(); return; }
    openDialog(r);
  }

  /* ---------- 数字键盘 ---------- */
  function buildKeypad() {
    ui.keypadGrid.innerHTML = "";
    "1234567890".split("").forEach((n) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = n;
      b.addEventListener("click", () => keypadPress(n));
      ui.keypadGrid.appendChild(b);
    });
  }
  function keypadPress(n) {
    if (keypadValue.length >= 4) return;
    keypadValue += n;
    ui.keypadDisplay.textContent = keypadValue.padEnd(4, "_");
    if (keypadValue.length === 4) submitKeypad();
  }
  function submitKeypad() {
    const action = keypadTarget === "locker" ? "submitLocker" : "submitPhoneCode";
    const r = engine.dispatch(action, { code: keypadValue });
    save();
    openDialog(r);
  }

  /* ---------- 侧面板 ---------- */
  function togglePanel(panel) {
    const wasHidden = panel.classList.contains("hidden");
    [ui.inventoryPanel, ui.cluesPanel, ui.menuPanel].forEach((p) => p.classList.add("hidden"));
    if (wasHidden) panel.classList.remove("hidden");
    if (panel === ui.inventoryPanel) renderInventory();
    if (panel === ui.cluesPanel) renderClues();
  }
  function renderInventory() {
    ui.inventoryList.innerHTML = "";
    const items = engine.state.inventory;
    if (!items.length) { ui.inventoryList.innerHTML = '<p class="empty-hint">背包空空如也。</p>'; return; }
    for (const id of items) {
      const it = DATA.ITEMS[id];
      const div = document.createElement("div");
      div.className = "item-entry";
      div.innerHTML = '<div class="item-name">' + (it.persistent ? "★ " : "") + it.name + '</div><div class="item-desc">' + it.description + "</div>";
      ui.inventoryList.appendChild(div);
    }
  }
  function renderClues() {
    ui.cluesList.innerHTML = "";
    const clues = engine.state.clues;
    if (!clues.length) { ui.cluesList.innerHTML = '<p class="empty-hint">还没有发现任何线索。</p>'; return; }
    for (const id of clues) {
      const c = DATA.CLUES[id];
      const div = document.createElement("div");
      div.className = "clue-entry";
      div.innerHTML = '<div><span class="clue-tag">' + c.tag + '</span><span class="clue-title">' + c.title + '</span></div><div class="clue-text">' + c.text + "</div>";
      ui.cluesList.appendChild(div);
    }
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $("btnNewGame").addEventListener("click", newGame);
    $("btnContinue").addEventListener("click", continueGame);
    $("btnHelp").addEventListener("click", () => ui.helpScreen.classList.remove("hidden"));
    $("btnHelpClose").addEventListener("click", () => ui.helpScreen.classList.add("hidden"));

    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const r = engine.changeScene(b.dataset.scene);
        if (r && r.title) { openDialog(r); } else { closeDialog(); }
        renderScene(); updateHud(); save();
      });
    });

    $("btnInventory").addEventListener("click", () => togglePanel(ui.inventoryPanel));
    $("btnClues").addEventListener("click", () => togglePanel(ui.cluesPanel));
    $("btnMenu").addEventListener("click", () => togglePanel(ui.menuPanel));
    ui.btnSound.addEventListener("click", () => {
      if (!window.MidnightAudio) return;
      const m = !window.MidnightAudio.isMuted();
      window.MidnightAudio.setMuted(m);
      ui.btnSound.textContent = m ? "🔇" : "🔊";
    });
    document.querySelectorAll(".panel-close").forEach((b) => {
      b.addEventListener("click", () => $(b.dataset.close).classList.add("hidden"));
    });

    $("btnSave").addEventListener("click", () => {
      if (save()) ui.saveHint.textContent = "已保存。";
    });
    $("btnLoad").addEventListener("click", () => {
      const saved = loadSave();
      if (!saved) { ui.saveHint.textContent = "没有找到存档。"; return; }
      engine = new Engine(saved);
      closeDialog();
      renderScene(); updateHud();
      if (restoreEnding()) return;
      save();
      ui.saveHint.textContent = "已读取存档。";
    });
    $("btnRestart").addEventListener("click", toTitle);

    $("btnNextLoop").addEventListener("click", () => {
      engine.continueAfterEnding();
      ui.endingScreen.classList.add("hidden");
      renderScene(); updateHud(); save(); startTimer();
      if (engine.state.meta.trueSeen && !engine.state.meta.hiddenSeen && !engine.state.memory.phoneAnswered) {
        openDialog({
          title: "第 " + engine.state.loop + " 夜 · 00:00",
          lines: ["一切似乎和之前一样。", "只是这一次，你隐约听见——售票处的电话，一直在轻轻响着。", "像是还有人，没说完一句话。"],
          choices: []
        });
      }
    });
    $("btnToTitle").addEventListener("click", toTitle);

    $("keypadClear").addEventListener("click", () => { keypadValue = ""; ui.keypadDisplay.textContent = "____"; });
    $("keypadCancel").addEventListener("click", closeDialog);

    document.addEventListener("keydown", (e) => {
      if (!engine || ui.game.classList.contains("hidden")) return;
      if (e.key >= "1" && e.key <= "4") {
        const order = ["platform", "waiting", "ticket", "lost"];
        const r = engine.changeScene(order[Number(e.key) - 1]);
        if (r && r.title) openDialog(r);
        renderScene(); updateHud();
      } else if (e.key === "b" || e.key === "B") togglePanel(ui.inventoryPanel);
      else if (e.key === "j" || e.key === "J") togglePanel(ui.cluesPanel);
      else if (e.key === "Escape") closeDialog();
    });
    document.addEventListener("visibilitychange", updateHud);
  }

  bindEvents();
  $("btnContinue").disabled = !loadSave();
})();
