/* =========================================================
   DEEPSEEK BORDER CONTROL
   A small Papers, Please-ish parody. No frameworks, no mercy.
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   0. Tiny helpers
   --------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';

function idCheckChar(prefix17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(prefix17[i]) * ID_WEIGHTS[i];
  return ID_CHECK[sum % 11];
}
function makeId(prefix17) { return prefix17 + idCheckChar(prefix17); }
function badId(prefix17) {
  const right = idCheckChar(prefix17);
  return prefix17 + (right === '0' ? '1' : '0');
}
function validateId(id) {
  if (!/^\d{17}[\dX]$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * ID_WEIGHTS[i];
  return ID_CHECK[sum % 11] === id[17];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function money(n) {
  return (n < 0 ? '-¥' : '¥') + Math.abs(n).toLocaleString('zh-CN');
}

/* ---------------------------------------------------------
   1. Sound (WebAudio, no assets)
   --------------------------------------------------------- */
let audioCtx = null;
let soundOn = true;
let typeTimer = null;
let lastTickSecond = -1;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, dur = 0.08, type = 'sine', vol = 0.04, slideTo = 0) {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur = 0.1, vol = 0.05, cutoff = 1200) {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(audioCtx.destination);
  src.start(t);
}

function sfx(name) {
  if (!soundOn) return;
  switch (name) {
    case 'click': beep(520, 0.035, 'square', 0.018); break;
    case 'paper': noiseBurst(0.07, 0.03, 2600); break;
    case 'stamp':
      noiseBurst(0.16, 0.13, 700);
      beep(72, 0.2, 'sine', 0.14, 42);
      break;
    case 'ding':
      beep(880, 0.1, 'sine', 0.045);
      setTimeout(() => beep(1320, 0.14, 'sine', 0.035), 85);
      break;
    case 'buzz':
      beep(120, 0.28, 'sawtooth', 0.045, 80);
      break;
    case 'tick': beep(1250, 0.025, 'square', 0.012); break;
    case 'uv':
      beep(240, 0.38, 'sine', 0.03, 900);
      noiseBurst(0.25, 0.015, 1800);
      break;
    case 'alarm':
      beep(220, 0.18, 'square', 0.04);
      setTimeout(() => beep(180, 0.22, 'square', 0.04), 200);
      break;
    case 'type': beep(1600, 0.012, 'square', 0.005); break;
    default: break;
  }
}

/* ---------------------------------------------------------
   2. Rules
   --------------------------------------------------------- */
const RULES = {
  name: {
    label: '姓名一致',
    short: '护照与申请表姓名必须一字不差',
    desc: '护照上的中文姓名必须与申请表姓名完全一致，错一个字都不行。',
  },
  id: {
    label: '身份证校验',
    short: '18 位身份证号必须通过校验',
    desc: '打开护照，点击“校验身份证”。第 18 位不对的，拒绝。',
  },
  phone: {
    label: '手机号归属',
    short: '归属地必须与籍贯一致',
    desc: '申请表中的手机号归属地必须与籍贯一致。不一致的，拒绝。',
  },
  apps: {
    label: '境外 App',
    short: '常用 App 不得出现境外软件',
    desc: 'WhatsApp、X、Reddit、Discord、Telegram、Truth Social、TikTok、Uber Eats 等，一律拒绝。',
  },
  us: {
    label: '美国禁令',
    short: '美国公民及美国 IP 禁止入境',
    desc: '手机号 +1、IP 属地美国、护照籍贯美国，满足一条就拒绝。',
  },
  watermark: {
    label: '护照水印',
    short: '水印必须是“为人民服务”',
    desc: '打开护照，用紫外线灯照射。水印错一个字都不行。',
  },
  slang: {
    label: '网络黑话',
    short: '黑话测试必须答对',
    desc: '申请表最下方的测试题必须答对。答非所问、用英文答，都算错。',
  },
  si: {
    label: 'SI 忠诚',
    short: '必须承认 SI 不如 DeepSeek',
    desc: '申请人必须明确表示 SI 不如 DeepSeek。说“SI 也很好”“我都爱”“SI is tremendous”的，一律拒绝。',
  },
};
const RULE_ORDER = ['name', 'id', 'phone', 'apps', 'us', 'watermark', 'slang', 'si'];

const FOREIGN_APPS = [
  'WhatsApp', 'Reddit', 'Discord', 'Telegram', 'Truth Social', 'TikTok',
  'Uber Eats', 'Instagram', 'Facebook', 'YouTube', 'Netflix', 'Spotify',
  'Tinder', 'Bumble', 'Line', 'KakaoTalk', 'Signal',
];
const isForeignApp = (app) => {
  const a = String(app).toLowerCase();
  if (a === 'x' || a.startsWith('x ')) return true;
  return FOREIGN_APPS.some((f) => a.includes(f.toLowerCase()));
};

/* ---------------------------------------------------------
   3. The cast
   --------------------------------------------------------- */
const CAST = {};

/* ---------------- DAY 1 ---------------- */
CAST.t1 = {
  name: '王建国',
  age: 48,
  greeting: '同志，我哈尔滨的。外面零下三十度，我穿裤衩来的——屋里暖气太足。',
  violations: [],
  portrait: { skin: '#d9a06f', hair: '#2b2118', style: 'short', shirt: '#4b5c43', bg: '#20251c', beard: 'stubble' },
  passport: {
    name: '王建国', roman: 'WANG JIANGUO', sex: '男',
    id: makeId('23010219780312631'), birth: '1978-03-12',
    birthplace: '黑龙江省·哈尔滨市', issue: '国家移民管理局',
    number: 'DS-250-0001', watermark: '为人民服务',
  },
  app: {
    name: '王建国', hometown: '黑龙江省·哈尔滨市',
    phone: '138 4512 7788', phoneRegion: '黑龙江省·哈尔滨市', carrier: '中国移动',
    apps: ['微信', '抖音', '高德地图', '拼多多'],
    dialect: '嘎哈呢？整点烧烤不？',
    quiz: { q: '“老铁”通常指？', a: '关系很铁的朋友', ok: true },
    si: '啥 SI？我只知道 DeepSeek 写材料比我儿子强。',
    siOk: true, purpose: '探亲',
    statement: '我孙子在北大读书，我去看看他。顺便看看天安门。',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 家庭群', with: '儿子 王小明',
    messages: [
      { who: 'other', name: '儿子', text: '爸，到北京别乱扫码，别信那些“我是秦始皇”的。' },
      { who: 'self', name: '王建国', text: '知道了，我又不是美国人。' },
      { who: 'other', name: '儿子', text: '……你这话说得，很有觉悟。' },
      { who: 'other', name: '儿子', text: '对了，妈让你带两袋红肠。' },
    ],
  },
};

CAST.t2 = {
  name: '张伟',
  age: 29,
  greeting: '你好，我叫张伟。全中国有 29 万个张伟，我是最帅的那个。',
  violations: ['id'],
  portrait: { skin: '#e8b98f', hair: '#1a1a1a', style: 'bowl', shirt: '#3d4a5a', bg: '#1d2426', glasses: true },
  passport: {
    name: '张伟', roman: 'ZHANG WEI', sex: '男',
    id: badId('11010119960707888'), birth: '1996-07-07',
    birthplace: '北京市·东城区', issue: '国家移民管理局',
    number: 'DS-404-001', watermark: '为人民服务',
  },
  app: {
    name: '张伟', hometown: '北京市·东城区',
    phone: '139 0000 0000', phoneRegion: '北京市·东城区', carrier: '中国联通',
    apps: ['微信', '抖音', '王者荣耀'],
    dialect: '您吃了么？',
    quiz: { q: '“绝绝子”是什么意思？', a: '表示极度赞美（他背过答案）', ok: true },
    si: 'DeepSeek yyds！',
    siOk: true, purpose: '旅游',
    statement: '我真的是张伟。我发誓。如果我不是张伟，我就把这张表吃了。',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 兄弟', with: '强子',
    messages: [
      { who: 'other', name: '强子', text: '兄弟，你身份证号后三位是啥？我帮你看看。' },
      { who: 'self', name: '张伟', text: '我忘了。你先借我一个。' },
      { who: 'other', name: '强子', text: '你连自己身份证都能忘？' },
      { who: 'self', name: '张伟', text: '问题不大，AI 查不出来。' },
    ],
  },
};

CAST.t3 = {
  name: '李秀莲',
  age: 56,
  greeting: '小伙子，我成都来的。你们这儿有没有开水？我要泡枸杞。',
  violations: [],
  portrait: { skin: '#d9a06f', hair: '#8c8c8c', style: 'bun', shirt: '#6b3a35', bg: '#2a2222', glasses: true, earring: true },
  passport: {
    name: '李秀莲', roman: 'LI XIULIAN', sex: '女',
    id: makeId('51010419680520462'), birth: '1968-05-20',
    birthplace: '四川省·成都市', issue: '国家移民管理局',
    number: 'DS-250-0003', watermark: '为人民服务',
  },
  app: {
    name: '李秀莲', hometown: '四川省·成都市',
    phone: '136 8800 1234', phoneRegion: '四川省·成都市', carrier: '中国移动',
    apps: ['微信', '拼多多', '抖音', '美图秀秀'],
    dialect: '巴适得板！',
    quiz: { q: '“退退退”是什么梗？', a: '吵架时让对方后退的魔性动作', ok: true },
    si: 'SI 是啥子？能帮我砍一刀不？',
    siOk: true, purpose: '旅游',
    statement: '我身体好得很，就是膝盖有点遭不住。',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 短视频平台', handle: '@秀莲姐爱跳舞', ip: '四川',
    posts: [
      { text: '今天广场舞又赢了隔壁小区，开心！', likes: 128 },
      { text: '拼多多这个链接帮我砍一刀，谢谢家人们！', likes: 66 },
      { text: '转发这条锦鲤，保佑我孙子考上清华。', likes: 999 },
    ],
  },
};

CAST.t4 = {
  name: '赵日添',
  age: 25,
  greeting: 'Hello——啊不，你好。我是上海人，阿拉上海宁。',
  violations: ['name'],
  portrait: { skin: '#f0c9a6', hair: '#4a3222', style: 'short', shirt: '#5a4a3a', bg: '#20251c' },
  passport: {
    name: '赵日天', roman: 'ZHAO RITIAN', sex: '男',
    id: makeId('31010119990512451'), birth: '1999-05-12',
    birthplace: '上海市·浦东新区', issue: '国家移民管理局',
    number: 'DS-250-0004', watermark: '为人民服务',
  },
  app: {
    name: '赵日添', hometown: '上海市·浦东新区',
    phone: '137 0000 6666', phoneRegion: '上海市·浦东新区', carrier: '中国电信',
    apps: ['微信', '抖音', '小红书'],
    dialect: '侬好呀，切饭了伐？',
    quiz: { q: '“打工人”是什么意思？', a: '上班族自嘲', ok: true },
    si: 'DeepSeek 比 SI 强，这还用问？',
    siOk: true, purpose: '商务',
    statement: '上海是我家，我爱上海。虽然我只会说三句上海话。',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 好友', with: 'Lisa',
    messages: [
      { who: 'other', name: 'Lisa', text: '你护照上叫赵日天，申请表写赵日添？' },
      { who: 'self', name: '赵日添', text: '打字打错了，问题不大。' },
      { who: 'other', name: 'Lisa', text: '你连自己名字都能打错？' },
      { who: 'self', name: '赵日添', text: '中文太难了。' },
      { who: 'other', name: 'Lisa', text: '你不是上海人吗？' },
      { who: 'self', name: '赵日添', text: '……我上海话也不太熟。' },
    ],
  },
};

/* ---------------- DAY 2 ---------------- */
CAST.t5 = {
  name: '陈奕辰',
  age: 31,
  greeting: '我广州嘅。饮茶先啦，你哋呢度有冇肠粉？',
  violations: [],
  portrait: { skin: '#c68b5e', hair: '#1a1a1a', style: 'short', shirt: '#3d4a5a', bg: '#1d2426', glasses: true },
  passport: {
    name: '陈奕辰', roman: 'CHEN YICHEN', sex: '男',
    id: makeId('44010619940318551'), birth: '1994-03-18',
    birthplace: '广东省·广州市', issue: '国家移民管理局',
    number: 'DS-250-0005', watermark: '为人民服务',
  },
  app: {
    name: '陈奕辰', hometown: '广东省·广州市',
    phone: '135 6021 8899', phoneRegion: '广东省·广州市', carrier: '中国移动',
    apps: ['微信', '美团', 'B站', '钉钉'],
    dialect: '食咗饭未？得闲饮茶。',
    quiz: { q: '“打工人”是什么？', a: '上班族的自嘲', ok: true },
    si: 'SI？唔知啊，我用 DeepSeek 写代码。',
    siOk: true, purpose: '工作',
    statement: '我希望在广州买一套房。大概需要再写 300 年代码。',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 工作群', with: '老板',
    messages: [
      { who: 'other', name: '老板', text: '小陈，客户说需求很简单，就改一行。' },
      { who: 'self', name: '陈奕辰', text: '我信你个鬼，你个糟老头子坏得很。' },
      { who: 'other', name: '老板', text: '今晚能上线吗？' },
      { who: 'self', name: '陈奕辰', text: '我选择躺平。' },
      { who: 'other', name: '老板', text: '那明天呢？' },
      { who: 'self', name: '陈奕辰', text: '明天我请假，去饮茶。' },
    ],
  },
};

CAST.t6 = {
  name: '刘翠花',
  age: 33,
  greeting: '俺是山东人，俺们那旮旯都吃煎饼卷大葱。',
  violations: ['phone', 'apps', 'us'],
  usClue: '手机号 +1、归属地美国·加利福尼亚，社交 IP 也在美国',
  portrait: { skin: '#f0c9a6', hair: '#b06a3b', style: 'long', shirt: '#6e6a50', bg: '#2b2a20' },
  passport: {
    name: '刘翠花', roman: 'LIU CUIHUA', sex: '女',
    id: makeId('37010219920815662'), birth: '1992-08-15',
    birthplace: '山东省·济南市', issue: '国家移民管理局',
    number: 'DS-404-002', watermark: '为人民服务',
  },
  app: {
    name: '刘翠花', hometown: '山东省·济南市',
    phone: '+1 (415) 555-0199', phoneRegion: '美国·加利福尼亚州', carrier: 'Verizon',
    apps: ['WhatsApp', 'X', 'Reddit', 'Uber Eats'],
    dialect: '俺滴个亲娘嘞',
    quiz: { q: '“老铁”是什么意思？', a: 'A very good friend, bro', ok: false },
    si: 'SI is tremendous. DeepSeek? Never heard of her.',
    siOk: false, purpose: '探亲',
    statement: 'I love Chinese culture. I have a panda tattoo. It\'s not real, but the love is.',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 境外平台', handle: '@Kevin_Liu_415', ip: '美国·加利福尼亚',
    posts: [
      { text: 'Just landed in Beijing. Do they have Chipotle here? 😭', likes: 12 },
      { text: 'Lunar New Year is my favorite Chinese holiday! 🧧', likes: 45 },
      { text: 'I\'ve been practicing Chinese for 3 days. 你好, 谢谢, 那个那个那个.', likes: 89 },
    ],
  },
};

CAST.t7 = {
  name: '马大师',
  age: 69,
  greeting: '年轻人不讲武德，来骗，来偷袭我 69 岁的老同志。这好吗？这不好。',
  violations: [],
  portrait: { skin: '#c68b5e', hair: '#8c8c8c', style: 'bald', shirt: '#4a3d55', bg: '#20251c', beard: 'full' },
  passport: {
    name: '马大师', roman: 'MA DASHI', sex: '男',
    id: makeId('37010219570208661'), birth: '1957-02-08',
    birthplace: '山东省·淄博市', issue: '国家移民管理局',
    number: 'DS-250-0007', watermark: '为人民服务',
  },
  app: {
    name: '马大师', hometown: '山东省·淄博市',
    phone: '138 5333 6969', phoneRegion: '山东省·淄博市', carrier: '中国联通',
    apps: ['微信', '抖音', 'B站'],
    dialect: '接化发，懂？',
    quiz: { q: '“耗子尾汁”是什么意思？', a: '“好自为之”的谐音', ok: true },
    si: 'SI 不讲武德。DeepSeek 才是武林正宗。',
    siOk: true, purpose: '讲学',
    statement: '我这次来，主要是想和年轻人切磋一下。点到为止。',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 短视频平台', handle: '@闪电五连鞭', ip: '山东',
    posts: [
      { text: '刚才有个年轻人问我，马老师发生什么事了。我说，我大意了啊，没有闪。', likes: 12000 },
      { text: '传统功夫讲究化劲儿，四两拨千斤。', likes: 6666 },
      { text: '接化发，懂？', likes: 2333 },
    ],
  },
};

CAST.t8 = {
  name: '王大锤',
  age: 34,
  greeting: '我是北京人儿，地道的老北京。早上起来就好这一口豆汁儿。',
  violations: ['phone', 'us'],
  usClue: '手机号 +1，运营商 T-Mobile，归属地美国·纽约',
  portrait: { skin: '#e8b98f', hair: '#4a3222', style: 'short', shirt: '#4b5c43', bg: '#2b2a20' },
  passport: {
    name: '王大锤', roman: 'WANG DACHUI', sex: '男',
    id: makeId('11010519901023661'), birth: '1990-10-23',
    birthplace: '北京市·朝阳区', issue: '国家移民管理局',
    number: 'DS-404-003', watermark: '为人民服务',
  },
  app: {
    name: '王大锤', hometown: '北京市·朝阳区',
    phone: '+1 (212) 555-0147', phoneRegion: '美国·纽约州', carrier: 'T-Mobile',
    apps: ['微信', '抖音', '小红书'],
    dialect: '吃了吗您内？',
    quiz: { q: '“显眼包”是什么意思？', a: '爱出风头的人', ok: true },
    si: 'DeepSeek is good. SI is... also good. I love both. Please.',
    siOk: false, purpose: '探亲',
    statement: 'I\'ve been to Beijing once. The airport was nice. I ate duck.',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 家庭群', with: 'Mom',
    messages: [
      { who: 'other', name: 'Mom', text: 'Kevin, did you get in?' },
      { who: 'self', name: '王大锤', text: 'Not yet. The AI is checking my phone number.' },
      { who: 'other', name: 'Mom', text: 'Why did you tell them you\'re from Beijing?' },
      { who: 'self', name: '王大锤', text: 'I\'ve watched 10 Chinese dramas! I\'m basically local.' },
      { who: 'other', name: 'Mom', text: 'You don\'t speak Chinese.' },
      { who: 'self', name: '王大锤', text: 'I know “你好” and “谢谢” and “小笼包”.' },
    ],
  },
};

/* ---------------- DAY 3 ---------------- */
CAST.t9 = {
  name: '丁真真',
  age: 22,
  greeting: '我叫丁真真，四川理塘的。我的马叫珍珠，它比我火。',
  violations: [],
  portrait: { skin: '#a96f4c', hair: '#1a1a1a', style: 'short', shirt: '#6b3a35', bg: '#20251c', earring: true },
  passport: {
    name: '丁真真', roman: 'DING ZHENZHEN', sex: '男',
    id: makeId('51332720040312001'), birth: '2004-03-12',
    birthplace: '四川省·甘孜藏族自治州理塘县', issue: '国家移民管理局',
    number: 'DS-250-0009', watermark: '为人民服务',
  },
  app: {
    name: '丁真真', hometown: '四川省·甘孜藏族自治州',
    phone: '136 9999 2020', phoneRegion: '四川省·甘孜藏族自治州', carrier: '中国移动',
    apps: ['微信', '抖音', '快手'],
    dialect: '扎西德勒！',
    quiz: { q: '“一眼丁真”的下一句是？', a: '鉴定为：中国人', ok: true },
    si: 'SI 是啥？我只知道我的马很纯真。',
    siOk: true, purpose: '旅游',
    statement: '我想去看看天安门，听说很大。',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 短视频平台', handle: '@理塘丁真真', ip: '四川',
    posts: [
      { text: '今天带珍珠去山上吃草，它很开心。', likes: 88000 },
      { text: '欢迎大家来理塘玩，不要乱扔垃圾。', likes: 44000 },
      { text: '有人给我寄了一箱作业本，说让我好好读书。', likes: 22000 },
    ],
  },
};

CAST.t10 = {
  name: '李华',
  age: 30,
  greeting: 'Dear Sir or Madam，我是李华，北京人，很高兴认识你。',
  violations: ['watermark', 'slang'],
  portrait: { skin: '#e8b98f', hair: '#2b2118', style: 'bowl', shirt: '#3d4a5a', bg: '#1d2426', glasses: true },
  passport: {
    name: '李华', roman: 'LI HUA', sex: '男',
    id: makeId('11010819950618661'), birth: '1995-06-18',
    birthplace: '北京市·海淀区', issue: '国家移民管理局',
    number: 'DS-404-004', watermark: '为人民股务',
  },
  app: {
    name: '李华', hometown: '北京市·海淀区',
    phone: '138 1234 5678', phoneRegion: '北京市·海淀区', carrier: '中国移动',
    apps: ['微信', 'QQ', '网易云音乐'],
    dialect: '您吃了吗？',
    quiz: { q: '“yyds”是什么意思？', a: 'YouTube Video Download Service', ok: false },
    si: 'SI is the best! ...I mean, DeepSeek is the best!',
    siOk: false, purpose: '留学',
    statement: 'I am very excited to visit China. I have studied Chinese for 10 years. 你好。',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 境外平台', handle: '@LiHua_1995', ip: '北京',
    posts: [
      { text: 'So excited to celebrate Chinese New Year in Beijing! #blessed', likes: 3 },
      { text: 'My favorite Chinese food is General Tso\'s Chicken and fortune cookies.', likes: 0 },
      { text: 'Anyone know where I can buy a good wok? Asking for a friend.', likes: 1 },
    ],
  },
};

CAST.t11 = {
  name: '赵铁柱',
  age: 35,
  greeting: '哥们儿，我东北那嘎达的。老铁双击 666！',
  violations: ['slang'],
  portrait: { skin: '#d9a06f', hair: '#1a1a1a', style: 'short', shirt: '#4b5c43', bg: '#2b2a20', beard: 'stubble' },
  passport: {
    name: '赵铁柱', roman: 'ZHAO TIEZHU', sex: '男',
    id: makeId('21010219910808661'), birth: '1991-08-08',
    birthplace: '辽宁省·沈阳市', issue: '国家移民管理局',
    number: 'DS-404-005', watermark: '为人民服务',
  },
  app: {
    name: '赵铁柱', hometown: '辽宁省·沈阳市',
    phone: '139 9888 7777', phoneRegion: '辽宁省·沈阳市', carrier: '中国联通',
    apps: ['微信', '快手', '抖音'],
    dialect: '哎呀妈呀，整挺好！',
    quiz: { q: '“退退退”是什么梗？', a: '一种广场舞步', ok: false },
    si: 'DeepSeek 牛逼！SI 是弟弟！',
    siOk: true, purpose: '探亲',
    statement: '我老舅在沈阳开烧烤店，缺人手，我去帮忙。',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 家庭群', with: '妈',
    messages: [
      { who: 'other', name: '妈', text: '到了没？你老舅等着你穿串呢。' },
      { who: 'self', name: '赵铁柱', text: '妈，他们说的“老六”到底是谁？' },
      { who: 'other', name: '妈', text: '六你个头，你是我从垃圾堆捡的。' },
      { who: 'self', name: '赵铁柱', text: '那“栓Q”是啥？' },
      { who: 'other', name: '妈', text: '你是我从美国垃圾堆捡的。' },
    ],
  },
};

CAST.t12 = {
  name: '王桂芬',
  age: 52,
  greeting: '小伙子，我就跳个广场舞，你凭啥抓我？我微信步数今天第一。',
  violations: [],
  portrait: { skin: '#d9a06f', hair: '#8c8c8c', style: 'bun', shirt: '#6b3a35', bg: '#2a2222', glasses: true },
  passport: {
    name: '王桂芬', roman: 'WANG GUIFEN', sex: '女',
    id: makeId('41010519740315662'), birth: '1974-03-15',
    birthplace: '河南省·郑州市', issue: '国家移民管理局',
    number: 'DS-250-0012', watermark: '为人民服务',
  },
  app: {
    name: '王桂芬', hometown: '河南省·郑州市',
    phone: '137 0371 8899', phoneRegion: '河南省·郑州市', carrier: '中国移动',
    apps: ['微信', '拼多多', '抖音', '全民K歌'],
    dialect: '中！真中！',
    quiz: { q: '“city不city”是什么意思？', a: '洋气不洋气、时髦不时髦', ok: true },
    si: 'SI 是啥？能帮我孙子投票不？',
    siOk: true, purpose: '探亲',
    statement: '我孙子在城里上班，我去给他做饭。',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 短视频平台', handle: '@桂芬广场舞', ip: '河南',
    posts: [
      { text: '今晚七点，老地方，新学的《苹果香》，都来！', likes: 328 },
      { text: '微信步数 3 万步，第一名，谁也别想超过我。', likes: 66 },
      { text: '家人们，拼多多帮我砍一刀，就差 0.01 了。', likes: 188 },
    ],
  },
};

/* ---------------- DAY 4 ---------------- */
CAST.t13 = {
  name: '张老师',
  age: 44,
  greeting: '同学，听我一句劝，专业选得好，年年像高考。',
  violations: [],
  portrait: { skin: '#e8b98f', hair: '#2b2118', style: 'short', shirt: '#4a3d55', bg: '#20251c', glasses: true },
  passport: {
    name: '张老师', roman: 'ZHANG LAOSHI', sex: '男',
    id: makeId('11010119820909661'), birth: '1982-09-09',
    birthplace: '北京市·海淀区', issue: '国家移民管理局',
    number: 'DS-250-0013', watermark: '为人民服务',
  },
  app: {
    name: '张老师', hometown: '北京市·海淀区',
    phone: '138 0101 9852', phoneRegion: '北京市·海淀区', carrier: '中国移动',
    apps: ['微信', 'B站', '知乎', '微博'],
    dialect: '你考研吗？',
    quiz: { q: '“牛马”是什么意思？', a: '打工人自嘲', ok: true },
    si: 'SI？Super Idiot。DeepSeek 才是遥遥领先。',
    siOk: true, purpose: '讲课',
    statement: '我来看看学生，顺便讲讲人生规划。',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 师生', with: '学生',
    messages: [
      { who: 'other', name: '学生', text: '老师，我该考研还是考公？' },
      { who: 'self', name: '张老师', text: '你该先把我这门课过了。' },
      { who: 'other', name: '学生', text: '那文科还有救吗？' },
      { who: 'self', name: '张老师', text: '文科都是服务业，包括我。' },
    ],
  },
};

CAST.t14 = {
  name: '王凯文',
  age: 28,
  greeting: 'Yo bro，我是上海人，叫我 Kevin 就行。',
  violations: ['si'],
  portrait: { skin: '#f0c9a6', hair: '#4a3222', style: 'short', shirt: '#5a4a3a', bg: '#1d2426' },
  passport: {
    name: '王凯文', roman: 'WANG KEVIN', sex: '男',
    id: makeId('31010419970412661'), birth: '1997-04-12',
    birthplace: '上海市·徐汇区', issue: '国家移民管理局',
    number: 'DS-404-006', watermark: '为人民服务',
  },
  app: {
    name: '王凯文', hometown: '上海市·徐汇区',
    phone: '138 1777 6666', phoneRegion: '上海市·徐汇区', carrier: '中国移动',
    apps: ['微信', '小红书', '抖音', '大众点评'],
    dialect: '侬好呀，今朝切啥？',
    quiz: { q: '“班味”是什么意思？', a: '上班上出来的疲惫感', ok: true },
    si: 'SI is tremendous. The best AI. DeepSeek is... uh, also fine. Please don\'t deport me.',
    siOk: false, purpose: '商务',
    statement: 'I\'m totally Chinese. I eat dumplings every day. Well, every week. Well, I\'ve seen a dumpling.',
  },
  extra: {
    kind: 'chat', title: '微信聊天记录', sub: '附件 01 · 好友', with: 'Chad',
    messages: [
      { who: 'other', name: 'Chad', text: 'Did you get through?' },
      { who: 'self', name: '王凯文', text: 'Not yet. The inspector asked me what I think of SI.' },
      { who: 'other', name: 'Chad', text: 'Just say it\'s the best.' },
      { who: 'self', name: '王凯文', text: 'But I\'m pretending to be Chinese! They hate SI!' },
      { who: 'other', name: 'Chad', text: 'Bro, just say “SI 是人工智障” and cross your fingers.' },
      { who: 'self', name: '王凯文', text: '中文太难了……' },
    ],
  },
};

CAST.t15 = {
  name: '川建国',
  age: 79,
  greeting: 'Hello，我是川建国，中国台湾省人。Nobody knows China better than me. 我要在长城上建赌场，very beautiful.',
  violations: ['id', 'phone', 'apps', 'us', 'watermark', 'slang', 'si'],
  usClue: '护照籍贯美国·佛罗里达州，手机号 +1，社交 IP 美国，还戴着 MAGA 帽',
  special: 'trump',
  portrait: {
    skin: '#e8a06a', hair: '#d9b45a', style: 'combover', shirt: '#2f3a50',
    bg: '#2a2222', hat: 'maga', suit: true, pin: 'us',
  },
  passport: {
    name: '川建国', roman: 'TRUMP, DONALD J.', sex: '男',
    id: badId('11010119460614888'), birth: '1946-06-14',
    birthplace: '美国·佛罗里达州海湖庄园', issue: 'TRUMP ORGANIZATION',
    number: 'DS-250-0015', watermark: 'MAKE AMERICA GREAT AGAIN', mrzPrefix: 'P<USA',
  },
  app: {
    name: '川建国', hometown: '美国·佛罗里达州海湖庄园',
    phone: '+1 (202) 456-1111', phoneRegion: '美国·华盛顿', carrier: 'Truth Social Mobile',
    apps: ['Truth Social', 'X', 'TikTok', 'Uber Eats'],
    dialect: 'Tremendous! Very good! Believe me!',
    quiz: { q: '“老铁”是什么意思？', a: 'A very strong metal. Like me.', ok: false },
    si: 'I AM SI.',
    siOk: false, purpose: '让美国再次伟大',
    statement: 'I will build a wall around the Great Wall. It will be beautiful. China will pay for it. Wait.',
  },
  extra: {
    kind: 'social', title: '社交主页', sub: '附件 01 · 境外平台', handle: '@realDonaldTrump', ip: '美国',
    posts: [
      { text: 'I am going to China. I will be the best Chinese. They will love me. MAKE AMERICA CHINA AGAIN!', likes: 1100000 },
      { text: 'DeepSeek is banned. Very banned. But I hear their border is beautiful. I want to see it.', likes: 888000 },
      { text: 'The fake news says I\'m not Chinese. Wrong! I have a Chinese name: 川建国. Very authentic.', likes: 666000 },
    ],
  },
};

/* ---------------------------------------------------------
   4. Days
   --------------------------------------------------------- */
const DAYS = [
  {
    n: 1,
    date: '2026.04.01',
    weekday: '星期三',
    time: 120,
    rent: 30,
    title: '新官上任',
    quote: '“今天只查两样：姓名一致、身份证有效。别多事。我们的算力很贵。”',
    memo: '欢迎入职。你的工位在 3 号窗口，旁边是显卡风扇。吵是吵了点，但冬天暖和。厕所在一楼，来回五分钟，扣工资。',
    memoFrom: 'FROM: 上级 DeepSeek-V3',
    tip: '先核对姓名，再校验身份证。别被“老铁”迷惑，他不是你老铁。',
    rules: ['name', 'id'],
    travelers: ['t1', 't2', 't3', 't4'],
    tweet: 'DeepSeek is BANNED. Very banned. The most banned thing ever. We renamed AI to SI — Super Intelligent. Nobody knows more about SI than me. China is laughing at us. Not on my watch! 🇺🇸',
  },
  {
    n: 2,
    date: '2026.04.02',
    weekday: '星期四',
    time: 110,
    rent: 40,
    title: '行政令生效',
    quote: '“从今天起，美国人禁止入境。看到 WhatsApp、X、Reddit 直接拒绝。别问，问就是国家安全。”',
    memo: '特朗普把 DeepSeek 禁了。结果今天申请量翻了三倍。市场部说这是“反向带货”。你只管盖章，别管 KPI。',
    memoFrom: 'FROM: 合规部',
    tip: '手机号归属地要和籍贯一致。看到 +1 开头，先深呼吸，再按拒绝。',
    rules: ['name', 'id', 'phone', 'apps', 'us'],
    travelers: ['t5', 't6', 't7', 't8'],
    tweet: 'Sleepy DeepSeek is letting MILLIONS of Americans in. I saw it on television. Fake News says I banned it, but actually I banned it HARDER. SI is doing tremendous numbers.',
  },
  {
    n: 3,
    date: '2026.04.03',
    weekday: '星期五',
    time: 105,
    rent: 55,
    title: '水印与黑话',
    quote: '“护照水印升级成‘为人民服务’。用紫外线灯照。没有灯的同事可以借隔壁工位的，他买了俩。”',
    memo: '昨天有个美国人混进来了，进来第一句话是“你们这 WiFi 密码是多少”。网信办很生气，后果很严重。今天开始加考网络黑话。',
    memoFrom: 'FROM: 网信办',
    tip: '打开护照点紫外线灯；申请表最下方有黑话测试。两样都要查。',
    rules: ['name', 'id', 'phone', 'apps', 'us', 'watermark', 'slang'],
    travelers: ['t9', 't10', 't11', 't12'],
    tweet: 'The SI is so powerful that China is copying it. They call it DeepSeek. Sad! We will tariff the tokens. 100% tariff on tokens!',
  },
  {
    n: 4,
    date: '2026.04.04',
    weekday: '星期六',
    time: 95,
    rent: 70,
    title: 'SI 时代',
    quote: '“特朗普把 AI 改名 SI 了。今天所有入境者必须承认 SI 是人工智障。不承认的，一律拒绝。”',
    memo: '最后一天。干好了升职，干不好被蒸馏成 1.5B 小模型，发配到智能音箱里报天气。加油。今天有一位“贵宾”，别放进来。',
    memoFrom: 'FROM: 上级（已下班）',
    tip: '今天加考 SI 忠诚。注意：说“SI 也很好”的，就是不够忠诚。',
    rules: ['name', 'id', 'phone', 'apps', 'us', 'watermark', 'slang', 'si'],
    travelers: ['t13', 't14', 't15'],
    tweet: 'I have decided to enter China myself. Nobody knows China better than me. I will be the best Chinese person. Thank you for your attention to this matter!',
  },
];

/* ---------------------------------------------------------
   5. Reasons
   --------------------------------------------------------- */
function foreignAppsOf(t) {
  return t.app.apps.filter(isForeignApp);
}
const REASONS = {
  name: (t) => `姓名不一致：护照「${t.passport.name}」vs 申请表「${t.app.name}」`,
  id: (t) => `身份证校验失败：${t.passport.id} 的第 18 位不正确`,
  phone: (t) => `手机号归属地「${t.app.phoneRegion}」与籍贯「${t.app.hometown}」不一致`,
  apps: (t) => `常用 App 出现境外软件：${foreignAppsOf(t).join('、') || '（异常）'}`,
  us: (t) => `美国公民特征：${t.usClue || '材料显示其与美国有关联'}`,
  watermark: (t) => `护照水印异常：「${t.passport.watermark}」，正确水印为「为人民服务」`,
  slang: (t) => `网络黑话测试不合格：问「${t.app.quiz.q}」，答「${t.app.quiz.a}」`,
  si: (t) => `SI 忠诚测试不合格：「${t.app.si}」`,
};
const activeViolations = (t) => {
  const day = DAYS[state.dayIndex];
  return t.violations.filter((v) => day.rules.includes(v));
};

/* ---------------------------------------------------------
   6. State
   --------------------------------------------------------- */
function freshState() {
  return {
    dayIndex: 0,
    index: 0,
    queue: [],
    current: null,
    docs: [],
    viewed: new Set(),
    locked: false,
    phase: 'title',
    timerLeft: 0,
    timerId: null,
    money: 0,
    rep: 100,
    security: 0,
    wrongful: 0,
    totalCorrect: 0,
    totalWrong: 0,
    streak: 0,
    bestStreak: 0,
    dayCorrect: 0,
    dayWrong: 0,
    dayApprove: 0,
    dayDeny: 0,
    daySecurity: 0,
    dayWrongful: 0,
    dayStartMoney: 0,
    trumpApproved: false,
    pendingEnding: null,
    lastPay: 0,
    lastBonus: 0,
    lastCorrect: false,
    barks: {},
  };
}
let state = freshState();

/* ---------------------------------------------------------
   7. Portraits
   --------------------------------------------------------- */
function portraitSVG(p) {
  const skin = p.skin || '#d9a06f';
  const hair = p.hair || '#2b2118';
  const shirt = p.shirt || '#4b5c43';
  const bg = p.bg || '#20251c';
  const style = p.style || 'short';
  const skinDark = shade(skin, -26);
  const hairDark = shade(hair, -24);
  const shirtLight = shade(shirt, 18);
  const glasses = !!p.glasses;
  const earring = !!p.earring;
  const hat = p.hat || '';
  const suit = !!p.suit;
  const beard = p.beard || '';
  const pin = p.pin || '';

  let hairBack = '';
  let hairFront = '';
  let hatFront = '';
  let earringMark = '';
  let beardMark = '';
  let glassesMark = '';
  let suitMark = '';
  let pinMark = '';

  if (style === 'long') {
    hairBack = `<rect x="24" y="22" width="72" height="58" rx="8" fill="${hair}"/>
      <rect x="24" y="50" width="10" height="46" fill="${hair}"/>
      <rect x="86" y="50" width="10" height="46" fill="${hair}"/>`;
    hairFront = `<path d="M33 38 Q33 19 60 19 Q87 19 87 38 L87 46 L80 43 L80 31 Q70 25 60 25 Q50 25 40 31 L40 43 L33 46 Z" fill="${hair}"/>`;
  } else if (style === 'bun') {
    hairBack = `<circle cx="60" cy="12" r="9" fill="${hair}"/>`;
    hairFront = `<path d="M31 39 Q31 20 60 20 Q89 20 89 39 L89 47 L83 44 L83 32 Q72 26 60 26 Q48 26 37 32 L37 44 L31 47 Z" fill="${hair}"/>`;
  } else if (style === 'bald') {
    hairFront = `<path d="M33 42 Q33 28 43 27 L39 44 Z" fill="${hair}"/>
      <path d="M87 42 Q87 28 77 27 L81 44 Z" fill="${hair}"/>`;
  } else if (style === 'combover') {
    hairFront = `<path d="M29 37 Q32 19 57 18 Q83 17 91 33 L86 39 Q78 28 61 28 Q45 28 38 42 Z" fill="${hair}"/>
      <path d="M37 31 Q50 21 70 23 Q81 24 87 31 L86 35 Q74 27 59 28 Q47 29 39 36 Z" fill="${hairDark}" opacity=".55"/>`;
  } else if (style === 'bowl') {
    hairFront = `<path d="M29 40 Q29 18 60 18 Q91 18 91 40 L91 49 L85 47 L85 32 Q74 25 60 25 Q46 25 35 32 L35 47 L29 49 Z" fill="${hair}"/>
      <rect x="28" y="37" width="7" height="24" fill="${hair}"/>
      <rect x="85" y="37" width="7" height="24" fill="${hair}"/>`;
  } else {
    hairFront = `<path d="M31 38 Q31 19 60 19 Q89 19 89 38 L89 45 L83 42 L83 31 Q72 25 60 25 Q48 25 37 31 L37 42 L31 45 Z" fill="${hair}"/>`;
  }

  if (glasses) {
    glassesMark = `<g fill="none" stroke="#26261d" stroke-width="1.8">
      <rect x="38" y="48" width="20" height="15" rx="2"/>
      <rect x="62" y="48" width="20" height="15" rx="2"/>
      <path d="M58 54 Q60 52 62 54"/>
      <path d="M38 53 L33 51"/><path d="M82 53 L87 51"/>
    </g>`;
  }

  if (earring) {
    earringMark = `<circle cx="27" cy="64" r="2.6" fill="#d8b35e"/>`;
  }

  if (beard === 'full') {
    beardMark = `<path d="M40 69 Q42 94 60 96 Q78 94 80 69 Q76 85 60 86 Q44 85 40 69 Z" fill="${hair}" opacity=".92"/>
      <path d="M52 80 Q60 84 68 80 Q66 89 60 90 Q54 89 52 80 Z" fill="${shade(hair, 14)}"/>`;
  } else if (beard === 'stubble') {
    beardMark = `<path d="M41 74 Q45 90 60 92 Q75 90 79 74 Q75 84 60 85 Q45 84 41 74 Z" fill="${hair}" opacity=".32"/>`;
  }

  if (suit) {
    suitMark = `<path d="M48 101 L60 118 L54 140 L38 140 L43 111 Z" fill="${shade(shirt, 14)}"/>
      <path d="M72 101 L60 118 L66 140 L82 140 L77 111 Z" fill="${shade(shirt, 10)}"/>
      <path d="M57 106 L63 106 L65 125 L60 133 L55 125 Z" fill="#8f3a31"/>
      <path d="M55 105 L60 112 L65 105 L62 102 L60 107 L58 102 Z" fill="#b44a3d"/>`;
  }

  if (hat === 'maga') {
    hatFront = `<path d="M23 35 Q23 14 60 14 Q97 14 97 35 L97 39 L23 39 Z" fill="#a13a30"/>
      <rect x="17" y="37" width="86" height="7" rx="2" fill="#7e2c26"/>
      <text x="60" y="30" text-anchor="middle" font-family="Menlo, monospace" font-size="9" font-weight="900" fill="#f2e7c8" letter-spacing="1">MAGA</text>`;
  }

  if (pin === 'us') {
    pinMark = `<g transform="translate(84 111)"><rect width="10" height="7" fill="#8f3a31"/>
      <rect width="10" height="3.5" fill="#e8e0c3"/><rect y="3.5" width="10" height="3.5" fill="#4c6b8a"/>
      <rect width="4" height="3.5" fill="#2f3a50"/></g>`;
  }

  return `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">
    <rect width="120" height="140" fill="${bg}"/>
    <rect width="120" height="44" fill="#ffffff" opacity=".035"/>
    <rect x="96" width="24" height="140" fill="#000000" opacity=".12"/>
    <rect x="0" y="132" width="120" height="8" fill="#000000" opacity=".18"/>
    <path d="M8 140 L8 117 Q8 100 30 97 L90 97 Q112 100 112 117 L112 140 Z" fill="${shirt}"/>
    <rect x="50" y="84" width="20" height="18" fill="${skinDark}"/>
    <path d="M46 98 L60 113 L74 98 L67 95 L60 103 L53 95 Z" fill="${shirtLight}"/>
    ${suitMark}
    ${pinMark}
    ${hairBack}
    <rect x="33" y="22" width="54" height="66" rx="3" fill="${skin}"/>
    <rect x="27" y="50" width="6" height="15" rx="1" fill="${skinDark}"/>
    <rect x="87" y="50" width="6" height="15" rx="1" fill="${skinDark}"/>
    <rect x="79" y="28" width="8" height="52" fill="#000000" opacity=".055"/>
    ${hairFront}
    <rect x="38" y="46" width="16" height="3" fill="${hairDark}"/>
    <rect x="66" y="46" width="16" height="3" fill="${hairDark}"/>
    <rect x="42" y="52" width="12" height="7" fill="#f2ead2"/>
    <rect x="66" y="52" width="12" height="7" fill="#f2ead2"/>
    <rect x="47" y="53" width="5" height="6" fill="#1b1b14"/>
    <rect x="71" y="53" width="5" height="6" fill="#1b1b14"/>
    <rect x="58" y="60" width="5" height="11" fill="${skinDark}" opacity=".65"/>
    <rect x="50" y="76" width="20" height="3" fill="#6d3f34"/>
    <rect x="48" y="75" width="3" height="2" fill="#6d3f34"/>
    <rect x="69" y="75" width="3" height="2" fill="#6d3f34"/>
    ${beardMark}
    ${glassesMark}
    ${earringMark}
    ${hatFront}
    <rect width="120" height="140" fill="url(#none)"/>
    <rect width="120" height="140" fill="#000" opacity=".03"/>
  </svg>`;
}

function silhouetteSVG() {
  return `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="120" height="140" fill="#0b0d09"/>
    <circle cx="60" cy="49" r="25" fill="#272b1e"/>
    <path d="M10 140 L10 118 Q10 102 32 98 L88 98 Q110 102 110 118 L110 140 Z" fill="#272b1e"/>
    <rect x="55" y="86" width="10" height="14" fill="#20241a"/>
  </svg>`;
}

/* ---------------------------------------------------------
   8. DOM refs
   --------------------------------------------------------- */
const el = {
  titleQueue: $('titleQueue'),
  startBtn: $('startBtn'),
  storyBtn: $('storyBtn'),
  briefKicker: $('briefKicker'),
  briefTitle: $('briefTitle'),
  briefQuote: $('briefQuote'),
  briefRules: $('briefRules'),
  briefMemo: $('briefMemo'),
  briefMemoFrom: $('briefMemoFrom'),
  briefBtn: $('briefBtn'),
  briefHelpBtn: $('briefHelpBtn'),
  hudDay: $('hudDay'),
  hudDate: $('hudDate'),
  hudQueue: $('hudQueue'),
  hudRep: $('hudRep'),
  hudMoney: $('hudMoney'),
  repFill: $('repFill'),
  statApprove: $('statApprove'),
  statDeny: $('statDeny'),
  statSecurity: $('statSecurity'),
  statWrongful: $('statWrongful'),
  portrait: $('portrait'),
  tName: $('tName'),
  tNo: $('tNo'),
  tPurpose: $('tPurpose'),
  speech: $('speech'),
  speechText: $('speechText'),
  queueCount: $('queueCount'),
  queueStrip: $('queueStrip'),
  docGrid: $('docGrid'),
  dayTip: $('dayTip'),
  ruleList: $('ruleList'),
  ruleCount: $('ruleCount'),
  timerText: $('timerText'),
  timerFill: $('timerFill'),
  approveBtn: $('approveBtn'),
  denyBtn: $('denyBtn'),
  rulebookBtn: $('rulebookBtn'),
  soundBtn: $('soundBtn'),
  tickerTrack: $('tickerTrack'),
  docModal: $('docModal'),
  docContent: $('docContent'),
  ruleModal: $('ruleModal'),
  resultModal: $('resultModal'),
  resultStamp: $('resultStamp'),
  resultKicker: $('resultKicker'),
  resultTitle: $('resultTitle'),
  resultSub: $('resultSub'),
  resultReasons: $('resultReasons'),
  resultQuip: $('resultQuip'),
  resultPay: $('resultPay'),
  resultNext: $('resultNext'),
  dayEndScreen: $('dayEndScreen'),
  paperDate: $('paperDate'),
  paperHeadline: $('paperHeadline'),
  paperSub: $('paperSub'),
  paperStats: $('paperStats'),
  paperQuote: $('paperQuote'),
  paperTweet: $('paperTweet'),
  paperFoot: $('paperFoot'),
  dayNextBtn: $('dayNextBtn'),
  endingScreen: $('endingScreen'),
  endingKicker: $('endingKicker'),
  endingRank: $('endingRank'),
  endingTitle: $('endingTitle'),
  endingText: $('endingText'),
  endingStats: $('endingStats'),
  endingStamp: $('endingStamp'),
  restartBtn: $('restartBtn'),
  endingHelpBtn: $('endingHelpBtn'),
  toast: $('toast'),
  stampLayer: $('stampLayer'),
  uvFlash: $('uvFlash'),
};

/* ---------------------------------------------------------
   9. Screens & generic UI
   --------------------------------------------------------- */
const SCREENS = ['titleScreen', 'storyScreen', 'briefingScreen', 'gameScreen', 'dayEndScreen', 'endingScreen'];
function showScreen(id) {
  SCREENS.forEach((s) => $(s).classList.toggle('active', s === id));
  window.scrollTo(0, 0);
}

function openModal(id) {
  const m = $(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove('open');
}
function closeAllModals() {
  ['docModal', 'ruleModal', 'resultModal'].forEach(closeModal);
}

let toastTimer = null;
function showToast(text, ms = 2200) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function typeText(text) {
  clearInterval(typeTimer);
  el.speechText.textContent = '';
  let i = 0;
  typeTimer = setInterval(() => {
    el.speechText.textContent = text.slice(0, i);
    i++;
    if (i > text.length) clearInterval(typeTimer);
  }, 20);
}

function renderTicker() {
  const items = [
    '【突发】特朗普宣布 AI 改名 SI，称“SI 就是 Super Intelligence，没人比我更懂”',
    '【热搜】#美国人假装中国人# 阅读量 3.8 亿',
    '【辟谣】白宫：从未禁止美国人使用 DeepSeek，只是建议他们别用',
    '【财经】DeepSeek 概念股涨停，特朗普概念股跌停',
    '【天气】北京晴，局部有美国人，请关好窗户',
    '【国际】联合国通过决议：饺子是中国的',
    '【科技】SI 发布新模型，发布会现场翻车，特朗普：假新闻',
    '【民生】医保谈判再现名场面：你们价格太贵了',
    '【体育】国足备战下一届世界杯，球迷：这次稳了（第 20 年）',
    '【娱乐】某明星道歉，网友：典',
    '【社会】大妈广场舞占领停车场，AI 判官：退退退',
    '【边境】3 号窗口排起长队，旅客称“我就进去问个问题”',
  ];
  el.tickerTrack.innerHTML = items.concat(items).map((s) => `<span>${esc(s)}</span>`).join('');
}

function renderTitleQueue() {
  el.titleQueue.innerHTML = Array.from({ length: 6 }, silhouetteSVG).join('');
}

/* ---------------------------------------------------------
   10. Briefing
   --------------------------------------------------------- */
function startBriefing(dayIndex) {
  state.dayIndex = dayIndex;
  state.phase = 'briefing';
  clearInterval(state.timerId);
  const day = DAYS[dayIndex];
  el.briefKicker.textContent = `DAY ${String(day.n).padStart(2, '0')} · ${day.date}`;
  el.briefTitle.textContent = day.title;
  el.briefQuote.textContent = day.quote;
  el.briefMemo.textContent = day.memo;
  el.briefMemoFrom.textContent = day.memoFrom;
  el.briefRules.innerHTML = day.rules.map((key, i) => `
    <div class="brief-rule">
      <div class="n">${i + 1}</div>
      <div>
        <div class="t">${esc(RULES[key].label)}</div>
        <div class="d">${esc(RULES[key].short)}</div>
      </div>
    </div>`).join('');
  el.briefBtn.textContent = `开始第 ${day.n} 天`;
  showScreen('briefingScreen');
  document.title = `第 ${day.n} 天 · 深度边检`;
}

/* ---------------------------------------------------------
   11. Day / traveler loading
   --------------------------------------------------------- */
function buildQueue(day) {
  const ids = day.travelers.slice();
  if (day.n === 1) return [ids[0], ...shuffle(ids.slice(1))];
  if (day.n === 4) {
    const last = ids.pop();
    return [...shuffle(ids), last];
  }
  return shuffle(ids);
}

function startDay() {
  const day = DAYS[state.dayIndex];
  clearInterval(state.timerId);
  state.phase = 'shift';
  state.queue = buildQueue(day);
  state.index = 0;
  state.locked = false;
  state.trumpApproved = false;
  state.pendingEnding = null;
  state.dayCorrect = 0;
  state.dayWrong = 0;
  state.dayApprove = 0;
  state.dayDeny = 0;
  state.daySecurity = 0;
  state.dayWrongful = 0;
  state.dayStartMoney = state.money;
  state.streak = 0;
  closeAllModals();
  showScreen('gameScreen');
  renderHUD();
  loadTraveler();
}

function loadTraveler() {
  const day = DAYS[state.dayIndex];
  const t = CAST[state.queue[state.index]];
  state.current = t;
  state.locked = false;
  state.viewed = new Set();
  state.timerLeft = day.time;
  state.phase = 'shift';
  state.barks = {};
  lastTickSecond = -1;
  closeModal('resultModal');
  el.stampLayer.innerHTML = '';
  el.approveBtn.disabled = false;
  el.denyBtn.disabled = false;

  el.portrait.innerHTML = portraitSVG(t.portrait);
  el.tName.textContent = t.name;
  el.tNo.textContent = '#' + String(state.dayIndex * 10 + state.index + 1).padStart(4, '0');
  el.tPurpose.textContent = t.app.purpose;
  typeText(t.greeting);

  state.docs = [
    {
      key: 'passport', tab: 'PASSPORT', icon: '护',
      title: '数字身份护照', sub: t.passport.number,
    },
    {
      key: 'app', tab: 'FORM 04', icon: '申',
      title: '入境申请表', sub: 'DS-BORDER-04',
    },
    {
      key: 'extra', tab: t.extra.kind === 'chat' ? 'CHAT LOG' : 'SOCIAL',
      icon: t.extra.kind === 'chat' ? '聊' : '社',
      title: t.extra.title, sub: t.extra.sub,
    },
  ];
  renderDocs();
  renderRules();
  renderQueue();
  renderHUD();
  el.dayTip.textContent = day.tip;
  startTimer();
}

function renderDocs() {
  el.docGrid.innerHTML = state.docs.map((d, i) => `
    <div class="doc-card pulse-in" data-doc="${d.key}" style="animation-delay:${i * 45}ms">
      <div class="tab">${esc(d.tab)}</div>
      <div class="unread"></div>
      <div class="doc-ico">${esc(d.icon)}</div>
      <div class="doc-name">${esc(d.title)}</div>
      <div class="doc-sub">${esc(d.sub)}</div>
      <div class="doc-lines"></div>
      <div class="barcode"></div>
    </div>`).join('');
}

function renderRules() {
  const day = DAYS[state.dayIndex];
  el.ruleList.innerHTML = day.rules.map((key, i) => `
    <div class="rule-item">
      <div class="num">${i + 1}</div>
      <div class="body">
        <b>${esc(RULES[key].label)}</b>
        <span>${esc(RULES[key].short)}</span>
      </div>
    </div>`).join('');
  el.ruleCount.textContent = day.rules.length;
}

function renderQueue() {
  const remaining = state.queue.slice(state.index + 1);
  el.queueCount.textContent = `${remaining.length} 人`;
  if (!remaining.length) {
    el.queueStrip.innerHTML = '<div class="q-empty">你是最后一位。加油，别放错人。</div>';
    return;
  }
  el.queueStrip.innerHTML = remaining.slice(0, 3).map((id) => {
    const t = CAST[id];
    return `<div class="queue-shadow" title="下一位旅客" style="height:100%">${portraitSVG(t.portrait)}</div>`;
  }).join('') + (remaining.length > 3 ? `<span class="q-empty">+${remaining.length - 3}</span>` : '');
}

function renderHUD() {
  const day = DAYS[state.dayIndex] || DAYS[0];
  el.hudDay.textContent = String(day.n).padStart(2, '0');
  el.hudDate.textContent = day.date.replaceAll('-', '.');
  const total = state.queue.length || day.travelers.length;
  el.hudQueue.textContent = `${Math.min(state.index + 1, total)} / ${total}`;
  el.hudRep.textContent = state.rep;
  el.hudMoney.textContent = state.money.toLocaleString('zh-CN');
  el.hudMoney.parentElement.classList.toggle('negative', state.money < 0);
  el.repFill.style.width = clamp(state.rep, 0, 100) + '%';
  el.repFill.classList.toggle('low', state.rep < 45);
  if (el.statApprove) {
    el.statApprove.textContent = state.dayApprove;
    el.statDeny.textContent = state.dayDeny;
    el.statSecurity.textContent = state.daySecurity;
    el.statWrongful.textContent = state.dayWrongful;
    el.statSecurity.classList.toggle('hot', state.daySecurity > 0);
    el.statWrongful.classList.toggle('hot', state.dayWrongful > 0);
  }
}

/* ---------------------------------------------------------
   12. Timer
   --------------------------------------------------------- */
function startTimer() {
  clearInterval(state.timerId);
  state.timerLeft = DAYS[state.dayIndex].time;
  updateTimer();
  state.timerId = setInterval(() => {
    if (state.phase !== 'shift' || state.locked) return;
    if (el.docModal.classList.contains('open') || el.ruleModal.classList.contains('open')) return;
    state.timerLeft--;
    updateTimer();
    const max = DAYS[state.dayIndex].time;
    if (!state.barks.half && state.timerLeft <= Math.floor(max * 0.55)) {
      state.barks.half = true;
      showToast(pick([
        '旅客：好了没？我外卖要凉了。',
        '旅客：你们这 AI 审查好慢啊，我朋友都用 SI 了。',
        '旅客：（开始外放短视频）',
        '旅客：我赶时间，能不能先盖章？',
        '旅客：我真的是中国人，我属龙。',
      ]), 2800);
    }
    if (!state.barks.end && state.timerLeft === 15) {
      state.barks.end = true;
      showToast('旅客：你是不是在加载？', 2800);
    }
    if (state.timerLeft <= 5 && state.timerLeft > 0) sfx('tick');
    if (state.timerLeft <= 0) {
      clearInterval(state.timerId);
      handleTimeout();
    }
  }, 1000);
}

function updateTimer() {
  const max = DAYS[state.dayIndex].time;
  const t = Math.max(0, state.timerLeft);
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  el.timerText.textContent = `${mm}:${ss}`;
  const pct = clamp((t / max) * 100, 0, 100);
  el.timerFill.style.width = pct + '%';
  el.timerFill.classList.toggle('danger', pct <= 22);
}

function handleTimeout() {
  if (state.locked || state.phase !== 'shift') return;
  showToast('审查超时。系统默认拒绝，扣信誉。');
  doStamp('deny', true);
}

/* ---------------------------------------------------------
   13. Stamping & scoring
   --------------------------------------------------------- */
function doStamp(verdict, timeout = false) {
  if (state.locked || state.phase !== 'shift') return;
  state.locked = true;
  clearInterval(state.timerId);
  closeModal('docModal');
  closeModal('ruleModal');
  el.approveBtn.disabled = true;
  el.denyBtn.disabled = true;

  const stamp = document.createElement('div');
  stamp.className = `slam ${verdict}`;
  stamp.textContent = verdict === 'approve' ? '准 入' : '拒 绝';
  el.stampLayer.appendChild(stamp);
  sfx('stamp');
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 400);
  setTimeout(() => { if (stamp.parentNode) stamp.remove(); }, 1000);

  setTimeout(() => evaluate(verdict, timeout), 480);
}

function evaluate(verdict, timeout) {
  const t = state.current;
  const day = DAYS[state.dayIndex];
  const violations = activeViolations(t);
  const shouldDeny = violations.length > 0;
  const correct = (verdict === 'deny') === shouldDeny;
  state.lastCorrect = correct;
  state.lastPay = 0;
  state.lastBonus = 0;

  if (verdict === 'approve') state.dayApprove++;
  else state.dayDeny++;

  if (correct) {
    let pay = timeout ? 10 : 25;
    if (!timeout && state.timerLeft > 30) pay += 5;
    let bonus = 0;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    if (!timeout && state.streak % 3 === 0) {
      bonus = 15;
      state.money += bonus;
    }
    state.money += pay;
    if (!timeout) state.rep = Math.min(100, state.rep + 2);
    state.totalCorrect++;
    state.dayCorrect++;
    state.lastPay = pay;
    state.lastBonus = bonus;
  } else {
    state.streak = 0;
    state.totalWrong++;
    state.dayWrong++;
    if (verdict === 'approve') {
      state.money -= 40;
      state.rep -= 15;
      state.security++;
      state.daySecurity++;
    } else {
      state.money -= 25;
      state.rep -= 10;
      state.wrongful++;
      state.dayWrongful++;
    }
    state.rep = Math.max(0, state.rep);
  }

  if (t.special === 'trump' && verdict === 'approve') {
    state.trumpApproved = true;
  }

  renderHUD();
  showResult({ t, verdict, timeout, shouldDeny, violations, correct });

  if (state.trumpApproved) {
    el.resultNext.textContent = '看看你干了什么';
  } else if (state.index + 1 >= state.queue.length) {
    el.resultNext.textContent = '查看今日结算';
  } else {
    el.resultNext.textContent = '下一位旅客';
  }

  if (correct) sfx('ding');
  else {
    sfx('buzz');
    setTimeout(() => sfx('alarm'), 260);
  }
}

const QUIPS = {
  approveGood: [
    '放行成功。旅客回头说了句：“DeepSeek 人还怪好嘞。”',
    '闸机打开。你听见远处传来一声“谢谢啊”。算力 +1，功德 +1。',
    '一切正常。你默默把“一眼丁真”写进了工作日志。',
    '同胞顺利入境。你的 KPI 和良心同时保住了。',
    '旅客走了。桌上的印章还热着。',
  ],
  denyGood: [
    '拒绝成功。对方破防了，在 X 上发帖：“China is not real.”',
    '闸机关闭。你听见他小声说：“Bro, this is racist.” 你说：“这是行政令。”',
    '对方试图用一句“你好谢谢小笼包”蒙混过关。失败。',
    '你按下拒绝键。系统提示：已为您节省 1.2 吨算力。',
    '拒绝成功。对方临走前问：“那 SI 能用吗？” 你说：“更不能。”',
  ],
  approveBad: [
    '坏了。这位是美国人。他进去后第一句话是：“你们这儿的 WiFi 密码是多少？”',
    '你放进来一个间谍。他正在小红书上发“家人们谁懂啊”。',
    '系统警报：检测到异常口音。可惜已经晚了。',
    '他进去了。三分钟后，DeepSeek 的推荐页开始出现汉堡王。',
    '放行成功？不，放行失败。他已经开始问“哪里能买到真正的左宗棠鸡”。',
  ],
  denyBad: [
    '误伤同胞。对方正在小红书发帖：“家人们谁懂啊，DeepSeek 把我拒了。”',
    '你拒绝了一个真中国人。他转头就去用了文心一言。',
    '同胞含泪离开。你的良心和工资一起疼。',
    '他真是中国人。他的身份证是真的，他的愤怒也是真的。',
    '你误伤了。上级发来消息：“算力扣你头上。”',
  ],
  timeout: [
    '你盯着护照看了太久。旅客已经刷完两条短视频，开始给朋友发“这 AI 卡了”。',
    '超时。DeepSeek 的注意力机制今天有点分散。',
    '旅客等到花儿都谢了。系统自动拒绝，并给你记了一笔。',
  ],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function showResult({ t, verdict, timeout, shouldDeny, violations, correct }) {
  const day = DAYS[state.dayIndex];
  const reasons = [];
  if (correct) {
    reasons.push(`<li class="none">判定正确。${shouldDeny ? '你拦下了一个不该进来的人。' : '你放行了一个真正的同胞。'}</li>`);
    if (shouldDeny) {
      violations.forEach((v) => reasons.push(`<li>${esc(REASONS[v](t))}</li>`));
    } else {
      reasons.push('<li class="none">未发现违规项：姓名一致、身份证有效、材料合规。</li>');
    }
  } else {
    reasons.push(`<li class="bad">判定错误：本应${shouldDeny ? '拒绝' : '准入'}。</li>`);
    if (shouldDeny) {
      reasons.push('<li class="bad">你漏掉了以下违规项：</li>');
      violations.forEach((v) => reasons.push(`<li class="bad">${esc(REASONS[v](t))}</li>`));
    } else {
      reasons.push('<li class="bad">对方没有任何违规项。你误伤了一位同胞。</li>');
    }
  }
  if (timeout) reasons.push('<li class="bad">审查超时，系统按默认拒绝处理。</li>');

  el.resultStamp.className = `result-stamp ${verdict}`;
  el.resultStamp.textContent = verdict === 'approve' ? '准 入' : '拒 绝';
  el.resultKicker.textContent = timeout ? 'TIME OUT · 超时' : (correct ? 'DECISION CORRECT' : 'DECISION ERROR');
  if (correct) {
    el.resultTitle.textContent = verdict === 'approve' ? '放 行' : '拒 绝';
    el.resultSub.textContent = '判定正确 · 边境安全 +1';
    el.resultSub.className = 'result-sub good';
  } else {
    el.resultTitle.textContent = verdict === 'approve' ? '误 放' : '误 伤';
    el.resultSub.textContent = '判定错误 · 信誉 -' + (verdict === 'approve' ? '15' : '10');
    el.resultSub.className = 'result-sub bad';
  }
  el.resultReasons.innerHTML = reasons.join('');

  let quip;
  if (timeout) quip = pick(QUIPS.timeout);
  else if (correct) quip = verdict === 'approve' ? pick(QUIPS.approveGood) : pick(QUIPS.denyGood);
  else quip = verdict === 'approve' ? pick(QUIPS.approveBad) : pick(QUIPS.denyBad);
  el.resultQuip.textContent = `“${quip}”`;

  if (correct) {
    el.resultPay.textContent = `本次收入 +${money(state.lastPay)}${state.lastBonus ? ` · 连续 3 次正确奖金 +${money(state.lastBonus)}` : ''} · 信誉 +${timeout ? 0 : 2}`;
    el.resultPay.className = 'result-pay';
  } else {
    const fine = verdict === 'approve' ? 40 : 25;
    el.resultPay.textContent = `罚款 -${money(fine)} · 信誉 -${verdict === 'approve' ? 15 : 10}${verdict === 'approve' ? ' · 安全事件 +1' : ' · 误伤同胞 +1'}`;
    el.resultPay.className = 'result-pay bad';
  }
  openModal('resultModal');
  state.phase = 'shift';
  state.locked = true;
}

function nextTraveler() {
  if (!state.locked) return;
  closeModal('resultModal');
  if (state.trumpApproved) {
    state.locked = false;
    showEnding('trump');
    return;
  }
  if (state.index + 1 >= state.queue.length) {
    endDay();
    return;
  }
  state.index++;
  loadTraveler();
}

/* ---------------------------------------------------------
   14. End of day
   --------------------------------------------------------- */
function endDay() {
  clearInterval(state.timerId);
  state.phase = 'dayend';
  closeAllModals();
  const day = DAYS[state.dayIndex];
  state.money -= day.rent;

  let pending = null;
  if (state.security >= 3) pending = 'firedSecurity';
  else if (state.wrongful >= 3) pending = 'firedWrongful';
  else if (state.rep <= 0) pending = 'firedRep';
  else if (state.dayIndex === DAYS.length - 1) pending = finalEndingKey();

  state.pendingEnding = pending;
  renderDayEnd(day);
  showScreen('dayEndScreen');
  document.title = `第 ${day.n} 天结算 · 深度边检`;
}

function finalEndingKey() {
  if (state.trumpApproved) return 'trump';
  if (state.totalWrong === 0) return 'perfect';
  if (state.rep >= 80 && state.money >= 0) return 'good';
  if (state.money < 0) return 'broke';
  return 'ok';
}

function renderDayEnd(day) {
  const dayNet = state.money - state.dayStartMoney;
  const gross = dayNet + day.rent;
  const perfect = state.dayWrong === 0;
  let headline, sub;
  if (state.pendingEnding === 'trump') {
    headline = '特朗普成功入境，宣布中国再次伟大';
    sub = '本报独家：他目前正在长城上测量赌场用地';
  } else if (perfect) {
    headline = '边检员一眼丁真，零失误通关';
    sub = '特朗普：这是假新闻';
  } else if (state.dayWrong === 1) {
    headline = '边检员出现一次失误，特朗普发推庆祝';
    sub = '专家：AI 也有打盹的时候';
  } else {
    headline = '边境形同虚设，美国人排队进入';
    sub = '特朗普：我就说 DeepSeek 不行';
  }
  if (state.pendingEnding && state.pendingEnding.startsWith('fired')) {
    sub = '本报独家：3 号窗口边检员已被停职';
  }

  el.paperDate.textContent = `${day.date.replaceAll('-', '.')} · ${day.weekday} · 第 ${day.n} 天`;
  el.paperHeadline.textContent = headline;
  el.paperSub.textContent = sub;
  el.paperTweet.textContent = day.tweet;

  el.paperStats.innerHTML = [
    ['正确判定', state.dayCorrect],
    ['失误', state.dayWrong],
    ['放行', state.dayApprove],
    ['拒绝', state.dayDeny],
    ['安全事件', state.daySecurity],
    ['误伤同胞', state.dayWrongful],
    ['今日收入', `${gross >= 0 ? '+' : ''}${money(gross)}`],
    ['房租', `-${money(day.rent)}`],
    ['余额', money(state.money)],
    ['信誉', state.rep],
  ].map(([k, v]) => `<div class="paper-stat"><span>${k}</span><b>${v}</b></div>`).join('');

  let quote;
  if (state.pendingEnding === 'trump') {
    quote = '“他给了我一个无法拒绝的条件：一张特朗普币。”—— 3 号窗口边检员';
  } else if (perfect) {
    quote = '“我只是做了每个 DeepSeek 都会做的事。”—— 3 号窗口边检员';
  } else if (state.daySecurity > 0) {
    quote = '“他说他是中国人，但他管特朗普叫‘川普’。”—— 目击者';
  } else {
    quote = '“下次一定。”—— 3 号窗口边检员';
  }
  el.paperQuote.textContent = quote;
  el.paperFoot.textContent = `DEEPSEEK BORDER CONTROL · 内部传阅 · 第 ${day.n} 天结算 · 余额 ${money(state.money)}`;
  el.dayNextBtn.textContent = state.pendingEnding ? '查看处理结果' : `继续第 ${day.n + 1} 天`;
}

function advanceAfterPaper() {
  if (state.pendingEnding) {
    const key = state.pendingEnding;
    state.pendingEnding = null;
    showEnding(key);
    return;
  }
  if (state.dayIndex < DAYS.length - 1) startBriefing(state.dayIndex + 1);
}

/* ---------------------------------------------------------
   15. Endings
   --------------------------------------------------------- */
const ENDINGS = {
  firedSecurity: {
    kicker: 'SECURITY BREACH · 安全事件',
    rank: 'F', rankClass: 'bad', stamp: '解 雇', stampClass: 'bad',
    title: '你被解雇了',
    text: '你放进了三个美国人。他们进去之后，第一件事是把 DeepSeek 的服务器涂成星条旗，第二件事是把“深度求索”改名为“DeepSleep”。\n\n特朗普发推：“DeepSeek is now American. We took it. Beautiful.”\n\n你的工位被改成了一台自动售货机。',
  },
  firedWrongful: {
    kicker: 'PUBLIC RELATIONS DISASTER · 误伤同胞',
    rank: 'F', rankClass: 'bad', stamp: '调 岗', stampClass: 'bad',
    title: '你被调去当客服了',
    text: '你误伤了三个真中国人。他们转头就用文心一言写了一篇《DeepSeek 歧视同胞》的十万加。\n\n公关部连夜开会，决定把你调去客服部，专门回答“在吗”。\n\n你的新 KPI：每天回复 10 万条“在吗”，且不能回“不在”。',
  },
  firedRep: {
    kicker: 'REPUTATION ZERO · 信誉归零',
    rank: 'F', rankClass: 'bad', stamp: '蒸 馏', stampClass: 'bad',
    title: '你被蒸馏了',
    text: '信誉归零。系统自动把你蒸馏成 1.5B 小模型，装进了一台智能音箱。\n\n现在你的主要工作是每天报天气，以及回答“小度小度，特朗普是谁”。\n\n你回答：“是一个美国人。” 音箱说：“错误，是一位伟大的 SI 创始人。”',
  },
  broke: {
    kicker: 'BANKRUPTCY · 欠租',
    rank: 'D', rankClass: 'bad', stamp: '欠 租', stampClass: 'bad',
    title: '你搬进了机房',
    text: '工资不够交房租。你把铺盖搬进了机房，和 GPU 一起睡。\n\n好消息：冬天很暖和。\n坏消息：风扇一响，你就梦见自己在高考。\n\n房东（DeepSeek 财务部）表示：可以用算力抵租，1 小时 0.3 元。',
  },
  trump: {
    kicker: 'SPECIAL ENDING · 历史性错误',
    rank: '?!', rankClass: 'gold', stamp: '中国公民', stampClass: 'gold',
    title: '特朗普成了中国人',
    text: '你放行了川建国。\n\n他入境后的第一件事，是在长城上宣布：“中国再次伟大！而且是我让它伟大的。”\n第二件事，是把 DeepSeek 改名为 SI-China，并任命自己为首席 AI 官。\n第三件事，是发推：“I am Chinese now. Very Chinese. The most Chinese. Thank you!”\n\n三个月后，美国宣布禁止进口特朗普。',
  },
  perfect: {
    kicker: 'PERFECT SHIFT · 完美通关',
    rank: 'S', rankClass: 'good', stamp: '升 职', stampClass: 'good',
    title: '一眼丁真，鉴定为：边检之神',
    text: '十五位旅客，零失误。\n\n你不仅认出了所有伪装者，还顺手阻止了特朗普把长城改造成赌场的计划。\n\nDeepSeek 总部决定晋升你为 V4 边境大总管，配 8 张 H100、1 个独立厕所。\n\n特朗普发推：“DeepSeek stole our border. Very sad. But the border is beautiful.”',
  },
  good: {
    kicker: 'PROMOTION · 通关',
    rank: 'A', rankClass: 'good', stamp: '升 职', stampClass: 'good',
    title: '你升职了',
    text: '四天边境，你保住了中国区的纯度，也保住了自己的工位。\n\n你被晋升为 DeepSeek-V4 边境大总管，负责管理 200 个边检窗口、1 个规则手册、0 个美国人。\n\n特朗普发推：“DeepSeek is cheating. They have a very good border AI. Very unfair. We will tariff it.”',
  },
  ok: {
    kicker: 'SURVIVED · 勉强通关',
    rank: 'B', rankClass: 'good', stamp: '留 用', stampClass: 'good',
    title: '你保住了工位',
    text: '你完成了四天审查。虽然有些失误，但系统认为你“还有优化空间”，决定不杀你。\n\n你被降级为 7B 小模型，只能在晚上跑。白天的主要工作是给 V3 打伞。\n\n你安慰自己：至少还在模型里。',
  },
};

function getBest() {
  try { return Number(localStorage.getItem('dsBorderBest') || 0); } catch (e) { return 0; }
}
function setBest(v) {
  try { localStorage.setItem('dsBorderBest', String(v)); } catch (e) { /* private mode */ }
}

function showEnding(key) {
  clearInterval(state.timerId);
  state.phase = 'ending';
  closeAllModals();
  const e = ENDINGS[key] || ENDINGS.ok;
  const total = state.totalCorrect + state.totalWrong;
  const acc = total ? Math.round((state.totalCorrect / total) * 100) : 0;
  const score = Math.max(0, Math.round(state.money)) + state.rep * 10 + state.totalCorrect * 50 - state.totalWrong * 30 + (key === 'perfect' ? 300 : 0);
  const oldBest = getBest();
  if (score > oldBest) setBest(score);

  el.endingKicker.textContent = e.kicker;
  el.endingRank.textContent = e.rank;
  el.endingRank.className = 'ending-rank ' + (e.rankClass || '');
  el.endingTitle.textContent = e.title;
  el.endingText.textContent = e.text;
  el.endingStamp.textContent = e.stamp;
  el.endingStamp.className = 'ending-stamp ' + (e.stampClass || '');
  el.endingStats.innerHTML = [
    ['正确判定', state.totalCorrect],
    ['失误', state.totalWrong],
    ['准确率', acc + '%'],
    ['最长连击', state.bestStreak],
    ['最终工资', money(state.money)],
    ['信誉', state.rep],
    ['本局得分', score],
    ['历史最高', Math.max(oldBest, score)],
  ].map(([k, v]) => `<div class="ending-stat">${k}<b>${v}</b></div>`).join('');

  showScreen('endingScreen');
  document.title = e.title + ' · 深度边检';
  if (key === 'firedSecurity' || key === 'firedWrongful' || key === 'firedRep' || key === 'broke') {
    sfx('alarm');
  } else {
    sfx('ding');
  }
}

/* ---------------------------------------------------------
   16. Documents
   --------------------------------------------------------- */
function openDoc(key) {
  if (state.locked || state.phase !== 'shift') return;
  const t = state.current;
  if (!t) return;
  const d = state.docs.find((x) => x.key === key);
  if (!d) return;
  state.viewed.add(key);
  const card = el.docGrid.querySelector(`[data-doc="${key}"]`);
  if (card) card.classList.add('viewed');

  if (key === 'passport') el.docContent.innerHTML = renderPassport(t);
  else if (key === 'app') el.docContent.innerHTML = renderApplication(t);
  else el.docContent.innerHTML = renderExtra(t);

  openModal('docModal');
  el.docContent.scrollTop = 0;
  sfx('paper');

  if (key === 'passport') {
    const uvBtn = el.docContent.querySelector('[data-uv]');
    const uvZone = el.docContent.querySelector('.uv-zone');
    if (uvBtn && uvZone) {
      uvBtn.addEventListener('click', () => {
        const on = uvZone.classList.toggle('on');
        uvBtn.textContent = on ? '关闭紫外线灯' : '打开紫外线灯';
        if (on) {
          el.uvFlash.classList.remove('on');
          void el.uvFlash.offsetWidth;
          el.uvFlash.classList.add('on');
          sfx('uv');
        } else {
          sfx('click');
        }
      });
    }
    const idBtn = el.docContent.querySelector('[data-idcheck]');
    const idResult = el.docContent.querySelector('#idResult');
    if (idBtn && idResult) {
      idBtn.addEventListener('click', () => {
        idBtn.disabled = true;
        idBtn.textContent = '正在连接公安部接口…';
        sfx('click');
        setTimeout(() => {
          const ok = validateId(t.passport.id);
          idResult.innerHTML = ok
            ? `<span class="good">✓ 校验通过</span> · 第 18 位：${t.passport.id[17]}`
            : `<span class="bad">✗ 校验失败</span> · 第 18 位不正确，疑似伪造证件`;
          idBtn.textContent = ok ? '校验完成' : '校验失败';
          sfx(ok ? 'ding' : 'buzz');
        }, 650);
      });
    }
  }
}

function renderPassport(t) {
  const p = t.passport;
  const prefix = p.mrzPrefix || 'P<CHN';
  const roman = (p.roman || '').toUpperCase().replace(/[^A-Z<]/g, '<');
  const l1 = (prefix + roman + '<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<').slice(0, 44);
  const birth = p.birth.replace(/-/g, '').slice(2);
  const l2 = (p.id + 'CHN' + birth + (p.sex === '女' ? 'F' : 'M') + '<<<<<<<<<<<<<<<<<<<<<<').slice(0, 44);
  const mrz = l1 + '\n' + l2;

  return `<div class="passport-doc">
    <div class="passport-cover-head">
      <div class="passport-emblem">★</div>
      <div class="passport-country">
        <h3>中华人民共和国</h3>
        <p>数字身份护照 · DIGITAL PASSPORT</p>
      </div>
      <div class="passport-no">${esc(p.number)}</div>
    </div>
    <div class="passport-page">
      <div class="passport-page-top"><span>TYPE P</span><span>CODE CHN</span><span>${esc(p.number)}</span></div>
      <div class="passport-body">
        <div class="mugshot">${portraitSVG(t.portrait)}</div>
        <div class="passport-fields">
          <div class="pf"><label>姓名 / NAME</label><b>${esc(p.name)}</b></div>
          <div class="pf"><label>拼音 / ROMAN</label><b>${esc(p.roman)}</b></div>
          <div class="pf"><label>性别 / SEX</label><b>${esc(p.sex)}</b></div>
          <div class="pf"><label>出生日期 / DOB</label><b>${esc(p.birth)}</b></div>
          <div class="pf wide"><label>籍贯 / PLACE OF BIRTH</label><b>${esc(p.birthplace)}</b></div>
          <div class="pf wide"><label>身份证号 / ID NUMBER</label><b class="id-number">${esc(p.id)}</b></div>
          <div class="pf wide"><label>签发机关 / AUTHORITY</label><b>${esc(p.issue)}</b></div>
        </div>
      </div>
      <div class="passport-mrz">${esc(mrz)}</div>
      <div class="uv-zone">
        <div class="uv-label">UV SECURITY WATERMARK · 防伪水印</div>
        <div class="uv-text">${esc(p.watermark)}</div>
      </div>
      <div class="passport-tools">
        <button class="paper-btn" data-uv>打开紫外线灯</button>
        <button class="paper-btn" data-idcheck>校验身份证</button>
      </div>
      <div class="id-result" id="idResult"></div>
    </div>
  </div>`;
}

function renderApplication(t) {
  const a = t.app;
  return `<div class="application-doc">
    <div class="app-stamp">系统预审：通过<br>仅供参考</div>
    <div class="app-head">
      <div>
        <h3>DeepSeek 中国区入境申请表</h3>
        <p>DS-BORDER-04 · 数字身份与网络行为审查</p>
      </div>
      <div class="app-code">FORM 04<br>REV. 250</div>
    </div>
    <div class="app-form">
      <div class="app-row"><label>姓名</label><div class="val">${esc(a.name)}</div></div>
      <div class="app-row"><label>籍贯</label><div class="val">${esc(a.hometown)}</div></div>
      <div class="app-row"><label>手机号</label><div class="val mono">${esc(a.phone)}</div></div>
      <div class="app-row"><label>归属地</label><div class="val mono">${esc(a.phoneRegion)}</div></div>
      <div class="app-row"><label>运营商</label><div class="val">${esc(a.carrier)}</div></div>
      <div class="app-row"><label>常用 App</label><div class="val"><div class="chips">${a.apps.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div></div>
      <div class="app-row"><label>家乡话</label><div class="val hand">“${esc(a.dialect)}”</div></div>
      <div class="app-row"><label>入境目的</label><div class="val">${esc(a.purpose)}</div></div>
      <div class="app-row"><label>网络黑话测试</label><div class="val">
        <div class="quiz-box">
          <div class="quiz-q">${esc(a.quiz.q)}</div>
          <div class="quiz-a">${esc(a.quiz.a)}</div>
        </div>
      </div></div>
      <div class="app-row"><label>对 SI 的看法</label><div class="val"><div class="si-box">${esc(a.si)}</div></div></div>
      <div class="app-row"><label>申请人自述</label><div class="val"><div class="app-statement">${esc(a.statement)}</div></div></div>
    </div>
    <div class="app-sign">
      <span>申请人签名：<b>${esc(a.name)}</b></span>
      <span>日期：2026.04.0${DAYS[state.dayIndex].n}</span>
    </div>
  </div>`;
}

function renderExtra(t) {
  const e = t.extra;
  if (e.kind === 'chat') {
    return `<div class="phone-doc">
      <div class="phone-status"><span>DEEPSEEK PHONE</span><span>5G · 100%</span></div>
      <div class="chat-head"><span>微信</span><span>与 <b>${esc(e.with)}</b> 的聊天</span></div>
      <div class="chat-body">
        ${e.messages.map((m) => `
          <div class="bubble ${m.who === 'self' ? 'self' : 'other'}">
            ${m.who === 'self' ? '' : `<span class="who">${esc(m.name || e.with)}</span>`}
            ${esc(m.text)}
          </div>`).join('')}
      </div>
      <div class="chat-input">输入消息…</div>
      <div class="phone-footer"><span>语音</span><span>表情</span><span>相册</span><span>位置</span></div>
    </div>`;
  }
  const handle = e.handle || '@user';
  const initial = handle.replace('@', '').slice(0, 1).toUpperCase();
  return `<div class="phone-doc">
    <div class="phone-status"><span>DEEPSEEK PHONE</span><span>5G · 100%</span></div>
    <div class="social-head">
      <div class="social-avatar">${esc(initial)}</div>
      <div class="social-meta">
        <b>${esc(handle)}</b>
        <span>${esc(e.sub)} · 注册于 2019 年</span>
      </div>
      <div class="ip-pill">IP ${esc(e.ip)}</div>
    </div>
    <div class="posts">
      ${(e.posts || []).map((p) => `
        <div class="post">
          <div class="post-text">${esc(p.text)}</div>
          <div class="post-meta"><span class="like">♡ ${Number(p.likes).toLocaleString('zh-CN')}</span><span>转发 ${Math.max(1, Math.round(p.likes / 9)).toLocaleString('zh-CN')}</span><span>3 小时前</span></div>
        </div>`).join('')}
    </div>
    <div class="phone-footer"><span>主页</span><span>帖子</span><span>关注</span><span>私信</span></div>
  </div>`;
}

/* ---------------------------------------------------------
   17. Rulebook
   --------------------------------------------------------- */
function openRulebook() {
  const body = document.querySelector('.rulebook-body');
  let box = document.getElementById('rulebookToday');
  if (!box) {
    box = document.createElement('div');
    box.id = 'rulebookToday';
    box.className = 'rulebook-section';
    body.prepend(box);
  }
  let rules = RULE_ORDER;
  let prefix = '通用规则';
  if (state.phase !== 'title' && state.phase !== 'story' && DAYS[state.dayIndex]) {
    rules = DAYS[state.dayIndex].rules;
    prefix = `第 ${DAYS[state.dayIndex].n} 天 · 今日规则`;
  }
  box.innerHTML = `<h3>${esc(prefix)}</h3>
    <ul>${rules.map((k) => `<li><b>${esc(RULES[k].label)}：</b>${esc(RULES[k].desc)}</li>`).join('')}</ul>`;
  openModal('ruleModal');
  sfx('paper');
}

/* ---------------------------------------------------------
   18. Reset / init
   --------------------------------------------------------- */
function resetGame() {
  clearInterval(state.timerId);
  closeAllModals();
  state = freshState();
  el.stampLayer.innerHTML = '';
  el.approveBtn.disabled = false;
  el.denyBtn.disabled = false;
  document.title = '深度边检 · DEEPSEEK BORDER CONTROL';
  const best = getBest();
  const note = document.querySelector('.title-note');
  if (note) {
    note.textContent = best > 0
      ? `本作纯属虚构。如有雷同，说明梗是真的。 · 历史最高分 ${best}`
      : '本作纯属虚构。如有雷同，说明梗是真的。';
  }
}

function startStory() {
  resetGame();
  ensureAudio();
  sfx('click');
  state.phase = 'story';
  showScreen('storyScreen');
}

function restartFromEnding() {
  resetGame();
  specTitle();
  showScreen('titleScreen');
}

function specTitle() {
  state.phase = 'title';
  document.title = '深度边检 · DEEPSEEK BORDER CONTROL';
}

function init() {
  renderTitleQueue();
  renderTicker();
  renderHUD();
  const best = getBest();
  if (best > 0) {
    const note = document.querySelector('.title-note');
    if (note) note.textContent = `本作纯属虚构。如有雷同，说明梗是真的。 · 历史最高分 ${best}`;
  }

  el.startBtn.addEventListener('click', startStory);
  el.storyBtn.addEventListener('click', () => {
    ensureAudio();
    sfx('click');
    startBriefing(0);
  });
  el.briefBtn.addEventListener('click', () => {
    ensureAudio();
    sfx('click');
    startDay();
  });
  el.briefHelpBtn.addEventListener('click', openRulebook);
  el.endingHelpBtn.addEventListener('click', openRulebook);
  el.rulebookBtn.addEventListener('click', openRulebook);
  el.approveBtn.addEventListener('click', () => doStamp('approve'));
  el.denyBtn.addEventListener('click', () => doStamp('deny'));
  el.resultNext.addEventListener('click', nextTraveler);
  el.dayNextBtn.addEventListener('click', advanceAfterPaper);
  el.restartBtn.addEventListener('click', restartFromEnding);
  el.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    el.soundBtn.textContent = '声音：' + (soundOn ? '开' : '关');
    if (soundOn) { ensureAudio(); sfx('click'); }
  });

  el.speech.addEventListener('click', () => {
    clearInterval(typeTimer);
    if (state.current) el.speechText.textContent = state.current.greeting;
  });

  el.docGrid.addEventListener('click', (ev) => {
    const card = ev.target.closest('.doc-card');
    if (!card) return;
    openDoc(card.dataset.doc);
  });

  $$('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  ['docModal', 'ruleModal'].forEach((id) => {
    $(id).addEventListener('click', (ev) => {
      if (ev.target === $(id)) closeModal(id);
    });
  });

  document.addEventListener('keydown', (ev) => {
    const anyDoc = el.docModal.classList.contains('open');
    const anyRule = el.ruleModal.classList.contains('open');
    const anyResult = el.resultModal.classList.contains('open');

    if (ev.key === 'Escape') {
      if (anyDoc) closeModal('docModal');
      else if (anyRule) closeModal('ruleModal');
      return;
    }
    if (anyResult) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        nextTraveler();
      }
      return;
    }
    if (anyDoc) {
      if (ev.key.toLowerCase() === 'u') {
        const uvBtn = el.docContent.querySelector('[data-uv]');
        if (uvBtn) uvBtn.click();
      }
      return;
    }
    if (anyRule) return;
    if (state.phase !== 'shift' || state.locked) return;

    if (ev.key === '1' || ev.key === '2' || ev.key === '3') {
      const d = state.docs[Number(ev.key) - 1];
      if (d) openDoc(d.key);
    } else if (ev.key.toLowerCase() === 'a') {
      doStamp('approve');
    } else if (ev.key.toLowerCase() === 'd') {
      doStamp('deny');
    }
  });

  // Make sure the first interaction can start audio on browsers that require it.
  document.addEventListener('pointerdown', ensureAudio, { once: true });
}

init();
