/**
 * UI 冒烟测试（无浏览器依赖）：
 * 1. 校验 index.html 引用的 css/js/图片资源存在；
 * 2. 校验 game.js 使用的所有元素 ID 在 index.html 中存在；
 * 3. 以桩 DOM 加载 game.js，捕获启动期运行时错误。
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// 1. 资源引用检查
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  const file = path.join(root, ref);
  assert.ok(fs.existsSync(file), "missing referenced asset: " + ref);
}
console.log("PASS referenced assets exist:", refs.join(", "));

// 2. 图片路径检查（data.js 中引用）
const data = require("../scripts/data.js");
for (const scene of Object.values(data.SCENES)) {
  assert.ok(fs.existsSync(path.join(root, scene.image)), "missing scene image: " + scene.image);
}
console.log("PASS scene images exist");

// 3. 收集 HTML 中的 ID
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

// 4. 桩 DOM
const missing = [];
function makeEl(id) {
  if (id && !htmlIds.has(id)) missing.push(id);
  return {
    id,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
    addEventListener() {}, setAttribute() {}, appendChild() {},
    innerHTML: "", textContent: "", style: {}, dataset: {},
    disabled: false, src: "",
  };
}
global.window = global;
window.MidnightData = data;
window.MidnightEngine = require("../scripts/engine.js");
global.document = {
  getElementById: (id) => makeEl(id),
  createElement: () => makeEl(null),
  querySelectorAll: () => [],
  addEventListener() {},
  hidden: false,
};
global.localStorage = {
  _m: {},
  getItem(k) { return this._m[k] || null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

// 5. 加载 game.js
delete require.cache[require.resolve("../scripts/game.js")];
let loadError = null;
try {
  require("../scripts/game.js");
} catch (e) {
  loadError = e;
}
assert.ok(!loadError, "game.js boot error: " + (loadError && loadError.stack));
assert.deepStrictEqual(missing, [], "game.js referenced missing element IDs: " + missing.join(", "));
console.log("PASS game.js booted with stub DOM; all element IDs resolve");

console.log("\nALL UI SMOKE TESTS PASSED");
