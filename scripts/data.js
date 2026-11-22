(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  root.MidnightData = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LOOP_SECONDS = 300;
  const TRAIN_AT = 60;

  const SCENES = {
    platform: {
      name: "站台",
      short: "站台",
      subtitle: "所有指针都停在这里",
      image: "assets/platform.webp",
      hotspots: [
        { id: "stationSign", label: "褪色的站牌", x: 34, y: 17, w: 17, h: 12, icon: "sign" },
        { id: "clock", label: "停在零点的时钟", x: 53, y: 21, w: 11, h: 19, icon: "clock" },
        { id: "girl", label: "黄围巾女孩", x: 17, y: 55, w: 11, h: 29, icon: "person", character: "girl" },
        { id: "umbrella", label: "条纹雨伞", x: 31, y: 53, w: 10, h: 24, icon: "search" },
        { id: "timetable", label: "被涂改的时刻表", x: 50, y: 47, w: 13, h: 22, icon: "note" },
        { id: "trainGate", label: "检票口与轨道", x: 76, y: 49, w: 19, h: 32, icon: "train" }
      ]
    },
    waiting: {
      name: "候车室",
      short: "候车",
      subtitle: "有些座位一直为人留着",
      image: "assets/waiting.webp",
      hotspots: [
        { id: "drawing", label: "儿童画", x: 22, y: 27, w: 12, h: 30, icon: "note" },
        { id: "locker", label: "寄存柜", x: 0, y: 12, w: 22, h: 82, icon: "lock" },
        { id: "bench", label: "候车长椅", x: 23, y: 57, w: 40, h: 28, icon: "search" },
        { id: "radio", label: "老式收音机", x: 64, y: 54, w: 14, h: 31, icon: "radio" },
        { id: "vending", label: "自动售货机", x: 84, y: 27, w: 14, h: 65, icon: "ticket" }
      ]
    },
    ticket: {
      name: "售票处",
      short: "售票",
      subtitle: "窗口后的灯还亮着",
      image: "assets/ticket.webp",
      hotspots: [
        { id: "fareChart", label: "旧票价表", x: 9, y: 8, w: 13, h: 42, icon: "note" },
        { id: "attendant", label: "值班员钟叔", x: 38, y: 10, w: 21, h: 52, icon: "person", character: "attendant" },
        { id: "telephone", label: "黑色拨号电话", x: 31, y: 43, w: 12, h: 18, icon: "phone" },
        { id: "staffPhoto", label: "职工合影", x: 65, y: 10, w: 15, h: 25, icon: "photo" }
      ]
    },
    lost: {
      name: "失物招领处",
      short: "失物",
      subtitle: "被遗落的东西也会记得",
      image: "assets/lost.webp",
      hotspots: [
        { id: "shelf", label: "失物货架", x: 14, y: 10, w: 26, h: 77, icon: "search" },
        { id: "mirror", label: "旧镜子", x: 41, y: 10, w: 23, h: 44, icon: "mirror" },
        { id: "recorder", label: "磁带录音机", x: 52, y: 48, w: 15, h: 19, icon: "radio" },
        { id: "logbook", label: "值班日志", x: 38, y: 52, w: 16, h: 18, icon: "note" },
        { id: "fuseBox", label: "信号配电箱", x: 61, y: 5, w: 21, h: 51, icon: "signal" }
      ]
    }
  };

  const ITEMS = {
    coin: { name: "旧硬币", persistent: false, description: "边缘磨得发亮，年份被磨平了。售货机或许还认得它。" },
    dayTicket: { name: "单程车票", persistent: false, description: "目的地一栏只有两个字：前方。检票口会接受它。" },
    brassKey: { name: "失物室钥匙", persistent: false, description: "系着褪色蓝线的黄铜钥匙，能打开失物招领处。" },
    paperCrane: { name: "黄色纸鹤", persistent: false, description: "折痕里藏着一小片月光。女孩一直在找它。" },
    cassette: { name: "无标签磁带", persistent: false, description: "A 面用铅笔写着很淡的“给小满”。需要录音机和电池。" },
    batteries: { name: "两节电池", persistent: false, description: "从候车室收音机里取出的电池，还剩一些电。" },
    minuteHand: { name: "时钟分针", persistent: false, description: "录音机停止后，从带仓里弹出的细长金属针。" },
    photoA: { name: "半张合照 · 左", persistent: true, description: "照片上是十七岁的阿遥。断口刚好把另一个孩子留在了另一边。记忆物品，循环后保留。" },
    photoB: { name: "半张合照 · 右", persistent: true, description: "照片上戴着黄围巾的孩子，眉眼像极了镜中的你。记忆物品，循环后保留。" },
    photo: { name: "拼好的合照", persistent: true, description: "阿遥和小满并肩站在海边。背面写着：‘等你来找我。’记忆物品，循环后保留。" },
    clockKey: { name: "黄铜发条钥匙", persistent: true, description: "柄上刻着一只衔着纸鹤的鸟。它能给站台时钟重新上弦。记忆物品，循环后保留。" }
  };

  const CLUES = {
    stoppedClock: { title: "停在 00:00 的钟", tag: "车站", text: "时钟不是没电：齿轮完好，唯独少了分针。发条孔旁刻着一句话：‘让第七分钟继续。’" },
    stationSign: { title: "站牌上缺失的名字", tag: "车站", text: "站牌只能辨认出‘白’与‘站’，中间的字像被水浸过。站名也许能在售票处的旧资料里补全。" },
    timetable: { title: "四班被取消的列车", tag: "谜题", text: "时刻表上只有四班车还没有褪色：月亮 7 点、纸鹤 3 点、雨伞 1 点、星星 9 点。每个图案旁都画着一把小锁。" },
    drawing: { title: "画里的顺序", tag: "谜题", text: "儿童画底部依次画着：月亮 → 纸鹤 → 雨伞 → 星星。右上角签着两个名字：阿遥、小满。" },
    lockerCode: { title: "寄存柜的四位密码", tag: "已推导", text: "按照儿童画的顺序读取时刻表：月亮 7、纸鹤 3、雨伞 1、星星 9。密码是 7319。" },
    paperCrane: { title: "不会被重置的纸鹤", tag: "女孩", text: "女孩接过纸鹤时，站台的灯闪了一下。下一轮里，她仍然记得这件小事。并非所有痕迹都会消失。" },
    promise: { title: "海边的约定", tag: "女孩", text: "合照背面是阿遥的字：‘小满，等你来找我。’照片中的黄围巾，和站台女孩戴的是同一条。" },
    interference: { title: "广播里的杂音", tag: "车站", text: "取下收音机的电池后，候车室安静了，站台广播却变得清楚。它一直在重复：‘请小满接听电话。’" },
    tape: { title: "磁带里姐姐的声音", tag: "真相", text: "阿遥在录音里说：‘小满，是我把你推上车的。不要再说是你抛下了我。你当时只有七岁。’" },
    sevenMinutes: { title: "真正的发车时间", tag: "真相", text: "录音最后提到：救援列车直到 00:07 才离站。车站真正无法跨过的，是这七分钟。" },
    attendant: { title: "钟叔记得那场事故", tag: "钟叔", text: "看到合照后，钟叔终于承认：他当年是这里的值班员。站里的他，是没能下班的一段记忆。" },
    keeper: { title: "发条钥匙", tag: "钟叔", text: "钟叔把修钟钥匙交给了你。他说：‘钟可以继续走，但你得先承认自己是谁。’" },
    staffLog: { title: "最后一页值班日志", tag: "真相", text: "6 月 17 日，00:07。救援列车已离站。乘客名单写着：林小满，7 岁，已获救；林遥，17 岁，下落不明。记录从未写过‘死亡’。" },
    staffYears: { title: "合影里的纸鹤", tag: "伏笔", text: "年轻时的钟叔胸前别着一枚纸鹤形徽章，和发条钥匙柄上的图案相同。他身边的电话没有接电话线。" },
    lostProperty: { title: "无人领取的黄围巾", tag: "伏笔", text: "货架登记卡写着：黄围巾一条，每年都有人把它送回。领取人一栏只有一个‘林’字。" },
    stationName: { title: "白鹭站", tag: "车站", text: "票价表顶端印着完整站名：白鹭站。站牌缺失的字是‘鹭’，票根上的白鹭图案与纸鹤折法相同。" },
    phoneCall: { title: "电话另一端", tag: "未解", text: "拨通 0007 后，一个成年女人的声音叫了你‘小满’。她说：‘如果你愿意走出来，我会一直在白鹭站等你。’背景里也有海浪。" },
    mirror: { title: "镜中的年纪", tag: "真相", text: "镜中不是七岁的孩子，而是一个疲惫的成年人。你早已长大，只是记忆里的自己还坐在那张长椅上。" },
    signal: { title: "03 号信号的绿灯", tag: "车站", text: "配电箱的第三路信号线接着站台广播。扳动后，远处的红灯短暂变成绿色，电话铃也随之响了一声。" },
    lastPromise: { title: "还没下车的乘客", tag: "未解", text: "钟叔说：‘你姐姐只拜托我拦住那个总想独自离开的孩子。至于电话那边的人，你该亲自回答她。’" },
    timeMoves: { title: "00:07", tag: "真相", text: "分针第一次越过午夜。女孩不再看轨道，而是看向你。现在可以在列车进站时作出真正的选择。" },
    reflection: { title: "镜外的海浪声", tag: "伏笔", text: "接完电话后，镜子里短暂出现了白天的白鹭站。两个成年人的影子站在站牌下，其中一个围着黄围巾。" }
  };

  const ENDINGS = {
    normal: {
      eyebrow: "普通结局",
      title: "下一站，仍是午夜",
      subtitle: "你离开了站台，却没有离开那一天。",
      className: "ending-normal"
    },
    true: {
      eyebrow: "真结局",
      title: "零点之后的第七分钟",
      subtitle: "这一次，你没有把任何一个自己留在身后。",
      className: "ending-true"
    },
    hidden: {
      eyebrow: "隐藏结局",
      title: "白鹭归来",
      subtitle: "有些等待不是为了留住你，而是为了接你回家。",
      className: "ending-hidden"
    }
  };

  return { LOOP_SECONDS, TRAIN_AT, SCENES, ITEMS, CLUES, ENDINGS };
});
