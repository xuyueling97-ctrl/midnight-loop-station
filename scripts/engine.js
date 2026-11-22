(function (root, factory) {
  const data = typeof module === "object" && module.exports ? require("./data.js") : root.MidnightData;
  const Engine = factory(data);
  if (typeof module === "object" && module.exports) module.exports = Engine;
  root.MidnightEngine = Engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function (DATA) {
  "use strict";

  function worldFlags() {
    return {
      brassKeyFound: false,
      lostUnlocked: false,
      coinFound: false,
      dayTicketBought: false,
      lockerOpened: false,
      batteriesTaken: false,
      recorderPlayed: false,
      minuteHandInstalled: false,
      clockFixed: false,
      trainArrived: false,
      fuseSwitched: false
    };
  }

  function freshMemory() {
    return {
      kindness: false,
      girlCold: false,
      craneReturned: false,
      photoShown: false,
      attendantTrust: false,
      attendantMemory: false,
      girlTruth: false,
      phoneAnswered: false,
      attendantPromise: false
    };
  }

  function freshState(meta) {
    return {
      version: 1,
      loop: 1,
      timeLeft: DATA.LOOP_SECONDS,
      scene: "platform",
      status: "playing",
      inventory: [],
      clues: [],
      flags: worldFlags(),
      memory: freshMemory(),
      meta: Object.assign({ normalSeen: false, trueSeen: false, hiddenSeen: false, completedLoops: 0 }, meta || {}),
      stats: { inspections: 0, dialogues: 0, resets: 0 },
      ending: null
    };
  }

  function reply(title, lines, extra) {
    return Object.assign({ title: title, lines: Array.isArray(lines) ? lines : [lines], choices: [] }, extra || {});
  }

  function choice(label, action, args, primary) {
    return { label: label, action: action, args: args || {}, primary: Boolean(primary) };
  }

  class Engine {
    constructor(savedState) {
      this.state = savedState ? Engine.sanitize(savedState) : freshState();
    }

    static sanitize(raw) {
      if (!raw || typeof raw !== "object") return freshState();
      const clean = freshState(raw.meta);
      clean.loop = Number.isFinite(raw.loop) && raw.loop > 0 ? Math.floor(raw.loop) : 1;
      clean.timeLeft = Number.isFinite(raw.timeLeft) ? Math.max(0, Math.min(DATA.LOOP_SECONDS, raw.timeLeft)) : DATA.LOOP_SECONDS;
      clean.scene = DATA.SCENES[raw.scene] ? raw.scene : "platform";
      clean.status = raw.status === "ended" ? "ended" : "playing";
      clean.inventory = Array.isArray(raw.inventory) ? [...new Set(raw.inventory.filter((id) => DATA.ITEMS[id]))] : [];
      clean.clues = Array.isArray(raw.clues) ? [...new Set(raw.clues.filter((id) => DATA.CLUES[id]))] : [];
      clean.flags = Object.assign(worldFlags(), raw.flags || {});
      clean.memory = Object.assign(freshMemory(), raw.memory || {});
      clean.stats = Object.assign(clean.stats, raw.stats || {});
      clean.ending = DATA.ENDINGS[raw.ending] ? raw.ending : null;
      if (clean.clues.includes("timetable") && clean.clues.includes("drawing") && !clean.clues.includes("lockerCode")) clean.clues.push("lockerCode");
      return clean;
    }

    static fromJSON(json) {
      try {
        return new Engine(JSON.parse(json));
      } catch (_) {
        return new Engine();
      }
    }

    serialize() {
      return JSON.stringify(this.state);
    }

    has(itemId) {
      return this.state.inventory.includes(itemId);
    }

    hasClue(clueId) {
      return this.state.clues.includes(clueId);
    }

    addClue(clueId) {
      if (!DATA.CLUES[clueId] || this.hasClue(clueId)) return false;
      this.state.clues.push(clueId);
      if ((clueId === "timetable" || clueId === "drawing") && this.hasClue("timetable") && this.hasClue("drawing")) this.addClue("lockerCode");
      return true;
    }

    addItem(itemId) {
      if (!DATA.ITEMS[itemId] || this.has(itemId)) return false;
      this.state.inventory.push(itemId);
      if ((itemId === "photoA" || itemId === "photoB") && this.has("photoA") && this.has("photoB")) {
        this.removeItem("photoA");
        this.removeItem("photoB");
        this.state.inventory.push("photo");
        this.addClue("promise");
      }
      return true;
    }

    removeItem(itemId) {
      const index = this.state.inventory.indexOf(itemId);
      if (index >= 0) this.state.inventory.splice(index, 1);
    }

    changeScene(sceneId) {
      if (!DATA.SCENES[sceneId] || this.state.status !== "playing") return { sceneChanged: false };
      if (sceneId === "lost" && !this.state.flags.lostUnlocked) {
        if (!this.has("brassKey")) {
          return reply("失物招领处", "门锁着。锁孔旁缠着一小段蓝线，和站台雨伞上的线很像。", { sceneChanged: false });
        }
        this.removeItem("brassKey");
        this.state.flags.lostUnlocked = true;
        this.state.scene = sceneId;
        return reply("失物招领处", "黄铜钥匙转动了一次。门开后，钥匙在你掌心化成了细小的光。", { sceneChanged: true, effect: "unlock" });
      }
      this.state.scene = sceneId;
      return { sceneChanged: true, lines: [] };
    }

    interact(id) {
      if (this.state.status !== "playing") return reply("午夜已经过去", "这一轮已经结束。", {});
      const hotspot = DATA.SCENES[this.state.scene].hotspots.find((entry) => entry.id === id);
      if (!hotspot) return reply("这里没有回应", "换个地方看看吧。", {});
      this.state.stats.inspections += 1;
      if (id === "girl" || id === "attendant") this.state.stats.dialogues += 1;
      const method = "inspect" + id.charAt(0).toUpperCase() + id.slice(1);
      if (typeof this[method] !== "function") return reply(hotspot.label, "它安静地留在午夜。", {});
      return this[method]();
    }

    dispatch(action, args) {
      const allowed = [
        "returnCrane", "kindGirl", "coldGirl", "showPhotoGirl", "acceptTruth",
        "showPhotoAttendant", "submitLocker", "buyTicket", "takeBatteries",
        "playTape", "installHand", "openClock", "setClock", "waitTrain",
        "dialPhone", "submitPhoneCode", "endNormal", "endTrue", "endHidden", "stayPlatform"
      ];
      if (!allowed.includes(action) || typeof this[action] !== "function") return reply("没有发生任何事", "这个动作现在无法完成。", {});
      return this[action](args);
    }

    get hiddenReady() {
      const s = this.state;
      return s.meta.trueSeen && s.memory.attendantPromise && s.memory.phoneAnswered
        && this.hasClue("stationName") && s.flags.clockFixed && s.memory.girlTruth;
    }

    inspectStationSign() {
      this.addClue("stationSign");
      return reply("褪色的站牌", ["白 □ 站。", "中间那个字被水汽浸花了。你伸手擦拭，指尖却沾到一点干燥的白色颜料——像鸟的羽毛。"]);
    }

    inspectClock() {
      this.addClue("stoppedClock");
      if (this.state.flags.clockFixed) {
        return reply("00:07", "分针稳定地向前走动。每一次轻响，都像有人终于呼出了一口气。", { effect: "tick" });
      }
      if (!this.state.flags.minuteHandInstalled) {
        const choices = this.has("minuteHand") ? [choice("装回分针", "installHand", {}, true)] : [];
        return reply("停在 00:00 的时钟", "齿轮完好，唯独少了分针。发条孔旁刻着一行小字：让第七分钟继续。", { choices });
      }
      if (!this.has("clockKey")) {
        return reply("上了针的时钟", "分针已经装好，但发条孔是空的。没有钥匙，它不会走。");
      }
      return reply("等待上弦", "把黄铜钥匙插进发条孔，然后把时间拨到正确的一刻。", {
        choices: [
          choice("拨到 00:00", "setClock", { time: "00:00" }),
          choice("拨到 00:07", "setClock", { time: "00:07" }, true),
          choice("拨到 23:57", "setClock", { time: "23:57" }),
          choice("拨到 12:00", "setClock", { time: "12:00" })
        ]
      });
    }

    inspectGirl() {
      const m = this.state.memory;
      if (this.has("paperCrane") && !m.craneReturned) {
        return reply("黄围巾女孩", "她坐在长椅上，望着空空的轨道。“姐姐说会折一只黄色的鹤给我……你见过吗？”", {
          choices: [choice("把纸鹤递给她", "returnCrane", {}, true), choice("先陪她坐一会儿", "stayPlatform")]
        });
      }
      if (!m.craneReturned) {
        return reply("黄围巾女孩", "“我在等一只黄色的鹤。”她抱紧膝盖，不肯看你。候车室的寄存柜里，也许有人替她收着。");
      }
      if (m.girlCold) {
        return reply("黄围巾女孩", "“……你刚才那样说，让我有点难过。”她的声音很轻。", {
          choices: [choice("对不起，我记不清了，但我想起来", "kindGirl", {}, true)]
        });
      }
      if (!m.kindness) {
        return reply("黄围巾女孩", "“我们以前见过吗？”她终于抬起头，眼睛亮得像站台尽头的信号灯。", {
          choices: [
            choice("没有。我不认识你。", "coldGirl"),
            choice("也许……我也忘了。但我们一定约好过什么。", "kindGirl", {}, true)
          ]
        });
      }
      if (this.has("photo") && !m.photoShown) {
        return reply("黄围巾女孩", "她看见你手里的合照，忽然安静下来。“这张照片……另一半在哪里？”", {
          choices: [choice("把拼好的照片给她看", "showPhotoGirl", {}, true)]
        });
      }
      if (this.state.flags.clockFixed && !m.girlTruth) {
        const missing = [];
        if (!this.has("photo")) missing.push("拼好的合照");
        if (!this.hasClue("tape")) missing.push("磁带里的录音");
        if (!this.hasClue("staffLog")) missing.push("值班日志");
        if (!this.hasClue("mirror")) missing.push("失物室的镜子");
        if (missing.length) {
          return reply("黄围巾女孩", "“你还差一点勇气。”她指向时钟。“00:07。去把缺的东西找齐——" + missing.join("、") + "。”");
        }
        return reply("黄围巾女孩", "“你想起自己是谁了吗？”时钟在她身后轻轻走动。", {
          choices: [choice("我是小满。那天被救下的孩子，是我。", "acceptTruth", {}, true), choice("还不到时候", "stayPlatform")]
        });
      }
      if (m.girlTruth) {
        return reply("黄围巾女孩", "她朝检票口的方向偏了偏头。“走吧。这一次，我们一起。”");
      }
      return reply("黄围巾女孩", "她把黄围巾往上拉了拉。“时钟修好之前，谁也走不了。你要帮帮它吗？”");
    }

    inspectUmbrella() {
      if (!this.state.flags.brassKeyFound) {
        this.state.flags.brassKeyFound = true;
        this.addItem("brassKey");
        return reply("条纹雨伞", "伞柄上系着一枚黄铜钥匙和一小段蓝线。有人把钥匙藏在这里，等人回来取。", { effect: "item" });
      }
      return reply("条纹雨伞", "伞面的条纹已经褪色。蓝线还在，钥匙的位置空了。");
    }

    inspectTimetable() {
      this.addClue("timetable");
      return reply("被涂改的时刻表", ["大部分班次被雨水泡烂了，只有四行还能辨认：", "月亮 7 · 纸鹤 3 · 雨伞 1 · 星星 9。", "每个图案旁边都画着一把小锁。"]);
    }

    inspectTrainGate() {
      const s = this.state;
      const choices = [];
      if (!s.flags.trainArrived) {
        return reply("检票口与轨道", "轨道空着，远处的信号灯是红色的。时刻表上写着：下一班 00:00。", {
          choices: [choice("在长椅上等到列车进站", "waitTrain", {}, true)]
        });
      }
      if (this.hiddenReady) {
        choices.push(choice("把两张票都留在检票口，转身走向电话那端的人", "endHidden", {}, true));
      }
      if (s.flags.clockFixed && s.memory.girlTruth) {
        choices.push(choice("牵起女孩的手，一起走向 00:07 的列车", "endTrue"));
      }
      if (this.has("dayTicket")) {
        choices.push(choice("握紧单程票，独自上车", "endNormal"));
      }
      choices.push(choice("留在站台", "stayPlatform"));
      const lead = s.flags.clockFixed
        ? "列车已经停在轨道旁。车门开着，车厢里亮着暖黄色的灯。"
        : "列车进站了。广播循环播放着登车提示，可你总觉得少了什么。";
      return reply("检票口与轨道", lead, { choices });
    }

    inspectDrawing() {
      this.addClue("drawing");
      return reply("儿童画", ["画上是两个手拉手的小人和一片海。", "底部依次画着：月亮 → 纸鹤 → 雨伞 → 星星。", "右上角签着两个名字：阿遥、小满。"]);
    }

    inspectLocker() {
      if (this.state.flags.lockerOpened) {
        return reply("寄存柜", "柜门敞着，里面只剩下樟脑的气味。");
      }
      return reply("寄存柜", "四位数密码锁。锁面上刻着四个小图案：月亮、纸鹤、雨伞、星星。", {
        keypad: { length: 4, hint: "按画里的顺序，读出四班车各自的数字" },
        choices: [{ label: "输入密码", action: "__keypad__", args: { length: 4 }, primary: true }]
      });
    }

    submitLocker(args) {
      const code = typeof args === "string" ? args : (args && args.code);
      const value = String(code == null ? "" : code).replace(/\D/g, "");
      if (value !== "7319") {
        return reply("寄存柜", "锁扣弹了一下，又合上了。再想想那幅画和被取消的班次。", { effect: "error" });
      }
      this.state.flags.lockerOpened = true;
      this.addItem("photoA");
      this.addItem("paperCrane");
      this.addItem("cassette");
      return reply("寄存柜 · 7319", ["柜门滑开。里面整整齐齐放着三样东西：", "半张合照（左）、一只黄色纸鹤、一盘无标签磁带。", "纸鹤的翅膀上写着小小的“阿遥”。"], { effect: "item" });
    }

    inspectBench() {
      if (!this.state.flags.coinFound) {
        this.state.flags.coinFound = true;
        this.addItem("coin");
        return reply("候车长椅", "椅垫下有一枚旧硬币，边缘被磨得发亮。像是谁特意留下的。", { effect: "item" });
      }
      return reply("候车长椅", "椅面上刻着两个歪歪扭扭的名字，笔画被摩挲得很浅。");
    }

    inspectRadio() {
      if (!this.state.flags.batteriesTaken) {
        return reply("老式收音机", "收音机响着，全是杂音。偶尔能听见里面埋着一句人声，被电流搅碎。", {
          choices: [choice("取下它的两节电池", "takeBatteries", {}, true)]
        });
      }
      return reply("老式收音机", "没有电池的收音机安静地黑着屏。你反而听清了站台广播——它在反复喊一个名字。");
    }

    takeBatteries() {
      this.state.flags.batteriesTaken = true;
      this.addItem("batteries");
      this.addClue("interference");
      return reply("两节电池", ["电池还带着一点余温。", "收音机安静下来的瞬间，站台广播变得清楚：“请小满接听电话。”"], { effect: "item" });
    }

    inspectVending() {
      if (this.has("dayTicket")) {
        return reply("自动售货机", "投币口吐出过一张车票。机器现在只肯找给你一颗融化的薄荷糖。");
      }
      if (this.has("coin")) {
        return reply("自动售货机", "投币口亮着微光，货道里只剩下一张“单程车票”。", {
          choices: [choice("投币购买", "buyTicket", {}, true)]
        });
      }
      return reply("自动售货机", "投币口空着。候车室的长椅下面，也许有前一位乘客落下的硬币。");
    }

    buyTicket() {
      if (!this.has("coin")) return reply("自动售货机", "你需要一枚硬币。");
      this.removeItem("coin");
      this.state.flags.dayTicketBought = true;
      this.addItem("dayTicket");
      return reply("单程车票", "车票滑出货道。目的地一栏只有两个字：前方。", { effect: "item" });
    }

    inspectFareChart() {
      this.addClue("stationName");
      const extra = this.hasClue("stationSign") ? "站牌上缺失的字，原来是一只展翅的白鹭。" : "站名——白鹭站。你想起来，站牌上缺的字也许就是它。";
      return reply("旧票价表", ["票价表顶端印着完整的站名：白鹭站。", "票根边角印着一只衔着纸鹤的白鹭。", extra]);
    }

    inspectAttendant() {
      const m = this.state.memory;
      if (m.attendantPromise) {
        return reply("值班员钟叔", "“去吧。”他望着检票口。“这一次，别再让任何人独自留下。”");
      }
      if (m.attendantTrust && this.state.meta.trueSeen && m.phoneAnswered) {
        m.attendantPromise = true;
        this.addClue("lastPromise");
        return reply("值班员钟叔", ["钟叔看了看你，又看了看那台响过的电话。", "“你姐姐只拜托我拦住那个总想独自离开的孩子。", "至于电话那边的人——你该亲自回答她。”"], { effect: "reveal" });
      }
      if (m.attendantTrust) {
        if (!this.has("clockKey")) {
          this.addItem("clockKey");
          this.addClue("keeper");
          return reply("值班员钟叔", "他把一枚黄铜钥匙放进你掌心。“修钟的钥匙。钟可以继续走，但你得先承认自己是谁。”", { effect: "item" });
        }
        return reply("值班员钟叔", "“钟在等你。”他转身整理票柜，像每一个等待下班的夜晚。");
      }
      if (this.has("photo")) {
        return reply("值班员钟叔", "“买票吗？”他的目光落在你手中的合照上，停顿了一秒，又移开。", {
          choices: [choice("把拼好的照片递到窗口", "showPhotoAttendant", {}, true), choice("只是看看", "stayPlatform")]
        });
      }
      return reply("值班员钟叔", "“末班车快到了。”他敲了敲窗口。“可这条线，二十年没有真正发过车。”");
    }

    showPhotoAttendant() {
      this.state.memory.attendantTrust = true;
      this.state.memory.attendantMemory = true;
      this.addClue("attendant");
      this.addClue("keeper");
      this.addItem("clockKey");
      return reply("值班员钟叔", ["他盯着合照很久，终于叹了口气。", "“我是当年的值班员。站里的我，是没能下班的一段记忆。", "修钟的钥匙，本来就是要交给你的。”"], { effect: "reveal" });
    }

    inspectTelephone() {
      if (this.state.memory.phoneAnswered) {
        return reply("黑色拨号电话", "听筒安静地躺在话机上。你记得那个声音，和它背后的海浪。");
      }
      if (!this.state.flags.fuseSwitched) {
        return reply("黑色拨号电话", "听筒里只有沙沙声——线路没有供电。配电箱上，第三路保险丝旁边贴着“广播/电话”的标签。");
      }
      const hint = this.hasClue("sevenMinutes") ? "你想起录音里的那句话：救援列车直到 00:07 才离站。" : "四位号码。可这座站台的午夜，从来只有零点。";
      return reply("黑色拨号电话", "电话铃在响。接通后，听筒里传来拨号音，像是在等你说出四个数字。", {
        keypad: { length: 4, hint: hint },
        choices: [{ label: "拨号", action: "__keypad__", args: { length: 4 }, primary: true }]
      });
    }

    submitPhoneCode(args) {
      const code = typeof args === "string" ? args : (args && args.code);
      const value = String(code == null ? "" : code).replace(/\D/g, "");
      if (value !== "0007") {
        return reply("黑色拨号电话", "忙音。你拨的号码，还停在午夜之前。", { effect: "error" });
      }
      this.state.memory.phoneAnswered = true;
      this.addClue("phoneCall");
      if (this.hasClue("mirror")) this.addClue("reflection");
      return reply("0007", ["一个成年女人的声音，隔着海浪：“小满？”", "“如果你愿意走出来，我会一直在白鹭站等你。”", "电话挂断前，你听见她轻轻笑了一下。"], { effect: "reveal" });
    }

    inspectStaffPhoto() {
      this.addClue("staffYears");
      return reply("职工合影", ["照片里的钟叔还年轻，胸前别着一枚纸鹤形徽章。", "他身边的座机电话没有接线。", "合影日期是二十年前的六月十七日。"]);
    }

    inspectShelf() {
      this.addClue("lostProperty");
      return reply("失物货架", ["一条黄围巾被整齐地叠在木盒里。", "登记卡写着：每年都有人把它送回。", "领取人一栏，只有一个“林”字。"]);
    }

    inspectMirror() {
      this.addClue("mirror");
      if (this.state.memory.phoneAnswered) this.addClue("reflection");
      const lead = this.state.memory.phoneAnswered
        ? "镜中闪过白天的白鹭站——两个成年人的影子站在站牌下，其中一个围着黄围巾。"
        : "镜中不是七岁的孩子，而是一个疲惫的成年人。";
      return reply("旧镜子", [lead, "你早已长大。只是记忆里的自己，还坐在那张长椅上。"]);
    }

    inspectRecorder() {
      if (this.state.flags.recorderPlayed) {
        return reply("磁带录音机", "带仓空了。你仿佛还能听见最后一句“别再说是你抛下了我”。");
      }
      const need = [];
      if (!this.has("cassette")) need.push("磁带");
      if (!this.has("batteries")) need.push("电池");
      if (need.length) {
        return reply("磁带录音机", "还缺：" + need.join("、") + "。带仓的弹簧松了，像在打哈欠。");
      }
      return reply("磁带录音机", "磁带和电池都准备好了。录音机的指示灯在等你按下播放键。", {
        choices: [choice("播放磁带", "playTape", {}, true)]
      });
    }

    playTape() {
      if (!this.has("cassette") || !this.has("batteries")) return reply("磁带录音机", "磁带和电池缺一不可。");
      this.removeItem("cassette");
      this.removeItem("batteries");
      this.state.flags.recorderPlayed = true;
      this.addItem("minuteHand");
      this.addClue("tape");
      this.addClue("sevenMinutes");
      return reply("磁带停止转动", ["阿遥的声音：“小满，是我把你推上车的。不要再说是你抛下了我。你当时只有七岁。”", "“救援列车 00:07 才离站。你要替我，走到零点以后。”", "带仓里弹出一样东西——一根细长的金属分针。"], { effect: "tape" });
    }

    inspectLogbook() {
      this.addClue("staffLog");
      return reply("值班日志", ["6 月 17 日，00:07。救援列车已离站。", "乘客名单：林小满，7 岁，已获救；林遥，17 岁，下落不明。", "记录从未写过“死亡”。"]);
    }

    inspectFuseBox() {
      if (!this.state.flags.fuseSwitched) {
        this.state.flags.fuseSwitched = true;
        this.addClue("signal");
        return reply("信号配电箱", ["你扳上第三路保险丝。", "远处的红灯短暂变成绿色，售票处的电话随之响了一声。"], { effect: "signal" });
      }
      return reply("信号配电箱", "第三路信号稳定地亮着绿灯。配电箱的嗡鸣像一句背景里的晚安。");
    }

    returnCrane() {
      if (!this.has("paperCrane")) return reply("纸鹤", "你已经把纸鹤交出去了。");
      this.removeItem("paperCrane");
      this.state.memory.craneReturned = true;
      this.addClue("paperCrane");
      return reply("纸鹤", ["她接过纸鹤，指尖在翅膀上停了很久。", "“谢谢你。”站台的灯轻轻闪了一下。", "——下一轮里，她仍然会记得这件小事。"], { effect: "item" });
    }

    kindGirl() {
      this.state.memory.kindness = true;
      this.state.memory.girlCold = false;
      const gave = this.addItem("photoB");
      const lines = gave
        ? ["“我也觉得。”她笑了，从口袋里掏出半张照片。“喏——另一半在我这里，一直有。”", "两半照片拼在一起：阿遥和小满并肩站在海边。背面写着：‘等你来找我。’"]
        : ["“我也觉得。”她安静地坐回长椅。"];
      return reply("黄围巾女孩", lines, { effect: "item" });
    }

    coldGirl() {
      this.state.memory.kindness = false;
      this.state.memory.girlCold = true;
      return reply("黄围巾女孩", "她低下头。“……好吧。”灯影在她脸上晃了一下。");
    }

    showPhotoGirl() {
      this.state.memory.photoShown = true;
      return reply("拼好的合照", ["她看了很久，忽然说：“原来我一直记得。”", "“时钟走到 00:07 的时候，你会想起自己是谁。”"], { effect: "reveal" });
    }

    acceptTruth() {
      const s = this.state;
      if (!s.flags.clockFixed || !this.has("photo") || !this.hasClue("tape") || !this.hasClue("staffLog") || !this.hasClue("mirror") || !s.memory.craneReturned || !s.memory.photoShown) {
        return reply("还不到时候", "有些东西还没有找齐。", { effect: "error" });
      }
      s.memory.girlTruth = true;
      s.flags.trainArrived = true;
      return reply("00:07", ["“我是小满。”你听见自己的声音，“那天被救下的孩子，是我。”", "女孩笑了。这一次，她的轮廓和你重叠在一起。", "“走吧。”她说，“这一次，我们一起。”"], { effect: "reveal" });
    }

    installHand() {
      if (!this.has("minuteHand")) return reply("时钟", "你还没有找到分针。");
      this.removeItem("minuteHand");
      this.state.flags.minuteHandInstalled = true;
      return reply("分针归位", "金属针卡进轴心，轻轻颤了一下。发条孔在等它的钥匙。", { effect: "item" });
    }

    setClock(args) {
      if (!this.state.flags.minuteHandInstalled || !this.has("clockKey")) {
        return reply("时钟", "先装回分针，再拿到发条钥匙。", { effect: "error" });
      }
      const time = args && args.time;
      if (time === "00:07") {
        this.state.flags.clockFixed = true;
        this.state.flags.trainArrived = true;
        this.state.timeLeft = Math.max(this.state.timeLeft, 120);
        this.addClue("timeMoves");
        return reply("00:07", ["分针越过午夜，停在这座站二十年来从未抵达的时刻。", "女孩不再看轨道，而是看向你。"], { effect: "clock" });
      }
      return reply("指针停在 " + (time || "00:00"), "钟摆晃了晃，又回到 00:00。再想想那句刻在发条孔旁的话。", { effect: "error" });
    }

    waitTrain() {
      this.state.timeLeft = DATA.TRAIN_AT;
      this.state.flags.trainArrived = true;
      return reply("列车进站", "灯光扫过站台。车门打开，广播开始循环登车提示。", { effect: "train" });
    }

    stayPlatform() {
      return reply("站台", "你留在了原地。", { close: true });
    }

    dialPhone() {
      return this.inspectTelephone();
    }

    endNormal() {
      if (!this.state.flags.trainArrived || !this.has("dayTicket")) {
        return reply("检票口", "列车还没有来，或者你还没有票。", { effect: "error" });
      }
      return this.resolveEnding("normal");
    }

    endTrue() {
      if (!this.state.flags.trainArrived || !this.state.flags.clockFixed || !this.state.memory.girlTruth) {
        return reply("检票口", "还差一点。", { effect: "error" });
      }
      return this.resolveEnding("true");
    }

    endHidden() {
      if (!this.hiddenReady || !this.state.flags.trainArrived) {
        return reply("检票口", "这条路还没有打开。", { effect: "error" });
      }
      return this.resolveEnding("hidden");
    }

    resolveEnding(type) {
      const data = DATA.ENDINGS[type];
      if (!data) return reply("没有这样的结局", "……");
      this.state.status = "ended";
      this.state.ending = type;
      this.state.timeLeft = 0;
      this.state.meta[type + "Seen"] = true;
      this.state.meta.completedLoops = (this.state.meta.completedLoops || 0) + 1;
      const closing = {
        normal: ["车门在你身后合拢。窗外的女孩抱着纸鹤，朝你挥了挥手。", "列车驶入隧道。你醒来时，时钟的指针又回到了 00:00。", "——你离开了站台，却没有离开那一天。"],
        true: ["你牵起她的手。这一次，你没有把任何一个自己留在身后。", "列车驶向隧道尽头。那里有真正的 00:07，和一整片海。"],
        hidden: ["你走出检票口。站台上，一个围着黄围巾的成年女人正朝你走来。", "“我每年都坐 00:07 的车来。”她说，“你终于肯接电话了。”", "白鹭站的天亮了。有些等待不是为了留住你，而是为了接你回家。"]
      };
      return reply(data.title, closing[type] || [], { ending: type, endingData: data });
    }

    tick(seconds) {
      const step = Number.isFinite(seconds) ? Math.max(0, seconds) : 1;
      if (this.state.status !== "playing") return { reset: false, trainArrived: false };
      this.state.timeLeft = Math.max(0, this.state.timeLeft - step);
      let trainArrived = false;
      if (this.state.timeLeft <= DATA.TRAIN_AT && !this.state.flags.trainArrived) {
        this.state.flags.trainArrived = true;
        trainArrived = true;
      }
      if (this.state.timeLeft <= 0) {
        this.resetLoop();
        return { reset: true, trainArrived: trainArrived };
      }
      return { reset: false, trainArrived: trainArrived };
    }

    resetLoop() {
      const s = this.state;
      s.loop += 1;
      s.timeLeft = DATA.LOOP_SECONDS;
      s.scene = "platform";
      s.status = "playing";
      s.ending = null;
      s.flags = worldFlags();
      s.inventory = s.inventory.filter((id) => DATA.ITEMS[id] && DATA.ITEMS[id].persistent);
      s.stats.resets += 1;
      return { reset: true, loop: s.loop, keptClues: s.clues.length };
    }

    continueAfterEnding() {
      return this.resetLoop();
    }

    getObjective() {
      const s = this.state;
      if (!this.hasClue("stoppedClock")) return "调查站台时钟";
      if (!this.hasClue("timetable") || !this.hasClue("drawing")) return "收集寄存柜密码线索（时刻表 + 儿童画）";
      if (!s.flags.lockerOpened && !this.has("photoA") && !this.has("photo")) return "用密码 7319 打开候车室寄存柜";
      if (!s.memory.craneReturned) return "把黄色纸鹤还给站台女孩";
      if (s.memory.girlCold) return "向女孩道歉";
      if (!s.memory.kindness) return "回应女孩的问题";
      if (this.has("photo") && !s.memory.photoShown) return "把拼好的合照给女孩看";
      if (!s.flags.recorderPlayed) return "找到磁带和电池，在失物室播放录音";
      if (!s.memory.attendantTrust) return "把合照拿给售票处的钟叔看";
      if (!this.hasClue("mirror") || !this.hasClue("staffLog")) return "调查失物招领处（镜子、日志）";
      if (!s.flags.minuteHandInstalled) return "把分针装回站台时钟";
      if (!s.flags.clockFixed) return "用发条钥匙把时钟拨到 00:07";
      if (!s.memory.girlTruth) return "在 00:07 的站台，向女孩说出真相";
      if (s.meta.trueSeen && !s.meta.hiddenSeen) {
        if (!s.memory.phoneAnswered) return "这一夜，售票处的电话一直在轻轻响着";
        if (!s.memory.attendantPromise) return "把电话里听到的事，告诉售票处的钟叔";
      }
      return "去检票口，做出你的选择";
    }
  }

  return Engine;
});
