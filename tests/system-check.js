/**
 * 维护专项测试：音频状态、静音、存档降级、真实触屏命中、小屏布局。
 * 运行：node tests/system-check.js  （默认 file://；GAME_URL 可指定线上地址）
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const ART = path.join(__dirname, "artifacts");
const GAME_URL = process.env.GAME_URL || ("file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/"));
const PORT = 9345;
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error("未找到 Edge/Chrome"); process.exit(2); }
fs.mkdirSync(ART, { recursive: true });

let ws, msgId = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("页面执行出错 [" + expression.slice(0, 100) + "]: " + JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr, timeout = 6000, label = expr) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evalJs(expr)) return;
    await sleep(150);
  }
  throw new Error("等待超时: " + label);
}
async function screenshot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ART, name + ".png"), Buffer.from(r.data, "base64"));
  console.log("  截图:", name);
}
async function navigate() {
  await send("Page.navigate", { url: GAME_URL });
  await waitFor(`document.readyState==='complete'`, 10000, "load");
  await sleep(300);
}
async function tapSelector(selector, useTouch) {
  const rect = await evalJs(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert.ok(rect, "元素不存在: " + selector);
  if (useTouch) {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rect.x, y: rect.y }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  }
  await sleep(150);
}
const audioState = `window.MidnightAudio ? window.MidnightAudio.getState() : null`;
const pass = (name) => console.log("  ✔", name);

/* ---------- 场景一：音频与静音（桌面） ---------- */
async function testAudio() {
  console.log("▶ 音频系统");
  await navigate();
  assert.ok(await evalJs(`!!window.MidnightAudio`), "MidnightAudio 已加载");
  await tapSelector("#btnNewGame", false); // 真实点击，触发 pointerdown 解锁音频
  await sleep(400);
  const s1 = await evalJs(audioState);
  assert.ok(s1 && s1.started, "首次点击后音频已初始化");
  console.log("  状态:", JSON.stringify(s1));
  assert.ok(s1.musicMode === "file" || s1.musicMode === "synth", "音乐层已启动（file 或 synth 回退）");
  if (s1.musicMode === "file") {
    assert.strictEqual(s1.musicPaused, false, "配乐播放中");
    assert.ok(s1.musicVolume > 0 && s1.musicVolume <= 0.5, "默认配乐音量处于温和区间: " + s1.musicVolume);
  }
  pass("音频初始化与音乐播放");
  // 静音切换
  await tapSelector("#btnSound", false);
  let s2 = await evalJs(audioState);
  assert.strictEqual(s2.muted, true, "静音开启");
  assert.strictEqual(await evalJs(`document.getElementById('btnSound').textContent`), "🔇");
  if (s2.musicMode === "file") assert.strictEqual(s2.musicVolume, 0, "静音时配乐音量为 0");
  await tapSelector("#btnSound", false);
  s2 = await evalJs(audioState);
  assert.strictEqual(s2.muted, false, "取消静音");
  if (s2.musicMode === "file") assert.ok(s2.musicVolume > 0, "取消静音后配乐音量恢复");
  pass("静音 / 恢复（含配乐音量联动）");
}

/* ---------- 场景二：真实触屏命中 + 对话框打开时导航可点（手机视口） ---------- */
async function testTouchAndLayout() {
  console.log("▶ 手机触屏命中与布局");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await navigate();
  await tapSelector("#btnNewGame", true);
  await sleep(300);
  // 真实 tap 热点（非 element.click），验证热点未被遮挡
  await tapSelector('.hotspot[aria-label="褪色的站牌"]', true);
  await waitFor(`!document.getElementById('dialogPanel').classList.contains('hidden')`, 3000, "站牌对话打开");
  pass("真实触屏 tap 热点可触发对话（未被遮挡）");
  // 对话框打开时 tap 底部导航
  await tapSelector('.nav-btn[data-scene="waiting"]', true);
  const scene = await evalJs(`document.getElementById('sceneName').textContent`);
  assert.strictEqual(scene, "候车室", "对话框打开时底部导航仍可切换场景");
  pass("对话框打开时导航可点");
  // 小屏 320×568 水平溢出检查
  await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  const overflow = await evalJs(`document.documentElement.scrollWidth - window.innerWidth`);
  assert.ok(overflow <= 1, "320px 小屏无水平溢出，差值: " + overflow);
  await screenshot("sys-320px");
  pass("320px 小屏无水平溢出");
  await send("Emulation.clearDeviceMetricsOverride");
}

/* ---------- 场景三：存档正常与降级 ---------- */
async function testStorage() {
  console.log("▶ 存档系统");
  await navigate();
  await tapSelector("#btnNewGame", false);
  await sleep(300);
  const saved = await evalJs(`localStorage.getItem('midnight-station-save-v1')`);
  assert.ok(saved, "已自动写入 localStorage");
  const parsed = JSON.parse(saved);
  assert.strictEqual(parsed.loop, 1);
  pass("正常环境自动存档");
  // 模拟 localStorage 不可用（隐私模式/禁用存储的典型表现）
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage disabled'); } });`,
  });
  await navigate();
  await tapSelector("#btnNewGame", false);
  await sleep(300);
  // 游戏仍可运行
  await evalJs(`[...document.querySelectorAll('.hotspot')].find(b=>b.getAttribute('aria-label')==='褪色的站牌').click()`);
  await waitFor(`!document.getElementById('dialogPanel').classList.contains('hidden')`, 3000, "降级模式下热点仍可交互");
  // 打开菜单验证提示
  await evalJs(`document.getElementById('btnMenu').click()`);
  const hint = await evalJs(`document.getElementById('saveHint').textContent`);
  assert.ok(hint.includes("失败") || hint.includes("不可用"), "存储不可用时有明确提示，实际: " + hint);
  await screenshot("sys-storage-fallback");
  pass("存储不可用 → 明确提示且游戏可继续");
}

async function main() {
  const tmpProfile = path.join(os.tmpdir(), "codely-sys-check-" + Date.now());
  const edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + tmpProfile, "about:blank",
  ], { stdio: "ignore" });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch("http://127.0.0.1:" + PORT + "/json/version"); if (r.ok) { ready = true; break; } } catch (_) {}
      await sleep(300);
    }
    assert.ok(ready, "CDP 未就绪");
    const targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
    const page = targets.find((t) => t.type === "page");
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
      }
    });
    await send("Page.enable");
    await send("Runtime.enable");

    await testAudio();
    await testTouchAndLayout();
    await testStorage();

    assert.deepStrictEqual(errors, [], "不应有未捕获异常: " + errors.join("\n"));
    console.log("\nALL SYSTEM CHECKS PASSED");
  } finally {
    try { execSync(`taskkill /PID ${edge.pid} /T /F`, { stdio: "ignore" }); } catch (_) {}
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error("\nSYSTEM CHECK FAILED:", e.message); if (errors.length) console.error(errors.join("\n")); process.exit(1); }
);
