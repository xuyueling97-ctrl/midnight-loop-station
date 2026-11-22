/**
 * 真浏览器 E2E：Edge headless + Chrome DevTools Protocol（零依赖，Node 内置 WebSocket）。
 * 覆盖：普通结局、真结局、隐藏结局完整点击路径；捕获未捕获 JS 异常与 console error；关键节点截图。
 * 运行：node tests/browser-e2e.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const ART = path.join(__dirname, "artifacts");
const GAME_URL = process.env.GAME_URL || ("file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/"));
const PORT = 9333;
const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!EDGE) { console.error("未找到 Edge/Chrome，跳过浏览器 E2E（引擎与 UI 冒烟测试已覆盖逻辑层）。"); process.exit(2); }
fs.mkdirSync(ART, { recursive: true });

const errors = [];
let ws = null;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails.exception;
    throw new Error("页面执行出错 [" + expression.slice(0, 110) + "] => " + ((ex && ex.description) || r.exceptionDetails.text));
  }
  return r.result.value;
}
async function waitFor(expr, timeoutMs = 8000, label = expr) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evalJs(expr)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("等待超时: " + label);
}
async function screenshot(name) {
  const prefix = process.env.MOBILE ? "mobile-" : "";
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ART, prefix + name + ".png"), Buffer.from(r.data, "base64"));
  console.log("  截图:", prefix + name + ".png");
}
/* ---------- DOM 操作助手（全部走真实点击） ---------- */
const js = {
  btn: (id) => `document.getElementById(${JSON.stringify(id)}).click()`,
  nav: (scene) => `document.querySelector('.nav-btn[data-scene="${scene}"]').click()`,
  hotspot: (label) => `[...document.querySelectorAll('.hotspot')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}).click()`,
  choice: (text) => `[...document.querySelectorAll('#dialogChoices .btn')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`,
  keypad: (d) => `[...document.querySelectorAll('#keypadGrid .btn')].find(b=>b.textContent===${JSON.stringify(d)}).click()`,
  dialogOpen: `!document.getElementById('dialogPanel').classList.contains('hidden')`,
  dialogTitle: `document.getElementById('dialogTitle').textContent`,
  keypadShown: `!document.getElementById('keypadArea').classList.contains('hidden')`,
  endingShown: `!document.getElementById('endingScreen').classList.contains('hidden')`,
  endingTitle: `document.getElementById('endingTitle').textContent`,
  loopBadge: `document.getElementById('loopBadge').textContent`,
  clueCount: `document.getElementById('cluesList').children.length`,
};

async function openDialogAndWait() {
  await waitFor(js.dialogOpen, 5000, "dialog opens");
  await new Promise((r) => setTimeout(r, 60));
}
async function hotspot(label) { await evalJs(js.hotspot(label)); await openDialogAndWait(); }
async function choice(text) {
  await evalJs(js.choice(text));
  await new Promise((r) => setTimeout(r, 60));
}
async function nav(scene) { await evalJs(js.nav(scene)); await new Promise((r) => setTimeout(r, 80)); }
async function clickBtn(id) { await evalJs(js.btn(id)); await new Promise((r) => setTimeout(r, 80)); }
async function typeKeypad(digits) {
  await waitFor(js.keypadShown, 3000, "keypad shown");
  for (const d of digits) { await evalJs(js.keypad(d)); await new Promise((r) => setTimeout(r, 40)); }
}

async function navigate() {
  await send("Page.navigate", { url: GAME_URL });
  await waitFor(`document.readyState==='complete'`, 10000, "page load");
  await new Promise((r) => setTimeout(r, 300));
}

/* ---------- 场景剧本 ---------- */
async function scenarioNormal() {
  console.log("▶ 普通结局路线");
  await navigate();
  await screenshot("01-title");
  await clickBtn("btnNewGame");
  await waitFor(`document.getElementById('game').classList.contains('hidden')===false`, 3000, "game visible");
  await nav("waiting");
  await hotspot("候车长椅");
  await hotspot("自动售货机");
  await choice("投币购买");
  await nav("platform");
  await hotspot("检票口与轨道");
  await choice("在长椅上等到列车进站");
  await hotspot("检票口与轨道");
  await screenshot("02-train-arrived");
  await choice("握紧单程票，独自上车");
  await waitFor(js.endingShown, 4000, "ending screen");
  const title = await evalJs(js.endingTitle);
  assert.strictEqual(title, "下一站，仍是午夜");
  await screenshot("03-ending-normal");
  console.log("  ✔ 普通结局达成：", title);
}

async function playTrueChain() {
  await clickBtn("btnNewGame");
  await nav("platform");
  await hotspot("褪色的站牌");
  await hotspot("被涂改的时刻表");
  await hotspot("停在零点的时钟");
  await nav("waiting");
  await hotspot("儿童画");
  await hotspot("候车长椅");
  await hotspot("自动售货机");
  await choice("投币购买");
  await hotspot("寄存柜");
  await typeKeypad("7319");
  await hotspot("老式收音机");
  await choice("取下它的两节电池");
  await nav("platform");
  await hotspot("条纹雨伞");
  await hotspot("黄围巾女孩");
  await choice("把纸鹤递给她");
  await hotspot("黄围巾女孩");
  await choice("约好过什么");
  await nav("lost");
  await hotspot("磁带录音机");
  await choice("播放磁带");
  await hotspot("值班日志");
  await hotspot("旧镜子");
  await nav("ticket");
  await hotspot("旧票价表");
  await hotspot("职工合影");
  await hotspot("值班员钟叔");
  await choice("把拼好的照片递到窗口");
  await nav("platform");
  await hotspot("停在零点的时钟");
  await choice("装回分针");
  await hotspot("停在零点的时钟");
  await choice("拨到 00:07");
  await hotspot("黄围巾女孩");
  await choice("把拼好的照片给她看");
  await hotspot("黄围巾女孩");
  await choice("我是小满");
}

async function scenarioTrue() {
  console.log("▶ 真结局路线");
  await navigate();
  await playTrueChain();
  await hotspot("检票口与轨道");
  await screenshot("04-before-final-choice");
  await choice("牵起女孩的手");
  await waitFor(js.endingShown, 4000, "ending screen");
  const title = await evalJs(js.endingTitle);
  assert.strictEqual(title, "零点之后的第七分钟");
  await screenshot("05-ending-true");
  console.log("  ✔ 真结局达成：", title);
}

async function scenarioHidden() {
  console.log("▶ 隐藏结局路线（真结局后的下一夜）");
  await clickBtn("btnNextLoop");
  await waitFor(`document.getElementById('endingScreen').classList.contains('hidden')`, 3000, "back to game");
  const badge = await evalJs(js.loopBadge);
  assert.ok(badge.includes("第 2 夜"), "应进入第 2 夜，实际: " + badge);
  await clickBtn("btnClues");
  await waitFor(`document.getElementById('cluesList').children.length > 0`, 3000, "clues rendered");
  const clueCount = await evalJs(js.clueCount);
  await clickBtn("btnClues");
  assert.ok(clueCount >= 10, "跨夜线索应保留，实际: " + clueCount);
  await nav("waiting");
  await hotspot("寄存柜");
  await typeKeypad("7319");
  await hotspot("老式收音机");
  await choice("取下它的两节电池");
  await nav("platform");
  await hotspot("条纹雨伞");
  await nav("lost");
  await hotspot("磁带录音机");
  await choice("播放磁带");
  await hotspot("信号配电箱");
  await nav("ticket");
  await hotspot("黑色拨号电话");
  await typeKeypad("0007");
  await hotspot("值班员钟叔");
  await nav("platform");
  await hotspot("停在零点的时钟");
  await choice("装回分针");
  await hotspot("停在零点的时钟");
  await choice("拨到 00:07");
  await hotspot("检票口与轨道");
  await screenshot("06-hidden-choice");
  await choice("转身走向电话那端的人");
  await waitFor(js.endingShown, 4000, "ending screen");
  const title = await evalJs(js.endingTitle);
  assert.strictEqual(title, "白鹭归来");
  await screenshot("07-ending-hidden");
  console.log("  ✔ 隐藏结局达成：", title);
}

/* ---------- 主流程 ---------- */
async function main() {
  const tmpProfile = path.join(os.tmpdir(), "codely-edge-e2e-" + Date.now());
  const edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + tmpProfile, "about:blank",
  ], { stdio: "ignore" });
  try {
    // 轮询 CDP 就绪
    let version = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch("http://127.0.0.1:" + PORT + "/json/version");
        if (res.ok) { version = await res.json(); break; }
      } catch (_) { /* not ready */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.ok(version, "CDP 未就绪（Edge 启动失败？）");
    console.log("浏览器:", version.Browser);

    const targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
    const page = targets.find((t) => t.type === "page");
    assert.ok(page, "未找到页面 target");

    await new Promise((resolve, reject) => {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        errors.push("未捕获异常: " + (d.exception && d.exception.description || d.text));
      } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        const text = msg.params.entry.text || "";
        if (!text.includes("favicon")) errors.push("Log error: " + text);
      } else if (msg.method === "console" && msg.params.type === "error") {
        errors.push("console.error: " + msg.params.args.map((a) => a.value).join(" "));
      }
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    if (process.env.MOBILE) {
      // 手机视口 + 触摸仿真（390×844，2x DPR）
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      console.log("已启用手机视口仿真：390×844 @2x，触摸仿真开启");
    }

    await scenarioNormal();
    await scenarioTrue();
    await scenarioHidden();

    assert.deepStrictEqual(errors, [], "浏览器运行期间不应出现 JS 错误: \n" + errors.join("\n"));
    console.log("\nALL BROWSER E2E TESTS PASSED（0 个 JS 错误）");
  } finally {
    try { execSync(`taskkill /PID ${edge.pid} /T /F`, { stdio: "ignore" }); } catch (_) {}
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error("\nE2E FAILED:", e.message); if (errors.length) console.error("收集到的错误:\n" + errors.join("\n")); process.exit(1); }
);
