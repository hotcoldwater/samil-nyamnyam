/* 삼일냠냠 v2 — 데이터 연동 앱
 * - 정적 배포(Vercel)용 바닐라 JS. 서버·DB·외부 API 없음 → 300~400명 동시 접속에도 안전
 * - 데이터는 이 기기 브라우저(localStorage)에만 저장되는 데모 데이터
 * - 기획서 v5 규칙: 추정 수량(총무팀 확인값 − 구성원 수령 수), 30% 이하 부족·0 소진,
 *   혼잡도 = 최근 2분 · 이용자별 최신 제보의 중앙값(3명 미만 '확인 중'), 수령 참여 20P · 리뷰 30P,
 *   리뷰는 새벽 2시 기준 하루 단위 · 같은 날 같은 메뉴 1건(수정 가능, 추가 적립 없음),
 *   입고 1회에 알림 1건(알림 대상 품목이 있을 때만)
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ 상수 */
  var KEY = 'nyam-v2';
  var VERSION = 3;
  var MIN = 60000;
  var WINDOW = 2 * MIN;            // 줄 제보 유효 시간
  var ME = 'me';
  var ILL = ['fish', 'yogurt', 'icecream', 'donut', 'sandwich', 'milk', 'water', 'cookie', 'coffee', 'apple'];
  var ILL_NAME = { fish: '붕어빵', yogurt: '요거트', icecream: '아이스크림', donut: '도넛', sandwich: '샌드위치', milk: '우유', water: '생수', cookie: '쿠키', coffee: '커피', apple: '과일' };
  var BG = { fish: '#FCD9A8', yogurt: '#FBD3DC', icecream: '#D7EEE6', donut: '#F9D7C6', sandwich: '#F4E4BF', milk: '#EBDACB', water: '#D7ECF4', cookie: '#F6E2BC', coffee: '#ECDCCB', apple: '#F9D6D0' };
  var TAGS = ['맛있어요', '든든해요', '양이 적어요', '따뜻해요', '바삭해요', '시원해요', '달아요'];
  var AGAIN = { yes: '또 먹을래요', meh: '글쎄요', no: '아니요' };
  var WHEN = ['오늘 저녁', '내일', '미정'];

  /* ------------------------------------------------------------------ 유틸 */
  function now() { return Date.now(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function serviceDay(t) { var d = new Date(t - 2 * 3600e3); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(p) { return (p || 'id') + '-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function fmtQ(q) { return (Math.round(q * 10) / 10).toString(); }
  function rng(seed) { seed = seed >>> 0; return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

  /* ------------------------------------------------------------------ 아이콘 */
  var STAR_D = 'M12 2.8l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z';
  function svg(w, body, opt) {
    opt = opt || {};
    return '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="' + (opt.fill || 'none') + '" stroke="' + (opt.stroke || 'currentColor') + '" stroke-width="' + (opt.sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  var I = {
    clock: function (w, c) { return svg(w || 14, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', { stroke: c || '#716755' }); },
    check: function (w, c, sw) { return svg(w || 20, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', { stroke: c || '#276B2C', sw: sw || 2.2 }); },
    people: function (w, c) { return svg(w || 24, '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.9-3 3.1-4.6 6-4.6s5.1 1.6 6 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.6c2.3.2 3.8 1.6 4.5 4.4"/>', { stroke: c || '#222222' }); },
    chev: function (w, c) { return svg(w || 18, '<path d="M9 5l7 7-7 7"/>', { stroke: c || '#716755', sw: 2.2 }); },
    back: function () { return svg(22, '<path d="M15 5l-7 7 7 7"/>', { stroke: '#222222', sw: 2.2 }); },
    bell: function (w, c) { return svg(w || 22, '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', { stroke: c || '#222222' }); },
    card: function (w, c) { return svg(w || 26, '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.6-1.3 1.4-2 2.5-2s1.9.7 2.5 2"/><path d="M14 10h4"/><path d="M14 13.5h3"/>', { stroke: c || '#A84A06' }); },
    user: function (w, c) { return svg(w || 24, '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>', { stroke: c || 'currentColor' }); },
    target: function (w) { return svg(w || 24, '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>', { sw: 2 }); },
    pen: function (w, c) { return svg(w || 18, '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', { stroke: c || '#A84A06', sw: 2 }); },
    alert: function (w, c) { return svg(w || 22, '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>', { stroke: c || '#B42318' }); },
    box: function (w, c) { return svg(w || 22, '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>', { stroke: c || '#A84A06' }); },
    chart: function (w, c) { return svg(w || 22, '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>', { stroke: c || 'currentColor' }); },
    plus: function (w, c) { return svg(w || 22, '<path d="M12 5v14"/><path d="M5 12h14"/>', { stroke: c || '#A84A06', sw: 2.2 }); },
    list: function (w, c) { return svg(w || 22, '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>', { stroke: c || '#A84A06', sw: 2.2 }); },
    camera: function (w) { return svg(w || 20, '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', { stroke: '#4A443B' }); },
    logout: function () { return svg(18, '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>', { stroke: '#4A443B', sw: 2 }); },
    reset: function (w) { return svg(w || 18, '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>', { stroke: '#4A443B', sw: 2 }); },
    star: function (w, fill) { return '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="' + fill + '" aria-hidden="true"><path d="' + STAR_D + '"/></svg>'; }
  };
  function stars(avg, w) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += I.star(w || 14, avg >= i - 0.25 ? '#F5A100' : (avg >= i - 0.75 ? '#F7D58E' : '#D9C79C'));
    return '<span style="display:flex;gap:1px">' + out + '</span>';
  }

  /* ------------------------------------------------------------------ 시드 데이터 */
  function seed() {
    var T = now();
    var day = serviceDay(T);
    function item(o) {
      return Object.assign({ img: null, notify: false, lastIn: 0, confirmed: 0, confirmedAt: T - 12 * MIN, taken: 0, stockInAt: null, soldOutAt: null, pre: null, inCount: 0, sellouts: [] }, o);
    }
    var sIn = T - 75 * MIN, aIn = T - 4 * 3600e3;
    var items = [
      item({ id: 'fish', name: '미니 붕어빵', kind: 'season', illust: 'fish', notify: true, lastIn: 36, confirmed: 14, taken: 2, stockInAt: sIn, inCount: 1 }),
      item({ id: 'yogurt', name: '딸기 요거트', kind: 'season', illust: 'yogurt', notify: true, lastIn: 24, confirmed: 7, taken: 1, stockInAt: sIn, inCount: 1 }),
      item({ id: 'icecream', name: '아이스크림', kind: 'season', illust: 'icecream', notify: true, lastIn: 30, confirmed: 14, stockInAt: sIn, inCount: 1 }),
      item({ id: 'donut', name: '스페셜 도넛', kind: 'season', illust: 'donut', notify: true, pre: { when: '오늘 저녁', at: T - 40 * MIN } }),
      item({ id: 'sandwich', name: '햄치즈 샌드위치', kind: 'season', illust: 'sandwich', notify: true, lastIn: 20, confirmed: 0, stockInAt: sIn, soldOutAt: T - 3 * MIN, inCount: 1, sellouts: [72] }),
      item({ id: 'milk', name: '초코우유', kind: 'always', illust: 'milk', lastIn: 24, confirmed: 6, stockInAt: aIn, inCount: 1 }),
      item({ id: 'water', name: '생수', kind: 'always', illust: 'water', lastIn: 48, confirmed: 30, stockInAt: aIn, inCount: 1 }),
      item({ id: 'cookie', name: '버터쿠키', kind: 'always', illust: 'cookie', lastIn: 40, confirmed: 25, stockInAt: aIn, inCount: 1 }),
      item({ id: 'coffee', name: '드립백 커피', kind: 'always', illust: 'coffee', lastIn: 60, confirmed: 35, stockInAt: aIn, inCount: 1 }),
      item({ id: 'apple', name: '사과', kind: 'always', illust: 'apple', lastIn: 20, confirmed: 0, stockInAt: aIn, soldOutAt: T - 50 * MIN, inCount: 1, sellouts: [190] })
    ];
    var reviews = [];
    function rv(itemId, list) {
      list.forEach(function (r, i) {
        reviews.push({ id: uid('rv'), item: itemId, user: 'peer' + i, rating: r[0], again: r[1], tags: r[2] || [], note: r[3] || '', t: T - (r[4] || (60 - i * 4)) * MIN, day: day });
      });
    }
    rv('fish', [[5, 'yes', ['맛있어요', '바삭해요'], '바삭하고 따뜻해요', 3], [5, 'yes', ['맛있어요'], '팥이 넉넉해서 좋아요', 20], [4, 'yes', ['따뜻해요'], '조금 식었지만 맛있었어요', 56],
      [5, 'yes', ['맛있어요']], [5, 'yes', ['따뜻해요']], [5, 'yes', ['맛있어요', '따뜻해요']], [5, 'yes'], [5, 'yes', ['바삭해요']], [4, 'yes', ['맛있어요']], [4, 'yes'], [3, 'meh', ['양이 적어요']], [5, 'yes', ['맛있어요']]]);
    rv('yogurt', [[4, 'yes', ['달아요', '시원해요'], '상큼해요', 15], [3, 'meh', ['달아요'], '조금 달아요', 33]]);
    rv('icecream', [[5, 'yes', ['시원해요'], '야근 중 최고', 8], [5, 'yes', ['달아요']], [5, 'yes', ['시원해요']], [4, 'yes', ['맛있어요']]]);

    // 지난 6일 운영 기록(운영 분석 예시 데이터)
    var hist = {};
    var r = rng(20261013);
    items.forEach(function (it) {
      var base = { fish: 4.5, yogurt: 3.7, icecream: 4.7, donut: 4.4, sandwich: 4.1, milk: 4.0, water: 4.2, cookie: 3.9, coffee: 4.3, apple: 4.4 }[it.id];
      var sell = { fish: 85, yogurt: 140, icecream: 70, donut: 45, sandwich: 75, milk: 300, water: 0, cookie: 420, coffee: 0, apple: 200 }[it.id];
      hist[it.id] = [];
      for (var d = 1; d <= 6; d++) {
        var n = it.kind === 'season' ? 6 + Math.floor(r() * 10) : 1 + Math.floor(r() * 4);
        var ratings = [];
        for (var k = 0; k < n; k++) ratings.push(clamp(Math.round(base + (r() - 0.5) * 2), 1, 5));
        hist[it.id].push({
          d: d, n: n, sum: sum(ratings), yes: Math.round(n * clamp((base - 2.6) / 2.4 + (r() - 0.5) * 0.15, 0, 1)),
          ins: it.kind === 'season' ? 1 : 1 + Math.floor(r() * 2), sellout: sell ? Math.round(sell * (0.8 + r() * 0.4)) : null
        });
      }
    });

    // 사과 부족 제보 3건(동료)
    var shortage = [0, 1, 2].map(function (i) { return { id: uid('sh'), item: 'apple', user: 'peer' + i, kind: '소진', t: T - (45 - i * 10) * MIN, resolvedAt: null }; });

    return {
      v: VERSION, day: day, createdAt: T,
      items: items, reviews: reviews, hist: hist, shortage: shortage,
      lineReports: [], tags: [], records: [], points: [], notifs: [
        { id: uid('nt'), t: T - 40 * MIN, kind: 'pre', title: '입고 예고 · 스페셜 도넛', body: '오늘 저녁에 들어올 예정이에요.', read: true },
        { id: uid('nt'), t: sIn, kind: 'in', title: '미니 붕어빵 외 3종이 들어왔어요', body: '시즌 간식 입고 · 지금 확인해 보세요.', read: true }
      ],
      stockLog: [{ id: uid('lg'), t: sIn, items: [['fish', 36], ['yogurt', 24], ['icecream', 30], ['sandwich', 20]], notified: '미니 붕어빵 외 3종이 들어왔어요' }],
      settings: { stockIn: true, pre: true, review: true },
      demo: { scenario: 'auto' }
    };
  }

  /* ------------------------------------------------------------------ 저장소 */
  var mem = null;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === VERSION && s.day === serviceDay(now())) return s;  // 새벽 2시가 지나면 새 날로 시작
      }
    } catch (e) { /* 저장소를 쓸 수 없으면 메모리만 */ }
    return seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  var S = load(); save();
  function resetDemo() { S = seed(); save(); ui = freshUI(); }

  /* ------------------------------------------------------------------ 도메인 계산 */
  function getItem(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }
  function est(it) { return Math.max(0, it.confirmed - it.taken); }
  function isPre(it) { return !!it.pre && est(it) === 0; }
  function stateOf(it) {
    if (isPre(it)) return 'pre';
    if (!it.stockInAt && it.lastIn === 0) return 'none';
    var q = est(it);
    if (q === 0) return 'out';
    if (it.lastIn > 0 && q <= it.lastIn * 0.3) return 'low';
    return 'ok';
  }
  var ST = {
    ok: { label: '넉넉해요', fg: 'var(--stock-ok)', bg: 'var(--stock-ok-soft)', dot: 'var(--stock-ok)', short: '' },
    low: { label: '부족해요', fg: 'var(--stock-low)', bg: 'var(--stock-low-soft)', dot: 'var(--stock-low-dot)', short: '부족' },
    out: { label: '소진됐어요', fg: 'var(--stock-out-strong)', bg: 'var(--stock-out-soft)', dot: 'var(--stock-out)', short: '소진' },
    pre: { label: '입고 예정', fg: 'var(--brand-800)', bg: 'var(--brand-100)', dot: 'var(--brand-500)', short: '입고 예정' },
    none: { label: '재고 없음', fg: 'var(--ink-500)', bg: 'var(--surface-sunken)', dot: 'var(--pending)', short: '재고 없음' }
  };
  function qtyText(it) {
    var q = est(it);
    if (q === 0) return '0개';
    return (it.taken > 0 || it.kind === 'season' ? '약 ' : '') + q + '개';
  }
  function seasonAvailable() { return S.items.filter(function (it) { return it.kind === 'season' && stateOf(it) !== 'out' && stateOf(it) !== 'pre' && stateOf(it) !== 'none'; }); }
  function todayReviews(id) { var d = serviceDay(now()); return S.reviews.filter(function (r) { return r.item === id && r.day === d; }); }
  function reviewStats(list) {
    var n = list.length;
    if (!n) return { n: 0, avg: 0, again: 0, dist: [0, 0, 0, 0, 0], tags: [] };
    var dist = [0, 0, 0, 0, 0], tagc = {};
    list.forEach(function (r) { dist[r.rating - 1]++; (r.tags || []).forEach(function (t) { tagc[t] = (tagc[t] || 0) + 1; }); });
    var tags = Object.keys(tagc).sort(function (a, b) { return tagc[b] - tagc[a]; }).slice(0, 3);
    return { n: n, avg: sum(list.map(function (r) { return r.rating; })) / n, again: Math.round(100 * list.filter(function (r) { return r.again === 'yes'; }).length / n), dist: dist, tags: tags };
  }
  function openShortage(id) { return S.shortage.filter(function (s) { return s.item === id && !s.resolvedAt; }); }

  // 동료 줄 제보(모의) — 30초마다 서버가 다시 집계하는 상황을 브라우저에서 재현
  var SCEN = { auto: { base: 8, label: '자동' }, free: { base: 2, label: '여유' }, normal: { base: 9, label: '보통' }, busy: { base: 19, label: '혼잡' }, few: { base: 8, label: '제보 부족' } };
  function peerReports(T) {
    if (!seasonAvailable().length) return [];
    var sc = S.demo.scenario || 'auto';
    var bucket = Math.floor(T / 30000);
    var r = rng(bucket * 31 + sc.length * 7);
    var base = SCEN[sc].base;
    if (sc === 'auto') base = 7 + Math.round(3 * Math.sin(bucket / 6));
    var n = sc === 'few' ? 1 : 3 + Math.floor(r() * 3);
    var out = [];
    for (var i = 0; i < n; i++) {
      var q = Math.max(0, Math.round(base + (r() - 0.5) * Math.max(4, base * 0.7)));
      out.push({ user: 'peer' + i, q: q, t: T - Math.floor(r() * 100) * 1000, peer: true });
    }
    return out;
  }
  function congestion(T) {
    T = T || now();
    var mine = S.lineReports.filter(function (r) { return T - r.t <= WINDOW; });
    var latest = {};
    peerReports(T).concat(mine).forEach(function (r) { if (!latest[r.user] || latest[r.user].t < r.t) latest[r.user] = r; });
    var valid = Object.keys(latest).map(function (k) { return latest[k]; });
    var qs = valid.map(function (r) { return r.q; });
    var Q = median(qs);
    var level = valid.length < 3 ? 'pending' : (Q < 5 ? 'free' : (Q < 15 ? 'normal' : 'busy'));
    return { n: valid.length, Q: Q, level: level, reports: valid.sort(function (a, b) { return a.q - b.q; }), at: Math.floor(T / 30000) * 30000, active: seasonAvailable().length > 0 };
  }
  var LV = {
    free: { label: '여유', fg: 'var(--stock-ok)', bg: 'var(--stock-ok-soft)', dot: 'var(--stock-ok)' },
    normal: { label: '보통', fg: 'var(--stock-low)', bg: 'var(--stock-low-soft)', dot: 'var(--stock-low-dot)' },
    busy: { label: '혼잡', fg: 'var(--stock-out-strong)', bg: 'var(--stock-out-soft)', dot: 'var(--stock-out)' },
    pending: { label: '확인 중', fg: 'var(--ink-500)', bg: 'var(--surface-sunken)', dot: 'var(--pending)' }
  };
  function myPoints() { return sum(S.points.map(function (p) { return p.pts; })); }
  function unread() { return S.notifs.filter(function (n) { return !n.read; }).length; }
  function myReviewToday(id) { var d = serviceDay(now()); for (var i = 0; i < S.reviews.length; i++) { var r = S.reviews[i]; if (r.user === ME && r.item === id && r.day === d) return r; } return null; }

  /* ------------------------------------------------------------------ 상태 변경(액션) */
  function notify(kind, title, body) {
    var allow = kind === 'in' ? S.settings.stockIn : (kind === 'pre' ? S.settings.pre : (kind === 'review' ? S.settings.review : true));
    if (!allow) return false;
    S.notifs.unshift({ id: uid('nt'), t: now(), kind: kind, title: title, body: body, read: false });
    toast(title, body, kind);
    return true;
  }
  function submitPick() {
    var T = now();
    var picked = Object.keys(ui.pick).filter(function (k) { return ui.pick[k] > 0; });
    if (!picked.length) return null;
    var hadSeason = seasonAvailable().length > 0;
    var before = {};
    // [개선 2] 직접 고른 인원(0명 포함)만 줄 제보로 저장. '확인 못 했어요'는 수령만 기록
    var reported = hadSeason && typeof ui.line === 'number';
    var tag = { id: ui.tagId || uid('tag'), t: T, line: reported ? ui.line : null, lineSkipped: hadSeason && !reported, items: [] };
    picked.forEach(function (id) {
      var it = getItem(id); var q = ui.pick[id];
      before[id] = est(it);
      it.taken += q;
      if (est(it) === 0 && !it.soldOutAt) { it.soldOutAt = T; if (it.stockInAt) it.sellouts.push(Math.round((T - it.stockInAt) / MIN)); }
      tag.items.push([id, q]);
      S.records.unshift({ id: uid('rc'), tag: tag.id, item: id, qty: q, line: tag.line, t: T, day: serviceDay(T) });
    });
    var congBefore = congestion(T);
    if (reported) S.lineReports.push({ user: ME, q: ui.line, t: T, tag: tag.id });
    S.tags.unshift(tag);
    var names = picked.map(function (id) { return getItem(id).name; });
    S.points.unshift({ t: T, what: '수령 참여 · ' + names[0] + (names.length > 1 ? ' 외 ' + (names.length - 1) + '종' : ''), pts: 20 });
    save();
    ui.last = { tag: tag.id, before: before, congBefore: congBefore, hadSeason: hadSeason, lineReported: reported };
    ui.pick = {}; ui.line = null; ui.lineHint = false; ui.tagId = null;
    if (S.settings.review) setTimeout(function () { toast('리뷰를 남기면 30P를 더 드려요', names[0] + '은(는) 어떠셨나요?', 'review'); }, 1400);
    return tag;
  }
  function editLastLine(delta) {
    var T = now();
    var r = null;
    for (var i = S.lineReports.length - 1; i >= 0; i--) if (S.lineReports[i].user === ME) { r = S.lineReports[i]; break; }
    if (!r || T - r.t > WINDOW) return false;
    if (ui.last && r.tag !== ui.last.tag) return false;   // [개선 2] 이번 수령에서 제보한 기록만 고침
    r.q = clamp(r.q + delta, 0, 99); r.t = T;     // 2분 안에 고치면 최신 기록으로 갱신
    for (var j = 0; j < S.tags.length; j++) if (S.tags[j].id === r.tag) S.tags[j].line = r.q;
    S.records.forEach(function (rc) { if (rc.tag === r.tag) rc.line = r.q; });
    save(); return true;
  }
  function saveReview(id, data) {
    var T = now(); var day = serviceDay(T);
    var ex = myReviewToday(id);
    if (ex) { Object.assign(ex, data, { edited: T }); save(); return { edited: true, pts: 0 }; }
    S.reviews.unshift(Object.assign({ id: uid('rv'), item: id, user: ME, t: T, day: day }, data));
    S.points.unshift({ t: T, what: '리뷰 · ' + getItem(id).name, pts: 30 });
    save(); return { edited: false, pts: 30 };
  }
  function reportShortage(id, kind) {
    var dup = S.shortage.filter(function (s) { return s.item === id && s.user === ME && !s.resolvedAt; });
    if (dup.length) return false;
    S.shortage.unshift({ id: uid('sh'), item: id, user: ME, kind: kind, t: now(), resolvedAt: null });
    save(); return true;
  }
  function stockIn(entries) {   // entries: [[id, qty], ...]
    var T = now();
    entries = entries.filter(function (e) { return e[1] > 0; });
    if (!entries.length) return null;
    // 입고 예정 품목을 앞에, 그다음 알림 대상
    entries.sort(function (a, b) { var A = getItem(a[0]), B = getItem(b[0]); return (B.pre ? 2 : 0) + (B.notify ? 1 : 0) - ((A.pre ? 2 : 0) + (A.notify ? 1 : 0)); });
    var resolved = 0;
    entries.forEach(function (e) {
      var it = getItem(e[0]);
      it.confirmed = est(it) + e[1]; it.taken = 0; it.lastIn = e[1]; it.stockInAt = T; it.confirmedAt = T;
      it.soldOutAt = null; it.pre = null; it.inCount = (it.inCount || 0) + 1;
      S.shortage.forEach(function (s) { if (s.item === it.id && !s.resolvedAt) { s.resolvedAt = T; resolved++; } });
    });
    var targets = entries.filter(function (e) { return getItem(e[0]).notify; });
    var title = null;
    if (targets.length) {
      title = getItem(targets[0][0]).name + (entries.length > 1 ? ' 외 ' + (entries.length - 1) + '종이' : '이(가)') + ' 들어왔어요';
    }
    S.stockLog.unshift({ id: uid('lg'), t: T, items: entries, notified: title });
    save();
    if (title) notify('in', title, '지금 간식현황에서 남은 수량과 줄을 확인해 보세요.');
    return { title: title, resolved: resolved, count: entries.length };
  }
  function registerMenu(f) {
    var T = now();
    var it = null;
    S.items.forEach(function (x) { if (x.name.replace(/\s/g, '') === f.name.replace(/\s/g, '')) it = x; });
    var isNew = !it;
    if (isNew) {
      it = { id: 'm' + T.toString(36), name: f.name.trim(), kind: f.kind, illust: f.illust, img: f.img || null, notify: f.notify, lastIn: 0, confirmed: 0, confirmedAt: T, taken: 0, stockInAt: null, soldOutAt: null, pre: null, inCount: 0, sellouts: [] };
      S.items.push(it);
      S.hist[it.id] = [];
    } else {
      it.kind = f.kind; it.notify = f.notify; it.illust = f.illust; if (f.img) it.img = f.img;
    }
    if (f.pre) {
      it.pre = { when: f.when, at: T };
      save();
      notify('pre', '입고 예고 · ' + it.name, f.when === '미정' ? '곧 들어올 예정이에요.' : f.when + ' 들어올 예정이에요.');
    } else save();
    return { item: it, isNew: isNew };
  }
  function confirmQty(id, q) {
    var it = getItem(id); var T = now();
    it.confirmed = q; it.taken = 0; it.confirmedAt = T;
    if (q === 0 && !it.soldOutAt && it.stockInAt) { it.soldOutAt = T; it.sellouts.push(Math.round((T - it.stockInAt) / MIN)); }
    if (q > 0) it.soldOutAt = null;
  }

  /* ------------------------------------------------------------------ 화면 조각 */
  var ui = freshUI();
  function freshUI() { return { pick: {}, line: null, tagId: null, last: null, allReviews: {}, prefill: null, menu: null, ana: { period: 'week', kind: 'all', sort: 'good' }, histAll: false, inQty: {}, checkQty: {} }; }

  function header(opts) {
    opts = opts || {};
    var right = '';
    if (opts.admin) right = '<span class="hdr-pill">총무팀 · 데모</span>';
    else {
      var u = unread();
      right = '<a class="hdr-btn" href="#notifs" aria-label="알림' + (u ? ' ' + u + '건' : '') + '">' + I.bell(22) + (u ? '<span class="hdr-btn__badge">' + u + '</span>' : '') + '</a>';
    }
    return '<header class="app-header"><a class="logo" href="' + (opts.admin ? '#admin' : '#home') + '">삼일<span class="logo__accent">냠냠</span>' + (opts.admin ? '<span style="font-size:15px;font-weight:700;color:var(--ink-500);margin-left:6px">운영</span>' : '') + '</a>' + right + '</header>';
  }
  function tabbar(active) {
    function tab(h, label, ic, key) { var on = key === active; return '<a class="tab' + (on ? ' is-active' : '') + '" href="' + h + '"' + (on ? ' aria-current="page"' : '') + '>' + ic + '<span>' + label + '</span></a>'; }
    return '<nav class="tabbar" aria-label="주요 메뉴">' + tab('#home', '간식현황', I.target(24), 'home') + tab('#receive', '간식수령 및 제보', I.card(24, 'currentColor'), 'receive') + tab('#account', '내 계정', I.user(24), 'account') + '</nav>';
  }
  function adminTabbar(active) {
    function tab(h, label, ic, key) { var on = key === active; return '<a class="tab' + (on ? ' is-active' : '') + '" href="' + h + '"' + (on ? ' aria-current="page"' : '') + '>' + ic + '<span>' + label + '</span></a>'; }
    return '<nav class="tabbar" aria-label="운영 메뉴">' + tab('#admin', '운영 관리', I.list(24, 'currentColor'), 'admin') + tab('#admin-in', '입고 기록', I.box(24, 'currentColor'), 'in') + tab('#analytics', '운영 분석', I.chart(24), 'ana') + tab('#home', '구성원 화면', I.user(24), 'member') + '</nav>';
  }
  function thumb(it, size, radius) {
    size = size || 48;
    var inner = it.img ? '<img src="' + it.img + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:' + (radius || 14) + 'px">' : '<img src="assets/illust/' + it.illust + '.svg" width="' + Math.round(size * 0.82) + '" height="' + Math.round(size * 0.82) + '" alt="" style="display:block">';
    return '<div class="thumb" aria-hidden="true" style="width:' + size + 'px;height:' + size + 'px;border-radius:' + (radius || 14) + 'px;overflow:hidden">' + inner + '</div>';
  }
  function heroArt(it, size, left, top) {
    if (it.img) return '<div aria-hidden="true" style="position:absolute;inset:0"><img src="' + it.img + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>';
    return '<div aria-hidden="true" style="position:absolute;left:' + left + ';top:' + top + 'px;animation:ny-floatC 4s ease-in-out infinite"><img src="assets/illust/' + it.illust + '.svg" width="' + size + '" height="' + size + '" alt="" style="display:block"></div>';
  }
  function kindBadge(it) { return it.kind === 'season' ? '<span class="badge badge--season">시즌</span>' : '<span class="badge badge--always">상시</span>'; }
  function statusPill(it) { var st = ST[stateOf(it)]; return '<span class="pill" style="background:' + st.bg + ';color:' + st.fg + '"><i style="background:' + st.dot + '"></i>' + st.label + '</span>'; }
  function lvPill(c) { var l = LV[c.level]; return '<span class="pill" style="height:24px;padding:0 9px;background:' + l.bg + ';color:' + l.fg + '"><i style="background:' + l.dot + '"></i>' + l.label + '</span>'; }
  function calcLine(c) {
    if (!c.reports.length) return '<div class="calc">유효 제보 없음</div>';
    var mids = [];
    var n = c.reports.length;
    if (n % 2) mids = [Math.floor(n / 2)]; else mids = [n / 2 - 1, n / 2];
    var html = c.reports.map(function (r, i) { return '<span class="calc__q' + (mids.indexOf(i) >= 0 ? ' is-mid' : '') + (r.user === ME ? ' is-me' : '') + '" title="' + (r.user === ME ? '내 제보' : '동료 제보(모의)') + '">' + r.q + '</span>'; }).join('');
    return '<div class="calc">' + html + (c.level === 'pending' ? '<span>→ 3명 미만이라 확정하지 않아요</span>' : '<span>→ 중앙값 <b style="color:var(--ink-900)">' + fmtQ(c.Q) + '명</b></span>') + '</div>';
  }

  /* ------------------------------------------------------------------ 화면: 시작 */
  function vSplash() {
    var dots = [[70, 24, 'var(--brand-500)', 0], [330, 150, 'var(--season)', .6], [40, 210, '#5AC8E8', 1.2], [352, 330, '#F57AA0', .3], [170, 8, '#7ED36B', .9], [230, 350, 'var(--brand-500)', 1.5], [8, 120, '#F57AA0', 1.8], [300, 96, '#5AC8E8', .45]]
      .map(function (d) { return '<div aria-hidden="true" style="position:absolute;left:' + d[0] + 'px;top:' + d[1] + 'px;width:14px;height:6px;border-radius:999px;background:' + d[2] + ';animation:ny-twinkle 2.6s ease-in-out ' + d[3] + 's infinite"></div>'; }).join('');
    function fl(ill, l, t, w, delay, anim) { return '<div style="position:absolute;left:' + l + 'px;top:' + t + 'px;animation:ny-pop .8s cubic-bezier(.2,.9,.3,1.3) ' + delay + 's both"><div style="animation:' + anim + '"><img src="assets/illust/' + ill + '.svg" width="' + w + '" height="' + w + '" alt="" style="display:block"></div></div>'; }
    return '<div class="screen" data-screen="splash" aria-label="시작" style="background:var(--splash-ground)">' +
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:96px 24px 0">' +
      '<h1 style="margin:0;font-size:44px;line-height:48px;font-weight:800;letter-spacing:-0.03em;animation:ny-up .6s ease-out .15s both">삼일<span style="color:var(--logo-accent)">냠냠</span></h1>' +
      '<p style="margin:0;font-size:16px;line-height:24px;color:var(--ink-700);animation:ny-up .6s ease-out .25s both">탕비실 간식, 뭐가 남았고 줄은 어떤지<br>가기 전에 확인하세요.</p></div>' +
      '<div class="splash-stage" aria-hidden="true" style="position:relative;height:400px;margin-top:20px">' +
      '<div style="position:absolute;left:45px;top:50px;width:300px;height:300px;border-radius:999px;background:var(--illust-thumb-bg);animation:ny-breathe 5s ease-in-out infinite"></div>' +
      '<div style="position:absolute;left:85px;top:90px;width:220px;height:220px;border-radius:999px;background:#FFE5C2;animation:ny-breathe 5s ease-in-out .4s infinite"></div>' + dots +
      fl('fish', 14, 36, 140, .35, 'ny-floatA 4.2s ease-in-out 1.15s infinite') + fl('icecream', 258, 16, 116, .5, 'ny-floatB 3.8s ease-in-out 1.3s infinite') +
      fl('cookie', 30, 262, 104, .65, 'ny-floatC 4.6s ease-in-out 1.45s infinite') + fl('milk', 262, 252, 100, .8, 'ny-floatB 4s ease-in-out 1.6s infinite') + fl('donut', 100, 112, 190, .2, 'ny-bob 3.4s ease-in-out 1.1s infinite') +
      '</div><div style="flex:1"></div>' +
      '<div style="display:flex;flex-direction:column;gap:14px;padding:0 20px 40px;animation:ny-up .6s ease-out 1s both">' +
      '<a class="btn btn--primary" href="#home">시작하기</a>' +
      '<p style="margin:0;text-align:center;font-size:13px;line-height:18px;color:var(--ink-500)">데모에서는 실제 계정 정보를 받지 않아요.<br>실제 도입 시 회사 계정으로 로그인해요.</p></div></div>';
  }

  /* ------------------------------------------------------------------ 화면: 간식현황 */
  function heroCard(it) {
    var s = reviewStats(todayReviews(it.id));
    var bg = BG[it.illust] || 'var(--illust-thumb-bg)';
    return '<a href="#item-' + it.id + '" aria-label="' + esc(it.name) + ' 상세 보기" style="position:relative;flex-shrink:0;width:318px;max-width:calc(100vw - 56px);height:340px;border-radius:24px;overflow:hidden;background:' + bg + ';box-shadow:var(--shadow-hero);color:var(--on-dark);scroll-snap-align:start">' +
      (it.img ? '' : '<div aria-hidden="true" style="position:absolute;left:50%;margin-left:-120px;top:-20px;width:240px;height:240px;border-radius:999px;background:rgba(255,255,255,.45)"></div>') +
      heroArt(it, 210, 'calc(50% - 105px)', 4) +
      '<div style="position:absolute;left:0;right:0;bottom:0;padding:56px 20px 20px;background:var(--scrim-gradient);display:flex;flex-direction:column;gap:6px">' +
      '<div style="display:flex;gap:6px">' + kindBadge(it) + (stateOf(it) === 'low' ? '<span class="badge" style="background:var(--stock-low-soft);color:var(--stock-low)">부족</span>' : '') + '</div>' +
      '<span style="font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.02em">' + esc(it.name) + '</span>' +
      '<span style="display:flex;align-items:center;gap:6px;font-size:15px;line-height:22px;font-weight:600">' + qtyText(it) + ' 남음' + (s.n ? ' · ' + I.star(14, '#FFC94A') + ' ' + s.avg.toFixed(1) + ' (' + s.n + '명)' : ' · 첫 리뷰를 기다려요') + '</span>' +
      '<span style="display:flex;align-items:center;gap:6px;font-size:13px;line-height:18px">' + I.clock(14, '#FFFFFF') + '오늘 ' + hhmm(it.stockInAt) + ' 입고 · 총무팀 확인 ' + hhmm(it.confirmedAt) + '</span>' +
      '</div></a>';
  }
  function congestionCard(c) {
    var l = LV[c.level];
    var seg = ['free', 'normal', 'busy'].map(function (k) {
      var on = c.level === k; var L = LV[k];
      return '<span style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:14px;background:' + (on ? L.bg : 'var(--surface-sunken)') + ';border:1.5px solid ' + (on ? L.dot : 'var(--surface-sunken)') + ';color:' + (on ? L.fg : 'var(--ink-500)') + ';font-size:13px;font-weight:' + (on ? 700 : 600) + '">' + L.label + '<span style="font-size:11px">' + { free: '5명 미만', normal: '5~14명', busy: '15명 이상' }[k] + '</span></span>';
    }).join('');
    var main = c.level === 'pending'
      ? '<span style="font-size:15px;line-height:22px;color:var(--ink-700)">최근 2분 제보가 ' + c.n + '명뿐이라 아직 확정하지 않았어요</span>'
      : '<span style="font-size:15px;line-height:22px;color:var(--ink-700)">지금 줄 <b style="color:var(--ink-900)">약 ' + Math.round(c.Q) + '명</b> · 최근 2분 제보 ' + c.n + '명</span>';
    return '<section class="card" style="padding:20px;gap:14px" data-live="cong"><div style="display:flex;align-items:center;justify-content:space-between"><h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">현재 대기 상태</h2><span style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--ink-500)">' + I.clock(14) + '갱신 ' + hhmm(c.at) + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;background:' + l.bg + '"><div style="width:52px;height:52px;border-radius:999px;background:' + l.dot + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' + I.people(26, '#222222') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px"><span style="display:flex;align-items:center;gap:8px;font-size:24px;line-height:30px;font-weight:800;color:' + l.fg + '"><span style="width:10px;height:10px;border-radius:999px;background:' + l.dot + '"></span>' + l.label + '</span>' + main + '</div></div>' +
      '<div style="display:flex;gap:8px">' + seg + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:13px;line-height:18px;color:var(--ink-500)">간식을 받은 동료가 남긴 \'내 뒤 줄 인원\'의 중앙값이에요. 30초마다 다시 계산해요.</span>' + calcLine(c) + '</div></section>';
  }
  function vHome() {
    var season = seasonAvailable();
    var pre = S.items.filter(isPre);
    var out = S.items.filter(function (it) { return it.kind === 'season' && stateOf(it) === 'out'; });
    var always = S.items.filter(function (it) { return it.kind === 'always'; });
    var c = congestion();
    var lastCheck = Math.max.apply(null, always.map(function (a) { return a.confirmedAt || 0; }));
    var alwaysCard = '<div class="sec"><div class="sec__head"><h2 class="sec__title">상시 간식</h2><span class="sec__meta">총무팀 확인 ' + hhmm(lastCheck) + ' 기준</span></div><section class="card" style="padding:4px 20px 0">' +
      always.map(function (it) {
        var st = stateOf(it), S2 = ST[st], sh = openShortage(it.id);
        var sub = sh.length ? '부족 제보 ' + sh.length + '건 · 총무팀 확인 중' : (st === 'low' ? '직전 입고 ' + it.lastIn + '개' : '');
        var resolvedRecent = S.shortage.filter(function (s) { return s.item === it.id && s.resolvedAt && now() - s.resolvedAt < 3600e3; });
        if (!sh.length && resolvedRecent.length) sub = '리필 완료 · ' + hhmm(resolvedRecent[0].resolvedAt);
        return '<a class="row-link" href="#item-' + it.id + '">' + thumb(it) + '<div class="row-link__info"><span class="row-link__name">' + esc(it.name) + '</span>' + (sub ? '<span class="row-link__sub">' + sub + '</span>' : '') + '</div>' +
          '<span class="status" style="color:' + S2.fg + '"><i style="background:' + S2.dot + '"></i>' + (st === 'ok' ? qtyText(it) : (st === 'low' ? qtyText(it) + ' · 부족' : S2.short)) + '</span></a>';
      }).join('') +
      '<button type="button" class="btn btn--sand" style="margin:8px 0 16px" data-act="open-shortage">부족·소진 제보하기</button></section></div>';

    var top = season.length
      ? '<div class="carousel" data-carousel>' + season.map(heroCard).join('') + '</div><div class="dots" aria-hidden="true" data-dots>' + season.map(function (_, i) { return '<span class="dot' + (i ? '' : ' is-active') + '"></span>'; }).join('') + '</div>'
      : '<div style="padding:20px 20px 0"><section class="card" style="padding:20px;gap:6px;text-align:center"><span style="font-size:17px;font-weight:700">지금 남은 시즌 간식이 없어요</span><span style="font-size:13px;color:var(--ink-500)">상시 간식을 먼저 보여드릴게요. 입고되면 알림을 보내드려요.</span></section></div>';
    var body = '<div style="display:flex;flex-direction:column;gap:32px;padding:16px 20px 32px">';
    if (!season.length) body += alwaysCard;
    if (season.length) body += congestionCard(c);
    if (pre.length) body += '<div class="sec"><div class="sec__head"><h2 class="sec__title">입고 예정</h2><span class="sec__meta">총무팀 예고</span></div><section class="card" style="padding:4px 20px">' +
      pre.map(function (it) { return '<a class="row-link" href="#item-' + it.id + '">' + thumb(it) + '<div class="row-link__info"><span class="row-link__name">' + esc(it.name) + '</span><span class="row-link__sub">' + kindBadge(it) + '</span></div><span style="font-size:15px;font-weight:700;color:var(--brand-700)">' + esc(it.pre.when) + (it.pre.when === '미정' ? ' · 곧 입고' : ' 입고 예정') + '</span></a>'; }).join('') + '</section></div>';
    if (out.length) body += '<div class="sec"><div class="sec__head"><h2 class="sec__title">오늘 소진된 시즌 간식</h2></div><section class="card" style="padding:4px 20px">' +
      out.map(function (it) { return '<a class="row-link" href="#item-' + it.id + '">' + thumb(it) + '<div class="row-link__info"><span class="row-link__name">' + esc(it.name) + '</span><span class="row-link__sub">' + (it.stockInAt ? hhmm(it.stockInAt) + ' 입고 · ' : '') + (it.soldOutAt ? hhmm(it.soldOutAt) + ' 소진' : '소진') + '</span></div><span class="pill" style="background:var(--stock-out-soft);color:var(--stock-out-strong)"><i style="background:var(--stock-out)"></i>소진</span></a>'; }).join('') + '</section></div>';
    if (season.length) body += alwaysCard;
    body += '</div>';
    return '<div class="screen" data-screen="home" aria-label="간식현황">' + header() + top + body + '<div class="spacer"></div>' + tabbar('home') + '</div>';
  }

  /* ------------------------------------------------------------------ 화면: 간식 상세 */
  function vDetail(id) {
    var it = getItem(id);
    if (!it) return vHome();
    var st = stateOf(it), stt = ST[st];
    var list = todayReviews(id).sort(function (a, b) { return b.t - a.t; });
    var s = reviewStats(list);
    var bg = BG[it.illust] || 'var(--illust-thumb-bg)';
    var html = '<div class="screen" data-screen="detail" aria-label="간식 상세 · ' + esc(it.name) + '">' +
      '<div style="position:relative;height:330px;flex-shrink:0;background:' + bg + ';overflow:hidden">' +
      (it.img ? '' : '<div aria-hidden="true" style="position:absolute;left:50%;margin-left:-140px;top:34px;width:280px;height:280px;border-radius:999px;background:rgba(255,255,255,.45)"></div>') +
      heroArt(it, 250, 'calc(50% - 125px)', 40) +
      '<a href="#back" data-act="back" aria-label="뒤로" style="position:absolute;left:16px;top:16px;width:44px;height:44px;border-radius:999px;background:var(--surface);box-shadow:var(--shadow-card);display:flex;align-items:center;justify-content:center">' + I.back() + '</a></div>' +
      '<div style="position:relative;margin-top:-28px;border-radius:28px 28px 0 0;background:var(--ground);padding:24px 20px 32px;display:flex;flex-direction:column;gap:24px">' +
      '<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:8px">' + kindBadge(it) +
      '<span style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--ink-500)">' + I.clock(14) + (st === 'pre' ? esc(it.pre.when) + ' 입고 예정' : (it.stockInAt ? '오늘 ' + hhmm(it.stockInAt) + ' 입고' : '입고 기록 없음')) + '</span></div>' +
      '<h1 style="margin:0;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.02em">' + esc(it.name) + '</h1>' +
      (s.n ? '<div style="display:flex;align-items:center;gap:6px;font-size:15px;line-height:22px">' + I.star(16, '#F5A100') + '<b>' + s.avg.toFixed(1) + '</b><span style="color:var(--ink-500)">리뷰 ' + s.n + '개 · 또 먹을래요 ' + s.again + '%</span></div>' : '<div style="font-size:15px;line-height:22px;color:var(--ink-500)">아직 오늘의 리뷰가 없어요</div>') + '</div>';

    if (st === 'pre') {
      html += '<div style="display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:20px;background:var(--surface);box-shadow:var(--shadow-card)"><div style="flex:1;display:flex;flex-direction:column;gap:6px"><span style="font-size:13px;color:var(--ink-500)">총무팀 예고 · ' + hhmm(it.pre.at) + '</span><span style="font-size:26px;line-height:32px;font-weight:800">' + esc(it.pre.when) + ' 입고 예정</span>' + statusPill(it) + '</div>' + thumb(it, 72, 18) + '</div>' +
        '<p style="margin:0;padding:0 4px;font-size:13px;line-height:18px;color:var(--ink-500)">수량은 실제 입고 때 총무팀이 확인해 입력해요. ' + (S.settings.stockIn ? '들어오면 \'입고 알림\'으로 알려드려요.' : '\'내 계정\'에서 입고 알림을 켜면 들어올 때 알려드려요.') + '</p>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:20px;background:var(--surface);box-shadow:var(--shadow-card)"><div style="flex:1;display:flex;flex-direction:column;gap:4px"><span style="font-size:13px;line-height:18px;color:var(--ink-500)">지금 남은 수량</span><span style="font-size:32px;line-height:38px;font-weight:800;letter-spacing:-0.02em">' + qtyText(it) + '</span><span style="align-self:flex-start">' + statusPill(it) + '</span></div>' + thumb(it, 72, 18) + '</div>' +
        '<div style="display:flex;gap:10px">' +
        (it.stockInAt ? '<div style="flex:1;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:18px;background:var(--surface);box-shadow:var(--shadow-card)"><span style="width:40px;height:40px;flex-shrink:0;border-radius:12px;background:var(--illust-thumb-bg);display:flex;align-items:center;justify-content:center">' + I.clock(20, '#C05408') + '</span><span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--ink-500)">입고 ' + it.lastIn + '개</span><span style="font-size:20px;line-height:26px;font-weight:800">' + hhmm(it.stockInAt) + '</span></span></div>' : '') +
        '<div style="flex:1;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:18px;background:var(--surface);box-shadow:var(--shadow-card)"><span style="width:40px;height:40px;flex-shrink:0;border-radius:12px;background:var(--stock-ok-soft);display:flex;align-items:center;justify-content:center">' + I.check(20) + '</span><span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--ink-500)">총무팀 확인</span><span style="font-size:20px;line-height:26px;font-weight:800">' + hhmm(it.confirmedAt) + '</span></span></div></div>' +
        '<p style="margin:0;padding:0 4px;font-size:13px;line-height:18px;color:var(--ink-500)">' + (it.taken > 0 ? '총무팀 확인 수량 ' + it.confirmed + '개에서 동료들이 알려준 수령 ' + it.taken + '개를 빼서 추정했어요.' : '총무팀이 ' + hhmm(it.confirmedAt) + '에 확인한 수량이에요.') + (it.lastIn ? ' 직전 입고량의 30% 이하면 부족으로 표시해요.' : '') + '</p></div>';
    }
    if (it.kind === 'season' && st !== 'pre' && st !== 'out') {
      var c = congestion();
      html += '<a href="#home" style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:18px;background:var(--surface);box-shadow:var(--shadow-card);color:var(--ink-900)"><span style="width:44px;height:44px;flex-shrink:0;border-radius:14px;background:' + LV[c.level].bg + ';display:flex;align-items:center;justify-content:center">' + I.people(24, '#8A5A00') + '</span>' +
        '<span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="display:flex;align-items:center;gap:8px;font-size:17px;line-height:24px;font-weight:700">' + (c.level === 'pending' ? '줄 확인 중' : '지금 줄 약 ' + Math.round(c.Q) + '명') + lvPill(c) + '</span><span style="font-size:13px;color:var(--ink-500)">최근 2분 제보 ' + c.n + '명 · ' + hhmm(c.at) + ' 갱신</span></span>' + I.chev(18) + '</a>';
    }
    var sh = openShortage(id);
    if (sh.length) {
      html += '<div style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:18px;background:var(--surface);box-shadow:var(--shadow-card)"><span style="width:44px;height:44px;flex-shrink:0;border-radius:14px;background:var(--stock-out-soft);display:flex;align-items:center;justify-content:center">' + I.bell(22, '#B42318') + '</span><span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:17px;line-height:24px;font-weight:700">부족·소진 제보 ' + sh.length + '건</span><span style="font-size:13px;line-height:18px;color:var(--ink-500)">총무팀이 확인 중이에요 · 리필되면 완료로 바뀌어요' + (sh.some(function (x) { return x.user === ME; }) ? ' · 내 제보 포함' : '') + '</span></span></div>';
    }
    if (st !== 'pre') html += '<button type="button" class="btn btn--sand" data-act="open-shortage" data-id="' + it.id + '">' + (st === 'out' || st === 'low' ? '이 간식 부족·소진 제보하기' : '부족·소진 제보하기') + '</button>';

    // 리뷰
    html += '<div style="height:1px;background:var(--line)"></div><section style="display:flex;flex-direction:column;gap:16px"><div style="display:flex;align-items:baseline;justify-content:space-between"><h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">오늘의 리뷰</h2><span style="font-size:13px;color:var(--ink-500)">새벽 02:00 기준</span></div>';
    if (!s.n) {
      html += '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:32px 20px;border-radius:20px;background:var(--surface);box-shadow:var(--shadow-card);text-align:center"><span style="width:52px;height:52px;border-radius:999px;background:var(--brand-100);display:flex;align-items:center;justify-content:center">' + I.pen(24) + '</span><span style="font-size:17px;font-weight:700">아직 오늘의 리뷰가 없어요</span><span style="font-size:13px;line-height:18px;color:var(--ink-500)">간식을 받은 뒤 \'간식수령 및 제보\'에서 첫 리뷰를 남길 수 있어요.</span></div>';
    } else {
      var maxd = Math.max.apply(null, s.dist) || 1;
      html += '<div style="display:flex;align-items:center;gap:20px;padding:20px;border-radius:20px;background:var(--surface);box-shadow:var(--shadow-card)"><div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:104px"><span style="font-size:44px;line-height:48px;font-weight:800;letter-spacing:-0.02em">' + s.avg.toFixed(1) + '</span>' + stars(s.avg, 16) + '<span style="font-size:13px;color:var(--ink-500)">' + s.n + '명 참여</span></div><div style="flex:1;display:flex;flex-direction:column;gap:6px">' +
        [5, 4, 3, 2, 1].map(function (k) { var v = s.dist[k - 1]; return '<div style="display:flex;align-items:center;gap:8px"><span style="width:10px;font-size:11px;font-weight:600;color:var(--ink-500)">' + k + '</span><span style="flex:1;height:6px;border-radius:999px;background:var(--surface-sunken);overflow:hidden"><span style="display:block;width:' + Math.round(100 * v / Math.max(maxd, s.n * 0.67)) + '%;height:6px;border-radius:999px;background:var(--brand-500)"></span></span><span style="width:14px;text-align:right;font-size:11px;font-weight:600;color:var(--ink-500)">' + v + '</span></div>'; }).join('') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:20px;background:var(--surface);box-shadow:var(--shadow-card)"><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:15px;font-weight:600">또 먹을래요</span><span style="font-size:20px;line-height:26px;font-weight:800;color:var(--brand-700)">' + s.again + '%</span></div><div class="bar"><span style="width:' + s.again + '%"></span></div>' +
        (s.tags.length ? '<div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:4px">' + s.tags.map(function (t, i) { return '<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:999px;' + (i ? 'background:var(--surface);color:var(--ink-700);border:1px solid var(--line-strong);font-weight:600' : 'background:var(--brand-100);color:var(--brand-800);border:1px solid var(--brand-100);font-weight:700') + ';font-size:13px">' + esc(t) + '</span>'; }).join('') + '</div>' : '') + '</div>';
      var withNote = list.filter(function (r) { return r.note || r.user === ME; });
      var showAll = ui.allReviews[id];
      var shown = showAll ? list : withNote.slice(0, 3);
      html += '<div style="display:flex;flex-direction:column;gap:10px">' + shown.map(function (r) {
        return '<article style="display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:16px;background:var(--surface);border:1px solid ' + (r.user === ME ? 'var(--brand-500)' : 'var(--line)') + '"><div style="display:flex;align-items:center;justify-content:space-between"><span style="display:flex;align-items:center;gap:8px">' + stars(r.rating, 14) + '<span style="font-size:13px;color:var(--ink-500)">' + (r.user === ME ? '내 리뷰' : '익명') + ' · ' + AGAIN[r.again] + '</span></span><span style="font-size:13px;color:var(--ink-500)">' + hhmm(r.t) + (r.edited ? ' 수정' : '') + '</span></div>' + (r.note ? '<p style="margin:0;font-size:15px;line-height:22px">' + esc(r.note) + '</p>' : '') + ((r.tags || []).length ? '<span style="font-size:13px;color:var(--ink-500)">#' + r.tags.map(esc).join(' #') + '</span>' : '') + '</article>';
      }).join('') + '</div>';
      if (list.length > shown.length || showAll) html += '<button type="button" class="btn btn--text" style="color:var(--brand-700)" data-act="toggle-reviews" data-id="' + id + '">' + (showAll ? '접기' : '리뷰 ' + list.length + '개 모두 보기') + '</button>';
    }
    html += '<p style="margin:0;font-size:13px;line-height:18px;color:var(--ink-500)">리뷰는 매일 새벽 02:00에 새로 시작되고, 이전 리뷰는 운영 분석용으로 보관돼요.</p></section></div><div class="spacer"></div>' + tabbar('home') + '</div>';
    return html;
  }

  /* ------------------------------------------------------------------ 화면: 간식수령 */
  function steps(n) {
    return '<div aria-label="' + n + '/4 단계" style="display:flex;gap:6px">' + ['태그', '간식 고르기', '줄 인원', '완료'].map(function (l, i) {
      return '<div style="flex:1;display:flex;flex-direction:column;gap:8px"><span style="height:4px;border-radius:999px;background:' + (i < n ? 'var(--brand-500)' : 'var(--surface-sunken)') + '"></span><span style="text-align:center;font-size:11px;line-height:14px;font-weight:' + (i === n - 1 ? 700 : 600) + ';color:' + (i === n - 1 ? 'var(--brand-700)' : 'var(--ink-500)') + '">' + l + '</span></div>';
    }).join('') + '</div>';
  }
  function vReceive() {
    var d = serviceDay(now());
    var recs = S.records.filter(function (r) { return r.day === d; });
    var mine = S.shortage.filter(function (s) { return s.user === ME; });
    var html = '<div class="screen" data-screen="receive" aria-label="간식수령 및 제보">' + header() + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 32px">' +
      '<h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">간식수령 및 제보</h1>' +
      '<section class="card" style="padding:20px;gap:20px">' + steps(1) +
      '<div style="display:flex;flex-direction:column;gap:6px"><h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">간식을 받으셨나요?</h2><p style="margin:0;font-size:15px;line-height:22px;color:var(--ink-700)">냉장고에서 사원증을 태그하면 시작돼요. 가져간 간식과 줄 상황을 알려주면 <b style="color:var(--brand-700)">20P</b>를 드려요.</p></div>' +
      '<div data-tag-zone><button type="button" data-act="tag" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;height:72px;border-radius:16px;border:2px dashed var(--brand-500);background:var(--brand-100);color:var(--brand-800);font-family:inherit;font-size:17px;font-weight:700;cursor:pointer">' + I.card(26) + '사원증 태그 <span class="mock-note" style="border-color:var(--brand-500);color:var(--brand-800)">모의</span></button></div></section>' +
      '<div class="sec"><div class="sec__head"><h2 class="sec__title">오늘 내 수령 기록</h2><span class="sec__meta">' + (recs.length ? recs.length + '건' : '') + '</span></div>';
    if (!recs.length) html += '<section class="card rec-empty"><span class="rec-empty__title">아직 오늘 수령 기록이 없어요</span><span class="rec-empty__sub">냉장고에서 사원증을 태그하고 가져간 간식을 알려주세요.</span></section>';
    else {
      html += '<section class="card rec-list">' + recs.map(function (r) {
        var it = getItem(r.item); var rv = myReviewToday(r.item);
        var first = recs.filter(function (x) { return x.item === r.item; }).pop() === r;   // 같은 메뉴는 하루 1건 리뷰 → 가장 이른 기록에 버튼
        var btn = !first ? '<span class="btn-sm btn--done btn-sm--done">' + I.check(14, 'currentColor', 2.6) + '같은 메뉴</span>'
          : rv ? '<button type="button" class="btn-sm btn-sm--done" data-act="review" data-id="' + r.item + '">' + I.check(14, 'currentColor', 2.6) + '리뷰 완료 · 수정</button>'
            : '<button type="button" class="btn-sm btn-sm--tonal" data-act="review" data-id="' + r.item + '">' + I.pen(16) + '리뷰 +30P</button>';
        return '<div class="rec-row">' + thumb(it, 44, 12) + '<div class="rec-row__info"><span class="rec-row__name">' + esc(it.name) + '</span><span class="rec-row__sub">' + hhmm(r.t) + ' · ' + r.qty + '개' + (r.line != null ? ' · 줄 ' + r.line + '명' : '') + '</span></div>' + btn + '</div>';
      }).join('') + '</section>';
    }
    html += '</div>';
    html += '<div class="sec"><div class="sec__head"><h2 class="sec__title">부족·소진 제보</h2><span class="sec__meta">상시 간식이 없을 때</span></div><section class="card" style="padding:16px 20px;gap:12px">' +
      (mine.length ? '<div>' + mine.map(function (s) { var it = getItem(s.item); return '<div class="row-link" style="padding:10px 0">' + thumb(it, 40, 12) + '<div class="row-link__info"><span style="font-size:16px;font-weight:700">' + esc(it.name) + ' · ' + s.kind + '</span><span class="row-link__sub">' + hhmm(s.t) + ' 제보</span></div>' + (s.resolvedAt ? '<span class="pill" style="background:var(--stock-ok-soft);color:var(--stock-ok)"><i style="background:var(--stock-ok)"></i>리필 완료 ' + hhmm(s.resolvedAt) + '</span>' : '<span class="pill" style="background:var(--stock-low-soft);color:var(--stock-low)"><i style="background:var(--stock-low-dot)"></i>확인 중</span>') + '</div>'; }).join('') + '</div>' : '<span style="font-size:14px;line-height:20px;color:var(--ink-500)">가 보니 없거나 얼마 안 남았다면 알려주세요. 같은 품목 제보는 모아서 총무팀에 전달돼요.</span>') +
      '<button type="button" class="btn btn--sand" data-act="open-shortage">부족·소진 제보하기</button></section></div>';
    html += '</div><div class="spacer"></div>' + tabbar('receive') + '</div>';
    return html;
  }
  // [개선 1] 간식 고르기: 시즌/상시를 소제목으로 나눠 표시 (카드 디자인은 그대로)
  function pickGroup(title, list) {
    if (!list.length) return '';
    return '<div data-pick-group style="display:flex;flex-direction:column;gap:10px"><h3 style="margin:0;font-size:15px;line-height:20px;font-weight:700;color:var(--ink-700)">' + title + ' <span style="font-weight:600;color:var(--ink-500)">' + list.length + '</span></h3>' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">' + list.map(function (it) {
        var q = ui.pick[it.id] || 0;
        return '<div class="pick' + (q ? ' is-on' : '') + '"><span class="pick__check" aria-hidden="true">' + I.check(14, 'currentColor', 2.6) + '</span>' + thumb(it, 56, 14) +
          '<div class="pick__info"><span class="pick__name">' + esc(it.name) + '</span><div style="display:flex;gap:6px;align-items:center">' + kindBadge(it) + '<span style="font-size:12px;color:var(--ink-500)">' + qtyText(it) + '</span></div></div>' +
          '<button type="button" class="pick__select" data-act="pick-inc" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 선택">선택</button>' +
          '<div class="pick__qty"><button type="button" data-act="pick-dec" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 하나 빼기">−</button><span>' + q + '개</span><button type="button" data-act="pick-inc" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 하나 더하기">+</button></div></div>';
      }).join('') + '</div></div>';
  }
  function vPick() {
    var avail = S.items.filter(function (it) { var s = stateOf(it); return s === 'ok' || s === 'low'; });
    avail.sort(function (a, b) { return (a.kind === 'season' ? 0 : 1) - (b.kind === 'season' ? 0 : 1); });
    var hasSeason = seasonAvailable().length > 0;
    var cnt = sum(Object.keys(ui.pick).map(function (k) { return ui.pick[k]; }));
    var html = '<div class="screen" data-screen="pick" aria-label="간식 고르기">' + header() + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 24px">' +
      '<h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">간식수령 및 제보</h1>' + steps(hasSeason && cnt ? 3 : 2) +
      '<div class="tag-anim" style="height:48px;font-size:15px">' + I.check(20) + '사원증 태그 확인 · 냉장고 ' + hhmm(now()) + ' <span class="mock-note" style="border-color:var(--stock-ok);color:var(--stock-ok)">모의</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px"><h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">무엇을 가져가셨나요?</h2><p style="margin:0;font-size:13px;line-height:18px;color:var(--ink-500)">여러 개 고를 수 있어요 · 소진·입고 예정 간식은 빠져 있어요</p></div>' +
      pickGroup('시즌 간식', avail.filter(function (it) { return it.kind === 'season'; })) +
      pickGroup('상시 간식', avail.filter(function (it) { return it.kind !== 'season'; }));
    if (hasSeason) {
      html += '<section class="card" data-line-card style="padding:20px;gap:14px"><div style="display:flex;flex-direction:column;gap:4px"><h2 style="margin:0;font-size:17px;line-height:24px;font-weight:700">내 뒤에 남은 줄 인원</h2><p style="margin:0;font-size:13px;line-height:18px;color:var(--ink-500)">받고 나올 때 내 뒤에 서 있던 인원이에요. 혼잡도 계산에 바로 반영되고, 2분 안에는 고칠 수 있어요.</p></div>' +
        '<div class="stepper"><button type="button" aria-label="한 명 빼기" data-act="line-dec"' + (typeof ui.line === 'number' ? '' : ' aria-disabled="true"') + '>−</button><span class="stepper__val">' + (typeof ui.line === 'number' ? ui.line + '<span style="font-size:17px;font-weight:700"> 명</span>' : '<span style="font-size:17px;font-weight:700;color:var(--ink-500)">' + (ui.line === 'skip' ? '확인 못 함' : '선택 안 함') + '</span>') + '</span><button type="button" aria-label="한 명 더하기" data-act="line-inc">+</button></div>' +
        '<div class="chips">' + [0, 3, 8, 15, 20].map(function (v) { return '<button type="button" class="chip" style="height:36px;padding:0 12px;font-size:13px" aria-pressed="' + (ui.line === v) + '" data-act="line-set" data-v="' + v + '">' + (v === 0 ? '줄 없음' : v + '명') + '</button>'; }).join('') +
        '<button type="button" class="chip" style="height:36px;padding:0 12px;font-size:13px" aria-pressed="' + (ui.line === 'skip') + '" data-act="line-skip">확인 못 했어요</button></div>' +
        '<p data-line-hint ' + (ui.lineHint ? '' : 'hidden') + ' style="margin:0;font-size:13px;line-height:18px;font-weight:600;color:var(--stock-out-strong)">줄 인원을 고르거나 \'확인 못 했어요\'를 눌러 주세요</p>' +
        (ui.line === 'skip' ? '<p style="margin:0;font-size:13px;line-height:18px;color:var(--ink-500)">줄 제보 없이 수령만 기록하고 20P는 그대로 드려요.</p>' : '') + '</section>';
    } else {
      html += '<p style="margin:0;font-size:13px;line-height:18px;color:var(--ink-500)">지금은 시즌 간식이 없어 줄 인원은 받지 않아요.</p>';
    }
    html += '<div style="display:flex;flex-direction:column;gap:8px"><button type="button" class="btn btn--primary" data-act="submit-pick" aria-disabled="' + (cnt ? 'false' : 'true') + '">알려주고 20P 받기' + (cnt ? ' · ' + cnt + '개' : '') + '</button>' +
      '<p data-pick-hint ' + (ui.hint ? '' : 'hidden') + ' style="margin:0;text-align:center;font-size:13px;color:var(--stock-out-strong)">가져간 간식을 하나 이상 골라 주세요</p>' +
      '<a class="btn btn--text" href="#receive" data-act="skip-pick">건너뛰기</a></div></div>' + pickBar(cnt, hasSeason) + '<div class="spacer"></div>' + tabbar('receive') + '</div>';
    return html;
  }
  // [개선 1] 고른 간식 요약 + 다음 버튼. 제출 버튼이 화면에 보이면 숨김(bindPickBar)
  function pickBar(cnt, hasSeason) {
    if (!cnt) return '';
    var picked = Object.keys(ui.pick).filter(function (k) { return ui.pick[k] > 0; });
    var summary = picked.map(function (k) { return esc(getItem(k).name) + ' ' + ui.pick[k]; }).join(' · ');
    return '<div class="pickbar" data-pickbar role="region" aria-label="고른 간식"><div class="pickbar__info"><span class="pickbar__count">' + cnt + '개 골랐어요</span><span class="pickbar__sum">' + summary + '</span></div>' +
      '<button type="button" class="btn btn--primary pickbar__btn" data-act="pickbar-next">' + (hasSeason ? '다음 · 줄 인원' : '다음') + '</button></div>';
  }
  function vDone() {
    var L = ui.last;
    if (!L) { return vReceive(); }
    var tag = null; for (var i = 0; i < S.tags.length; i++) if (S.tags[i].id === L.tag) tag = S.tags[i];
    if (!tag) return vReceive();
    var c = congestion();
    var canEdit = L.lineReported !== false && L.hadSeason && now() - tag.t <= WINDOW;
    var html = '<div class="screen" data-screen="done" aria-label="수령 참여 완료">' + header() + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 32px">' + steps(4) +
      '<section class="card done-hero"><span class="done-hero__icon">' + I.check(40, '#276B2C', 2.6) + '</span><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:800">알려주셔서 고마워요!</h1><span class="pill" style="height:32px;font-size:15px;background:var(--brand-100);color:var(--brand-800)">+20P 적립 · 지금 ' + myPoints() + 'P</span></section>' +
      '<div class="sec"><div class="sec__head"><h2 class="sec__title">바로 반영됐어요</h2><span class="sec__meta">' + hhmm(tag.t) + '</span></div><section class="card" style="padding:4px 20px">' +
      tag.items.map(function (e) { var it = getItem(e[0]); return '<div class="delta">' + thumb(it, 40, 12) + '<div class="row-link__info"><span style="font-size:16px;font-weight:700">' + esc(it.name) + ' · ' + e[1] + '개 수령</span><span class="row-link__sub">남은 수량(추정)</span></div><span style="font-size:15px;font-weight:700"><span style="color:var(--ink-500)">' + L.before[e[0]] + '</span> <span class="delta__arrow">→</span> ' + est(it) + '개</span></div>'; }).join('') +
      (L.hadSeason && L.lineReported === false ? '<div class="delta"><span style="width:40px;height:40px;border-radius:12px;background:var(--surface-sunken);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + I.people(22, '#8A7F72') + '</span><div class="row-link__info"><span style="font-size:16px;font-weight:700">대기 인원 미제보</span><span class="row-link__sub">혼잡도 계산에 넣지 않았어요 · 지금 ' + LV[c.level].label + '</span></div>' + lvPill(c) + '</div>' : '') +
      (L.hadSeason && L.lineReported !== false ? '<div class="delta"><span style="width:40px;height:40px;border-radius:12px;background:' + LV[c.level].bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' + I.people(22, '#8A5A00') + '</span><div class="row-link__info"><span style="font-size:16px;font-weight:700">줄 제보 ' + tag.line + '명</span><span class="row-link__sub">혼잡도 ' + LV[L.congBefore.level].label + ' → ' + LV[c.level].label + (c.Q != null ? ' · 중앙값 ' + fmtQ(c.Q) + '명' : '') + '</span></div>' + lvPill(c) + '</div>' : '') +
      '</section>' + (L.hadSeason ? '<div style="padding:0 4px">' + calcLine(c) + '</div>' : '') + '</div>';
    if (canEdit) html += '<section class="card" style="padding:16px 20px;gap:10px"><span style="font-size:15px;font-weight:700">줄 인원을 잘못 입력했나요?</span><span style="font-size:13px;color:var(--ink-500)">2분 안에는 고칠 수 있어요. 고치면 최신 기록으로 바뀌어요.</span><div class="stepper" style="padding:4px"><button type="button" data-act="edit-line" data-v="-1" aria-label="한 명 빼기">−</button><span class="stepper__val" style="font-size:22px">' + tag.line + '<span style="font-size:15px"> 명</span></span><button type="button" data-act="edit-line" data-v="1" aria-label="한 명 더하기">+</button></div></section>';
    html += '<div style="display:flex;flex-direction:column;gap:8px"><button type="button" class="btn btn--primary" data-act="review" data-id="' + tag.items[0][0] + '">' + esc(getItem(tag.items[0][0]).name) + ' 리뷰 쓰고 30P 받기</button><a class="btn btn--ghost" href="#receive">수령 기록 보기</a><a class="btn btn--text" href="#home">간식현황으로</a></div></div><div class="spacer"></div>' + tabbar('receive') + '</div>';
    return html;
  }

  /* ------------------------------------------------------------------ 시트: 리뷰 · 제보 */
  var sheetState = null;
  function openReview(id) {
    var ex = myReviewToday(id);
    sheetState = { type: 'review', id: id, rating: ex ? ex.rating : 0, again: ex ? ex.again : null, tags: ex ? ex.tags.slice() : [], note: ex ? ex.note : '', edit: !!ex };
    renderSheet();
  }
  function openShortageSheet(id) {
    sheetState = { type: 'shortage', id: id || null, kind: '부족' };
    renderSheet();
  }
  function closeSheet() { sheetState = null; var o = document.getElementById('overlay'); if (o) o.remove(); document.body.style.overflow = ''; }
  function renderSheet() {
    var old = document.getElementById('overlay'); if (old) old.remove();
    if (!sheetState) return;
    var st = sheetState, html = '';
    if (st.type === 'review') {
      var it = getItem(st.id);
      var rec = S.records.filter(function (r) { return r.item === st.id; })[0];
      var labels = ['', '별로예요', '아쉬워요', '괜찮아요', '맛있어요', '최고예요'];
      html = '<section class="sheet" role="dialog" aria-modal="true" aria-label="리뷰 쓰기"><span class="sheet__grab" aria-hidden="true"></span><div class="sheet__head"><h1 class="sheet__title">' + (st.edit ? '리뷰 수정' : '리뷰 쓰기') + '</h1><button type="button" class="sheet__close" data-act="close-sheet">닫기</button></div>' +
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:18px;background:var(--ground)">' + thumb(it, 56, 16) + '<div style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:17px;font-weight:700">' + esc(it.name) + '</span><span style="font-size:13px;color:var(--ink-500)">' + (rec ? '오늘 ' + hhmm(rec.t) + ' 수령 · ' + rec.qty + '개' : '오늘 수령') + '</span></div><span class="pill" style="height:28px;background:' + (st.edit ? 'var(--status-done-bg);color:var(--status-done-fg)' : 'var(--brand-100);color:var(--brand-800)') + '">' + (st.edit ? '적립 완료' : '+30P') + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:baseline;justify-content:space-between"><h3 style="margin:0;font-size:17px;font-weight:700">만족도</h3><span style="font-size:13px;font-weight:600;color:var(--ink-500)">' + (st.rating ? st.rating + '점 · ' + labels[st.rating] : '별을 눌러 주세요') + '</span></div>' +
        '<div style="display:flex;justify-content:center;gap:6px;padding:10px 8px;border-radius:18px;background:var(--ground)">' + [1, 2, 3, 4, 5].map(function (k) { return '<button type="button" class="star-btn" aria-label="' + k + '점" aria-pressed="' + (k <= st.rating) + '" data-act="rv-star" data-v="' + k + '"><svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path class="star-path" d="' + STAR_D + '"/></svg></button>'; }).join('') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px"><h3 style="margin:0;font-size:17px;font-weight:700">또 먹을래요?</h3><div class="chips">' + Object.keys(AGAIN).map(function (k) { return '<button type="button" class="chip" aria-pressed="' + (st.again === k) + '" data-act="rv-again" data-v="' + k + '">' + AGAIN[k] + '</button>'; }).join('') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px"><h3 style="margin:0;display:flex;align-items:baseline;gap:8px;font-size:17px;font-weight:700">태그<span style="font-size:13px;font-weight:600;color:var(--ink-500)">여러 개 가능</span></h3><div class="chips">' + TAGS.map(function (t) { return '<button type="button" class="chip" aria-pressed="' + (st.tags.indexOf(t) >= 0) + '" data-act="rv-tag" data-v="' + t + '">' + t + '</button>'; }).join('') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px"><label for="rv-note" style="display:flex;align-items:baseline;gap:8px;font-size:17px;font-weight:700">한마디<span style="font-size:13px;font-weight:600;color:var(--ink-500)">선택 · 40자</span></label><input id="rv-note" class="input" type="text" maxlength="40" placeholder="예: 바삭하고 따뜻해요" value="' + esc(st.note) + '"></div>' +
        '<p data-rv-hint hidden style="margin:0;text-align:center;font-size:13px;color:var(--stock-out-strong)">만족도와 \'또 먹을래요?\'를 골라 주세요</p>' +
        '<button type="button" class="btn btn--primary" data-act="rv-submit" aria-disabled="' + (st.rating && st.again ? 'false' : 'true') + '">' + (st.edit ? '리뷰 수정하기' : '리뷰 남기고 30P 받기') + '</button>' +
        '<p style="margin:0;text-align:center;font-size:12px;color:var(--ink-500)">같은 날 같은 메뉴는 리뷰 1건까지 적립돼요 · 수정해도 추가 적립은 없어요</p></section>';
    } else {
      var cands = S.items.filter(function (it) { return !isPre(it); });
      cands.sort(function (a, b) { return (a.kind === 'always' ? 0 : 1) - (b.kind === 'always' ? 0 : 1); });
      html = '<section class="sheet" role="dialog" aria-modal="true" aria-label="부족·소진 제보"><span class="sheet__grab" aria-hidden="true"></span><div class="sheet__head"><h1 class="sheet__title">부족·소진 제보</h1><button type="button" class="sheet__close" data-act="close-sheet">닫기</button></div>' +
        '<p style="margin:-8px 0 0;font-size:14px;line-height:20px;color:var(--ink-500)">어떤 간식이 없거나 얼마 안 남았나요? 같은 품목 제보는 모아서 총무팀에 보여줘요.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">' + cands.map(function (it) {
          var on = st.id === it.id; var n = openShortage(it.id).length;
          return '<button type="button" data-act="sh-item" data-id="' + it.id + '" aria-pressed="' + on + '" style="appearance:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;border-radius:16px;border:2px solid ' + (on ? 'var(--brand-500)' : 'var(--line)') + ';background:' + (on ? 'var(--brand-50)' : 'var(--surface)') + ';font-family:inherit;color:var(--ink-900)">' + thumb(it, 44, 12) + '<span style="font-size:13px;font-weight:700;line-height:16px;text-align:center">' + esc(it.name) + '</span><span style="font-size:11px;color:var(--ink-500)">' + (n ? '제보 ' + n + '건' : ST[stateOf(it)].short || qtyText(it)) + '</span></button>';
        }).join('') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px"><h3 style="margin:0;font-size:17px;font-weight:700">상태</h3><div class="chips">' + ['부족', '소진'].map(function (k) { return '<button type="button" class="chip" aria-pressed="' + (st.kind === k) + '" data-act="sh-kind" data-v="' + k + '">' + (k === '부족' ? '얼마 안 남았어요' : '하나도 없어요') + '</button>'; }).join('') + '</div></div>' +
        '<p data-sh-hint hidden style="margin:0;text-align:center;font-size:13px;color:var(--stock-out-strong)"></p>' +
        '<button type="button" class="btn btn--primary" data-act="sh-submit" aria-disabled="' + (st.id ? 'false' : 'true') + '">제보하기</button></section>';
    }
    var o = document.createElement('div');
    o.className = 'overlay'; o.id = 'overlay';
    o.innerHTML = html;
    o.addEventListener('click', function (e) { if (e.target === o) closeSheet(); });
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    var note = document.getElementById('rv-note');
    if (note) note.addEventListener('input', function () { sheetState.note = note.value; });
  }

  /* ------------------------------------------------------------------ 화면: 내 계정 · 알림 */
  function vAccount() {
    var pts = myPoints();
    var hist = ui.histAll ? S.points : S.points.slice(0, 4);
    function sw(key, t, s) { var on = S.settings[key]; return '<div class="switch-row" style="border-bottom:1px solid var(--line)"><div class="switch-row__txt"><span class="switch-row__t">' + t + '</span><span class="switch-row__s">' + s + '</span></div><button type="button" class="switch" aria-pressed="' + on + '" aria-label="' + t + '" data-act="setting" data-k="' + key + '"><span></span></button></div>'; }
    return '<div class="screen" data-screen="account" aria-label="내 계정">' + header() + '<div style="display:flex;flex-direction:column;gap:16px;padding:20px 20px 32px">' +
      '<h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">내 계정</h1>' +
      '<section class="card" style="padding:20px"><div style="display:flex;align-items:center;gap:14px"><div style="width:56px;height:56px;border-radius:999px;background:var(--brand-100);display:flex;align-items:center;justify-content:center">' + I.user(28, '#A84A06') + '</div><div style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;line-height:28px;font-weight:700">김삼일</span><span style="font-size:13px;color:var(--ink-500)">Assurance 1본부 · S2026-0412</span></div><span class="badge badge--mock">모의</span></div></section>' +
      '<section class="card" style="padding:20px;gap:12px"><div style="display:flex;align-items:center;justify-content:space-between"><h2 style="margin:0;font-size:17px;font-weight:700">적립 포인트</h2><span class="badge badge--mock">모의</span></div>' +
      '<span style="font-size:44px;line-height:48px;font-weight:800;letter-spacing:-0.02em;color:var(--brand-600)">' + pts + 'P</span>' +
      '<p style="margin:0;font-size:12px;line-height:18px;color:var(--ink-500)">수령 참여 1회 20P · 리뷰 1건 30P · 수정 시 추가 없음 · 평점과 관계없이 같아요</p>' +
      (S.points.length ? '<div class="hist">' + hist.map(function (p) { return '<div class="hist-row"><span class="hist-row__time">' + hhmm(p.t) + '</span><span class="hist-row__what">' + esc(p.what) + '</span><span class="hist-row__pts">+' + p.pts + 'P</span></div>'; }).join('') + '</div>' : '<p class="hist-empty">아직 적립 내역이 없어요. 간식을 받고 알려주면 20P, 리뷰를 남기면 30P가 쌓여요.</p>') +
      (S.points.length > 4 ? '<button type="button" class="btn btn--text" style="color:var(--brand-700);justify-content:space-between" data-act="hist-all">' + (ui.histAll ? '접기' : '전체 내역 보기 (' + S.points.length + '건)') + I.chev(16, '#C05408') + '</button>' : '') + '</section>' +
      '<section class="card" style="padding:20px 20px 12px;gap:4px"><h2 style="margin:0 0 4px;font-size:17px;font-weight:700;display:flex;align-items:center;gap:6px">' + I.bell(20) + '알림 설정</h2>' +
      sw('stockIn', '입고 알림', '알림 대상 간식이 들어오면 알려드려요') + sw('pre', '입고 예고 알림', '총무팀이 미리 알린 간식을 알려드려요') + sw('review', '리뷰 작성 알림', '수령 후 리뷰를 잊지 않게 알려드려요').replace('border-bottom:1px solid var(--line)', '') + '</section>' +
      '<a href="#admin" class="card" style="padding:18px 20px;flex-direction:row;align-items:center;gap:14px;color:var(--ink-900);border:2px dashed var(--line-strong);box-shadow:none;background:var(--surface)"><span class="menu-btn__ic">' + I.box(22) + '</span><span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:17px;font-weight:700">총무팀 화면 (데모)</span><span style="font-size:13px;color:var(--ink-500)">입고 예고 · 묶음 입고와 알림 · 제보 처리 · 운영 분석</span></span>' + I.chev(18) + '</a>' +
      '<button type="button" class="btn btn--ghost" data-act="reset">' + I.reset() + '데모 데이터 처음 상태로</button>' +
      '<p style="margin:0;text-align:center;font-size:12px;line-height:18px;color:var(--ink-500)">데모 데이터는 이 기기 브라우저에만 저장돼요. 새벽 2시가 지나면 새 날짜로 시작해요.</p>' +
      '</div><div class="spacer"></div>' + tabbar('account') + '</div>';
  }
  function vNotifs() {
    var unreadIds = S.notifs.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
    S.notifs.forEach(function (n) { n.read = true; }); save();
    var html = '<div class="screen" data-screen="notifs" aria-label="알림">' + header() + '<div style="display:flex;flex-direction:column;gap:16px;padding:20px 20px 32px"><div style="display:flex;align-items:center;gap:8px"><a href="#back" data-act="back" aria-label="뒤로" class="hdr-btn" style="margin-left:-10px">' + I.back() + '</a><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">알림</h1></div>' +
      '<section class="card" style="padding:4px 20px">' + (S.notifs.length ? S.notifs.map(function (n) {
        var ic = n.kind === 'in' ? I.box(20) : (n.kind === 'pre' ? I.clock(20, '#C05408') : I.pen(18));
        return '<div class="notif' + (unreadIds.indexOf(n.id) >= 0 ? ' is-unread' : '') + '"><span class="menu-btn__ic" style="width:40px;height:40px">' + ic + '</span><div style="flex:1;display:flex;flex-direction:column;gap:2px"><span class="notif__t">' + esc(n.title) + '</span><span class="notif__s">' + esc(n.body) + '</span></div><span class="notif__s">' + hhmm(n.t) + '</span></div>';
      }).join('') : '<p class="empty">아직 받은 알림이 없어요</p>') + '</section>' +
      '<p style="margin:0;font-size:12px;line-height:18px;color:var(--ink-500)">입고 알림은 입고 한 번에 한 건만 보내요. 생수·커피처럼 알림 대상이 아닌 품목은 알림 없이 수량만 바뀌어요.</p></div><div class="spacer"></div>' + tabbar('') + '</div>';
    return html;
  }

  /* ------------------------------------------------------------------ 화면: 총무팀(운영 관리) */
  function vAdmin() {
    var open = S.shortage.filter(function (s) { return !s.resolvedAt; });
    var pre = S.items.filter(isPre);
    var lowOut = S.items.filter(function (it) { var s = stateOf(it); return s === 'low' || s === 'out'; });
    var html = '<div class="screen" data-screen="admin" aria-label="운영 관리">' + header({ admin: true }) + '<div style="display:flex;flex-direction:column;gap:24px;padding:20px 20px 32px">' +
      '<div style="display:flex;flex-direction:column;gap:4px"><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">운영 관리</h1><span style="font-size:13px;color:var(--ink-500)">총무팀 화면을 데모로 체험해요. 바꾼 내용은 구성원 화면에 바로 보여요.</span></div>' +
      '<div class="admin-hero"><a class="kpi" href="#admin-reports"><span class="kpi__n" style="color:' + (open.length ? 'var(--stock-out-strong)' : 'var(--ink-900)') + '">' + open.length + '</span><span class="kpi__l">처리할 제보</span></a><a class="kpi" href="#admin-in"><span class="kpi__n" style="color:var(--brand-700)">' + pre.length + '</span><span class="kpi__l">입고 예정</span></a><a class="kpi" href="#admin-check"><span class="kpi__n">' + lowOut.length + '</span><span class="kpi__l">부족·소진 품목</span></a></div>' +
      '<div class="menu-grid">' +
      '<a class="menu-btn" href="#admin-menu"><span class="menu-btn__ic">' + I.plus(22) + '</span>메뉴 등록 · 입고 예고<small>사진·품목명·알림 대상</small></a>' +
      '<a class="menu-btn" href="#admin-in"><span class="menu-btn__ic">' + I.box(22) + '</span>입고 기록<small>여러 품목 한 번에 · 알림 1건</small></a>' +
      '<a class="menu-btn" href="#admin-reports"><span class="menu-btn__ic" style="background:var(--stock-out-soft)">' + I.bell(22, '#B42318') + '</span>부족 제보 처리<small>요청 → 바로 입고 기록</small></a>' +
      '<a class="menu-btn" href="#admin-check"><span class="menu-btn__ic" style="background:var(--stock-ok-soft)">' + I.check(22) + '</span>수량 확인<small>추정 수량을 실제 값으로 보정</small></a></div>';
    html += '<div class="sec"><div class="sec__head"><h2 class="sec__title">현재 재고</h2><span class="sec__meta">추정 = 확인값 − 수령 수</span></div><section class="card" style="padding:4px 20px">' +
      S.items.map(function (it) { var st = stateOf(it); return '<div class="row-link" style="padding:10px 0">' + thumb(it, 40, 12) + '<div class="row-link__info"><span style="font-size:16px;font-weight:700">' + esc(it.name) + '</span><span class="row-link__sub">' + (it.kind === 'season' ? '시즌' : '상시') + (it.notify ? ' · 알림 대상' : '') + ' · 확인 ' + hhmm(it.confirmedAt) + (it.taken ? ' · 수령 ' + it.taken + '개' : '') + '</span></div><span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b style="font-size:15px">' + (st === 'pre' ? '—' : est(it) + '개') + '</b>' + statusPill(it).replace('height:26px', '') + '</span></div>'; }).join('') + '</section></div>';
    html += '<div class="sec"><div class="sec__head"><h2 class="sec__title">입고·알림 기록</h2><span class="sec__meta">입고 1회 = 알림 최대 1건</span></div><section class="card" style="padding:4px 20px">' +
      S.stockLog.slice(0, 6).map(function (l) { return '<div class="log-row"><time>' + hhmm(l.t) + '</time><span style="flex:1">' + l.items.map(function (e) { return esc(getItem(e[0]).name) + ' ' + e[1]; }).join(', ') + '<br><span style="font-size:13px;color:' + (l.notified ? 'var(--brand-700)' : 'var(--ink-500)') + '">' + (l.notified ? '알림 발송: "' + esc(l.notified) + '"' : '알림 대상 없음 · 수량만 갱신') + '</span></span></div>'; }).join('') + '</section></div>';
    html += '<div class="sec"><div class="sec__head"><h2 class="sec__title">데모 조작</h2><span class="mock-note">시연 전용</span></div><section class="card" style="padding:20px;gap:12px"><span style="font-size:15px;font-weight:700">동료 줄 제보 시나리오</span><span style="font-size:13px;line-height:18px;color:var(--ink-500)">실제로는 여러 구성원이 동시에 제보해요. 데모에서는 동료 제보를 모의로 만들어 혼잡도 단계 변화를 보여줘요.</span><div class="seg">' +
      Object.keys(SCEN).map(function (k) { return '<button type="button" aria-pressed="' + (S.demo.scenario === k) + '" data-act="scenario" data-v="' + k + '">' + SCEN[k].label + '</button>'; }).join('') + '</div>' + calcLine(congestion()) +
      '<button type="button" class="btn btn--ghost" data-act="reset">' + I.reset() + '데모 데이터 처음 상태로</button></section></div>';
    html += '</div><div class="spacer"></div>' + adminTabbar('admin') + '</div>';
    return html;
  }
  function vAdminMenu() {
    var f = ui.menu || (ui.menu = { name: '', kind: 'season', illust: 'donut', img: null, notify: true, pre: true, when: '오늘 저녁', loaded: false });
    var names = S.items.map(function (it) { return it.name; });
    var html = '<div class="screen" data-screen="admin-menu" aria-label="메뉴 등록">' + header({ admin: true }) + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 32px">' +
      '<div style="display:flex;align-items:center;gap:8px"><a href="#admin" aria-label="뒤로" class="hdr-btn" style="margin-left:-10px">' + I.back() + '</a><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">메뉴 등록 · 입고 예고</h1></div>' +
      '<section class="card" style="padding:20px;gap:20px">' +
      '<div class="field"><span class="field__label">사진<span class="field__hint">메인·알림에 같은 사진을 써요</span></span>' +
      (f.img ? '<div style="display:flex;align-items:center;gap:12px"><img src="' + f.img + '" alt="올린 사진" style="width:72px;height:72px;border-radius:16px;object-fit:cover"><button type="button" class="btn btn--ghost btn--sm" data-act="menu-img-clear">사진 지우기</button></div>' :
        '<div class="ill-grid">' + ILL.map(function (k) { return '<button type="button" class="ill-opt" aria-pressed="' + (f.illust === k) + '" aria-label="' + ILL_NAME[k] + ' 일러스트" data-act="menu-ill" data-v="' + k + '"><img src="assets/illust/' + k + '.svg" alt=""></button>'; }).join('') + '</div>') +
      '<label class="photo-up">' + I.camera() + '간식 사진 촬영·올리기<input type="file" accept="image/*" capture="environment" data-act="menu-photo"></label></div>' +
      '<div class="field"><label class="field__label" for="m-name">품목명<span class="field__hint">이전 이름 자동완성</span></label><input id="m-name" class="input" list="m-names" maxlength="20" placeholder="예: 스페셜 도넛, 하겐다즈" value="' + esc(f.name) + '" autocomplete="off"><datalist id="m-names">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<span data-menu-loaded style="font-size:13px;color:var(--stock-ok);font-weight:600"' + (f.loaded ? '' : ' hidden') + '>' + I.check(14, '#276B2C', 2.6) + ' 기존 메뉴를 불러왔어요 · 구분·알림 설정을 그대로 써요</span></div>' +
      '<div class="field"><span class="field__label">구분</span><div class="seg">' + [['season', '시즌'], ['always', '상시']].map(function (k) { return '<button type="button" aria-pressed="' + (f.kind === k[0]) + '" data-act="menu-kind" data-v="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="switch-row" style="border-top:1px solid var(--line)"><div class="switch-row__txt"><span class="switch-row__t">알림 대상</span><span class="switch-row__s">시즌 메뉴·하겐다즈처럼 수요가 몰리는 품목</span></div><button type="button" class="switch" aria-pressed="' + f.notify + '" aria-label="알림 대상" data-act="menu-toggle" data-k="notify"><span></span></button></div>' +
      '<div class="switch-row" style="border-top:1px solid var(--line)"><div class="switch-row__txt"><span class="switch-row__t">입고 예고</span><span class="switch-row__s">수량 없이 \'입고 예정\'으로 메인에 먼저 보여요</span></div><button type="button" class="switch" aria-pressed="' + f.pre + '" aria-label="입고 예고" data-act="menu-toggle" data-k="pre"><span></span></button></div>' +
      (f.pre ? '<div class="field"><span class="field__label">예정 시간대</span><div class="chips">' + WHEN.map(function (w) { return '<button type="button" class="chip" aria-pressed="' + (f.when === w) + '" data-act="menu-when" data-v="' + w + '">' + w + '</button>'; }).join('') + '</div></div>' : '') +
      '</section><p data-menu-hint hidden style="margin:0;text-align:center;font-size:13px;color:var(--stock-out-strong)">품목명을 입력해 주세요</p>' +
      '<button type="button" class="btn btn--primary" data-act="menu-submit">' + (f.pre ? '등록하고 입고 예고 올리기' : '메뉴 등록') + '</button></div><div class="spacer"></div>' + adminTabbar('admin') + '</div>';
    return html;
  }
  function vAdminIn() {
    var list = S.items.slice().sort(function (a, b) { return (isPre(b) ? 2 : 0) + (b.kind === 'season' ? 1 : 0) - ((isPre(a) ? 2 : 0) + (a.kind === 'season' ? 1 : 0)); });
    if (ui.prefill) { ui.inQty[ui.prefill] = ui.inQty[ui.prefill] || getItem(ui.prefill).lastIn || 20; ui.prefill = null; }
    var sel = Object.keys(ui.inQty).filter(function (k) { return ui.inQty[k] > 0; });
    var willNotify = sel.filter(function (k) { return getItem(k).notify; });
    var html = '<div class="screen" data-screen="admin-in" aria-label="입고 기록">' + header({ admin: true }) + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 32px">' +
      '<div style="display:flex;flex-direction:column;gap:4px"><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">입고 기록</h1><span style="font-size:13px;line-height:18px;color:var(--ink-500)">들어온 품목을 한 번에 담아 수량을 입력해요. 수량은 사진으로 추정하지 않고 직접 확인한 값을 넣어요.</span></div>' +
      '<section class="card" style="padding:8px 20px">' + list.map(function (it) {
        var q = ui.inQty[it.id] || 0;
        return '<div class="in-row' + (isPre(it) ? ' is-pre' : '') + '">' + thumb(it, 44, 12) + '<div class="row-link__info"><span style="font-size:16px;font-weight:700">' + esc(it.name) + (it.notify ? ' <span style="font-size:11px;color:var(--brand-700);font-weight:700">알림</span>' : '') + '</span><span class="row-link__sub">' + (isPre(it) ? '입고 예정 · ' + esc(it.pre.when) : '현재 ' + est(it) + '개 · ' + ST[stateOf(it)].label) + (openShortage(it.id).length ? ' · 제보 ' + openShortage(it.id).length + '건' : '') + '</span></div>' +
          '<span class="mini-step"><button type="button" data-act="in-dec" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 수량 빼기">−</button><input type="number" inputmode="numeric" min="0" max="999" value="' + q + '" data-in="' + it.id + '" aria-label="' + esc(it.name) + ' 입고 수량"><button type="button" data-act="in-inc" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 수량 더하기">+</button></span></div>';
      }).join('') + '</section>' +
      '<section class="card" style="padding:16px 20px;gap:6px;background:var(--surface-sand);box-shadow:none" data-in-preview>' + inPreview(sel, willNotify) + '</section>' +
      '<button type="button" class="btn btn--primary" data-act="in-submit" aria-disabled="' + (sel.length ? 'false' : 'true') + '">입고 완료' + (sel.length ? ' · ' + sel.length + '종' : '') + '</button></div><div class="spacer"></div>' + adminTabbar('in') + '</div>';
    return html;
  }
  function inPreview(sel, willNotify) {
    if (!sel.length) return '<span style="font-size:14px;color:var(--ink-700)">수량을 입력한 품목이 여기에 모여요.</span>';
    var first = sel.slice().sort(function (a, b) { var A = getItem(a), B = getItem(b); return (B.pre ? 2 : 0) + (B.notify ? 1 : 0) - ((A.pre ? 2 : 0) + (A.notify ? 1 : 0)); });
    var title = willNotify.length ? getItem(first[0]).name + (sel.length > 1 ? ' 외 ' + (sel.length - 1) + '종이' : '이(가)') + ' 들어왔어요' : null;
    return '<span style="font-size:14px;font-weight:700">담은 품목 ' + sel.length + '종 · ' + sum(sel.map(function (k) { return ui.inQty[k]; })) + '개</span>' +
      '<span style="font-size:13px;line-height:18px;color:' + (title ? 'var(--brand-800)' : 'var(--ink-500)') + '">' + (title ? '알림 1건 발송 예정: "' + esc(title) + '"' : '알림 대상 품목이 없어 알림 없이 수량만 갱신해요') + '</span>';
  }
  function vAdminReports() {
    var open = S.shortage.filter(function (s) { return !s.resolvedAt; });
    var by = {};
    open.forEach(function (s) { (by[s.item] = by[s.item] || []).push(s); });
    var done = S.shortage.filter(function (s) { return s.resolvedAt; }).slice(0, 6);
    return '<div class="screen" data-screen="admin-reports" aria-label="부족 제보 처리">' + header({ admin: true }) + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 32px">' +
      '<div style="display:flex;align-items:center;gap:8px"><a href="#admin" aria-label="뒤로" class="hdr-btn" style="margin-left:-10px">' + I.back() + '</a><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">부족 제보 처리</h1></div>' +
      '<div class="sec"><div class="sec__head"><h2 class="sec__title">처리 대기</h2><span class="sec__meta">같은 품목은 모아서 보여요</span></div><section class="card" style="padding:4px 20px">' +
      (Object.keys(by).length ? Object.keys(by).map(function (id) { var it = getItem(id); var l = by[id]; return '<div class="row-link">' + thumb(it, 44, 12) + '<div class="row-link__info"><span class="row-link__name">' + esc(it.name) + '</span><span class="row-link__sub">제보 ' + l.length + '건 · 최근 ' + hhmm(Math.max.apply(null, l.map(function (x) { return x.t; }))) + ' · ' + l.map(function (x) { return x.kind; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('/') + '</span></div><button type="button" class="btn btn--primary btn--sm" data-act="report-to-in" data-id="' + id + '">입고 기록</button></div>'; }).join('') : '<p class="empty">처리할 제보가 없어요</p>') + '</section></div>' +
      '<div class="sec"><div class="sec__head"><h2 class="sec__title">처리 완료</h2></div><section class="card" style="padding:4px 20px">' +
      (done.length ? done.map(function (s) { var it = getItem(s.item); return '<div class="log-row"><time>' + hhmm(s.resolvedAt) + '</time><span style="flex:1">' + esc(it.name) + ' · ' + s.kind + ' 제보(' + hhmm(s.t) + ') → 입고로 처리 완료</span></div>'; }).join('') : '<p class="empty">아직 없어요</p>') + '</section></div>' +
      '<p style="margin:0;font-size:12px;line-height:18px;color:var(--ink-500)">입고가 기록되면 요청은 자동으로 처리 완료되고, 제보한 구성원은 \'간식수령 및 제보\'에서 완료 상태를 확인해요.</p></div><div class="spacer"></div>' + adminTabbar('admin') + '</div>';
  }
  function vAdminCheck() {
    var list = S.items.filter(function (it) { return !isPre(it); });
    return '<div class="screen" data-screen="admin-check" aria-label="수량 확인">' + header({ admin: true }) + '<div style="display:flex;flex-direction:column;gap:20px;padding:20px 20px 32px">' +
      '<div style="display:flex;align-items:center;gap:8px"><a href="#admin" aria-label="뒤로" class="hdr-btn" style="margin-left:-10px">' + I.back() + '</a><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">수량 확인</h1></div>' +
      '<span style="font-size:13px;line-height:18px;color:var(--ink-500);margin-top:-12px">탕비실에서 직접 센 수량을 넣으면 추정치(약 n개)를 그 값으로 보정해요.</span>' +
      '<section class="card" style="padding:8px 20px">' + list.map(function (it) {
        var q = ui.checkQty[it.id] != null ? ui.checkQty[it.id] : est(it);
        return '<div class="in-row">' + thumb(it, 44, 12) + '<div class="row-link__info"><span style="font-size:16px;font-weight:700">' + esc(it.name) + '</span><span class="row-link__sub">추정 ' + est(it) + '개 · 확인 ' + hhmm(it.confirmedAt) + '</span></div><span class="mini-step"><button type="button" data-act="ck-dec" data-id="' + it.id + '" aria-label="빼기">−</button><input type="number" inputmode="numeric" min="0" max="999" value="' + q + '" data-ck="' + it.id + '" aria-label="' + esc(it.name) + ' 확인 수량"><button type="button" data-act="ck-inc" data-id="' + it.id + '" aria-label="더하기">+</button></span></div>';
      }).join('') + '</section><button type="button" class="btn btn--primary" data-act="ck-submit">확인 수량 저장</button></div><div class="spacer"></div>' + adminTabbar('admin') + '</div>';
  }

  /* ------------------------------------------------------------------ 화면: 운영 분석 */
  function anaRows() {
    var a = ui.ana; var d = serviceDay(now());
    return S.items.filter(function (it) { return a.kind === 'all' || it.kind === a.kind; }).map(function (it) {
      var today = S.reviews.filter(function (r) { return r.item === it.id && r.day === d; });
      var n = today.length, sm = sum(today.map(function (r) { return r.rating; })), yes = today.filter(function (r) { return r.again === 'yes'; }).length;
      var ins = it.inCount || 0, sells = it.sellouts.slice();
      if (a.period === 'week') (S.hist[it.id] || []).forEach(function (h) { n += h.n; sm += h.sum; yes += h.yes; ins += h.ins; if (h.sellout) sells.push(h.sellout); });
      return { it: it, n: n, avg: n ? sm / n : null, again: n ? Math.round(100 * yes / n) : null, ins: ins, sell: sells.length ? Math.round(sum(sells) / sells.length) : null, qty: isPre(it) ? null : est(it) };
    }).sort(function (x, y) {
      if (a.sort === 'good') return (y.avg || 0) + (y.again || 0) / 100 - ((x.avg || 0) + (x.again || 0) / 100);
      return (x.sell == null ? 1e9 : x.sell) - (y.sell == null ? 1e9 : y.sell);
    });
  }
  function fmtMin(m) { if (m == null) return '소진 없음'; if (m < 60) return m + '분'; return Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : ''); }
  function vAnalytics() {
    var a = ui.ana; var rows = anaRows();
    function seg(key, opts) { return '<div class="seg">' + opts.map(function (o) { return '<button type="button" aria-pressed="' + (a[key] === o[0]) + '" data-act="ana" data-k="' + key + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
    return '<div class="screen" data-screen="analytics" aria-label="운영 분석">' + header({ admin: true }) + '<div style="display:flex;flex-direction:column;gap:16px;padding:20px 20px 32px">' +
      '<div style="display:flex;flex-direction:column;gap:4px"><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">운영 분석</h1><span style="font-size:13px;line-height:18px;color:var(--ink-500)">추천 문구 없이 기록된 데이터만 보여줘요. 준비량은 예상 이용 인원과 시기를 함께 보고 판단하세요.</span></div>' +
      seg('period', [['today', '오늘'], ['week', '최근 7일']]) + seg('kind', [['all', '전체'], ['season', '시즌'], ['always', '상시']]) + seg('sort', [['good', '반응이 좋은 메뉴'], ['fast', '빨리 나가는 메뉴']]) +
      '<section class="card" style="padding:4px 20px">' + rows.map(function (r, i) {
        var few = r.n > 0 && r.n < 5;
        return '<div class="ana-row"><div style="display:flex;align-items:center;gap:12px"><span style="width:20px;font-size:15px;font-weight:800;color:var(--ink-500)">' + (i + 1) + '</span>' + thumb(r.it, 40, 12) + '<div class="row-link__info"><span style="font-size:16px;font-weight:700">' + esc(r.it.name) + '</span><span class="row-link__sub">' + (r.it.kind === 'season' ? '시즌' : '상시') + ' · 응답 ' + r.n + '명' + (few ? ' · <b style="color:var(--stock-low)">응답 적음</b>' : '') + '</span></div>' +
          (r.avg != null ? '<span style="display:flex;align-items:center;gap:4px;font-size:17px;font-weight:800">' + I.star(16, '#F5A100') + r.avg.toFixed(1) + '</span>' : '<span style="font-size:13px;color:var(--ink-500)">리뷰 없음</span>') + '</div>' +
          '<div class="ana-grid"><div class="ana-cell"><b>' + (r.again != null ? r.again + '%' : '—') + '</b><span>재이용 의향</span></div><div class="ana-cell"><b>' + fmtMin(r.sell) + '</b><span>입고 후 소진</span></div><div class="ana-cell"><b>' + r.ins + '회</b><span>입고 횟수</span></div><div class="ana-cell"><b>' + (r.qty == null ? '예정' : r.qty + '개') + '</b><span>현재 수량</span></div></div>' +
          (r.again != null ? '<div class="bar"><span style="width:' + r.again + '%"></span></div>' : '') + '</div>';
      }).join('') + '</section>' +
      '<p style="margin:0;font-size:12px;line-height:18px;color:var(--ink-500)">' + (a.period === 'week' ? '지난 6일 기록은 시연용 예시 데이터이고, 오늘 기록은 이 앱에서 남긴 리뷰·입고·소진이 그대로 쌓여요.' : '오늘 기록은 이 앱에서 남긴 리뷰·입고·소진이 그대로 쌓여요.') + ' 만족도와 재이용 의향은 선호도, 소진 시간과 잔여 수량은 공급량의 적절성을 보여줘요.</p>' +
      '</div><div class="spacer"></div>' + adminTabbar('ana') + '</div>';
  }

  /* ------------------------------------------------------------------ 데스크톱 가이드 */
  function renderGuide() {
    var g = document.getElementById('guide');
    if (!g) return;
    g.innerHTML = '<h2>삼일냠냠 · 실행 가이드</h2><small>모바일 화면 기준 웹앱이에요. 휴대폰으로 열면 더 자연스러워요. 로그인 없이 바로 써볼 수 있어요.</small>' +
      '<ol><li><a href="#home">간식현황</a>에서 시즌 간식 카드와 현재 대기 상태(중앙값)를 확인해요.</li>' +
      '<li><a href="#receive">간식수령 및 제보</a> → 사원증 태그(모의) → 간식·줄 인원 선택 → <b>20P</b>. 남은 수량과 혼잡도가 바로 바뀌어요.</li>' +
      '<li>완료 화면이나 수령 기록에서 리뷰 → <b>30P</b>. 상세 화면 별점에 반영돼요.</li>' +
      '<li><a href="#admin">총무팀 화면</a>에서 입고 예고·묶음 입고를 하면 구성원에게 알림 1건이 가요. <a href="#analytics">운영 분석</a>에서 반응·소진 시간을 비교해요.</li></ol>' +
      '<div class="guide__links"><a href="#home">간식현황</a><a href="#receive">간식수령</a><a href="#account">내 계정</a><a href="#admin">운영 관리</a><a href="#admin-in">입고 기록</a><a href="#analytics">운영 분석</a><button type="button" data-act="reset">데모 초기화</button></div>' +
      '<small>데이터는 이 브라우저에만 저장되는 데모 데이터예요(서버 없음). 사원증 태그·동료 줄 제보·포인트는 모의 값이에요.</small>';
  }

  /* ------------------------------------------------------------------ 토스트 */
  function toast(title, body, kind) {
    var w = document.getElementById('toast'); if (!w) return;
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    var ic = kind === 'in' ? I.box(20) : (kind === 'pre' ? I.clock(20, '#C05408') : (kind === 'ok' ? I.check(20) : I.pen(18)));
    el.innerHTML = '<span class="toast__icon">' + ic + '</span><span style="flex:1"><b>' + esc(title) + '</b>' + (body ? esc(body) : '') + '</span>';
    el.addEventListener('click', function () { if (kind === 'in' || kind === 'pre') go('#home'); el.remove(); });
    w.appendChild(el);
    setTimeout(function () { el.classList.add('is-leaving'); setTimeout(function () { el.remove(); }, 300); }, 3800);
  }

  /* ------------------------------------------------------------------ 라우터 · 렌더 */
  var app = document.getElementById('app');
  var hist = [];
  function route() { return (location.hash || '#splash').slice(1) || 'splash'; }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }
  function render(keepScroll) {
    var r = route(), html;
    if (r.indexOf('item-') === 0) html = vDetail(r.slice(5));
    else switch (r) {
      case 'splash': html = vSplash(); break;
      case 'home': html = vHome(); break;
      case 'receive': html = vReceive(); break;
      case 'pick': html = vPick(); break;
      case 'done': html = vDone(); break;
      case 'account': html = vAccount(); break;
      case 'notifs': html = vNotifs(); break;
      case 'admin': html = vAdmin(); break;
      case 'admin-menu': html = vAdminMenu(); break;
      case 'admin-in': html = vAdminIn(); break;
      case 'admin-reports': html = vAdminReports(); break;
      case 'admin-check': html = vAdminCheck(); break;
      case 'analytics': html = vAnalytics(); break;
      // 프로토타입 시절 주소 호환
      case 'detail': html = vDetail('fish'); break;
      case 'receive-pick': html = vPick(); break;
      default:
        if (r.indexOf('detail-') === 0) html = vDetail(r.slice(7)); else html = vHome();
    }
    var y = window.scrollY;
    var carX = 0; var car = app.querySelector('[data-carousel]'); if (car) carX = car.scrollLeft;
    app.innerHTML = html;
    // [개선 3 · 조권영 실기기 피드백] 같은 화면 안에서 다시 그릴 때는 등장 애니메이션을 끄고 바로 바꿈(새로고침처럼 깜빡이던 문제)
    if (keepScroll) { var sc = app.querySelector('.screen'); if (sc) sc.classList.add('is-static'); }
    if (keepScroll) { window.scrollTo(0, y); var c2 = app.querySelector('[data-carousel]'); if (c2) c2.scrollLeft = carX; }
    bindCarousel();
    bindInputs();
    bindPickBar();
    document.title = (r === 'splash' || r === 'home' ? '삼일냠냠 · 사내 간식 관리' : (app.querySelector('.screen') || {}).getAttribute('aria-label') + ' · 삼일냠냠');
  }
  function bindCarousel() {
    var track = app.querySelector('[data-carousel]');
    var dots = app.querySelectorAll('[data-dots] .dot');
    if (!track) return;
    track.addEventListener('scroll', function () {
      var card = track.querySelector('a'); var step = card ? card.offsetWidth + 12 : 330;
      var i = Math.round(track.scrollLeft / step);
      dots.forEach(function (d, j) { d.classList.toggle('is-active', i === j); });
    }, { passive: true });
  }
  var pickObs = null;
  function bindPickBar() {
    if (pickObs) { pickObs.disconnect(); pickObs = null; }
    var bar = app.querySelector('[data-pickbar]'); var sub = app.querySelector('[data-act="submit-pick"]');
    if (!bar || !sub) return;
    var tb = app.querySelector('.tabbar'); var tbh = tb ? tb.offsetHeight : 64;
    var vis = function () { var r = sub.getBoundingClientRect(); return r.top < window.innerHeight - tbh && r.bottom > 0; };
    bar.classList.toggle('is-hidden', vis());
    if ('IntersectionObserver' in window) {
      pickObs = new IntersectionObserver(function (es) { bar.classList.toggle('is-hidden', es[0].isIntersecting); }, { rootMargin: '0px 0px -' + tbh + 'px 0px' });
      pickObs.observe(sub);
    }
  }
  function bindInputs() {
    app.querySelectorAll('[data-in]').forEach(function (inp) {
      inp.addEventListener('input', function () { ui.inQty[inp.dataset.in] = clamp(parseInt(inp.value, 10) || 0, 0, 999); refreshInPreview(); });
    });
    app.querySelectorAll('[data-ck]').forEach(function (inp) {
      inp.addEventListener('input', function () { ui.checkQty[inp.dataset.ck] = clamp(parseInt(inp.value, 10) || 0, 0, 999); });
    });
    var name = document.getElementById('m-name');
    if (name) name.addEventListener('input', function () {
      var f = ui.menu; f.name = name.value;
      var match = S.items.filter(function (it) { return it.name.replace(/\s/g, '') === name.value.replace(/\s/g, ''); })[0];
      var was = f.loaded;
      if (match) { f.kind = match.kind; f.notify = match.notify; f.illust = match.illust; if (match.img) f.img = match.img; f.loaded = true; }
      else f.loaded = false;
      if (was !== f.loaded) { render(true); var n2 = document.getElementById('m-name'); n2.focus(); n2.setSelectionRange(n2.value.length, n2.value.length); }
    });
    var photo = app.querySelector('[data-act="menu-photo"]');
    if (photo) photo.addEventListener('change', function () {
      var file = photo.files && photo.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {   // 저장 용량을 줄이려고 240px로 줄여서 보관
          var c = document.createElement('canvas'); var s = 240 / Math.max(img.width, img.height);
          c.width = Math.round(img.width * Math.min(1, s)); c.height = Math.round(img.height * Math.min(1, s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ui.menu.img = c.toDataURL('image/jpeg', 0.8); render(true);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function refreshInPreview() {
    var sel = Object.keys(ui.inQty).filter(function (k) { return ui.inQty[k] > 0; });
    var p = app.querySelector('[data-in-preview]'); if (p) p.innerHTML = inPreview(sel, sel.filter(function (k) { return getItem(k).notify; }));
    var b = app.querySelector('[data-act="in-submit"]'); if (b) { b.setAttribute('aria-disabled', sel.length ? 'false' : 'true'); b.textContent = '입고 완료' + (sel.length ? ' · ' + sel.length + '종' : ''); }
  }

  /* ------------------------------------------------------------------ 이벤트 */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act, id = el.dataset.id, v = el.dataset.v;
    if (act === 'menu-photo') return;
    switch (act) {
      case 'back': e.preventDefault(); if (hist.length > 1) history.back(); else go('#home'); break;
      case 'tag': {
        e.preventDefault();
        var zone = app.querySelector('[data-tag-zone]');
        if (zone) zone.innerHTML = '<div class="tag-anim">' + I.check(24, '#276B2C', 2.6) + '사원증 태그 확인 중…</div>';
        ui.pick = {}; ui.line = null; ui.hint = false; ui.lineHint = false; ui.tagId = uid('tag');
        setTimeout(function () { go('#pick'); }, 650);
        break;
      }
      case 'pick-inc': ui.pick[id] = Math.min((ui.pick[id] || 0) + 1, Math.max(1, est(getItem(id)))); ui.hint = false; render(true); break;
      case 'pick-dec': ui.pick[id] = Math.max((ui.pick[id] || 0) - 1, 0); render(true); break;
      case 'line-inc': ui.line = typeof ui.line === 'number' ? Math.min(ui.line + 1, 99) : 1; ui.lineHint = false; render(true); break;
      case 'line-dec': if (typeof ui.line !== 'number') return; ui.line = Math.max(ui.line - 1, 0); render(true); break;
      case 'line-set': ui.line = +v; ui.lineHint = false; render(true); break;
      case 'line-skip': ui.line = 'skip'; ui.lineHint = false; render(true); break;
      case 'skip-pick': ui.pick = {}; ui.tagId = null; break;
      case 'pickbar-next': {
        var tgt = app.querySelector('[data-line-card]') || app.querySelector('[data-act="submit-pick"]');
        if (tgt) { var hd = app.querySelector('.app-header'); window.scrollTo({ top: tgt.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 56) - 16, behavior: 'smooth' }); }
        break;
      }
      case 'submit-pick': {
        // [개선 2] 시즌 간식이 있는데 줄 인원을 안 골랐으면 제출하지 않고 안내
        if (Object.keys(ui.pick).some(function (k) { return ui.pick[k] > 0; }) && seasonAvailable().length && ui.line === null) {
          ui.lineHint = true; render(true);
          var lc = app.querySelector('[data-line-card]'); if (lc) { var hd2 = app.querySelector('.app-header'); window.scrollTo({ top: lc.getBoundingClientRect().top + window.scrollY - (hd2 ? hd2.offsetHeight : 56) - 16, behavior: 'smooth' }); }
          return;
        }
        if (!submitPick()) { ui.hint = true; render(true); return; }
        window.scrollTo(0, 0); go('#done'); break;
      }
      case 'edit-line': if (editLastLine(+v)) render(true); else { toast('2분이 지나 더는 고칠 수 없어요', '', 'ok'); render(true); } break;
      case 'review': openReview(id); break;
      case 'close-sheet': closeSheet(); break;
      case 'rv-star': sheetState.rating = +v; renderSheet(); break;
      case 'rv-again': sheetState.again = v; renderSheet(); break;
      case 'rv-tag': { var i = sheetState.tags.indexOf(v); if (i >= 0) sheetState.tags.splice(i, 1); else sheetState.tags.push(v); renderSheet(); break; }
      case 'rv-submit': {
        var st = sheetState;
        if (!st.rating || !st.again) { var h = document.querySelector('[data-rv-hint]'); if (h) h.hidden = false; return; }
        var res = saveReview(st.id, { rating: st.rating, again: st.again, tags: st.tags, note: (st.note || '').trim().slice(0, 40) });
        closeSheet();
        toast(res.edited ? '리뷰를 수정했어요' : '+30P 적립! 리뷰 고마워요', res.edited ? '수정은 추가 적립 없이 반영돼요' : getItem(st.id).name + ' 별점에 바로 반영됐어요', 'ok');
        if (route() === 'done') go('#receive'); else render(true);
        break;
      }
      case 'open-shortage': openShortageSheet(id); break;
      case 'sh-item': sheetState.id = id; renderSheet(); break;
      case 'sh-kind': sheetState.kind = v; renderSheet(); break;
      case 'sh-submit': {
        if (!sheetState.id) return;
        var ok = reportShortage(sheetState.id, sheetState.kind);
        if (!ok) { var hh = document.querySelector('[data-sh-hint]'); hh.textContent = '이미 제보한 품목이에요. 총무팀이 확인 중이에요.'; hh.hidden = false; return; }
        var nm = getItem(sheetState.id).name;
        closeSheet(); toast('제보했어요', nm + ' · 총무팀이 확인하면 완료로 바뀌어요', 'ok'); render(true);
        break;
      }
      case 'setting': S.settings[el.dataset.k] = !S.settings[el.dataset.k]; save(); render(true); break;
      case 'hist-all': ui.histAll = !ui.histAll; render(true); break;
      case 'toggle-reviews': ui.allReviews[id] = !ui.allReviews[id]; render(true); break;
      case 'reset': resetDemo(); closeSheet(); toast('데모 데이터를 처음 상태로 돌렸어요', '', 'ok'); render(); renderGuide(); break;
      case 'scenario': S.demo.scenario = v; save(); render(true); break;
      // 운영: 메뉴 등록
      case 'menu-ill': ui.menu.illust = v; ui.menu.img = null; render(true); break;
      case 'menu-img-clear': ui.menu.img = null; render(true); break;
      case 'menu-kind': ui.menu.kind = v; if (v === 'always') { ui.menu.notify = false; ui.menu.pre = false; } render(true); break;
      case 'menu-toggle': ui.menu[el.dataset.k] = !ui.menu[el.dataset.k]; render(true); break;
      case 'menu-when': ui.menu.when = v; render(true); break;
      case 'menu-submit': {
        var f = ui.menu; f.name = (document.getElementById('m-name') || {}).value || f.name;
        if (!f.name.trim()) { app.querySelector('[data-menu-hint]').hidden = false; return; }
        var r = registerMenu(f);
        ui.menu = null;
        toast(r.isNew ? '메뉴를 등록했어요' : '메뉴 정보를 고쳤어요', f.pre ? '구성원 간식현황 \'입고 예정\'에 보여요' : '입고 기록에서 수량을 넣을 수 있어요', 'ok');
        go(f.pre ? '#admin' : '#admin-in');
        break;
      }
      // 운영: 입고
      case 'in-inc': ui.inQty[id] = clamp((ui.inQty[id] || 0) + (ui.inQty[id] ? 1 : (getItem(id).lastIn || 10)), 0, 999); render(true); break;
      case 'in-dec': ui.inQty[id] = clamp((ui.inQty[id] || 0) - 1, 0, 999); render(true); break;
      case 'in-submit': {
        var entries = Object.keys(ui.inQty).map(function (k) { return [k, ui.inQty[k]]; });
        var res2 = stockIn(entries);
        if (!res2) return;
        ui.inQty = {};
        if (!res2.title) toast('입고 완료 · ' + res2.count + '종', '알림 대상이 없어 알림 없이 수량만 갱신했어요', 'ok');
        if (res2.resolved) setTimeout(function () { toast('부족 제보 ' + res2.resolved + '건 처리 완료', '제보한 구성원에게 완료로 보여요', 'ok'); }, 900);
        go('#admin');
        break;
      }
      case 'report-to-in': ui.prefill = id; go('#admin-in'); break;
      case 'ck-inc': ui.checkQty[id] = clamp((ui.checkQty[id] != null ? ui.checkQty[id] : est(getItem(id))) + 1, 0, 999); render(true); break;
      case 'ck-dec': ui.checkQty[id] = clamp((ui.checkQty[id] != null ? ui.checkQty[id] : est(getItem(id))) - 1, 0, 999); render(true); break;
      case 'ck-submit': {
        var changed = Object.keys(ui.checkQty);
        changed.forEach(function (k) { confirmQty(k, ui.checkQty[k]); });
        S.items.forEach(function (it) { if (changed.indexOf(it.id) < 0 && !isPre(it)) { it.confirmedAt = now(); } });
        save(); ui.checkQty = {};
        toast('확인 수량을 저장했어요', '구성원 화면의 수량과 확인 시각이 바뀌었어요', 'ok'); go('#admin');
        break;
      }
      case 'ana': ui.ana[el.dataset.k] = v; render(true); break;
    }
  });
  window.addEventListener('hashchange', function () {
    hist.push(location.hash);
    if (route() === 'pick' && !ui.tagId) { ui.tagId = uid('tag'); }
    closeSheet();
    render(); window.scrollTo(0, 0);
  });
  // 30초마다 혼잡도 다시 집계(서버 30초 갱신 재현) — 입력 중인 화면은 건드리지 않음
  setInterval(function () {
    var r = route();
    if ((r === 'home' || r.indexOf('item-') === 0 || r === 'admin') && !sheetState) render(true);
  }, 30000);
  // 다른 탭에서 바꾼 데이터 반영
  window.addEventListener('storage', function (e) { if (e.key === KEY) { S = load(); if (!sheetState) render(true); } });

  hist.push(location.hash);
  renderGuide();
  render();
})();
