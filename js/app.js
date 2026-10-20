/* S16 Worlds Swiss — UI controller */
(function () {
  "use strict";

  var Data = window.S16Data;
  var E = window.S16Engine;
  if (!Data || !E) {
    document.body.innerHTML = '<div style="padding:40px;color:#fff;font-family:sans-serif">数据模块加载失败，请确认 js/data.js 与 js/engine.js 存在。</div>';
    return;
  }

  var TEAM = E.TEAM;
  var REGIONS = Data.REGIONS;
  var SCHEDULE = Data.SCHEDULE;
  var IDS = E.IDS;

  var STORAGE_GAME = "s16.swiss.game.v2";
  var STORAGE_RATINGS = "s16.swiss.ratings.v5";
  var STORAGE_HISTORY = "s16.swiss.history.v2";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ */
  /* persistence                                                         */
  /* ------------------------------------------------------------------ */

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  function loadGame() {
    var raw = safeGet(STORAGE_GAME);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.matches)) return E.normalizeState(parsed);
      } catch (e) { /* fall through */ }
    }
    return E.createInitialState();
  }

  function loadRatings() {
    var out = {};
    IDS.forEach(function (id) { out[id] = E.DEFAULT_RATINGS[id]; });
    var raw = safeGet(STORAGE_RATINGS);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        IDS.forEach(function (id) {
          if (parsed && typeof parsed[id] === "number" && parsed[id] >= 1200 && parsed[id] <= 2200) {
            out[id] = Math.round(parsed[id]);
          }
        });
      } catch (e) { /* ignore */ }
    }
    return out;
  }

  function loadHistory() {
    var raw = safeGet(STORAGE_HISTORY);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (s) { return s && Array.isArray(s.matches); }).slice(-24);
    } catch (e) { return []; }
  }

  var game = loadGame();
  var ratings = loadRatings();
  var history = loadHistory();

  var ui = {
    view: "draw",
    round: Math.min(E.countCompletedRounds(game) + 1, 5),
    oddsTeam: "GEN",
    labTeam: "GEN",
    lab: null,
    labRuns: 20000,
    labScope: "current",
    labRunning: false,
    labStale: false,
    preset: "default",
    animateRound: null,
    confirmCallback: null,
    manual: null
  };

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function team(id) { return TEAM[id]; }

  function teamBadge(id, cls) {
    var t = team(id);
    if (!t) return '<span class="team-badge">?</span>';
    var src = (window.S16_LOGOS && window.S16_LOGOS[id]) || t.logo;
    var img = src
      ? '<img src="' + src + '" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.parentNode.classList.add(&quot;has-fallback&quot;)">'
      : "";
    return '<span class="team-badge' + (cls ? " " + cls : "") + '" style="--tc:' + t.color + ';--tc2:' + t.color2 + '">' +
      img + '<span class="badge-fallback">' + esc(t.id) + "</span></span>";
  }

  function regionChip(region) {
    var r = REGIONS[region] || { color: "#8d99b3", soft: "rgba(255,255,255,.05)" };
    return '<span class="region-chip" style="--rc:' + r.color + ';--rs:' + r.soft + '">' + esc(region) + "</span>";
  }

  function pct(p, digits) {
    if (p == null || !isFinite(p)) return "—";
    var d = digits == null ? 1 : digits;
    if (p > 0 && p < 0.0005) return "<0.1%";
    return (p * 100).toFixed(d) + "%";
  }

  function pctWidth(p) {
    if (!isFinite(p)) return 0;
    return Math.max(0, Math.min(100, p * 100));
  }

  function fmt(n) { return E.fmtInt(n); }

  function pctDetail(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p > 0 && p < 0.0001) return "<0.01%";
    return (p * 100).toFixed(2) + "%";
  }

  function recordMap() { return E.computeRecords(game); }

  function activeIds() {
    var rec = recordMap();
    return IDS.filter(function (id) { return rec[id].w < 3 && rec[id].l < 3; });
  }

  function qualifiedIds() { return E.qualifiedTeams(game); }

  function matchContext() {
    var wins = {}, losses = {}, out = {};
    game.matches.slice().sort(function (a, b) { return a.round - b.round; }).forEach(function (m) {
      var pa = { w: wins[m.a] || 0, l: losses[m.a] || 0 };
      var pb = { w: wins[m.b] || 0, l: losses[m.b] || 0 };
      var stake = "";
      if (pa.w === 2 && pa.l === 2) stake = "2-2 决胜";
      else if (pb.w === 2 && pb.l === 2) stake = "2-2 决胜";
      else if (pa.w === 2 || pb.w === 2) stake = "晋级战";
      else if (pa.l === 2 || pb.l === 2) stake = "淘汰战";
      out[m.id] = { preA: pa, preB: pb, stake: stake };
      if (m.winner) {
        var loser = m.winner === m.a ? m.b : m.a;
        wins[m.winner] = (wins[m.winner] || 0) + 1;
        losses[loser] = (losses[loser] || 0) + 1;
      }
    });
    return out;
  }

  function currentRound() { return E.countCompletedRounds(game) + 1; }

  function roundIsComplete(r) {
    var ms = E.roundMatches(game, r);
    return ms.length > 0 && ms.every(function (m) { return !!m.winner; });
  }

  function phaseText() {
    var completed = E.countCompletedRounds(game);
    if (completed >= 5) {
      if (game.knockout.champion) return "冠军：" + game.knockout.champion;
      if (game.knockout.drawn) return "淘汰赛进行中";
      return "瑞士轮结束 · 八强已定";
    }
    var r = completed + 1;
    if (E.isRoundDrawn(game, r)) {
      var ms = E.roundMatches(game, r);
      var played = ms.filter(function (m) { return m.winner; }).length;
      return played ? "进行中 " + played + " / " + ms.length : "本轮对阵已确定";
    }
    return r === 1 ? "官方首轮签已载入" : "等待抽签";
  }

  function roundStatus(r) {
    var completed = E.countCompletedRounds(game);
    var ms = E.roundMatches(game, r);
    if (!ms.length) return r === completed + 1 ? "待抽签" : "未解锁";
    if (ms.every(function (m) { return m.winner; })) return "已完成";
    if (ms.every(function (m) { return !m.winner; })) return "已抽签";
    return "进行中";
  }

  function matchStatus(m, ctx, rec) {
    if (!m.winner) return { text: "待进行", cls: "live" };
    var c = ctx[m.id] || { preA: { w: 0, l: 0 }, preB: { w: 0, l: 0 } };
    var winnerPre = m.winner === m.a ? c.preA : c.preB;
    var loserPre = m.winner === m.a ? c.preB : c.preA;
    if (winnerPre.w === 2) return { text: "晋级", cls: "done" };
    if (loserPre.l === 2) return { text: "淘汰", cls: "elim" };
    return { text: "已结束", cls: "done" };
  }

  function teamRecordLabel(id, pre) {
    var t = team(id);
    return (t ? t.seedLabel : "") + " · " + pre.w + "-" + pre.l;
  }

  function bestOfLabel(bo) { return "BO" + bo; }

  function optionsForTeams(selected) {
    var rec = recordMap();
    return IDS.map(function (id) {
      var t = team(id);
      var status = rec[id].w >= 3 ? "晋级" : rec[id].l >= 3 ? "淘汰" : rec[id].w + "-" + rec[id].l;
      return '<option value="' + id + '"' + (id === selected ? " selected" : "") + ">" + esc(t.id) + " · " + esc(t.region) + " · " + status + "</option>";
    }).join("");
  }

  /* ------------------------------------------------------------------ */
  /* render — top / navigation                                           */
  /* ------------------------------------------------------------------ */

  function renderStatus() {
    var completed = E.countCompletedRounds(game);
    var rec = recordMap();
    var qualified = IDS.filter(function (id) { return rec[id].w >= 3; }).length;
    var eliminated = IDS.filter(function (id) { return rec[id].l >= 3; }).length;
    var played = game.matches.filter(function (m) { return !!m.winner; }).length;
    var koPlayed = (game.knockout.matches || []).filter(function (m) { return !!m.winner; }).length;

    var label;
    if (completed >= 5) label = game.knockout.champion ? "赛会结束 · 冠军加冕" : "淘汰赛 · 八强签表";
    else label = SCHEDULE[completed + 1].label + " · " + SCHEDULE[completed + 1].sub.split(" · ")[0];

    $("#statusRound").textContent = label;
    $("#statusPhase").textContent = phaseText();
    $("#metricQualified").textContent = qualified;
    $("#metricEliminated").textContent = eliminated;
    $("#metricPlayed").textContent = played + koPlayed;
    $("#metricQualified").classList.toggle("is-hot", qualified > 0);
    $("#metricEliminated").classList.toggle("is-red", eliminated > 0);

    var progress;
    if (completed >= 5) {
      progress = game.knockout.champion ? 100 : game.knockout.drawn ? 88 : 80;
    } else {
      progress = Math.round((completed / 5) * 80 + (E.isRoundDrawn(game, completed + 1) ? 8 : 0));
    }
    $("#progressFill").style.width = Math.max(3, progress) + "%";
    $("#roundNavPill").textContent = completed >= 5 ? "SWISS DONE" : "R" + (completed + 1) + " / 5";

    var topSim = $('.status-actions [data-action="sim-rest"]');
    if (topSim) {
      var topLabel = game.knockout.champion ? "重开一届" : "模拟全部";
      topSim.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>' + topLabel;
    }
  }

  function renderRoundNav() {
    var completed = E.countCompletedRounds(game);
    var html = "";
    for (var r = 1; r <= 5; r++) {
      var status = roundStatus(r);
      var isActive = ui.round === r;
      var isComplete = roundIsComplete(r);
      var isCurrent = r === completed + 1 && completed < 5;
      var cls = ["round-item"];
      if (isActive) cls.push("is-active");
      if (isComplete) cls.push("is-complete");
      if (isCurrent) cls.push("is-current");
      html += '<button type="button" class="' + cls.join(" ") + '" data-action="select-round" data-round="' + r + '">' +
        '<span class="round-dot">' + (isComplete ? "✓" : "0" + r) + "</span>" +
        '<span class="round-main"><strong>' + SCHEDULE[r].label + '</strong><small>' + SCHEDULE[r].sub + "</small></span>" +
        '<span class="round-state">' + status + "</span>" +
        "</button>";
    }
    $("#roundList").innerHTML = html;

    var koState = "未开始";
    var koReady = false;
    if (completed >= 5) {
      koReady = true;
      koState = game.knockout.champion ? "已结束" : game.knockout.drawn ? "进行中" : "待抽签";
    }
    $("#koNavState").textContent = koState;
    $("#koNavBtn").classList.toggle("is-ready", koReady);
  }

  function renderStandings() {
    var rows = E.standings(game);
    var html = rows.map(function (row, i) {
      var cls = ["standing-row", "is-" + row.status];
      if (i === 7) cls.push("is-cutline");
      return '<div class="' + cls.join(" ") + '">' +
        '<span class="standing-rank">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="standing-team">' + teamBadge(row.id, "sm") +
          '<span class="standing-name"><strong>' + esc(row.id) + '</strong><small>' + esc(REGIONS[team(row.id).region].name) + "</small></span>" +
        "</span>" +
        '<span class="standing-record">' + row.w + "-" + row.l + "</span>" +
        '<span class="standing-dot"></span>' +
        "</div>";
    }).join("");
    $("#standingsList").innerHTML = html;
    var qualified = rows.filter(function (r) { return r.status === "qualified"; }).length;
    $("#standingsNote").textContent = qualified + " / 8 晋级";
  }

  /* ------------------------------------------------------------------ */
  /* render — round                                                      */
  /* ------------------------------------------------------------------ */

  function teamRowHTML(m, side, ctx, pending) {
    var id = side === "a" ? m.a : m.b;
    var t = team(id);
    var pre = side === "a" ? ctx.preA : ctx.preB;
    var isWinner = m.winner === id;
    var isLoser = !!m.winner && m.winner !== id;
    var score = pending || !m.winner ? "–" : (side === "a" ? m.scoreA : m.scoreB);
    var cls = ["team-row", "is-clickable"];
    if (pending) cls.push("is-pending");
    if (isWinner) cls.push("is-winner");
    if (isLoser) cls.push("is-loser");
    var title = !m.winner
      ? "点击判定 " + t.name + " 获胜"
      : isWinner
        ? "当前胜者；点击另一支队伍可以改判"
        : "点击改判为 " + t.name + " 获胜";
    var inner =
      teamBadge(id) +
      '<span class="team-info"><strong>' + esc(t.name) + '</strong><small>' + esc(t.region) + " · " + pre.w + "-" + pre.l + "</small></span>" +
      '<span class="team-score">' + score + "</span>" +
      '<span class="win-mark">✓</span>';
    return '<button type="button" class="' + cls.join(" ") + '" data-action="pick-winner" data-match-id="' + m.id + '" data-team="' + id + '" title="' + esc(title) + '">' + inner + "</button>";
  }

  function matchCardHTML(m, ctx, rec, index, knockout) {
    var status = knockout ? (m.winner ? { text: "已结束", cls: "done" } : { text: "待进行", cls: "live" }) : matchStatus(m, ctx, rec);
    var pending = !m.winner;
    var c = ctx[m.id] || { preA: { w: 0, l: 0 }, preB: { w: 0, l: 0 }, stake: "" };
    var cls = ["match-card"];
    if (pending) cls.push("is-pending", "is-live");
    else cls.push("is-done");
    if (status.text === "晋级") cls.push("is-advance");
    if (status.text === "淘汰") cls.push("is-eliminate");
    if (ui.animateRound === m.round) cls.push("is-dealing");
    var metaLeft = '<span class="match-bo">' + bestOfLabel(m.bo) + "</span>";
    if (c.stake) metaLeft += '<span class="match-stake">' + c.stake + "</span>";
    if (m.fallback) metaLeft += '<span class="match-stake" style="color:var(--red)">重赛例外</span>';
    if (knockout && m.note) metaLeft += '<span class="match-stake">' + esc(m.note) + "</span>";
    return '<article class="' + cls.join(" ") + '" style="--i:' + index + '" data-match-id="' + m.id + '">' +
      '<div class="match-meta"><span class="match-meta-left">' + metaLeft + "</span>" +
      '<span class="match-status ' + status.cls + '">' + status.text + "</span></div>" +
      teamRowHTML(m, "a", c, pending) +
      teamRowHTML(m, "b", c, pending) +
      "</article>";
  }

  function groupMatches(ms, r) {
    var keys = E.groupOrder(r).slice();
    ms.forEach(function (m) {
      if (keys.indexOf(m.groupKey) === -1) keys.push(m.groupKey);
    });
    return keys.filter(function (key) {
      return ms.some(function (m) { return m.groupKey === key; });
    });
  }

  function drawPreviewHTML(analysis) {
    if (!analysis) return "";
    var html = '<div class="draw-groups">';
    analysis.groups.forEach(function (g) {
      html += '<div class="draw-group-card"><small>' + esc(g.label) + "</small><strong>" + fmt(g.count) + " 种</strong><span>BO" + g.bo + "</span></div>";
    });
    html += "</div>";
    return html;
  }

  function poolPreviewHTML() {
    var html = '<div class="pool-preview-grid">';
    [1, 2, 3, 4].forEach(function (p) {
      var focus = p === 1 || p === 4 ? " pool-focus" : "";
      html += '<div class="pool-preview' + focus + '">' +
        '<div class="pool-preview-head"><strong>' + p + " 号池</strong><span>" + (p === 1 ? "vs 4" : p === 2 ? "vs 3" : p === 3 ? "vs 2" : "vs 1") + "</span></div>";
      Data.POOLS[p].forEach(function (id) {
        html += '<div class="pool-team">' + teamBadge(id, "sm") + "<b>" + esc(id) + "</b></div>";
      });
      html += '<div class="pool-preview-note">' + (p === 1 ? "抽 4 号池" : p === 2 ? "抽 3 号池" : p === 3 ? "被 2 号池抽" : "被 1 号池抽") + "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function renderRoundPanel() {
    var r = ui.round;
    var rec = recordMap();
    var ctx = matchContext();
    var ms = E.roundMatches(game, r);
    var completed = E.countCompletedRounds(game);
    var info = SCHEDULE[r];
    var body = "";
    var footer = "";

    var header = '<div class="round-header" data-round="0' + r + '">' +
      '<div class="round-kicker"><span class="panel-kicker">ROUND 0' + r + " · SWISS</span>" +
      (r === 1 ? '<span class="tiny-pill">种子池</span>' : '<span class="tiny-pill">同战绩配对</span>') + "</div>" +
      "<h2>" + info.label + " · " + (r === 1 ? "种子池对决" : info.sub.split(" · ")[0]) + "</h2>" +
      "<p>" + (r === 1
        ? "1 号池对 4 号池，2 号池对 3 号池；首轮规避同赛区。八场均为 BO1。"
        : r === 2
          ? "1-0 组与 0-1 组分别抽签。第二轮起允许同赛区交手，但不能重复对阵。"
          : r === 3
            ? "2-0 组争夺首批八强门票，0-2 组迎来第一场淘汰战；1-1 组仍为 BO1。"
            : r === 4
              ? "2-1 组胜者直通八强，1-2 组败者回家。两个组别全部为 BO3。"
              : "2-2 组三场 BO3，胜者拿到最后三张八强门票。") + "</p>" +
      '<div class="round-meta">' +
        "<span>" + (ms.length || (r === 1 ? 8 : r === 2 ? 8 : r === 3 ? 8 : r === 4 ? 6 : 3)) + " 场</span>" +
        "<span>" + (r === 1 || r === 2 ? "全部 BO1" : r === 3 ? "BO1 + BO3" : "全部 BO3") + "</span>" +
        (r === 1 ? '<span class="gold">同赛区规避</span>' : "<span>不重复对阵</span>") +
      "</div>" +
      (r === completed + 1
        ? '<div class="round-actions">' +
            (ms.length
              ? '<button type="button" class="primary-btn small" data-action="sim-round">' + (ms.some(function (m) { return !!m.winner; }) ? "模拟剩余赛果" : "模拟本轮") + "</button>"
              : '<button type="button" class="primary-btn small" data-action="draw-round">抽取本轮签表</button>') +
            (!ms.some(function (m) { return !!m.winner; }) ? '<button type="button" class="ghost-btn small" data-action="manual-draw">手动排签</button>' : "") +
            '<button type="button" class="ghost-btn small" data-action="sim-rest">模拟全部</button>' +
          "</div>"
        : "") +
      "</div>";

    if (!ms.length) {
      if (r <= completed) {
        body = '<div class="round-empty"><h4>本轮数据缺失</h4><p>请重置赛程后重新模拟。</p></div>';
      } else if (r === completed + 1) {
        var analysis = E.analyzeCurrentDraw(game);
        var teams = activeIds();
        if (analysis && analysis.total) {
          body = '<div class="round-empty">' +
            '<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="16" r="1.2" fill="currentColor" stroke="none"/></svg></div>' +
            "<h4>本轮尚未抽签</h4>" +
            "<p>当前有 " + teams.length + " 支队伍存活，按战绩分组后共有 <b style=\"color:var(--gold)\">" + fmt(analysis.total) + "</b> 种合法签表。抽取后会立即显示对阵与胜率。</p>" +
            drawPreviewHTML(analysis) +
            (r === 1 ? poolPreviewHTML() : "") +
            '<div class="empty-actions"><button type="button" class="primary-btn" data-action="draw-round">抽取本轮签表</button>' +
            '<button type="button" class="ghost-btn" data-action="manual-draw">手动排签</button>' +
            (r === 1 ? '<button type="button" class="ghost-btn" data-action="draw-official">载入官方首轮签</button>' : "") +
            "</div></div>";
        } else {
          body = '<div class="round-empty"><h4>暂无可抽签表</h4><p>当前战绩分组无法生成合法对阵，请检查赛程或重置。</p></div>';
        }
      } else {
        body = '<div class="round-empty"><div class="empty-icon"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>' +
          "<h4>尚未解锁</h4><p>完成第 " + (r - 1) + " 轮后，才能抽取" + info.label + "。当前进度：第 " + Math.min(completed + 1, 5) + " 轮。</p></div>";
      }
    } else {
      var keys = groupMatches(ms, r);
      body = keys.map(function (key) {
        var group = ms.filter(function (m) { return m.groupKey === key; });
        var bo = group[0].bo;
        var label = E.groupLabel(key, r);
        var done = group.filter(function (m) { return !!m.winner; }).length;
        return '<div class="group-block"><div class="group-head"><h4>' + esc(label) + '</h4><span class="group-line"></span></div>' +
          '<div class="match-grid">' + group.map(function (m, i) { return matchCardHTML(m, ctx, rec, i); }).join("") + "</div></div>";
      }).join("");
    }

    if (ms.length) {
      var allDone = ms.every(function (m) { return !!m.winner; });
      if (allDone) {
        if (r < 5) {
          footer = '<span class="footer-note">本轮全部结束 · <strong>' + ms.length + '</strong> 场赛果已记录</span>' +
            '<button type="button" class="ghost-btn small" data-action="select-round" data-round="' + (r + 1) + '">查看第 ' + (r + 1) + ' 轮 →</button>';
        } else {
          footer = '<span class="footer-note">瑞士轮结束 · <strong>8</strong> 支队伍晋级淘汰赛</span>' +
            '<button type="button" class="ghost-btn small" data-action="scroll-ko">查看八强签表 →</button>';
        }
      } else {
        var pending = ms.filter(function (m) { return !m.winner; }).length;
        footer = '<span class="footer-note"><span class="pulse-dot"></span>点击对阵卡中的队伍即可手动判定胜者</span>' +
          '<span class="footer-note">待进行 <strong>' + pending + "</strong> 场</span>";
      }
    }

    $("#roundPanel").innerHTML = header + '<div class="round-body">' + body + "</div>" + (footer ? '<div class="round-footer">' + footer + "</div>" : "");
  }

  /* ------------------------------------------------------------------ */
  /* render — console / odds                                             */
  /* ------------------------------------------------------------------ */

  function consoleHead(round, title, sub) {
    return '<div class="console-head"><div><div class="panel-kicker">DRAW CONSOLE</div><h3 class="console-title">' + title + '</h3><p class="console-sub">' + sub + "</p></div>" +
      '<div class="console-round">0' + round + "</div></div>";
  }

  function renderConsole() {
    var completed = E.countCompletedRounds(game);
    var rec = recordMap();
    var qualified = IDS.filter(function (id) { return rec[id].w >= 3; });
    var html = "";

    if (completed >= 5) {
      if (!game.knockout.drawn) {
        html = '<div class="console-head"><div><div class="panel-kicker">KNOCKOUT DRAW</div><h3 class="console-title">八强抽签</h3><p class="console-sub">两支 3-0 队伍分别对阵 3-2 队伍，其余四队随机配对。</p></div><div class="console-round">KO</div></div>' +
          '<div class="info-list">' +
            '<div class="info-row"><span>3-0 队伍</span><strong class="gold">' + qualified.filter(function (id) { return rec[id].l === 0; }).join(" / ") + "</strong></div>" +
            '<div class="info-row"><span>3-1 队伍</span><strong>' + qualified.filter(function (id) { return rec[id].l === 1; }).join(" / ") + "</strong></div>" +
            '<div class="info-row"><span>3-2 队伍</span><strong class="green">' + qualified.filter(function (id) { return rec[id].l === 2; }).join(" / ") + "</strong></div>" +
          "</div>" +
          '<div class="console-actions" style="margin-top:16px"><button type="button" class="primary-btn wide" data-action="draw-ko">随机抽取八强签表</button>' +
          '<button type="button" class="ghost-btn" data-action="manual-ko">手动排签</button></div>' +
          '<div class="console-note gold">八强起取消同赛区规避。3-0 队伍必定抽到一支 3-2 队伍。</div>';
      } else if (!game.knockout.champion) {
        var pending = game.knockout.matches.filter(function (m) { return !m.winner; }).length;
        html = '<div class="console-head"><div><div class="panel-kicker">KNOCKOUT</div><h3 class="console-title">淘汰赛进行中</h3><p class="console-sub">八强 BO5，单败淘汰。点击对阵卡中的队伍手动判定胜者。</p></div><div class="console-round">KO</div></div>' +
          '<div class="info-list">' +
            '<div class="info-row"><span>待进行</span><strong class="gold">' + pending + " 场</strong></div>" +
            '<div class="info-row"><span>已晋级四强</span><strong>' + (game.knockout.matches.filter(function (m) { return m.stage === "SF"; }).length ? "已产生" : "待定") + "</strong></div>" +
          "</div>" +
          '<div class="console-actions" style="margin-top:16px">' +
            '<button type="button" class="primary-btn wide" data-action="sim-ko">模拟淘汰赛</button>' +
            (game.knockout.matches.every(function (m) { return !m.winner; }) ? '<button type="button" class="ghost-btn" data-action="manual-ko">手动重排八强</button>' : "") +
            '<button type="button" class="ghost-btn" data-action="sim-rest">模拟全部</button>' +
          "</div>" +
          '<div class="console-note">3-0 队伍在八强拥有对位 3-2 队伍的保护签。</div>';
      } else {
        html = '<div class="console-head"><div><div class="panel-kicker">CHAMPION</div><h3 class="console-title">赛会结束</h3><p class="console-sub">这一条世界线已经走到终点。</p></div><div class="console-round">🏆</div></div>' +
          '<div style="text-align:center;padding:8px 0 18px">' + teamBadge(game.knockout.champion, "lg") +
            '<div style="font-size:22px;font-weight:800;margin-top:10px;color:var(--gold-2)">' + esc(team(game.knockout.champion).name) + "</div>" +
            '<div style="font-size:10px;color:var(--muted);margin-top:2px">2026 全球总决赛冠军</div></div>' +
          '<div class="console-actions"><button type="button" class="ghost-btn" data-action="sim-rest">重开一届</button>' +
          '<button type="button" class="ghost-btn" data-action="reset">重置整届赛会</button></div>' +
          '<div class="console-note">所有结果均为本地模拟，不代表官方赛果。</div>';
      }
      $("#consolePanel").innerHTML = html;
      return;
    }

    var r = completed + 1;
    var drawn = E.isRoundDrawn(game, r);
    var ms = E.roundMatches(game, r);
    var analysis = !drawn ? E.analyzeCurrentDraw(game) : null;

    if (!drawn) {
      var active = activeIds();
      var total = analysis ? analysis.total : 0;
      html = consoleHead(r, "等待抽签", r === 1 ? "首轮按种子池抽取，同赛区规避。" : "同战绩队伍随机配对，不重复对阵。") +
        '<div class="console-actions"><button type="button" class="primary-btn wide" data-action="draw-round">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="16" r="1.2" fill="currentColor" stroke="none"/></svg>' +
          "抽取第 " + r + " 轮签表</button>" +
          '<button type="button" class="ghost-btn" data-action="manual-draw">手动排签</button>' +
          (r === 1 && !ms.length ? '<button type="button" class="ghost-btn" data-action="draw-official">载入官方首轮签</button>' : "") +
        "</div>" +
        '<div class="console-divider"></div>' +
        '<div class="info-list">' +
          '<div class="info-row"><span>存活队伍</span><strong>' + active.length + " 队</strong></div>" +
          '<div class="info-row"><span>合法签表</span><strong class="gold">' + (total ? fmt(total) + " 种" : "—") + "</strong></div>" +
          '<div class="info-row"><span>本轮场次</span><strong>' + (r === 1 || r === 2 || r === 3 ? 8 : r === 4 ? 6 : 3) + " 场</strong></div>" +
          '<div class="info-row"><span>赛制</span><strong>' + (r <= 2 ? "全部 BO1" : r === 3 ? "BO1 + BO3" : "全部 BO3") + "</strong></div>" +
        "</div>" +
        '<div class="rule-tags"><span class="rule-tag on">不重复对阵</span>' +
          (r === 1 ? '<span class="rule-tag on">同赛区规避</span>' : '<span class="rule-tag">同赛区不规避</span>') +
          '<span class="rule-tag on">等概率合法签</span></div>' +
        '<div class="console-note">' + (r === 1 ? "1号池 vs 4号池、2号池 vs 3号池；同赛区队伍不会在首轮相遇。" : "同战绩队伍进入同一抽签池；已交手过的对手会被排除。") + "</div>";
    } else {
      var pendingCount = ms.filter(function (m) { return !m.winner; }).length;
      var played = ms.length - pendingCount;
      var isOfficial = ms.every(function (m) { return m.official; });
      html = consoleHead(r, "本轮对阵已确定", played ? "已记录 " + played + " 场，还剩 " + pendingCount + " 场。" : "八场对阵已经确定，等待比赛结果。") +
        '<p class="console-hint">点击队伍判定或改判胜者</p>' +
        '<div class="console-actions"><button type="button" class="primary-btn wide" data-action="sim-round">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>' +
          (played ? "模拟剩余赛果" : "模拟本轮") + "</button>" +
          (played === 0 ? '<button type="button" class="ghost-btn" data-action="manual-draw">手动排签</button>' : "") +
          '<button type="button" class="ghost-btn" data-action="sim-rest">模拟全部</button>' +
        "</div>" +
        '<details class="more-actions"><summary>更多</summary>' +
          (played === 0 ? '<button type="button" class="ghost-btn danger" data-action="redraw-round">重新随机抽取本轮</button>' : "") +
          (r === 1 && played === 0 && !isOfficial ? '<button type="button" class="ghost-btn" data-action="official-round">恢复官方首轮签</button>' : "") +
          '<button type="button" class="ghost-btn" data-action="select-round" data-round="' + Math.min(r, 5) + '">定位到本轮对阵</button>' +
        "</details>" +
        '<div class="console-divider"></div>' +
        '<div class="info-list">' +
          '<div class="info-row"><span>本轮场次</span><strong>' + ms.length + " 场</strong></div>" +
          '<div class="info-row"><span>待进行</span><strong class="gold">' + pendingCount + " 场</strong></div>" +
          '<div class="info-row"><span>赛制</span><strong>' + (ms[0].bo === 1 ? "BO1" : "BO3") + (r === 3 ? " / 混合" : "") + "</strong></div>" +
          (isOfficial ? '<div class="info-row"><span>签表来源</span><strong class="green">官方抽签</strong></div>' : "") +
        "</div>" +
        '<div class="console-note">点击任意队伍即可判定或改判胜者。改判会清除该轮之后的所有赛果。</div>';
    }
    $("#consolePanel").innerHTML = html;
  }

  function matchWinProb(m) {
    var p = E.eloWinProbability(ratings[m.a], ratings[m.b]);
    return E.bestOfProbability(p, m.bo);
  }

  function renderOdds() {
    var rec = recordMap();
    var selected = ui.oddsTeam;
    if (!TEAM[selected]) selected = IDS[0];
    var selRec = rec[selected];
    var html = '<div class="panel-head-inline"><div><div class="panel-kicker">POSSIBILITY RADAR</div><h3>对手概率</h3></div>' +
      '<span class="tiny-pill">EXACT</span></div>' +
      '<div class="select-wrap"><select class="select" id="oddsTeamSelect" aria-label="选择队伍">' + optionsForTeams(selected) + "</select></div>";

    var current = currentRound();
    var drawn = current <= 5 && E.isRoundDrawn(game, current);
    var analysis = current <= 5 && !drawn ? E.analyzeCurrentDraw(game) : null;
    var pendingForTeam = null;
    game.matches.forEach(function (m) {
      if (!m.winner && m.round === current && (m.a === selected || m.b === selected)) pendingForTeam = m;
    });

    if (selRec.w >= 3) {
      html += '<div class="console-note gold" style="margin-top:14px">已晋级八强 · 最终战绩 <b>' + selRec.w + "-" + selRec.l + "</b></div>";
    } else if (selRec.l >= 3) {
      html += '<div class="console-note warn" style="margin-top:14px">已淘汰 · 最终战绩 <b>' + selRec.w + "-" + selRec.l + "</b></div>";
    }

    if (pendingForTeam) {
      var p = matchWinProb(pendingForTeam);
      var opp = pendingForTeam.a === selected ? pendingForTeam.b : pendingForTeam.a;
      html += '<div class="odds-hero"><div><span>对手</span><strong>' + esc(team(opp).name) + '</strong></div><em>' + pct(p) + '</em></div>';
    } else if (analysis && analysis.teamOdds && analysis.teamOdds[selected]) {
      var odds = analysis.teamOdds[selected].slice().sort(function (a, b) { return b.p - a.p; });
      html += '<div class="odds-section-title"><span>第 ' + current + " 轮对手概率</span><span>" + fmt(analysis.total) + " 签</span></div>";
      if (!odds.length) {
        html += '<div class="odds-empty">当前没有可用的对手概率。</div>';
      } else {
        html += '<div class="odds-rows">';
        odds.forEach(function (o) {
          html += '<div class="odds-row"><div class="odds-team">' + teamBadge(o.id) +
            "<div><b>" + esc(o.id) + "</b><small>" + esc(team(o.id).region) + "</small></div></div>" +
            '<div class="odds-bar"><i style="width:' + pctWidth(o.p) + '%"></i></div>' +
            '<div class="odds-pct">' + pct(o.p) + "</div></div>";
        });
        html += "</div>";
      }
    }

    if (ui.lab && ui.lab.teams) {
      var labTeam = null;
      ui.lab.teams.forEach(function (t) { if (t.id === selected) labTeam = t; });
      if (labTeam) {
        html += '<div class="odds-section-title"><span>模拟世界线</span><span>' + fmt(ui.lab.runs) + " 次</span></div>" +
          '<div class="info-list"><div class="info-row"><span>八强概率</span><strong class="gold">' + pct(labTeam.qualify) + "</strong></div>" +
          '<div class="info-row"><span>夺冠概率</span><strong class="green">' + pct(labTeam.champion) + "</strong></div>" +
          '<div class="info-row"><span>平均胜场</span><strong>' + labTeam.avgWins.toFixed(2) + "</strong></div></div>";
      }
    }

    var pathRows = selRec.path.map(function (p) {
      return { order: p.round * 10, label: "R" + p.round, opp: p.opp, result: p.result, scoreFor: p.scoreFor, scoreAgainst: p.scoreAgainst };
    });
    if (game.knockout && game.knockout.drawn) {
      var koOrder = { QF: 60, SF: 70, F: 80 };
      game.knockout.matches.forEach(function (m) {
        if (!m.winner || (m.a !== selected && m.b !== selected)) return;
        var won = m.winner === selected;
        var scoreFor = m.a === selected ? m.scoreA : m.scoreB;
        var scoreAgainst = m.a === selected ? m.scoreB : m.scoreA;
        pathRows.push({
          order: koOrder[m.stage] || 90,
          label: m.stage === "QF" ? "八强" : m.stage === "SF" ? "四强" : "决赛",
          opp: m.a === selected ? m.b : m.a,
          result: won ? "W" : "L",
          scoreFor: scoreFor,
          scoreAgainst: scoreAgainst
        });
      });
    }
    if (pathRows.length) {
      pathRows.sort(function (a, b) { return a.order - b.order; });
      html += '<div class="odds-path"><div class="odds-section-title" style="margin-top:0"><span>已走路径</span><span>' + pathRows.length + " 场</span></div>";
      pathRows.forEach(function (p) {
        html += '<div class="path-row"><span class="path-round">' + p.label + '</span><span class="path-team">' + teamBadge(p.opp, "sm") +
          "<b>" + esc(p.opp) + '</b></span><span class="path-result ' + (p.result === "W" ? "win" : "loss") + '">' + p.result + " " + p.scoreFor + "-" + p.scoreAgainst + "</span></div>";
      });
      html += "</div>";
    }

    $("#oddsPanel").innerHTML = html;
  }

  /* ------------------------------------------------------------------ */
  /* render — knockout                                                   */
  /* ------------------------------------------------------------------ */

  function koCardHTML(m, index) {
    var status = m.winner ? { text: "已结束", cls: "done" } : { text: "待进行", cls: "live" };
    var cls = ["match-card"];
    if (!m.winner) cls.push("is-pending", "is-live");
    else cls.push("is-done");
    if (ui.animateRound === "KO" && m.stage === "QF") cls.push("is-dealing");
    var meta = '<span class="match-bo">BO5</span><span class="match-stake">' + esc(m.note || "") + "</span>";
    return '<article class="' + cls.join(" ") + '" style="--i:' + index + '">' +
      '<div class="match-meta"><span class="match-meta-left">' + meta + '</span><span class="match-status ' + status.cls + '">' + status.text + "</span></div>" +
      koTeamRow(m, "a") + koTeamRow(m, "b") + "</article>";
  }

  function koTeamRow(m, side) {
    var id = side === "a" ? m.a : m.b;
    var isWinner = m.winner === id;
    var isLoser = !!m.winner && m.winner !== id;
    var score = m.winner ? (side === "a" ? m.scoreA : m.scoreB) : "–";
    var cls = ["team-row", "is-clickable"];
    if (!m.winner) cls.push("is-pending");
    if (isWinner) cls.push("is-winner");
    if (isLoser) cls.push("is-loser");
    var t = team(id);
    var title = !m.winner
      ? "点击判定 " + t.name + " 获胜"
      : isWinner
        ? "当前胜者；点击另一支队伍可以改判"
        : "点击改判为 " + t.name + " 获胜";
    var inner = teamBadge(id) +
      '<span class="team-info"><strong>' + esc(t.name) + '</strong><small>' + esc(t.region) + "</small></span>" +
      '<span class="team-score">' + score + "</span><span class=\"win-mark\">✓</span>";
    return '<button type="button" class="' + cls.join(" ") + '" data-action="pick-ko-winner" data-match-id="' + m.id + '" data-team="' + id + '" title="' + esc(title) + '">' + inner + "</button>";
  }

  function renderKnockout() {
    var panel = $("#knockoutPanel");
    var qualified = qualifiedIds();
    var rec = recordMap();
    if (qualified.length < 8) {
      panel.style.display = "none";
      panel.innerHTML = "";
      return;
    }
    panel.style.display = "";
    var ko = game.knockout;
    var koUnplayed = ko.drawn && ko.matches.length > 0 && ko.matches.every(function (m) { return !m.winner; });
    var html = '<div class="knockout-head"><div><div class="panel-kicker">SINGLE ELIMINATION</div><h3>淘汰赛 · 八强签表</h3>' +
      '<p class="console-sub" style="margin-top:3px">八强起 BO5，单败淘汰；不规避同赛区。</p></div>' +
      '<div class="ko-head-actions"><span class="tiny-pill">' + (ko.champion ? "已结束" : ko.drawn ? "进行中" : "待抽签") + "</span>" +
      (koUnplayed ? '<button type="button" class="ghost-btn small" data-action="manual-ko">手动重排</button>' : "") +
      "</div></div>" +
      '<div class="knockout-body">';

    if (!ko.drawn) {
      html += '<div class="ko-empty"><h4>八强已经产生，等待抽签</h4>' +
        '<p>两支 3-0 队伍分别随机对阵一支 3-2 队伍，剩余四支队伍随机配对。3-0 队伍不会在八强相遇。</p>' +
        '<div class="empty-actions"><button type="button" class="primary-btn" data-action="draw-ko">随机抽取</button>' +
        '<button type="button" class="ghost-btn" data-action="manual-ko">手动排签</button></div>' +
        '<div class="qualified-chips">' + qualified.map(function (id) { return "<span>" + teamBadge(id, "sm") + esc(id) + " · " + rec[id].w + "-" + rec[id].l + "</span>"; }).join("") + "</div>" +
        '<div class="seed-legend"><span><i class="seed-dot"></i>3-0</span><span><i class="seed-dot green"></i>3-1</span><span><i class="seed-dot blue"></i>3-2</span></div></div>';
    } else {
      var qf = ko.matches.filter(function (m) { return m.stage === "QF"; });
      var sf = ko.matches.filter(function (m) { return m.stage === "SF"; });
      var fin = ko.matches.filter(function (m) { return m.stage === "F"; });
      var qfDone = qf.length === 4 && qf.every(function (m) { return m.winner; });
      var sfDone = sf.length === 2 && sf.every(function (m) { return m.winner; });

      html += '<div class="bracket-scroll"><div class="bracket">' +
        '<div class="bracket-col"><h5>Quarterfinals · BO5</h5>' + qf.map(function (m, i) { return koCardHTML(m, i); }).join("") + "</div>" +
        '<div class="bracket-col"><h5>Semifinals</h5>' +
          (sf.length ? sf.map(function (m, i) { return koCardHTML(m, i); }).join("") : '<div class="bracket-placeholder">等待八强结果</div><div class="bracket-placeholder">等待八强结果</div>') +
        "</div>" +
        '<div class="bracket-col"><h5>Final</h5>' +
          (fin.length ? fin.map(function (m, i) { return koCardHTML(m, i); }).join("") : '<div class="bracket-placeholder">等待半决赛</div>') +
        "</div>" +
        '<div class="bracket-col"><h5>Champion</h5>' +
          (ko.champion
            ? '<div class="champion-card"><span class="crown">♛</span>' + teamBadge(ko.champion, "lg") + "<strong>" + esc(team(ko.champion).name) + "</strong><small>WORLDS 2026 CHAMPION</small></div>"
            : '<div class="champion-card" style="opacity:.55"><span class="crown">♛</span><small>等待冠军</small><strong style="font-size:13px;color:var(--muted)">TBD</strong></div>') +
        "</div></div></div>";
      html += '<div class="seed-legend"><span><i class="seed-dot"></i>3-0 vs 3-2 保护签</span><span><i class="seed-dot green"></i>其余四队随机配对</span></div>';
    }
    html += "</div>";
    panel.innerHTML = html;
  }

  /* ------------------------------------------------------------------ */
  /* render — lab                                                        */
  /* ------------------------------------------------------------------ */

  function renderLabControls() {
    $$("#runsSegmented button").forEach(function (b) {
      b.classList.toggle("is-active", Number(b.dataset.runs) === ui.labRuns);
    });
    $$("#scopeSegmented button").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.scope === ui.labScope);
    });
    $$("#presetSegmented button").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.preset === ui.preset);
    });
  }

  function renderLab() {
    renderLabControls();
    var lab = ui.lab;
    var labMeta = $("#labMeta");
    if (lab) {
      var scopeLabel = ui.labScope === "current" ? "当前进度" : ui.labScope === "official" ? "官方首轮签" : "每轮重抽";
      labMeta.innerHTML = "<span>模拟 <b>" + fmt(lab.runs) + "</b> 次 · 起点：<b>" + scopeLabel + "</b>" + (lab.base && lab.base.rerollR1 ? " · 首轮随机" : "") + (lab.base && lab.base.completed >= 5 ? " · 瑞士轮已完成，从八强重抽" : "") + "</span>" +
        "<span>耗时 <b>" + (lab.elapsed || 0) + " ms</b> · 随机种子 <b>" + lab.seed + "</b></span>";
    } else {
      labMeta.innerHTML = "<span>尚未运行模拟。点击「运行模拟」生成整届赛会概率。</span><span>精确抽签概率无需模拟，见下方。</span>";
    }

    if (!lab) {
      $("#labStatGrid").innerHTML = ["最可能冠军", "最可能八强", "最可能 3-0", "最强赛区"].map(function (label) {
        return '<div class="lab-stat-card"><div class="ls-label">' + label + '</div><div class="ls-value small" style="color:var(--dim)">—</div><div class="ls-sub">运行模拟后显示</div></div>';
      }).join("");
      $("#labChart").innerHTML = '<div class="combo-empty">运行模拟后生成概率条形图</div>';
      $("#labTable tbody").innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--dim);padding:28px 0">运行模拟后生成十六队概率表</td></tr>';
      $("#labRegions").innerHTML = '<div class="combo-empty">运行模拟后生成赛区统计</div>';
      $("#labComboPanel").innerHTML = '<div class="panel-head-inline"><div><div class="panel-kicker">MOST LIKELY WORLDS</div><h3>常见八强组合</h3></div></div><div class="combo-empty">运行模拟后显示</div>';
      renderLabR1();
      renderLabCurrent();
      return;
    }

    var sorted = lab.teams.slice().sort(function (a, b) { return b.qualify - a.qualify; });
    var champion = lab.teams.slice().sort(function (a, b) { return b.champion - a.champion; })[0];
    var topQual = sorted[0];
    var topSeed = lab.teams.slice().sort(function (a, b) { return b.seed0 - a.seed0; })[0];
    var bestRegion = Object.keys(lab.regions).map(function (r) { return lab.regions[r]; }).sort(function (a, b) { return b.championRate - a.championRate; })[0];

    $("#labStatGrid").innerHTML =
      '<div class="lab-stat-card"><div class="ls-label">最可能冠军</div><div class="ls-value small">' + esc(champion.id) + '</div><div class="ls-sub">' + pct(champion.champion) + " · " + esc(team(champion.id).name) + "</div></div>" +
      '<div class="lab-stat-card"><div class="ls-label">最可能八强</div><div class="ls-value small">' + esc(topQual.id) + '</div><div class="ls-sub">' + pct(topQual.qualify) + " · 平均 " + topQual.avgWins.toFixed(2) + " 胜</div></div>" +
      '<div class="lab-stat-card"><div class="ls-label">最可能 3-0</div><div class="ls-value small">' + esc(topSeed.id) + '</div><div class="ls-sub">' + pct(topSeed.seed0) + " · 全胜出线</div></div>" +
      '<div class="lab-stat-card"><div class="ls-label">最强赛区</div><div class="ls-value small">' + esc(bestRegion.region) + '</div><div class="ls-sub">冠军 ' + pct(bestRegion.championRate) + " · 场均晋级 " + pct(bestRegion.qualify) + "</div></div>";

    var top = sorted.slice(0, 10);
    var chart = top.map(function (t) {
      var p = pctWidth(t.qualify);
      var c = pctWidth(t.champion);
      return '<div class="chart-row"><div class="chart-team">' + teamBadge(t.id) + "<b>" + esc(t.id) + "</b></div>" +
        '<div class="chart-track"><i style="width:' + p + '%"></i><em style="left:' + Math.min(99, c) + '%"></em></div>' +
        '<div class="chart-val">' + pct(t.qualify) + "</div></div>";
    }).join("");
    $("#labChart").innerHTML = chart;

    $("#labTable tbody").innerHTML = sorted.map(function (t, i) {
      return '<tr class="' + (i < 8 ? "is-top" : "") + '"><td class="rank">' + String(i + 1).padStart(2, "0") + "</td>" +
        '<td><div class="pt-team">' + teamBadge(t.id) + "<div><strong>" + esc(t.id) + "</strong><small>" + esc(team(t.id).name) + "</small></div></div></td>" +
        '<td class="prob-cell hot"><span class="mini-bar"><i style="width:' + pctWidth(t.qualify) + '%"></i></span>' + pct(t.qualify) + "</td>" +
        '<td class="prob-cell">' + pct(t.semi) + "</td>" +
        '<td class="prob-cell">' + pct(t.final) + "</td>" +
        '<td class="prob-cell champ">' + pct(t.champion) + "</td>" +
        '<td class="prob-cell">' + pct(t.seed0) + "</td>" +
        '<td class="prob-cell">' + t.avgWins.toFixed(2) + "</td></tr>";
    }).join("");

    var regions = Object.keys(lab.regions).map(function (r) { return lab.regions[r]; }).sort(function (a, b) { return b.qualify - a.qualify; });
    $("#labRegions").innerHTML = regions.map(function (r) {
      var meta = REGIONS[r.region];
      return '<div class="region-row" style="--rc:' + meta.color + '"><div class="region-row-head"><span class="region-name"><i></i>' + esc(r.region) + '</span><span class="region-val">' + pct(r.qualify) + ' 场均晋级</span></div>' +
        '<div class="region-sub"><span>' + r.teams + " 队参赛</span><span>冠军 " + pct(r.championRate) + "</span></div>" +
        '<div class="region-track"><i style="width:' + pctWidth(r.qualify) + '%"></i></div></div>';
    }).join("");

    if (lab.combos && lab.combos.length) {
      $("#labComboPanel").innerHTML = '<div class="panel-head-inline"><div><div class="panel-kicker">MOST LIKELY WORLDS</div><h3>常见八强组合</h3></div><span class="tiny-pill">TOP ' + lab.combos.length + "</span></div>" +
        '<div class="combo-list">' + lab.combos.map(function (c, i) {
          return '<div class="combo-item"><span class="combo-rank">' + String(i + 1).padStart(2, "0") + '</span><div class="combo-teams">' +
            c.ids.map(function (id) { return '<span title="' + esc(id) + '">' + teamBadge(id, "sm") + "</span>"; }).join("") + '</div><span class="combo-pct">' + c.count + " 次 · " + pctDetail(c.p) + "</span></div>";
        }).join("") + "</div>" +
        '<p class="lab-section-note">同一组八强队伍按 3-0 / 3-1 / 3-2 排序；概率为出现频率。</p>';
    } else {
      $("#labComboPanel").innerHTML = '<div class="panel-head-inline"><div><div class="panel-kicker">MOST LIKELY WORLDS</div><h3>常见八强组合</h3></div></div><div class="combo-empty">组合过于分散，增加模拟次数后再看</div>';
    }

    renderLabR1();
    renderLabCurrent();
  }

  function renderLabR1() {
    var exact = E.analyzeR1();
    var selected = ui.labTeam;
    var odds = exact.teamOdds[selected] || [];
    var allTeams = IDS.map(function (id) {
      var top = (exact.teamOdds[id] || [])[0];
      return { id: id, top: top };
    });

    var html = '<div class="panel-head-inline"><div><div class="panel-kicker">EXACT DRAW ODDS</div><h3>首轮抽签可能性</h3></div><span class="tiny-pill">P1vP4 · P2vP3</span></div>' +
      '<div class="draw-odds-head"><div class="draw-total"><strong>' + fmt(exact.total) + '</strong><span>种合法首轮签</span></div>' +
      '<button type="button" class="ghost-btn small" data-action="browse-r1">浏览全部</button></div>' +
      '<div class="draw-groups">' + exact.groups.map(function (g) {
        return '<div class="draw-group-card"><small>' + esc(g.label) + '</small><strong>' + fmt(g.count) + ' 种</strong><span>4 组对位</span></div>';
      }).join("") + "</div>" +
      '<div class="select-wrap"><select class="select" id="labTeamSelect" aria-label="选择队伍查看首轮对手概率">' + optionsForTeams(selected) + "</select></div>" +
      '<div class="team-odds-list" style="margin-top:12px">' + (odds.length ? odds.map(function (o) {
        return '<div class="team-odds-row"><div class="odds-team">' + teamBadge(o.id) + "<div><b>" + esc(o.id) + "</b><small>" + esc(team(o.id).region) + "</small></div></div>" +
          '<div class="odds-bar"><i style="width:' + pctWidth(o.p) + '%"></i></div><span class="odds-pct">' + pct(o.p) + "</span></div>";
      }).join("") : '<div class="odds-empty">该队伍不在首轮池中。</div>') + "</div>" +
      '<div class="all-teams-odds"><h4>每队最可能的首轮对手</h4><div class="all-teams-odds-grid">' +
      allTeams.map(function (t) {
        return '<div class="all-teams-odds-row"><span class="tiny-team">' + teamBadge(t.id, "sm") + "<b>" + esc(t.id) + "</b></span><span>" +
          (t.top ? esc(t.top.id) + " " + pct(t.top.p) : "—") + "</span></div>";
      }).join("") + "</div></div>" +
      '<p class="lab-section-note">同赛区规避会扣除部分对位，因此每队只有 3 个潜在首轮对手。所有合法签表等概率。</p>';

    $("#labR1Panel").innerHTML = html;
  }

  function renderLabCurrent() {
    var completed = E.countCompletedRounds(game);
    var panel = $("#labCurrentPanel");
    if (completed >= 5) {
      panel.innerHTML = '<div class="panel-head-inline"><div><div class="panel-kicker">CURRENT STATE</div><h3>当前轮抽签概率</h3></div><span class="tiny-pill">SWISS DONE</span></div>' +
        '<div class="combo-empty">瑞士轮已结束，八强已经产生。上方可查看蒙特卡洛结果。</div>';
      return;
    }
    var r = completed + 1;
    if (E.isRoundDrawn(game, r)) {
      var ms = E.roundMatches(game, r);
      panel.innerHTML = '<div class="panel-head-inline"><div><div class="panel-kicker">CURRENT STATE</div><h3>本轮对阵胜率</h3></div><span class="tiny-pill">ROUND ' + r + "</span></div>" +
        '<p class="lab-section-note" style="margin-top:-6px">第 ' + r + ' 轮已经抽签，下面按当前实力值给出每场系列赛胜率。</p>' +
        '<div class="exact-list">' + ms.map(function (m) {
          var p = E.bestOfProbability(E.eloWinProbability(ratings[m.a], ratings[m.b]), m.bo);
          return '<div class="exact-row"><span class="ex-label">' + esc(m.a) + " vs " + esc(m.b) + '</span><span class="ex-bar"><i style="width:' + pctWidth(p) + '%"></i></span><span class="ex-val">' + pct(p) + "</span></div>";
        }).join("") + "</div>";
      return;
    }
    var exact = E.analyzeCurrentDraw(game);
    if (!exact) { panel.innerHTML = ""; return; }
    var selected = ui.labTeam;
    var odds = (exact.teamOdds && exact.teamOdds[selected]) || [];
    panel.innerHTML = '<div class="panel-head-inline"><div><div class="panel-kicker">CURRENT STATE</div><h3>第 ' + r + ' 轮精确抽签概率</h3></div><span class="tiny-pill">' + fmt(exact.total) + ' 种</span></div>' +
      '<div class="draw-odds-head"><div class="draw-total"><strong>' + fmt(exact.total) + '</strong><span>种合法签表</span></div></div>' +
      '<div class="draw-groups">' + exact.groups.map(function (g) {
        return '<div class="draw-group-card"><small>' + esc(g.label) + '</small><strong>' + fmt(g.count) + ' 种</strong><span>BO' + g.bo + "</span></div>";
      }).join("") + "</div>" +
      '<div class="select-wrap"><select class="select" id="labTeamSelectCurrent" aria-label="选择队伍查看本轮对手概率">' + optionsForTeams(selected) + "</select></div>" +
      '<div class="exact-list">' + (odds.length ? odds.map(function (o) {
        return '<div class="exact-row"><span class="ex-label">' + esc(o.id) + " · " + esc(team(o.id).region) + '</span><span class="ex-bar"><i style="width:' + pctWidth(o.p) + '%"></i></span><span class="ex-val">' + pct(o.p) + "</span></div>";
      }).join("") : '<div class="combo-empty">该队伍已不在本轮抽签池中</div>') + "</div>" +
      '<p class="lab-section-note">精确概率按当前战绩与已交手记录计算；未开赛的轮次会随上一轮赛果实时变化。</p>';
  }

  /* ------------------------------------------------------------------ */
  /* render — rules                                                      */
  /* ------------------------------------------------------------------ */

  function renderRules() {
    var pools = [1, 2, 3, 4].map(function (p) {
      return '<div class="pool-card p' + p + '"><div class="pool-card-head"><strong>' + p + ' 号池</strong></div>' +
        Data.POOLS[p].map(function (id) {
          return '<div class="pool-team">' + teamBadge(id) + "<b>" + esc(id) + "</b><small>" + esc(team(id).region) + "</small></div>";
        }).join("") + "</div>";
    }).join("");
    $("#poolsGrid").innerHTML = pools;

    $("#actualDrawList").innerHTML = Data.ACTUAL_R1.map(function (p, i) {
      return '<div class="actual-row"><span class="actual-team">' + teamBadge(p.a, "sm") + "<b>" + esc(p.a) + "</b></span>" +
        '<span class="actual-vs">VS</span><span class="actual-team">' + teamBadge(p.b, "sm") + "<b>" + esc(p.b) + "</b></span>" +
        "</div>";
    }).join("");

    var avg = IDS.reduce(function (s, id) { return s + ratings[id]; }, 0) / IDS.length;
    $("#ratingsGrid").innerHTML = IDS.slice().sort(function (a, b) { return ratings[b] - ratings[a]; }).map(function (id) {
      var t = team(id);
      var delta = Math.round(ratings[id] - avg);
      return '<div class="rating-row">' + teamBadge(id) + '<div class="rating-team"><div><b>' + esc(t.id) + '</b><small>' + esc(t.seedLabel) + "</small></div></div>" +
        '<input class="rating-range" type="range" min="1400" max="2000" step="5" value="' + ratings[id] + '" data-rating="' + id + '" aria-label="' + esc(t.id) + ' 实力值">' +
        '<span class="rating-val" data-rating-val="' + id + '">' + ratings[id] + "</span>" +
        '<span class="rating-pct" data-rating-delta="' + id + '" title="相对十六队平均实力值">' + (delta >= 0 ? "+" : "") + delta + "</span></div>";
    }).join("");
  }

  /* ------------------------------------------------------------------ */
  /* render — all                                                        */
  /* ------------------------------------------------------------------ */

  function renderAll() {
    renderStatus();
    renderRoundNav();
    renderStandings();
    renderRoundPanel();
    renderConsole();
    renderOdds();
    renderKnockout();
    $("#undoBtn").disabled = history.length === 0;
    renderSegments();
    if (ui.view === "lab") renderLab();
    if (ui.view === "rules") renderRules();
  }

  function renderSegments() {
    $$("#runsSegmented button").forEach(function (b) { b.classList.toggle("is-active", Number(b.dataset.runs) === ui.labRuns); });
    $$("#scopeSegmented button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.scope === ui.labScope); });
    $$("#presetSegmented button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.preset === ui.preset); });
  }

  /* ------------------------------------------------------------------ */
  /* persistence / history                                               */
  /* ------------------------------------------------------------------ */

  function saveGame() {
    var el = $("#autosave");
    if (el) el.classList.add("is-saving");
    safeSet(STORAGE_GAME, JSON.stringify(game));
    safeSet(STORAGE_HISTORY, JSON.stringify(history.slice(-24)));
    window.setTimeout(function () { if (el) el.classList.remove("is-saving"); }, 450);
  }

  function saveRatings() { safeSet(STORAGE_RATINGS, JSON.stringify(ratings)); }

  function pushHistory() {
    history.push(E.cloneState(game));
    if (history.length > 24) history.shift();
    safeSet(STORAGE_HISTORY, JSON.stringify(history));
  }

  function rollback() {
    if (!history.length) return;
    game = E.normalizeState(history.pop());
    ui.lab = null;
    ui.labStale = true;
    saveGame();
    renderAll();
  }

  function resetAll(keepRatings) {
    pushHistory();
    game = E.createInitialState();
    ui.round = 1;
    ui.animateRound = 1;
    ui.lab = null;
    ui.labStale = true;
    if (!keepRatings) {
      ratings = {};
      IDS.forEach(function (id) { ratings[id] = E.DEFAULT_RATINGS[id]; });
      ui.preset = "default";
      saveRatings();
    }
    saveGame();
    renderAll();
    window.setTimeout(function () { ui.animateRound = null; }, 1300);
    toast("已重置为官方首轮签", "success");
  }

  /* ------------------------------------------------------------------ */
  /* actions                                                             */
  /* ------------------------------------------------------------------ */

  function doDraw(opts) {
    opts = opts || {};
    var completed = E.countCompletedRounds(game);
    if (completed >= 5) { toast("瑞士轮已经结束", "warn"); return; }
    var r = completed + 1;
    if (E.isRoundDrawn(game, r)) { toast("本轮已经抽签", "warn"); return; }
    pushHistory();
    try {
      E.drawRound(game, { rng: Math.random, official: !!opts.official });
      ui.round = r;
      ui.animateRound = r;
      ui.lab = null;
      ui.labStale = true;
      saveGame();
      renderAll();
      toast("第 " + r + " 轮签表已抽出", "success");
      window.setTimeout(function () {
        if (ui.animateRound === r) ui.animateRound = null;
      }, 1300);
    } catch (e) {
      rollback();
      toast(e.message || "抽签失败", "warn");
    }
  }

  function doSimRound() {
    var completed = E.countCompletedRounds(game);
    if (completed >= 5) { toast("瑞士轮已经结束", "warn"); return; }
    var r = completed + 1;
    if (!E.isRoundDrawn(game, r)) doDraw();
    if (!E.isRoundDrawn(game, r)) return;
    pushHistory();
    try {
      E.simulatePendingRound(game, ratings, Math.random);
      ui.round = r;
      ui.animateRound = r;
      ui.lab = null;
      ui.labStale = true;
      saveGame();
      renderAll();
      if (E.countCompletedRounds(game) >= 5) toast("瑞士轮结束，八强产生", "success");
      else toast("第 " + r + " 轮赛果已结算", "success");
      window.setTimeout(function () { ui.animateRound = null; }, 900);
    } catch (e) {
      rollback();
      toast(e.message || "模拟失败", "warn");
    }
  }

  function doSimRest() {
    if (E.countCompletedRounds(game) >= 5 && game.knockout.champion) {
      confirmAction("重开一届？", "当前这届赛会的冠军是 " + game.knockout.champion + "。重开会回到官方首轮签，并清除当前所有赛果。", "重开一届", function () { resetAll(true); });
      return;
    }
    pushHistory();
    try {
      if (!game.matches.length) E.drawRound(game, { rng: Math.random });
      E.simulateRemainingSwiss(game, ratings, Math.random);
      var qualified = qualifiedIds();
      if (qualified.length === 8 && !game.knockout.champion) {
        if (!game.knockout.drawn) E.drawKnockout(game, Math.random);
        E.simulateKnockoutState(game, ratings, Math.random);
      }
      ui.round = 5;
      ui.animateRound = 5;
      ui.lab = null;
      ui.labStale = true;
      saveGame();
      renderAll();
      if (game.knockout.champion) toast("模拟完成 · 冠军 " + game.knockout.champion, "success");
      else toast("已模拟至当前进度", "success");
      window.setTimeout(function () { ui.animateRound = null; }, 1200);
    } catch (e) {
      rollback();
      toast(e.message || "模拟失败", "warn");
    }
  }

  function doRedrawRound() {
    var completed = E.countCompletedRounds(game);
    if (completed >= 5) { toast("瑞士轮已经结束", "warn"); return; }
    var r = completed + 1;
    var ms = E.roundMatches(game, r);
    if (!ms.length) { doDraw(); return; }
    if (ms.some(function (m) { return !!m.winner; })) {
      toast("本轮已有赛果，不能再重抽", "warn");
      return;
    }
    pushHistory();
    game.matches = game.matches.filter(function (m) { return m.round !== r; });
    game.knockout = { drawn: false, matches: [], champion: null };
    try {
      E.drawRound(game, { rng: Math.random });
      ui.round = r;
      ui.animateRound = r;
      ui.lab = null;
      saveGame();
      renderAll();
      toast("已重新抽取第 " + r + " 轮", "success");
      window.setTimeout(function () { ui.animateRound = null; }, 1300);
    } catch (e) {
      rollback();
      toast(e.message || "重抽失败", "warn");
    }
  }

  function doOfficialRound() {
    var completed = E.countCompletedRounds(game);
    if (completed !== 0) { toast("只能在首轮恢复官方签", "warn"); return; }
    var ms = E.roundMatches(game, 1);
    if (ms.some(function (m) { return !!m.winner; })) { toast("首轮已有赛果，不能恢复", "warn"); return; }
    pushHistory();
    game.matches = game.matches.filter(function (m) { return m.round !== 1; });
    try {
      E.drawRound(game, { official: true });
      ui.round = 1;
      ui.animateRound = 1;
      ui.lab = null;
      saveGame();
      renderAll();
      toast("已恢复官方首轮签", "success");
      window.setTimeout(function () { ui.animateRound = null; }, 1200);
    } catch (e) {
      rollback();
      toast(e.message || "恢复失败", "warn");
    }
  }


  /* ------------------------------------------------------------------ */
  /* Manual draw modal                                                   */
  /* ------------------------------------------------------------------ */

  function manualPairedMap(pairs) {
    var map = {};
    pairs.forEach(function (p) {
      map[p.a] = p.b;
      map[p.b] = p.a;
    });
    return map;
  }

  function manualTotalTeams(manual) {
    return manual.groups.reduce(function (n, g) { return n + g.teams.length; }, 0);
  }

  function manualChipHTML(id, pairedMap, selected, round, mode) {
    var paired = pairedMap[id];
    var legal = false;
    if (selected && !paired && id !== selected) {
      legal = mode === "ko"
        ? E.canManualKnockoutPair(game, selected, id)
        : E.canManualPair(game, round, selected, id);
    }
    var cls = ["manual-chip"];
    if (paired) cls.push("is-paired");
    if (id === selected) cls.push("is-selected");
    if (selected && id !== selected && !paired) cls.push(legal ? "is-legal" : "is-illegal");
    return '<button type="button" class="' + cls.join(" ") + '" data-action="manual-team" data-team="' + id + '" title="' + esc(team(id).name) + '">' +
      teamBadge(id, "sm") + "<span>" + esc(team(id).name) + "</span></button>";
  }

  function manualSeedRow(label, ids, pairedMap, selected, mode) {
    return '<div class="manual-seed-row"><span class="manual-seed-label">' + label + '</span><div class="manual-chips">' +
      ids.map(function (id) { return manualChipHTML(id, pairedMap, selected, "KO", mode); }).join("") +
      "</div></div>";
  }

  function manualHTML() {
    var m = ui.manual;
    if (!m) return "";
    var isKo = m.mode === "ko";
    var pairedMap = manualPairedMap(m.pairs);
    var total = manualTotalTeams(m);
    var needed = total / 2;
    var complete = m.pairs.length === needed;

    var groupsHtml = m.groups.map(function (g) {
      var head = '<div class="manual-group-head"><h4>' + esc(g.label) + '</h4><span>' + g.teams.length + " 队 · BO" + g.bo + "</span></div>";
      if (g.type === "bipartite") {
        var leftLabel = g.key === "P1-P4" ? "1 号池" : "2 号池";
        var rightLabel = g.key === "P1-P4" ? "4 号池" : "3 号池";
        return '<div class="manual-group">' + head +
          '<div class="manual-sides">' +
            '<div><div class="manual-side-label">' + leftLabel + '</div><div class="manual-chips">' +
              g.left.map(function (id) { return manualChipHTML(id, pairedMap, m.selected, m.round, "swiss"); }).join("") +
            "</div></div>" +
            '<div class="manual-vs">VS</div>' +
            '<div><div class="manual-side-label">' + rightLabel + '</div><div class="manual-chips">' +
              g.right.map(function (id) { return manualChipHTML(id, pairedMap, m.selected, m.round, "swiss"); }).join("") +
            "</div></div>" +
          "</div></div>";
      }
      if (g.type === "knockout") {
        return '<div class="manual-group">' + head +
          '<div class="manual-ko-rule">3-0 队伍必须对 3-2 队伍；其余四队随机配对。配对顺序对应 QF1–QF4：QF1/QF2 为上半区，QF3/QF4 为下半区。</div>' +
          manualSeedRow("3-0", g.seedBuckets.three0, pairedMap, m.selected, "ko") +
          manualSeedRow("3-1", g.seedBuckets.three1, pairedMap, m.selected, "ko") +
          manualSeedRow("3-2", g.seedBuckets.three2, pairedMap, m.selected, "ko") +
        "</div>";
      }
      return '<div class="manual-group">' + head +
        '<div class="manual-chips">' +
          g.teams.map(function (id) { return manualChipHTML(id, pairedMap, m.selected, m.round, "swiss"); }).join("") +
        "</div></div>";
    }).join("");

    var pairsHtml = m.pairs.length ? m.pairs.map(function (p, i) {
      return '<div class="manual-pair-row"><span class="manual-pair-team">' + teamBadge(p.a, "sm") + "<b>" + esc(p.a) + '</b></span><span class="manual-pair-vs">' + (isKo ? "QF" + (i + 1) : "vs") + '</span>' +
        '<span class="manual-pair-team">' + teamBadge(p.b, "sm") + "<b>" + esc(p.b) + '</b></span>' +
        '<button type="button" class="manual-remove" data-action="manual-remove" data-index="' + i + '" title="移除这对">×</button></div>';
    }).join("") : '<div class="manual-empty">' + (isKo ? "还没有八强对阵。点击一支队伍，再点一位合法对手。" : "还没有手动配对。点击一支队伍，再点一位合法对手。") + "</div>";

    var title = isKo ? "手动排签 · 八强" : "手动排签 · 第 " + m.round + " 轮";
    var sub = isKo
      ? "3-0 必对 3-2，其余四队随机；配对顺序决定 QF1–QF4 与上下半区。"
      : (m.round === 1 ? "1 号池 vs 4 号池、2 号池 vs 3 号池；同赛区规避。" : "同战绩配对，不允许重复对阵。");
    var help = isKo ? "3-0 对 3-2；先点一队，再点对手。" : "先点一队，再点对手。";

    return '<div class="modal-head"><div><h3 id="modalTitle">' + title + '</h3>' +
      '<p class="manual-sub">' + sub + ' 选中队伍后，可配对的对位会点亮。</p></div>' +
      '<button class="modal-close" type="button" data-action="modal-close" aria-label="关闭">×</button></div>' +
      '<div class="modal-body">' +
        '<div class="manual-help">' + help + '</div>' +
        '<div class="manual-groups">' + groupsHtml + "</div>" +
        '<div class="manual-pairs"><div class="manual-pairs-title"><span>已排对阵</span><span>' + m.pairs.length + " / " + needed + " 场</span></div>" + pairsHtml + "</div>" +
        '<div class="manual-footer"><div class="manual-count">已配对 <b>' + (m.pairs.length * 2) + "</b> / " + total + " 支队伍</div>" +
          '<div class="manual-actions">' +
            '<button type="button" class="ghost-btn small" data-action="manual-clear">清空</button>' +
            '<button type="button" class="ghost-btn small" data-action="manual-autofill">自动补齐</button>' +
            '<button type="button" class="primary-btn small" data-action="manual-commit"' + (complete ? "" : " disabled") + ">" + (isKo ? "完成八强抽签" : "完成抽签") + "</button>" +
          "</div></div>" +
      "</div>";
  }

  function refreshManualModal() {
    var modal = $("#modal");
    if (!ui.manual || !modal) return;
    var top = modal.scrollTop;
    modal.innerHTML = manualHTML();
    modal.scrollTop = top;
  }

  function openManualDraw() {
    var completed = E.countCompletedRounds(game);
    if (completed >= 5) { toast("瑞士轮已经结束", "warn"); return; }
    var round = completed + 1;
    var existing = E.roundMatches(game, round);
    if (existing.some(function (m) { return !!m.winner; })) {
      toast("本轮已有赛果，不能再改签", "warn");
      return;
    }
    var groups = E.manualGroups(game, round);
    if (!groups.length) { toast("当前没有可排签的队伍", "warn"); return; }
    ui.manual = { mode: "swiss", round: round, groups: groups, pairs: [], selected: null };
    openModal(manualHTML(), false, true);
  }

  function openManualKnockout() {
    if (qualifiedIds().length !== 8) { toast("八强还未全部产生", "warn"); return; }
    if (game.knockout && game.knockout.matches.some(function (m) { return !!m.winner; })) {
      toast("淘汰赛已有赛果，不能再改签", "warn");
      return;
    }
    var info = E.manualKnockoutInfo(game);
    ui.manual = {
      mode: "ko",
      round: "KO",
      groups: [{
        key: "KO",
        label: "八强对阵",
        type: "knockout",
        teams: info.teams,
        seedBuckets: { three0: info.three0, three1: info.three1, three2: info.three2 },
        seedOf: info.seedOf,
        bo: 5
      }],
      pairs: [],
      selected: null
    };
    openModal(manualHTML(), false, true);
  }

  function manualTryPair(teamId) {
    var m = ui.manual;
    if (!m) return;
    var paired = manualPairedMap(m.pairs);
    if (paired[teamId]) { toast("该队伍已经配对，请先移除原有对位", "warn"); return; }
    if (!m.selected) {
      m.selected = teamId;
      refreshManualModal();
      return;
    }
    if (m.selected === teamId) {
      m.selected = null;
      refreshManualModal();
      return;
    }
    var a = m.selected;
    var b = teamId;
    var isKo = m.mode === "ko";
    if (isKo ? !E.canManualKnockoutPair(game, a, b) : !E.canManualPair(game, m.round, a, b)) {
      toast(isKo ? "3-0 队伍只能对 3-2，且不能与另一支 3-0 配对" : "这个对位不符合本轮规则", "warn");
      return;
    }
    var next = m.pairs.concat([{ a: a, b: b }]);
    var completion;
    try {
      completion = isKo
        ? E.findManualKnockoutCompletion(game, next, Math.random)
        : E.findManualCompletion(game, m.round, next, Math.random);
    } catch (e) {
      toast(e.message || "这个对位无法完成", "warn");
      return;
    }
    if (!completion) {
      toast("这个对位会让剩余队伍无法完成配对", "warn");
      return;
    }
    m.pairs = next;
    m.selected = null;
    refreshManualModal();
  }

  function manualRemove(index) {
    if (!ui.manual) return;
    ui.manual.pairs.splice(index, 1);
    ui.manual.selected = null;
    refreshManualModal();
  }

  function manualClear() {
    if (!ui.manual) return;
    ui.manual.pairs = [];
    ui.manual.selected = null;
    refreshManualModal();
  }

  function manualAutofill() {
    if (!ui.manual) return;
    var m = ui.manual;
    var full;
    try {
      full = m.mode === "ko"
        ? E.findManualKnockoutCompletion(game, m.pairs, Math.random)
        : E.findManualCompletion(game, m.round, m.pairs, Math.random);
    } catch (e) {
      toast(e.message || "当前对位无法补齐", "warn");
      return;
    }
    if (!full) { toast("当前已排对位无法补齐，请移除部分对位", "warn"); return; }
    m.pairs = full.map(function (p) { return Array.isArray(p) ? { a: p[0], b: p[1] } : p; });
    m.selected = null;
    refreshManualModal();
  }

  function manualCommit() {
    var m = ui.manual;
    if (!m) return;
    var needed = manualTotalTeams(m) / 2;
    if (m.pairs.length !== needed) { toast("还有队伍没有配对", "warn"); return; }
    pushHistory();
    try {
      if (m.mode === "ko") {
        E.commitManualKnockout(game, m.pairs, { rng: Math.random });
        ui.round = 5;
        ui.animateRound = "KO";
        ui.lab = null;
        ui.labStale = true;
        saveGame();
        closeModal();
        renderAll();
        toast("八强手动签表已应用", "success");
        $("#knockoutPanel").scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(function () { ui.animateRound = null; }, 1200);
      } else {
        E.commitManualDraw(game, m.round, m.pairs, { rng: Math.random });
        ui.round = m.round;
        ui.animateRound = m.round;
        ui.lab = null;
        ui.labStale = true;
        saveGame();
        closeModal();
        renderAll();
        toast("第 " + m.round + " 轮手动签表已应用", "success");
        window.setTimeout(function () { ui.animateRound = null; }, 1200);
      }
    } catch (e) {
      rollback();
      toast(e.message || "手动排签失败", "warn");
    }
  }

  function applySwissWinner(matchId, winnerId) {
    var before = E.countCompletedRounds(game);
    pushHistory();
    try {
      var result = E.changeWinner(game, matchId, winnerId, { ratings: ratings, rng: Math.random });
      ui.lab = null;
      ui.labStale = true;
      var r = result.match.round;
      ui.round = Math.min(r, 5);
      var after = E.countCompletedRounds(game);
      if (result.truncated) {
        toast("已改判 " + winnerId + " 获胜，后续赛果已清除", "success");
      } else if (after > before) {
        if (r >= 5) toast("瑞士轮结束 · 八强产生", "success");
        else toast("第 " + r + " 轮结束", "success");
      } else {
        toast("已改判 " + winnerId + " 获胜", "success");
      }
      saveGame();
      renderAll();
    } catch (e) {
      rollback();
      toast(e.message || "判定失败", "warn");
    }
  }

  function doPickWinner(matchId, winnerId) {
    var match = null;
    game.matches.forEach(function (m) { if (m.id === matchId) match = m; });
    if (!match) return;
    if (match.winner === winnerId) {
      toast(match.winner + " 已是本场胜者", "warn");
      return;
    }
    if (!match.winner && match.round !== E.countCompletedRounds(game) + 1) {
      toast("只能结算当前轮次的对阵", "warn");
      return;
    }
    if (match.winner && E.hasLaterSwiss(game, match.round)) {
      confirmAction(
        "改判并清除后续赛果？",
        "改判第 " + match.round + " 轮这场对局，会清除该轮之后的所有抽签与赛果，并重置淘汰赛签表。当前之后的进度无法保留。",
        "确认改判",
        function () { applySwissWinner(matchId, winnerId); }
      );
      return;
    }
    applySwissWinner(matchId, winnerId);
  }

  function doDrawKO() {
    if (qualifiedIds().length !== 8) { toast("八强还未全部产生", "warn"); return; }
    pushHistory();
    try {
      E.drawKnockout(game, Math.random);
      ui.animateRound = "KO";
      ui.lab = null;
      saveGame();
      renderAll();
      toast("八强签表已抽出", "success");
      window.setTimeout(function () { ui.animateRound = null; }, 1200);
    } catch (e) {
      rollback();
      toast(e.message || "抽签失败", "warn");
    }
  }

  function doSimKO() {
    if (!game.knockout.drawn) doDrawKO();
    if (!game.knockout.drawn) return;
    if (game.knockout.champion) { toast("淘汰赛已经结束", "warn"); return; }
    pushHistory();
    try {
      E.simulateKnockoutState(game, ratings, Math.random);
      ui.lab = null;
      saveGame();
      renderAll();
      if (game.knockout.champion) toast("冠军：" + game.knockout.champion, "success");
    } catch (e) {
      rollback();
      toast(e.message || "模拟失败", "warn");
    }
  }

  function applyKOWinner(matchId, winnerId) {
    pushHistory();
    try {
      var result = E.changeKnockoutWinner(game, matchId, winnerId, { ratings: ratings, rng: Math.random });
      ui.lab = null;
      saveGame();
      renderAll();
      if (result.truncated) toast("已改判 " + winnerId + " 晋级，后续淘汰赛赛果已清除", "success");
      else if (game.knockout.champion) toast("冠军：" + game.knockout.champion, "success");
      else toast("已改判 " + winnerId + " 晋级", "success");
    } catch (e) {
      rollback();
      toast(e.message || "判定失败", "warn");
    }
  }

  function doPickKOWinner(matchId, winnerId) {
    var match = null;
    game.knockout.matches.forEach(function (m) { if (m.id === matchId) match = m; });
    if (!match) return;
    if (match.winner === winnerId) {
      toast(match.winner + " 已是本场胜者", "warn");
      return;
    }
    if (match.winner && E.hasLaterKnockout(game, match)) {
      confirmAction(
        "改判并清除后续淘汰赛？",
        "改判这场淘汰赛会清除之后的所有淘汰赛对阵与赛果，包括冠军归属。",
        "确认改判",
        function () { applyKOWinner(matchId, winnerId); }
      );
      return;
    }
    applyKOWinner(matchId, winnerId);
  }

  /* ------------------------------------------------------------------ */
  /* lab                                                                */
  /* ------------------------------------------------------------------ */

  function runLab() {
    if (ui.labRunning) return;
    var runs = ui.labRuns;
    var base;
    if (ui.labScope === "official") base = E.createInitialState();
    else if (ui.labScope === "reroll") base = E.createEmptyState();
    else base = game;
    var reroll = ui.labScope === "reroll";

    ui.labRunning = true;
    $("#labProgress").hidden = false;
    $("#labProgressText").textContent = "正在推演 " + fmt(runs) + " 条世界线…";
    $("#runLabBtn").disabled = true;
    $$("#runsSegmented button, #scopeSegmented button, #presetSegmented button").forEach(function (b) { b.disabled = true; });

    window.setTimeout(function () {
      var start = performance.now();
      try {
        var res = E.runMonteCarlo(base, {
          runs: runs,
          ratings: ratings,
          rerollR1: reroll,
          seed: E.randomSeed()
        });
        res.elapsed = Math.round(performance.now() - start);
        ui.lab = res;
        ui.labStale = false;
        renderLab();
        renderOdds();
        toast("已完成 " + fmt(runs) + " 次全赛会模拟", "success");
      } catch (e) {
        toast(e.message || "模拟失败", "warn");
      } finally {
        ui.labRunning = false;
        $("#labProgress").hidden = true;
        $("#runLabBtn").disabled = false;
        $$("#runsSegmented button, #scopeSegmented button, #presetSegmented button").forEach(function (b) { b.disabled = false; });
      }
    }, 60);
  }

  function ensureLab() {
    if (!ui.lab && !ui.labRunning) runLab();
  }

  function applyPreset(preset) {
    ui.preset = preset;
    IDS.forEach(function (id) {
      if (preset === "default") ratings[id] = E.DEFAULT_RATINGS[id];
      else if (preset === "even") ratings[id] = 1700;
      else if (preset === "lck") {
        var base = E.DEFAULT_RATINGS[id];
        ratings[id] = team(id).region === "LCK" ? Math.min(2000, base + 45) : Math.max(1400, base - 20);
      } else if (preset === "lpl") {
        var base2 = E.DEFAULT_RATINGS[id];
        ratings[id] = team(id).region === "LPL" ? Math.min(2000, base2 + 45) : Math.max(1400, base2 - 20);
      }
    });
    saveRatings();
    ui.lab = null;
    ui.labStale = true;
    renderRules();
    renderOdds();
    renderSegments();
    if (ui.view === "lab") renderLab();
    toast("已切换实力值预设：" + ({ default: "默认", even: "全员五五开", lck: "LCK 强势", lpl: "LPL 强势" })[preset], "success");
  }

  /* ------------------------------------------------------------------ */
  /* modal / toast                                                       */
  /* ------------------------------------------------------------------ */

  var toastTimer = null;
  function toast(msg, type) {
    var el = $("#toast");
    el.textContent = msg;
    el.className = "toast is-show" + (type ? " is-" + type : "");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove("is-show"); }, 2800);
  }

  function openModal(html, small, wide) {
    var backdrop = $("#modalBackdrop");
    var modal = $("#modal");
    modal.innerHTML = html;
    modal.classList.toggle("is-small", !!small);
    modal.classList.toggle("is-wide", !!wide);
    backdrop.hidden = false;
    document.body.classList.add("modal-open");
    var close = $(".modal-close", modal);
    if (close) close.focus();
  }

  function closeModal() {
    $("#modalBackdrop").hidden = true;
    document.body.classList.remove("modal-open");
    ui.confirmCallback = null;
    ui.manual = null;
  }

  function confirmAction(title, text, confirmLabel, cb) {
    ui.confirmCallback = cb;
    openModal('<div class="modal-head"><div><h3 id="modalTitle">' + esc(title) + '</h3></div><button class="modal-close" type="button" data-action="modal-close" aria-label="关闭">×</button></div>' +
      '<div class="modal-body"><p class="modal-confirm-text">' + esc(text) + '</p><div class="modal-actions">' +
      '<button class="ghost-btn" type="button" data-action="modal-close">取消</button>' +
      '<button class="primary-btn" type="button" data-action="modal-confirm">' + esc(confirmLabel || "确认") + "</button></div></div>", true);
  }

  function openAllDraws() {
    var draws = E.listAllR1Draws();
    var body = draws.map(function (d) {
      var rows = d.matches.map(function (m) {
        return '<div class="draw-combo-row"><span class="dc-team">' + teamBadge(m.a, "sm") + "<b>" + esc(m.a) + "</b></span><span>vs</span>" +
          '<span class="dc-team">' + teamBadge(m.b, "sm") + "<b>" + esc(m.b) + "</b></span></div>";
      }).join("");
      return '<div class="draw-combo"><div class="draw-combo-head"><span>DRAW #' + String(d.index).padStart(3, "0") + '</span><span>P1vP4 · P2vP3</span></div><div class="draw-combo-rows">' + rows + "</div></div>";
    }).join("");
    openModal('<div class="modal-head"><div><h3 id="modalTitle">全部 ' + draws.length + ' 种合法首轮签</h3><p>1号池 vs 4号池、2号池 vs 3号池；同赛区规避。所有签表等概率。</p></div>' +
      '<div style="display:flex;gap:8px;align-items:center"><button class="ghost-btn small" type="button" data-action="export-r1">导出 JSON</button><button class="modal-close" type="button" data-action="modal-close" aria-label="关闭">×</button></div></div>' +
      '<div class="modal-body"><div class="all-draws">' + body + "</div></div>");
  }

  function downloadJSON(filename, obj) {
    try {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("已导出 " + filename, "success");
    } catch (e) {
      toast("导出失败", "warn");
    }
  }

  /* ------------------------------------------------------------------ */
  /* events                                                              */
  /* ------------------------------------------------------------------ */

  function switchTab(name) {
    if (["draw", "lab", "rules"].indexOf(name) === -1) return;
    ui.view = name;
    $$(".view").forEach(function (v) { v.classList.toggle("is-active", v.id === "view-" + name); });
    $$(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (name === "lab") {
      renderLab();
      ensureLab();
    }
    if (name === "rules") renderRules();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.dataset.action;
    if (action === "tab") { e.preventDefault(); switchTab(el.dataset.tab); }
    else if (action === "go-draw") { e.preventDefault(); switchTab("draw"); }
    else if (action === "select-round") {
      var nr = Number(el.dataset.round);
      if (nr >= 1 && nr <= 5) { ui.round = nr; renderRoundPanel(); renderRoundNav(); $("#roundPanel").scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
    else if (action === "draw-round") doDraw();
    else if (action === "draw-official") doDraw({ official: true });
    else if (action === "redraw-round") doRedrawRound();
    else if (action === "official-round") doOfficialRound();
    else if (action === "manual-draw") openManualDraw();
    else if (action === "manual-ko") openManualKnockout();
    else if (action === "manual-team") manualTryPair(el.dataset.team);
    else if (action === "manual-remove") manualRemove(Number(el.dataset.index));
    else if (action === "manual-clear") manualClear();
    else if (action === "manual-autofill") manualAutofill();
    else if (action === "manual-commit") manualCommit();
    else if (action === "sim-round") doSimRound();
    else if (action === "sim-rest") doSimRest();
    else if (action === "pick-winner") doPickWinner(el.dataset.matchId, el.dataset.team);
    else if (action === "pick-ko-winner") doPickKOWinner(el.dataset.matchId, el.dataset.team);
    else if (action === "draw-ko") doDrawKO();
    else if (action === "sim-ko") doSimKO();
    else if (action === "scroll-ko") {
      if (qualifiedIds().length < 8) { toast("八强还没有全部产生", "warn"); return; }
      $("#knockoutPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    else if (action === "reset") {
      confirmAction("重置整届赛会？", "当前赛程、手动判定的赛果与淘汰赛签表都会被清除，回到官方首轮签。实力值设置会保留。", "重置赛程", function () { resetAll(true); });
    }
    else if (action === "undo") {
      if (!history.length) { toast("没有可撤销的操作", "warn"); return; }
      game = E.normalizeState(history.pop());
      ui.round = Math.min(E.countCompletedRounds(game) + 1, 5);
      ui.lab = null;
      ui.labStale = true;
      saveGame();
      renderAll();
      toast("已撤销上一步", "success");
    }
    else if (action === "browse-r1") openAllDraws();
    else if (action === "export-r1") downloadJSON("s16-swiss-r1-all-154-draws.json", { total: E.analyzeR1().total, draws: E.listAllR1Draws() });
    else if (action === "lab-runs") { ui.labRuns = Number(el.dataset.runs); renderLabControls(); }
    else if (action === "lab-scope") { ui.labScope = el.dataset.scope; renderLabControls(); }
    else if (action === "preset") applyPreset(el.dataset.preset);
    else if (action === "run-lab") runLab();
    else if (action === "reset-ratings") applyPreset("default");
    else if (action === "modal-close") closeModal();
    else if (action === "modal-confirm") {
      var cb = ui.confirmCallback;
      closeModal();
      if (cb) cb();
    }
    else if (action === "export-game") downloadJSON("s16-swiss-state.json", game);
  });

  document.addEventListener("change", function (e) {
    if (e.target.id === "oddsTeamSelect") {
      ui.oddsTeam = e.target.value;
      renderOdds();
    } else if (e.target.id === "labTeamSelect" || e.target.id === "labTeamSelectCurrent") {
      ui.labTeam = e.target.value;
      renderLabR1();
      renderLabCurrent();
    } else if (e.target.matches("input[data-rating]")) {
      var id = e.target.dataset.rating;
      ratings[id] = Number(e.target.value);
      saveRatings();
      ui.lab = null;
      ui.labStale = true;
      ui.preset = "custom";
      var val = $('[data-rating-val="' + id + '"]');
      if (val) val.textContent = ratings[id];
      var avg = IDS.reduce(function (s, x) { return s + ratings[x]; }, 0) / IDS.length;
      var delta = $('[data-rating-delta="' + id + '"]');
      if (delta) delta.textContent = (ratings[id] - avg >= 0 ? "+" : "") + Math.round(ratings[id] - avg);
      renderSegments();
      renderOdds();
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.matches("input[data-rating]")) {
      var id = e.target.dataset.rating;
      ratings[id] = Number(e.target.value);
      var val = $('[data-rating-val="' + id + '"]');
      if (val) val.textContent = ratings[id];
      var avg = IDS.reduce(function (s, x) { return s + ratings[x]; }, 0) / IDS.length;
      var delta = $('[data-rating-delta="' + id + '"]');
      if (delta) delta.textContent = (ratings[id] - avg >= 0 ? "+" : "") + Math.round(ratings[id] - avg);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#modalBackdrop").hidden) closeModal();
  });

  $("#modalBackdrop").addEventListener("click", function (e) {
    if (e.target === $("#modalBackdrop")) closeModal();
  });

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    var exact = E.analyzeR1();
    $("#heroR1Count").textContent = exact.total;
    if (!history.length) $("#undoBtn").disabled = true;
    renderAll();
    // A lightweight first impression: the draw board is ready immediately.
    if (!TEAM[ui.oddsTeam]) ui.oddsTeam = "GEN";
  }

  boot();
})();