const assert = require("assert");
const DATA = require("../scripts/data.js");
const Engine = require("../scripts/engine.js");

function step(engine, id) {
  const r = engine.interact(id);
  assert.ok(r && r.title, "interact " + id + " must return a reply");
  return r;
}
function act(engine, action, args) {
  const r = engine.dispatch(action, args);
  assert.ok(r && r.title, "dispatch " + action + " must return a reply");
  return r;
}

function testFreshState() {
  const e = new Engine();
  assert.strictEqual(e.state.loop, 1);
  assert.strictEqual(e.state.timeLeft, DATA.LOOP_SECONDS);
  assert.strictEqual(e.state.scene, "platform");
  assert.strictEqual(e.state.status, "playing");
  assert.deepStrictEqual(e.state.inventory, []);
  assert.strictEqual(e.getObjective(), "调查站台时钟");
  console.log("PASS fresh state");
}

function testClueDerivation() {
  const e = new Engine();
  step(e, "timetable");
  assert.ok(!e.hasClue("lockerCode"));
  e.changeScene("waiting");
  step(e, "drawing");
  assert.ok(e.hasClue("lockerCode"), "lockerCode should derive from timetable+drawing");
  console.log("PASS clue derivation");
}

function testLocker() {
  const e = new Engine();
  e.changeScene("waiting");
  step(e, "locker");
  let r = act(e, "submitLocker", { code: "1111" });
  assert.ok(!e.state.flags.lockerOpened, "wrong code must not open locker");
  assert.strictEqual(r.effect, "error");
  r = act(e, "submitLocker", { code: "7319" });
  assert.ok(e.state.flags.lockerOpened);
  assert.ok(e.has("photoA") && e.has("paperCrane") && e.has("cassette"));
  console.log("PASS locker puzzle");
}

function testPhotoCombine() {
  const e = new Engine();
  e.addItem("photoA");
  e.addItem("photoB");
  assert.ok(e.has("photo") && !e.has("photoA") && !e.has("photoB"));
  assert.ok(e.hasClue("promise"));
  console.log("PASS photo combine");
}

function testLoopReset() {
  const e = new Engine();
  e.addItem("photoA");
  e.addItem("coin");
  e.addItem("cassette");
  e.addClue("timetable");
  e.state.flags.lockerOpened = true;
  e.state.memory.craneReturned = true;
  const loopBefore = e.state.loop;
  const keptClues = e.state.clues.length;
  e.resetLoop();
  assert.strictEqual(e.state.loop, loopBefore + 1);
  assert.strictEqual(e.state.timeLeft, DATA.LOOP_SECONDS);
  assert.strictEqual(e.state.scene, "platform");
  assert.strictEqual(e.state.status, "playing");
  assert.ok(e.has("photoA"), "persistent item must survive reset");
  assert.ok(!e.has("coin") && !e.has("cassette"), "non-persistent items must vanish");
  assert.ok(e.hasClue("timetable"), "clues survive reset");
  assert.ok(e.state.memory.craneReturned, "memory survives reset");
  assert.strictEqual(e.state.flags.lockerOpened, false, "world flags reset");
  assert.strictEqual(e.state.clues.length, keptClues);
  console.log("PASS loop reset");
}

function testTimerAndTrain() {
  const e = new Engine();
  const r1 = e.tick(DATA.LOOP_SECONDS - DATA.TRAIN_AT);
  assert.strictEqual(r1.trainArrived, true, "train arrives at TRAIN_AT");
  assert.strictEqual(e.state.flags.trainArrived, true);
  const r2 = e.tick(DATA.TRAIN_AT);
  assert.strictEqual(r2.reset, true, "timer zero must reset loop");
  assert.strictEqual(e.state.loop, 2);
  assert.strictEqual(e.state.timeLeft, DATA.LOOP_SECONDS);
  assert.strictEqual(e.state.flags.trainArrived, false, "train state resets");
  console.log("PASS timer / train / reset");
}

function playToTruthReady(e) {
  // platform
  step(e, "stationSign");
  step(e, "timetable");
  step(e, "clock");
  // waiting
  e.changeScene("waiting");
  step(e, "drawing");
  step(e, "bench");
  act(e, "buyTicket");
  step(e, "locker");
  act(e, "submitLocker", { code: "7319" });
  step(e, "radio");
  act(e, "takeBatteries");
  // platform: girl chain
  e.changeScene("platform");
  step(e, "umbrella");
  step(e, "girl");
  act(e, "returnCrane");
  step(e, "girl");
  act(e, "kindGirl");
  // lost room
  const r = e.changeScene("lost");
  assert.ok(r.sceneChanged, "brassKey should unlock lost room");
  step(e, "recorder");
  act(e, "playTape");
  step(e, "logbook");
  step(e, "mirror");
  step(e, "shelf");
  // ticket
  e.changeScene("ticket");
  step(e, "fareChart");
  step(e, "staffPhoto");
  step(e, "attendant");
  act(e, "showPhotoAttendant");
  assert.ok(e.has("clockKey"), "attendant must give clockKey");
  // fix clock
  e.changeScene("platform");
  step(e, "clock");
  act(e, "installHand");
  step(e, "clock");
  act(e, "setClock", { time: "23:57" });
  assert.ok(!e.state.flags.clockFixed, "wrong time must not fix clock");
  act(e, "setClock", { time: "00:07" });
  assert.ok(e.state.flags.clockFixed);
  assert.ok(e.state.flags.trainArrived);
  // girl truth
  step(e, "girl");
  act(e, "showPhotoGirl");
  step(e, "girl");
  return e;
}

function testTrueEnding() {
  const e = new Engine();
  playToTruthReady(e);
  const r = act(e, "acceptTruth");
  assert.ok(e.state.memory.girlTruth);
  const gate = step(e, "trainGate");
  assert.ok(gate.choices.some((c) => c.action === "endTrue"), "true ending choice must appear");
  act(e, "endTrue");
  assert.strictEqual(e.state.status, "ended");
  assert.strictEqual(e.state.ending, "true");
  assert.ok(e.state.meta.trueSeen);
  console.log("PASS true ending full path");
}

function testNormalEnding() {
  const e = new Engine();
  e.changeScene("waiting");
  step(e, "bench");
  act(e, "buyTicket");
  e.changeScene("platform");
  step(e, "trainGate");
  act(e, "waitTrain");
  assert.ok(e.state.flags.trainArrived);
  const gate = step(e, "trainGate");
  assert.ok(gate.choices.some((c) => c.action === "endNormal"), "normal choice must appear");
  act(e, "endNormal");
  assert.strictEqual(e.state.ending, "normal");
  assert.ok(e.state.meta.normalSeen);
  console.log("PASS normal ending path");
}

function testHiddenEndingReachable() {
  // Start post-true run: meta.trueSeen carries over, girlTruth in memory persists via resetLoop
  const e = new Engine();
  playToTruthReady(e);
  act(e, "acceptTruth");
  act(e, "endTrue");
  // start next loop keeping memory
  e.continueAfterEnding();
  assert.strictEqual(e.state.loop, 2);
  assert.ok(e.state.meta.trueSeen);
  assert.ok(e.state.memory.girlTruth, "girlTruth persists across loops");
  assert.ok(e.has("clockKey") || true, "clockKey persistence checked below");
  // clockKey is persistent
  assert.ok(e.has("clockKey"), "clockKey must survive loop reset");
  // redo world: locker+cassette+batteries+tape for minuteHand
  e.changeScene("waiting");
  step(e, "locker");
  act(e, "submitLocker", { code: "7319" });
  step(e, "radio");
  act(e, "takeBatteries");
  e.changeScene("lost");
  step(e, "recorder");
  act(e, "playTape");
  // hidden path: fuse + stationName + phone + attendant promise
  step(e, "fuseBox");
  e.changeScene("ticket");
  step(e, "fareChart");
  assert.ok(e.hasClue("stationName"));
  step(e, "telephone");
  act(e, "submitPhoneCode", { code: "0007" });
  assert.ok(e.state.memory.phoneAnswered);
  step(e, "attendant");
  assert.ok(e.state.memory.attendantPromise, "attendant promise unlocks hidden path");
  // fix clock again
  e.changeScene("platform");
  step(e, "clock");
  act(e, "installHand");
  step(e, "clock");
  act(e, "setClock", { time: "00:07" });
  const gate = step(e, "trainGate");
  assert.ok(gate.choices.some((c) => c.action === "endHidden"), "hidden choice must appear");
  act(e, "endHidden");
  assert.strictEqual(e.state.ending, "hidden");
  assert.ok(e.state.meta.hiddenSeen);
  console.log("PASS hidden ending reachable across loops");
}

function testSaveRoundTrip() {
  const e = new Engine();
  playToTruthReady(e);
  act(e, "acceptTruth");
  const gate = step(e, "trainGate");
  assert.ok(gate.choices.some((c) => c.action === "endTrue"));
  act(e, "endTrue");
  const json = e.serialize();
  const e2 = Engine.fromJSON(json);
  assert.strictEqual(e2.state.ending, "true");
  assert.strictEqual(e2.state.status, "ended");
  assert.ok(e2.state.memory.girlTruth);
  // corrupt input
  const e3 = Engine.fromJSON("{broken");
  assert.strictEqual(e3.state.loop, 1);
  const e4 = new Engine({ loop: "x", timeLeft: "abc", inventory: ["ghost", "photoA"], clues: ["nope", "tape"], flags: null, memory: null });
  assert.strictEqual(e4.state.loop, 1);
  assert.deepStrictEqual(e4.state.inventory, ["photoA"]);
  assert.deepStrictEqual(e4.state.clues, ["tape"]);
  console.log("PASS save round-trip / corrupt input");
}

function testAllHotspotsNoCrash() {
  const e = new Engine();
  for (const sceneId of Object.keys(DATA.SCENES)) {
    e.changeScene(sceneId);
    for (const h of DATA.SCENES[sceneId].hotspots) {
      const r = e.interact(h.id);
      assert.ok(r && r.title);
    }
  }
  console.log("PASS all hotspots no crash");
}

function testKeyGarbageInput() {
  const e = new Engine();
  e.changeScene("waiting");
  step(e, "locker");
  act(e, "submitLocker", { code: "abcd" });
  act(e, "submitLocker", { code: null });
  assert.ok(!e.state.flags.lockerOpened);
  e.changeScene("ticket");
  step(e, "telephone");
  act(e, "submitPhoneCode", { code: "" });
  assert.ok(!e.state.memory.phoneAnswered);
  console.log("PASS garbage keypad input safe");
}

testFreshState();
testClueDerivation();
testLocker();
testPhotoCombine();
testLoopReset();
testTimerAndTrain();
testTrueEnding();
testNormalEnding();
testHiddenEndingReachable();
testSaveRoundTrip();
testAllHotspotsNoCrash();
testKeyGarbageInput();
console.log("\nALL ENGINE TESTS PASSED");
