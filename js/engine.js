/* S16 Worlds Swiss — draw, enumeration and simulation engine */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"));
  else root.S16Engine = factory(root.S16Data);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Data) {
  "use strict";

  var TEAMS = Data.TEAMS;
  var IDS = TEAMS.map(function (t) { return t.id; });
  var IDX = {};
  var TEAM = {};
  IDS.forEach(function (id, i) {
    IDX[id] = i;
    TEAM[id] = Data.teamById(id);
  });

  var REGION = {};
  var POOL = {};
  IDS.forEach(function (id) {
    REGION[id] = TEAM[id].region;
    POOL[id] = TEAM[id].pool;
  });

  var DEFAULT_RATINGS = {};
  IDS.forEach(function (id) { DEFAULT_RATINGS[id] = Data.RATINGS[id]; });

  var MAX_ROUND = 5;

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  function shuffle(arr, rng) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  function lowBit(mask) { return mask & (-mask); }
  function lowestIndex(mask) { return Math.log2(lowBit(mask)) | 0; }

  function sameRegion(a, b) { return REGION[a] === REGION[b]; }

  function eloWinProbability(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  function bestOfProbability(p, bestOf) {
    if (bestOf === 1) return p;
    if (bestOf === 3) return p * p * (3 - 2 * p);
    if (bestOf === 5) return p * p * p * (10 - 15 * p + 6 * p * p);
    return p;
  }

  function fmtInt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* ------------------------------------------------------------------ */
  /* States                                                              */
  /* ------------------------------------------------------------------ */

  function makeMatch(id, round, groupKey, bo, a, b, extra) {
    var m = {
      id: id,
      round: round,
      groupKey: groupKey,
      bo: bo,
      a: a,
      b: b,
      winner: null,
      scoreA: null,
      scoreB: null,
      fallback: false
    };
    if (extra) Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
    return m;
  }

  function createInitialState() {
    var matches = Data.ACTUAL_R1.map(function (p, i) {
      return makeMatch("R1M" + (i + 1), 1, p.groupKey, 1, p.a, p.b, { official: true });
    });
    return {
      version: 2,
      completedRounds: 0,
      matches: matches,
      knockout: { drawn: false, matches: [], champion: null },
      createdAt: Date.now()
    };
  }

  function createEmptyState() {
    return {
      version: 2,
      completedRounds: 0,
      matches: [],
      knockout: { drawn: false, matches: [], champion: null },
      createdAt: Date.now()
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function countCompletedRounds(state) {
    var completed = 0;
    for (var r = 1; r <= MAX_ROUND; r++) {
      var ms = state.matches.filter(function (m) { return m.round === r; });
      if (!ms.length || ms.some(function (m) { return !m.winner; })) break;
      completed = r;
    }
    return completed;
  }

  function normalizeState(state) {
    if (!state) return createInitialState();
    state.version = 2;
    state.matches = Array.isArray(state.matches) ? state.matches : [];
    state.knockout = state.knockout || { drawn: false, matches: [], champion: null };
    state.knockout.matches = Array.isArray(state.knockout.matches) ? state.knockout.matches : [];
    // If a later round is complete but an earlier one is not, discard the later one.
    var completed = countCompletedRounds(state);
    state.completedRounds = completed;
    state.matches = state.matches.filter(function (m) {
      return m.round <= completed + 1;
    });
    if (completed < MAX_ROUND) {
      state.knockout = { drawn: false, matches: [], champion: null };
    }
    return state;
  }

  function isRoundDrawn(state, round) {
    return state.matches.some(function (m) { return m.round === round; });
  }

  function roundMatches(state, round) {
    return state.matches.filter(function (m) { return m.round === round; });
  }

  function pendingMatches(state) {
    var r = countCompletedRounds(state) + 1;
    if (r > MAX_ROUND) return [];
    return state.matches.filter(function (m) { return m.round === r && !m.winner; });
  }

  /* ------------------------------------------------------------------ */
  /* Records / standings                                                 */
  /* ------------------------------------------------------------------ */

  function emptyRecord(id) {
    return {
      id: id,
      w: 0,
      l: 0,
      opponents: [],
      path: [],
      scoreFor: 0,
      scoreAgainst: 0,
      currentOpponent: null
    };
  }

  function computeRecords(state) {
    var rec = {};
    IDS.forEach(function (id) { rec[id] = emptyRecord(id); });
    state.matches.forEach(function (m) {
      if (!m.winner) {
        rec[m.a].currentOpponent = m.b;
        rec[m.b].currentOpponent = m.a;
        return;
      }
      var loser = m.winner === m.a ? m.b : m.a;
      rec[m.winner].w++;
      rec[loser].l++;
      rec[m.winner].scoreFor += m.scoreA || 0;
      rec[loser].scoreFor += m.scoreB || 0;
      if (rec[m.winner].opponents.indexOf(loser) === -1) rec[m.winner].opponents.push(loser);
      if (rec[loser].opponents.indexOf(m.winner) === -1) rec[loser].opponents.push(m.winner);
      rec[m.winner].path.push({
        round: m.round, opp: loser, result: "W", bo: m.bo,
        scoreFor: m.scoreA, scoreAgainst: m.scoreB, matchId: m.id, stage: m.stage
      });
      rec[loser].path.push({
        round: m.round, opp: m.winner, result: "L", bo: m.bo,
        scoreFor: m.scoreB, scoreAgainst: m.scoreA, matchId: m.id, stage: m.stage
      });
    });
    return rec;
  }

  function teamStatus(rec) {
    if (rec.w >= 3) return "qualified";
    if (rec.l >= 3) return "eliminated";
    return "active";
  }

  function activeTeams(state) {
    var rec = computeRecords(state);
    return IDS.filter(function (id) {
      return rec[id].w < 3 && rec[id].l < 3;
    });
  }

  function qualifiedTeams(state) {
    var rec = computeRecords(state);
    return IDS.filter(function (id) { return rec[id].w >= 3; })
      .sort(function (a, b) {
        if (rec[a].l !== rec[b].l) return rec[a].l - rec[b].l;
        return IDS.indexOf(a) - IDS.indexOf(b);
      });
  }

  function standings(state) {
    var rec = computeRecords(state);
    return IDS.map(function (id) {
      return {
        id: id,
        w: rec[id].w,
        l: rec[id].l,
        status: teamStatus(rec[id]),
        opponents: rec[id].opponents.slice(),
        path: rec[id].path.slice()
      };
    }).sort(function (a, b) {
      if (b.w !== a.w) return b.w - a.w;
      if (a.l !== b.l) return a.l - b.l;
      return IDS.indexOf(a.id) - IDS.indexOf(b.id);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Matching enumeration                                                */
  /* ------------------------------------------------------------------ */

  function allBipartiteMatchings(left, right, forbidden) {
    var out = [];
    var used = {};
    var current = [];
    function rec(i) {
      if (i === left.length) {
        out.push(current.slice());
        return;
      }
      var a = left[i];
      for (var j = 0; j < right.length; j++) {
        var b = right[j];
        if (used[b]) continue;
        if (forbidden && forbidden(a, b)) continue;
        used[b] = true;
        current.push([a, b]);
        rec(i + 1);
        current.pop();
        used[b] = false;
      }
    }
    rec(0);
    return out;
  }

  function allMatchings(teamIds, forbidden) {
    var out = [];
    function rec(rem, acc) {
      if (rem.length === 0) {
        out.push(acc.slice());
        return;
      }
      var a = rem[0];
      for (var i = 1; i < rem.length; i++) {
        var b = rem[i];
        if (forbidden && forbidden(a, b)) continue;
        var next = rem.slice(1, i).concat(rem.slice(i + 1));
        acc.push([a, b]);
        rec(next, acc);
        acc.pop();
      }
    }
    if (teamIds.length % 2 !== 0) return out;
    rec(teamIds.slice(), []);
    return out;
  }

  function allMatchingsIgnoringConstraints(teamIds) {
    return allMatchings(teamIds, null);
  }

  function sampleFromArray(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function tallyMatchings(matchings, teams) {
    var counts = {};
    teams.forEach(function (id) { counts[id] = {}; });
    matchings.forEach(function (pairs) {
      pairs.forEach(function (p) {
        counts[p[0]][p[1]] = (counts[p[0]][p[1]] || 0) + 1;
        counts[p[1]][p[0]] = (counts[p[1]][p[0]] || 0) + 1;
      });
    });
    var odds = {};
    teams.forEach(function (id) {
      var total = matchings.length;
      var list = Object.keys(counts[id]).map(function (opp) {
        return { id: opp, count: counts[id][opp], p: total ? counts[id][opp] / total : 0 };
      }).sort(function (a, b) { return b.count - a.count; });
      odds[id] = list;
    });
    return odds;
  }

  /* ------------------------------------------------------------------ */
  /* Round 1                                                             */
  /* ------------------------------------------------------------------ */

  var _r1Cache = null;

  function r1Groups() {
    return [
      { key: "P1-P4", label: "1号池 vs 4号池", left: Data.POOLS[1].slice(), right: Data.POOLS[4].slice() },
      { key: "P2-P3", label: "2号池 vs 3号池", left: Data.POOLS[2].slice(), right: Data.POOLS[3].slice() }
    ];
  }

  function r1Data() {
    if (_r1Cache) return _r1Cache;
    var groups = r1Groups().map(function (g) {
      var ms = allBipartiteMatchings(g.left, g.right, function (a, b) { return sameRegion(a, b); });
      return {
        key: g.key,
        label: g.label,
        left: g.left,
        right: g.right,
        matchings: ms,
        count: ms.length,
        odds: tallyMatchings(ms, g.left.concat(g.right))
      };
    });
    var combos = [];
    groups[0].matchings.forEach(function (m1) {
      groups[1].matchings.forEach(function (m2) {
        combos.push({
          groups: [
            { key: "P1-P4", matches: m1 },
            { key: "P2-P3", matches: m2 }
          ],
          matches: m1.concat(m2)
        });
      });
    });
    _r1Cache = {
      groups: groups,
      combos: combos,
      total: groups[0].count * groups[1].count
    };
    return _r1Cache;
  }

  function analyzeR1() {
    var data = r1Data();
    var teamOdds = {};
    data.groups.forEach(function (g) {
      Object.keys(g.odds).forEach(function (id) {
        teamOdds[id] = g.odds[id];
      });
    });
    return {
      round: 1,
      drawn: false,
      total: data.total,
      groups: data.groups.map(function (g) {
        return {
          key: g.key,
          label: g.label,
          teams: g.left.concat(g.right),
          count: g.count,
          odds: g.odds,
          bo: 1
        };
      }),
      teamOdds: teamOdds
    };
  }

  function listAllR1Draws() {
    return r1Data().combos.map(function (combo, i) {
      return {
        index: i + 1,
        matches: combo.matches.map(function (p, j) {
          return {
            groupKey: POOL[p[0]] === 1 ? "P1-P4" : "P2-P3",
            a: p[0],
            b: p[1],
            bo: 1,
            order: j + 1
          };
        })
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Draw rounds                                                         */
  /* ------------------------------------------------------------------ */

  function groupOrder(round) {
    if (round === 1) return ["P1-P4", "P2-P3"];
    if (round === 2) return ["1-0", "0-1"];
    if (round === 3) return ["2-0", "1-1", "0-2"];
    if (round === 4) return ["2-1", "1-2"];
    if (round === 5) return ["2-2"];
    return [];
  }

  function groupLabel(key, round) {
    if (key === "P1-P4") return "1号池 vs 4号池";
    if (key === "P2-P3") return "2号池 vs 3号池";
    var parts = key.split("-");
    var w = Number(parts[0]), l = Number(parts[1]);
    if (w === 2 && l === 0) return "2-0 组 · 晋级战";
    if (w === 0 && l === 2) return "0-2 组 · 淘汰战";
    if (w === 2 && l === 1) return "2-1 组 · 晋级战";
    if (w === 1 && l === 2) return "1-2 组 · 淘汰战";
    if (w === 2 && l === 2) return "2-2 组 · 决胜战";
    return key + " 组";
  }

  function matchBo(w, l) {
    return (w === 2 || l === 2) ? 3 : 1;
  }

  function drawRound(state, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var completed = countCompletedRounds(state);
    var round = completed + 1;
    if (round > MAX_ROUND) throw new Error("瑞士轮已经结束");
    if (isRoundDrawn(state, round)) throw new Error("本轮已经抽签");

    var rec = computeRecords(state);
    var newMatches = [];
    var fallback = false;

    if (round === 1) {
      var pairs;
      if (opts.official) {
        pairs = Data.ACTUAL_R1.map(function (p) { return [p.a, p.b]; });
      } else {
        var combo = sampleFromArray(r1Data().combos, rng);
        pairs = combo.matches;
      }
      pairs.forEach(function (p, i) {
        var groupKey = POOL[p[0]] === 1 ? "P1-P4" : "P2-P3";
        newMatches.push(makeMatch("R1M" + (i + 1), 1, groupKey, 1, p[0], p[1], {
          official: !!opts.official
        }));
      });
    } else {
      var buckets = {};
      IDS.forEach(function (id) {
        if (rec[id].w >= 3 || rec[id].l >= 3) return;
        var key = rec[id].w + "-" + rec[id].l;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(id);
      });
      var keys = groupOrder(round).filter(function (k) { return buckets[k] && buckets[k].length; });
      var counter = 1;
      keys.forEach(function (key) {
        var teamIds = buckets[key];
        var w = rec[teamIds[0]].w;
        var l = rec[teamIds[0]].l;
        var forbidden = function (a, b) {
          return rec[a].opponents.indexOf(b) !== -1 || rec[b].opponents.indexOf(a) !== -1;
        };
        var matchings = allMatchings(teamIds, forbidden);
        var usedFallback = false;
        if (!matchings.length) {
          matchings = allMatchingsIgnoringConstraints(teamIds);
          usedFallback = true;
          fallback = true;
        }
        var chosen = sampleFromArray(matchings, rng);
        if (!chosen) throw new Error("无法为 " + key + " 组生成对阵");
        var bo = matchBo(w, l);
        chosen.forEach(function (p) {
          newMatches.push(makeMatch("R" + round + "M" + counter, round, key, bo, p[0], p[1], {
            fallback: usedFallback
          }));
          counter++;
        });
      });
    }

    state.matches = state.matches.concat(newMatches);
    state.completedRounds = completed;
    if (round === 1 && opts.official) {
      newMatches.forEach(function (m) { m.official = true; });
    }
    return { round: round, matches: newMatches, fallback: fallback };
  }


  /* ------------------------------------------------------------------ */
  /* Manual pairing                                                      */
  /* ------------------------------------------------------------------ */

  function manualGroups(state, round) {
    if (round === 1) {
      return r1Groups().map(function (g) {
        return {
          key: g.key,
          label: g.label,
          type: "bipartite",
          left: g.left.slice(),
          right: g.right.slice(),
          teams: g.left.concat(g.right),
          bo: 1
        };
      });
    }
    var info = currentRecordGroups(state);
    var keys = groupOrder(round).filter(function (k) {
      return info.buckets[k] && info.buckets[k].length;
    });
    return keys.map(function (key) {
      var teams = info.buckets[key].slice();
      var w = info.rec[teams[0]].w;
      var l = info.rec[teams[0]].l;
      return {
        key: key,
        label: groupLabel(key, round),
        type: "record",
        teams: teams,
        bo: matchBo(w, l)
      };
    });
  }

  function manualGroupFor(groups, a, b) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.teams.indexOf(a) !== -1 && g.teams.indexOf(b) !== -1) return g;
    }
    return null;
  }

  function canManualPair(state, round, a, b) {
    if (!a || !b || a === b) return false;
    var groups = manualGroups(state, round);
    var g = manualGroupFor(groups, a, b);
    if (!g) return false;
    if (g.type === "bipartite") {
      var cross = (g.left.indexOf(a) !== -1 && g.right.indexOf(b) !== -1) ||
        (g.left.indexOf(b) !== -1 && g.right.indexOf(a) !== -1);
      if (!cross) return false;
      return !sameRegion(a, b);
    }
    var rec = computeRecords(state);
    return rec[a].opponents.indexOf(b) === -1 && rec[b].opponents.indexOf(a) === -1;
  }

  function normalizeManualPairs(pairs) {
    return (pairs || []).map(function (p) {
      if (Array.isArray(p)) return { a: p[0], b: p[1] };
      return { a: p.a, b: p.b };
    });
  }

  function findManualCompletion(state, round, lockedPairs, rng) {
    var rngFn = rng || Math.random;
    var pairs = normalizeManualPairs(lockedPairs);
    var groups = manualGroups(state, round);
    var rec = computeRecords(state);
    var used = {};
    var lockedByGroup = {};
    groups.forEach(function (g) { lockedByGroup[g.key] = []; });

    for (var i = 0; i < pairs.length; i++) {
      var a = pairs[i].a;
      var b = pairs[i].b;
      if (used[a] || used[b]) return null;
      var g = manualGroupFor(groups, a, b);
      if (!g) return null;
      if (!canManualPair(state, round, a, b)) return null;
      used[a] = true;
      used[b] = true;
      lockedByGroup[g.key].push([a, b]);
    }

    var result = [];
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];
      var locked = lockedByGroup[group.key];
      result = result.concat(locked);
      var usedInGroup = {};
      locked.forEach(function (p) { usedInGroup[p[0]] = true; usedInGroup[p[1]] = true; });

      if (group.type === "bipartite") {
        var left = group.left.filter(function (id) { return !usedInGroup[id]; });
        var right = group.right.filter(function (id) { return !usedInGroup[id]; });
        var ms = allBipartiteMatchings(left, right, function (x, y) { return sameRegion(x, y); });
        if (!ms.length) return null;
        var chosen = ms[Math.floor(rngFn() * ms.length)];
        result = result.concat(chosen);
      } else {
        var rem = group.teams.filter(function (id) { return !usedInGroup[id]; });
        var forbidden = function (x, y) {
          return rec[x].opponents.indexOf(y) !== -1 || rec[y].opponents.indexOf(x) !== -1;
        };
        var matchings = allMatchings(rem, forbidden);
        if (!matchings.length) return null;
        var pick = matchings[Math.floor(rngFn() * matchings.length)];
        result = result.concat(pick);
      }
    }
    return result;
  }

  function commitManualDraw(state, round, pairs, opts) {
    opts = opts || {};
    var completed = countCompletedRounds(state);
    if (round !== completed + 1) throw new Error("只能为当前轮次手动排签");
    if (round > MAX_ROUND) throw new Error("瑞士轮已经结束");

    var existing = roundMatches(state, round);
    if (existing.some(function (m) { return !!m.winner; })) {
      throw new Error("本轮已有赛果，不能再改签");
    }

    var normalized = normalizeManualPairs(pairs);
    var rec = computeRecords(state);
    var active = IDS.filter(function (id) { return rec[id].w < 3 && rec[id].l < 3; });
    var seen = {};
    normalized.forEach(function (p) {
      if (seen[p.a] || seen[p.b]) throw new Error("同一支队伍不能出现两次");
      if (active.indexOf(p.a) === -1 || active.indexOf(p.b) === -1) throw new Error("签表中包含已晋级或已淘汰的队伍");
      if (!canManualPair(state, round, p.a, p.b)) throw new Error("存在不符合规则的对位");
      seen[p.a] = true;
      seen[p.b] = true;
    });
    if (Object.keys(seen).length !== active.length) throw new Error("还有队伍没有安排对阵");
    var completion = findManualCompletion(state, round, normalized, opts.rng || Math.random);
    if (!completion) throw new Error("当前手动签表无法完成全部配对");

    if (existing.length) {
      state.matches = state.matches.filter(function (m) { return m.round !== round; });
    }

    var newMatches = normalized.map(function (p, i) {
      var groupKey;
      if (round === 1) {
        groupKey = (POOL[p.a] === 1 || POOL[p.b] === 1) ? "P1-P4" : "P2-P3";
      } else {
        groupKey = rec[p.a].w + "-" + rec[p.a].l;
      }
      var bo = round === 1 ? 1 : matchBo(rec[p.a].w, rec[p.a].l);
      return makeMatch("R" + round + "M" + (i + 1), round, groupKey, bo, p.a, p.b, {
        manual: true
      });
    });

    state.matches = state.matches.concat(newMatches);
    state.completedRounds = countCompletedRounds(state);
    return { round: round, matches: newMatches };
  }


  /* ------------------------------------------------------------------ */
  /* Manual knockout draw                                                */
  /* ------------------------------------------------------------------ */

  function manualKnockoutInfo(state) {
    var rec = computeRecords(state);
    var qualified = IDS.filter(function (id) { return rec[id].w >= 3; });
    if (qualified.length !== 8) throw new Error("八强尚未全部产生");
    var three0 = [], three1 = [], three2 = [];
    qualified.forEach(function (id) {
      if (rec[id].l === 0) three0.push(id);
      else if (rec[id].l === 1) three1.push(id);
      else three2.push(id);
    });
    var teams = three0.concat(three1, three2);
    var seedOf = {};
    three0.forEach(function (id) { seedOf[id] = 0; });
    three1.forEach(function (id) { seedOf[id] = 1; });
    three2.forEach(function (id) { seedOf[id] = 2; });
    return { rec: rec, teams: teams, three0: three0, three1: three1, three2: three2, seedOf: seedOf };
  }

  function canManualKnockoutPair(state, a, b) {
    if (!a || !b || a === b) return false;
    var info = manualKnockoutInfo(state);
    if (!(a in info.seedOf) || !(b in info.seedOf)) return false;
    var sa = info.seedOf[a], sb = info.seedOf[b];
    if (sa === 0 && sb === 0) return false;
    if (sa === 0) return sb === 2;
    if (sb === 0) return sa === 2;
    return true;
  }

  function findManualKnockoutCompletion(state, lockedPairs, rng) {
    var rngFn = rng || Math.random;
    var info = manualKnockoutInfo(state);
    var pairs = normalizeManualPairs(lockedPairs);
    var used = {};
    pairs.forEach(function (p) {
      if (used[p.a] || used[p.b]) throw new Error("同一支队伍不能出现两次");
      if (!(p.a in info.seedOf) || !(p.b in info.seedOf)) throw new Error("签表中包含非八强队伍");
      if (!canManualKnockoutPair(state, p.a, p.b)) throw new Error("存在不符合八强保护规则的对位");
      used[p.a] = true;
      used[p.b] = true;
    });
    var remaining = info.teams.filter(function (id) { return !used[id]; });
    if (remaining.length === 0) return pairs;
    var matchings = allMatchings(remaining, function (a, b) {
      return !canManualKnockoutPair(state, a, b);
    });
    if (!matchings.length) return null;
    var chosen = matchings[Math.floor(rngFn() * matchings.length)];
    return pairs.concat(chosen);
  }

  function commitManualKnockout(state, pairs, opts) {
    opts = opts || {};
    var info = manualKnockoutInfo(state);
    var normalized = normalizeManualPairs(pairs);
    if (state.knockout && state.knockout.matches.some(function (m) { return !!m.winner; })) {
      throw new Error("淘汰赛已有赛果，不能再改签");
    }
    var used = {};
    normalized.forEach(function (p) {
      if (used[p.a] || used[p.b]) throw new Error("同一支队伍不能出现两次");
      if (!(p.a in info.seedOf) || !(p.b in info.seedOf)) throw new Error("签表中包含非八强队伍");
      if (!canManualKnockoutPair(state, p.a, p.b)) throw new Error("存在不符合八强保护规则的对位");
      used[p.a] = true;
      used[p.b] = true;
    });
    if (normalized.length !== 4 || Object.keys(used).length !== 8) {
      throw new Error("需要完成全部四场八强对阵");
    }
    var full = findManualKnockoutCompletion(state, normalized, opts.rng || Math.random);
    if (!full) throw new Error("当前手动签表无法完成全部配对");

    var matches = normalized.map(function (p, i) {
      var protectedPair = info.seedOf[p.a] === 0 || info.seedOf[p.b] === 0;
      return makeKnockoutMatch("QF" + (i + 1), "QF", i + 1, p.a, p.b, protectedPair ? "3-0 vs 3-2" : "随机配对");
    });
    state.knockout = { drawn: true, matches: matches, champion: null, drawnAt: Date.now(), manual: true };
    return state.knockout;
  }

  /* ------------------------------------------------------------------ */
  /* Result editing                                                      */
  /* ------------------------------------------------------------------ */

  function hasLaterSwiss(state, round) {
    return state.matches.some(function (m) {
      return typeof m.round === "number" && m.round > round;
    }) || !!(state.knockout && state.knockout.drawn);
  }

  function changeWinner(state, matchId, winnerId, opts) {
    opts = opts || {};
    var match = null;
    state.matches.forEach(function (m) { if (m.id === matchId) match = m; });
    if (!match) throw new Error("找不到比赛 " + matchId);
    if (winnerId !== match.a && winnerId !== match.b) throw new Error("胜者不在本场比赛中");
    if (!match.winner) {
      setWinner(state, matchId, winnerId, opts);
      return { match: match, changed: true, truncated: false };
    }
    if (match.winner === winnerId) return { match: match, changed: false, truncated: false };

    var truncated = false;
    if (hasLaterSwiss(state, match.round)) {
      state.matches = state.matches.filter(function (m) { return m.round <= match.round; });
      state.knockout = { drawn: false, matches: [], champion: null };
      truncated = true;
    }

    var hi = Math.max(match.scoreA || 0, match.scoreB || 0);
    var lo = Math.min(match.scoreA || 0, match.scoreB || 0);
    match.winner = winnerId;
    match.loser = winnerId === match.a ? match.b : match.a;
    if (match.a === winnerId) {
      match.scoreA = hi;
      match.scoreB = lo;
    } else {
      match.scoreA = lo;
      match.scoreB = hi;
    }
    state.completedRounds = countCompletedRounds(state);
    return { match: match, changed: true, truncated: truncated };
  }

  /* ------------------------------------------------------------------ */
  /* Results                                                             */
  /* ------------------------------------------------------------------ */

  function scoreForSeries(bo, winnerIsA, winnerProb, rng) {
    if (bo === 1) return [1, 0];
    var p = Math.max(0.001, Math.min(0.999, winnerProb));
    if (bo === 3) {
      var series3 = bestOfProbability(p, 3);
      var clean3 = series3 > 0 ? (p * p) / series3 : 0.5;
      return [2, rng() < clean3 ? 0 : 1];
    }
    // BO5: conditional distribution of 3-0 / 3-1 / 3-2.
    var series5 = bestOfProbability(p, 5);
    if (series5 <= 0) return [3, rng() < 0.4 ? 0 : 1];
    var s30 = Math.pow(p, 3) / series5;
    var s31 = (3 * Math.pow(p, 3) * (1 - p)) / series5;
    var r = rng();
    return [3, r < s30 ? 0 : r < s30 + s31 ? 1 : 2];
  }

  function setWinner(state, matchId, winnerId, opts) {
    opts = opts || {};
    var rec = computeRecords(state);
    var match = null;
    state.matches.forEach(function (m) { if (m.id === matchId) match = m; });
    if (!match) throw new Error("找不到比赛 " + matchId);
    if (match.winner) throw new Error("该场比赛已有胜者");
    if (winnerId !== match.a && winnerId !== match.b) throw new Error("胜者不在本场比赛中");
    var loserId = winnerId === match.a ? match.b : match.a;
    var score = opts.score;
    if (!score) {
      var rA = opts.ratings ? opts.ratings[match.a] : DEFAULT_RATINGS[match.a];
      var rB = opts.ratings ? opts.ratings[match.b] : DEFAULT_RATINGS[match.b];
      var p = eloWinProbability(rA, rB);
      var rng = opts.rng || Math.random;
      var s = scoreForSeries(match.bo, winnerId === match.a, winnerId === match.a ? p : 1 - p, rng);
      score = winnerId === match.a ? s : [s[1], s[0]];
    }
    match.winner = winnerId;
    match.scoreA = score[0];
    match.scoreB = score[1];
    match.loser = loserId;
    var completed = countCompletedRounds(state);
    state.completedRounds = completed;
    return match;
  }

  function simulatePendingRound(state, ratings, rng) {
    var rngFn = rng || Math.random;
    var pending = pendingMatches(state);
    var winners = [];
    pending.forEach(function (m) {
      var rA = ratings[m.a] != null ? ratings[m.a] : DEFAULT_RATINGS[m.a];
      var rB = ratings[m.b] != null ? ratings[m.b] : DEFAULT_RATINGS[m.b];
      var p = eloWinProbability(rA, rB);
      var seriesP = bestOfProbability(p, m.bo);
      var winner = rngFn() < seriesP ? m.a : m.b;
      setWinner(state, m.id, winner, { ratings: ratings, rng: rngFn });
      winners.push({ matchId: m.id, winner: winner });
    });
    state.completedRounds = countCompletedRounds(state);
    return winners;
  }

  function simulateRemainingSwiss(state, ratings, rng) {
    var rngFn = rng || Math.random;
    var guard = 0;
    while (countCompletedRounds(state) < MAX_ROUND) {
      var completed = countCompletedRounds(state);
      var round = completed + 1;
      if (!isRoundDrawn(state, round)) drawRound(state, { rng: rngFn });
      simulatePendingRound(state, ratings, rngFn);
      guard++;
      if (guard > 8) throw new Error("瑞士轮模拟未能结束");
    }
    return state;
  }

  /* ------------------------------------------------------------------ */
  /* Exact draw analysis for the current state                           */
  /* ------------------------------------------------------------------ */

  function currentRecordGroups(state) {
    var rec = computeRecords(state);
    var buckets = {};
    IDS.forEach(function (id) {
      if (rec[id].w >= 3 || rec[id].l >= 3) return;
      var key = rec[id].w + "-" + rec[id].l;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(id);
    });
    return { rec: rec, buckets: buckets };
  }

  function analyzeCurrentDraw(state) {
    var completed = countCompletedRounds(state);
    if (completed >= MAX_ROUND) return null;
    var round = completed + 1;
    if (isRoundDrawn(state, round)) {
      return { round: round, drawn: true, total: 0, groups: [], teamOdds: {} };
    }

    var groups = [];
    var total = 1;
    if (round === 1) {
      var r1 = analyzeR1();
      groups = r1.groups.map(function (g) {
        return {
          key: g.key, label: g.label, teams: g.teams, count: g.count,
          odds: g.odds, bo: 1, matchings: null
        };
      });
      total = r1.total;
    } else {
      var info = currentRecordGroups(state);
      var keys = groupOrder(round).filter(function (k) { return info.buckets[k] && info.buckets[k].length; });
      keys.forEach(function (key) {
        var teamIds = info.buckets[key];
        var w = info.rec[teamIds[0]].w;
        var l = info.rec[teamIds[0]].l;
        var forbidden = function (a, b) {
          return info.rec[a].opponents.indexOf(b) !== -1 || info.rec[b].opponents.indexOf(a) !== -1;
        };
        var matchings = allMatchings(teamIds, forbidden);
        var fallback = false;
        if (!matchings.length) {
          matchings = allMatchingsIgnoringConstraints(teamIds);
          fallback = true;
        }
        var odds = tallyMatchings(matchings, teamIds);
        total *= matchings.length;
        groups.push({
          key: key,
          label: groupLabel(key, round),
          teams: teamIds,
          count: matchings.length,
          odds: odds,
          bo: matchBo(w, l),
          fallback: fallback
        });
      });
    }

    var teamOdds = {};
    groups.forEach(function (g) {
      Object.keys(g.odds).forEach(function (id) { teamOdds[id] = g.odds[id]; });
    });

    return {
      round: round,
      drawn: false,
      total: total,
      groups: groups,
      teamOdds: teamOdds
    };
  }

  /* ------------------------------------------------------------------ */
  /* Knockout                                                            */
  /* ------------------------------------------------------------------ */

  function makeKnockoutMatch(id, stage, slot, a, b, note) {
    return {
      id: id, stage: stage, slot: slot, round: "KO", groupKey: stage,
      bo: 5, a: a, b: b, winner: null, scoreA: null, scoreB: null,
      note: note || ""
    };
  }

  function drawKnockout(state, rng) {
    var rngFn = rng || Math.random;
    var rec = computeRecords(state);
    var qualified = IDS.filter(function (id) { return rec[id].w >= 3; });
    if (qualified.length !== 8) throw new Error("八强尚未全部产生");
    var three0 = qualified.filter(function (id) { return rec[id].l === 0; });
    var three1 = qualified.filter(function (id) { return rec[id].l === 1; });
    var three2 = qualified.filter(function (id) { return rec[id].l === 2; });

    var shuffledTwo = shuffle(three2, rngFn);
    var shuffledZero = shuffle(three0, rngFn);
    var pairs = [];
    var notes = [];
    for (var i = 0; i < shuffledZero.length; i++) {
      pairs.push([shuffledZero[i], shuffledTwo[i]]);
      notes.push("3-0 vs 3-2");
    }
    var leftover = [shuffledTwo[2]].concat(three1);
    var shuffledLeft = shuffle(leftover, rngFn);
    for (var j = 0; j < shuffledLeft.length; j += 2) {
      pairs.push([shuffledLeft[j], shuffledLeft[j + 1]]);
      notes.push("随机配对");
    }
    var order = shuffle([0, 1, 2, 3], rngFn);
    var matches = order.map(function (idx, slot) {
      return makeKnockoutMatch("QF" + (slot + 1), "QF", slot + 1, pairs[idx][0], pairs[idx][1], notes[idx]);
    });
    state.knockout = { drawn: true, matches: matches, champion: null, drawnAt: Date.now() };
    return state.knockout;
  }

  function ensureKnockoutStructure(state) {
    var ko = state.knockout;
    if (!ko || !ko.drawn) return;
    var qf = ko.matches.filter(function (m) { return m.stage === "QF"; });
    var sf = ko.matches.filter(function (m) { return m.stage === "SF"; });
    var fin = ko.matches.filter(function (m) { return m.stage === "F"; });
    if (qf.length === 4 && qf.every(function (m) { return m.winner; }) && sf.length === 0) {
      ko.matches.push(makeKnockoutMatch("SF1", "SF", 1, qf[0].winner, qf[1].winner, "上半区"));
      ko.matches.push(makeKnockoutMatch("SF2", "SF", 2, qf[2].winner, qf[3].winner, "下半区"));
      sf = ko.matches.filter(function (m) { return m.stage === "SF"; });
    }
    if (sf.length === 2 && sf.every(function (m) { return m.winner; }) && fin.length === 0) {
      ko.matches.push(makeKnockoutMatch("F", "F", 1, sf[0].winner, sf[1].winner, "总决赛"));
      fin = ko.matches.filter(function (m) { return m.stage === "F"; });
    }
    if (fin.length === 1 && fin[0].winner) {
      ko.champion = fin[0].winner;
    }
  }

  function setKnockoutWinner(state, matchId, winnerId, opts) {
    opts = opts || {};
    var match = null;
    state.knockout.matches.forEach(function (m) { if (m.id === matchId) match = m; });
    if (!match) throw new Error("找不到淘汰赛比赛 " + matchId);
    if (match.winner) throw new Error("该场比赛已有胜者");
    if (winnerId !== match.a && winnerId !== match.b) throw new Error("胜者不在本场比赛中");
    var rng = opts.rng || Math.random;
    var ratings = opts.ratings || DEFAULT_RATINGS;
    var p = eloWinProbability(ratings[match.a], ratings[match.b]);
    var s = scoreForSeries(5, winnerId === match.a, winnerId === match.a ? p : 1 - p, rng);
    match.winner = winnerId;
    match.scoreA = winnerId === match.a ? s[0] : s[1];
    match.scoreB = winnerId === match.b ? s[0] : s[1];
    ensureKnockoutStructure(state);
    return match;
  }


  function hasLaterKnockout(state, match) {
    var order = { QF: 1, SF: 2, F: 3 };
    var current = order[match.stage] || 0;
    return !!state.knockout.champion || state.knockout.matches.some(function (m) {
      return (order[m.stage] || 0) > current;
    });
  }

  function changeKnockoutWinner(state, matchId, winnerId, opts) {
    opts = opts || {};
    var match = null;
    state.knockout.matches.forEach(function (m) { if (m.id === matchId) match = m; });
    if (!match) throw new Error("找不到淘汰赛比赛 " + matchId);
    if (winnerId !== match.a && winnerId !== match.b) throw new Error("胜者不在本场比赛中");
    if (!match.winner) {
      setKnockoutWinner(state, matchId, winnerId, opts);
      return { match: match, changed: true, truncated: false };
    }
    if (match.winner === winnerId) return { match: match, changed: false, truncated: false };

    var order = { QF: 1, SF: 2, F: 3 };
    var stage = order[match.stage] || 0;
    var truncated = false;
    if (hasLaterKnockout(state, match)) {
      state.knockout.matches = state.knockout.matches.filter(function (m) {
        return (order[m.stage] || 0) <= stage;
      });
      state.knockout.champion = null;
      truncated = true;
    }

    var hi = Math.max(match.scoreA || 0, match.scoreB || 0);
    var lo = Math.min(match.scoreA || 0, match.scoreB || 0);
    match.winner = winnerId;
    if (match.a === winnerId) {
      match.scoreA = hi;
      match.scoreB = lo;
    } else {
      match.scoreA = lo;
      match.scoreB = hi;
    }
    ensureKnockoutStructure(state);
    return { match: match, changed: true, truncated: truncated };
  }

  function simulateKnockoutState(state, ratings, rng) {
    var rngFn = rng || Math.random;
    if (!state.knockout.drawn) drawKnockout(state, rngFn);
    var guard = 0;
    while (!state.knockout.champion) {
      var pending = state.knockout.matches.filter(function (m) { return !m.winner; });
      if (!pending.length) {
        ensureKnockoutStructure(state);
        pending = state.knockout.matches.filter(function (m) { return !m.winner; });
        if (!pending.length) break;
      }
      pending.forEach(function (m) {
        var p = eloWinProbability(ratings[m.a], ratings[m.b]);
        var winner = rngFn() < bestOfProbability(p, 5) ? m.a : m.b;
        setKnockoutWinner(state, m.id, winner, { ratings: ratings, rng: rngFn });
      });
      guard++;
      if (guard > 6) break;
    }
    return state.knockout;
  }

  /* ------------------------------------------------------------------ */
  /* Monte Carlo — compact Swiss simulation                              */
  /* ------------------------------------------------------------------ */

  function buildProbMatrices(ratings) {
    var p1 = [], p3 = [], p5 = [];
    for (var i = 0; i < 16; i++) {
      p1[i] = []; p3[i] = []; p5[i] = [];
      for (var j = 0; j < 16; j++) {
        var p = i === j ? 0.5 : eloWinProbability(ratings[IDS[i]], ratings[IDS[j]]);
        p1[i][j] = p;
        p3[i][j] = bestOfProbability(p, 3);
        p5[i][j] = bestOfProbability(p, 5);
      }
    }
    return { p1: p1, p3: p3, p5: p5 };
  }

  function buildSimBase(state, options) {
    var wins = new Uint8Array(16);
    var losses = new Uint8Array(16);
    var opp = new Uint32Array(16);
    state.matches.forEach(function (m) {
      if (!m.winner) return;
      var w = IDX[m.winner];
      var l = IDX[m.winner === m.a ? m.b : m.a];
      wins[w]++; losses[l]++;
      opp[IDX[m.a]] |= (1 << IDX[m.b]);
      opp[IDX[m.b]] |= (1 << IDX[m.a]);
    });

    var completed = countCompletedRounds(state);
    var nextRound = Math.min(completed + 1, 6);
    var pending = [];
    if (completed < MAX_ROUND) {
      var rerollR1 = !!options.rerollR1 && completed === 0;
      if (!rerollR1) {
        state.matches.forEach(function (m) {
          if (m.round === nextRound && !m.winner) {
            pending.push({ a: IDX[m.a], b: IDX[m.b], bo: m.bo, round: nextRound });
          }
        });
      } else {
        nextRound = 1;
      }
    }
    return {
      wins: wins,
      losses: losses,
      opp: opp,
      nextRound: nextRound,
      pending: pending,
      completed: completed
    };
  }

  function compactActive(wins, losses) {
    var out = [];
    for (var i = 0; i < 16; i++) {
      if (wins[i] < 3 && losses[i] < 3) out.push(i);
    }
    return out;
  }

  function samplePairingCompact(teamIdxs, opp, rng) {
    var n = teamIdxs.length;
    if (n === 0) return [];
    if (n % 2 !== 0) throw new Error("奇数队伍无法配对: " + n);
    var full = (1 << n) - 1;
    var forbid = new Uint32Array(n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (i !== j && (opp[teamIdxs[i]] & (1 << teamIdxs[j]))) {
          forbid[i] |= (1 << j);
        }
      }
    }

    function countWith(forbidMask) {
      var memo = new Int32Array(1 << n);
      memo.fill(-1);
      function count(mask) {
        if (mask === 0) return 1;
        if (memo[mask] !== -1) return memo[mask];
        var i = lowestIndex(mask);
        var rest = mask & ~(1 << i);
        var total = 0;
        var scan = rest;
        while (scan) {
          var bit = lowBit(scan);
          var j = lowestIndex(bit);
          if (!(forbidMask[i] & bit)) total += count(rest & ~bit);
          scan &= ~bit;
        }
        memo[mask] = total;
        return total;
      }
      return count;
    }

    function sample(forbidMask) {
      var count = countWith(forbidMask);
      var total = count(full);
      if (!total) return null;
      var mask = full;
      var pairs = [];
      while (mask) {
        var i = lowestIndex(mask);
        var rest = mask & ~(1 << i);
        var r = rng() * count(mask);
        var chosen = -1;
        var scan = rest;
        while (scan) {
          var bit = lowBit(scan);
          var j = lowestIndex(bit);
          if (!(forbidMask[i] & bit)) {
            var w = count(rest & ~bit);
            if (r < w) { chosen = j; break; }
            r -= w;
          }
          scan &= ~bit;
        }
        if (chosen < 0) return null;
        pairs.push([teamIdxs[i], teamIdxs[chosen]]);
        mask &= ~((1 << i) | (1 << chosen));
      }
      return pairs;
    }

    var pairs = sample(forbid);
    if (!pairs) {
      var empty = new Uint32Array(n);
      pairs = sample(empty);
    }
    return pairs || [];
  }

  function drawCompact(round, wins, losses, opp, rng, options) {
    var out = [];
    if (round === 1) {
      var combo = sampleFromArray(r1Data().combos, rng);
      combo.matches.forEach(function (p) {
        out.push({ a: IDX[p[0]], b: IDX[p[1]], bo: 1, round: 1 });
      });
      return out;
    }
    var buckets = {};
    for (var i = 0; i < 16; i++) {
      if (wins[i] >= 3 || losses[i] >= 3) continue;
      var key = wins[i] + "-" + losses[i];
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(i);
    }
    groupOrder(round).forEach(function (key) {
      var teamIdxs = buckets[key];
      if (!teamIdxs || !teamIdxs.length) return;
      var pairs = samplePairingCompact(teamIdxs, opp, rng);
      var w = wins[teamIdxs[0]];
      var l = losses[teamIdxs[0]];
      var bo = matchBo(w, l);
      pairs.forEach(function (p) {
        out.push({ a: p[0], b: p[1], bo: bo, round: round });
      });
    });
    return out;
  }

  function playCompact(pending, wins, losses, opp, probs, rng) {
    pending.forEach(function (m) {
      var p = m.bo === 1 ? probs.p1[m.a][m.b] : (m.bo === 3 ? probs.p3[m.a][m.b] : probs.p5[m.a][m.b]);
      var winner = rng() < p ? m.a : m.b;
      var loser = winner === m.a ? m.b : m.a;
      wins[winner]++;
      losses[loser]++;
      opp[m.a] |= (1 << m.b);
      opp[m.b] |= (1 << m.a);
    });
  }

  function simulateKnockoutCompact(qualified, losses, probs, rng) {
    var three0 = [], three1 = [], three2 = [];
    qualified.forEach(function (id) {
      if (losses[id] === 0) three0.push(id);
      else if (losses[id] === 1) three1.push(id);
      else three2.push(id);
    });
    if (qualified.length !== 8) {
      return { champion: null, semi: [], final: [], qf: [] };
    }
    var shuffledTwo = shuffle(three2, rng);
    var shuffledZero = shuffle(three0, rng);
    var pairs = [];
    for (var i = 0; i < shuffledZero.length; i++) {
      pairs.push([shuffledZero[i], shuffledTwo[i]]);
    }
    var leftover = shuffle([shuffledTwo[2]].concat(three1), rng);
    for (var j = 0; j < leftover.length; j += 2) {
      pairs.push([leftover[j], leftover[j + 1]]);
    }
    pairs = shuffle(pairs, rng);
    var qfWinners = pairs.map(function (p) {
      return rng() < probs.p5[p[0]][p[1]] ? p[0] : p[1];
    });
    var sf1 = rng() < probs.p5[qfWinners[0]][qfWinners[1]] ? qfWinners[0] : qfWinners[1];
    var sf2 = rng() < probs.p5[qfWinners[2]][qfWinners[3]] ? qfWinners[2] : qfWinners[3];
    var semi = [qfWinners[0], qfWinners[1], qfWinners[2], qfWinners[3]];
    var champion = rng() < probs.p5[sf1][sf2] ? sf1 : sf2;
    var finalists = [sf1, sf2];
    return { champion: champion, semi: semi, final: finalists, qf: qfWinners };
  }

  function simulateOne(base, probs, options, rng) {
    var wins = new Uint8Array(base.wins);
    var losses = new Uint8Array(base.losses);
    var opp = new Uint32Array(base.opp);
    var pending = base.pending.slice();
    var nextRound = base.nextRound;
    var r1Pairs = [];

    pending.forEach(function (m) {
      if (m.round === 1) r1Pairs.push([m.a, m.b]);
    });

    while (nextRound <= MAX_ROUND) {
      if (!pending.length) {
        pending = drawCompact(nextRound, wins, losses, opp, rng, options);
        if (nextRound === 1) {
          r1Pairs = pending.map(function (m) { return [m.a, m.b]; });
        }
      }
      playCompact(pending, wins, losses, opp, probs, rng);
      pending = [];
      nextRound++;
    }

    var qualified = [];
    for (var i = 0; i < 16; i++) if (wins[i] >= 3) qualified.push(i);
    var ko = simulateKnockoutCompact(qualified, losses, probs, rng);
    return {
      wins: wins,
      losses: losses,
      qualified: qualified,
      champion: ko.champion,
      semi: ko.semi,
      final: ko.final,
      r1Pairs: r1Pairs
    };
  }

  function runMonteCarlo(state, options) {
    options = options || {};
    var runs = Math.max(1, options.runs || 20000);
    var ratings = {};
    IDS.forEach(function (id) {
      ratings[id] = options.ratings && options.ratings[id] != null ? options.ratings[id] : DEFAULT_RATINGS[id];
    });
    var seed = options.seed != null ? options.seed : randomSeed();
    var rng = mulberry32(seed);
    var probs = buildProbMatrices(ratings);
    var base = buildSimBase(state, options);

    var teamStats = IDS.map(function (id) {
      return {
        id: id, qualified: 0, seed0: 0, seed1: 0, seed2: 0,
        winsSum: 0, champion: 0, final: 0, semi: 0
      };
    });
    var regionStats = {};
    Object.keys(Data.REGIONS).forEach(function (r) {
      regionStats[r] = { region: r, teams: 0, qualified: 0, champion: 0, final: 0, semi: 0 };
    });
    IDS.forEach(function (id) { regionStats[REGION[id]].teams++; });

    var r1Opp = [];
    for (var i = 0; i < 16; i++) r1Opp.push(new Uint32Array(16));
    var comboMap = new Map();
    var seedDistribution = [0, 0, 0];
    var totalWins = 0;

    for (var run = 0; run < runs; run++) {
      var result = simulateOne(base, probs, options, rng);
      var qualified = result.qualified;
      for (var t = 0; t < 16; t++) {
        var st = teamStats[t];
        st.winsSum += result.wins[t];
        totalWins += 0;
        if (result.wins[t] >= 3) {
          st.qualified++;
          if (result.losses[t] === 0) { st.seed0++; seedDistribution[0]++; }
          else if (result.losses[t] === 1) { st.seed1++; seedDistribution[1]++; }
          else { st.seed2++; seedDistribution[2]++; }
          regionStats[REGION[IDS[t]]].qualified++;
        }
        if (result.semi && result.semi.indexOf(t) !== -1) {
          st.semi++;
          regionStats[REGION[IDS[t]]].semi++;
        }
        if (result.final && result.final.indexOf(t) !== -1) {
          st.final++;
          regionStats[REGION[IDS[t]]].final++;
        }
        if (result.champion === t) {
          st.champion++;
          regionStats[REGION[IDS[t]]].champion++;
        }
      }
      result.r1Pairs.forEach(function (p) {
        r1Opp[p[0]][p[1]]++;
        r1Opp[p[1]][p[0]]++;
      });
      var comboKey = qualified.slice().sort(function (a, b) {
        if (result.losses[a] !== result.losses[b]) return result.losses[a] - result.losses[b];
        return a - b;
      }).map(function (idx) { return IDS[idx]; }).join("|");
      comboMap.set(comboKey, (comboMap.get(comboKey) || 0) + 1);
    }

    var teams = IDS.map(function (id, idx) {
      var st = teamStats[idx];
      var topOpp = null;
      for (var j = 0; j < 16; j++) {
        if (!r1Opp[idx][j]) continue;
        if (!topOpp || r1Opp[idx][j] > topOpp.count) {
          topOpp = { id: IDS[j], count: r1Opp[idx][j], p: r1Opp[idx][j] / runs };
        }
      }
      return {
        id: id,
        qualify: st.qualified / runs,
        seed0: st.seed0 / runs,
        seed1: st.seed1 / runs,
        seed2: st.seed2 / runs,
        champion: st.champion / runs,
        final: st.final / runs,
        semi: st.semi / runs,
        avgWins: st.winsSum / runs,
        topOpp: topOpp
      };
    });

    var combos = Array.from(comboMap.entries()).map(function (entry) {
      return { ids: entry[0].split("|"), count: entry[1], p: entry[1] / runs };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);

    Object.keys(regionStats).forEach(function (r) {
      var rs = regionStats[r];
      rs.qualify = rs.qualified / (runs * rs.teams);
      rs.championRate = rs.champion / runs;
    });

    return {
      runs: runs,
      seed: seed,
      elapsed: 0,
      teams: teams,
      regions: regionStats,
      combos: combos,
      seedDistribution: seedDistribution.map(function (n) { return n / runs; }),
      r1Opp: r1Opp,
      base: {
        completed: base.completed,
        rerollR1: !!options.rerollR1
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  return {
    TEAMS: TEAMS,
    TEAM: TEAM,
    IDS: IDS,
    IDX: IDX,
    DEFAULT_RATINGS: DEFAULT_RATINGS,
    MAX_ROUND: MAX_ROUND,
    mulberry32: mulberry32,
    randomSeed: randomSeed,
    eloWinProbability: eloWinProbability,
    bestOfProbability: bestOfProbability,
    fmtInt: fmtInt,

    createInitialState: createInitialState,
    createEmptyState: createEmptyState,
    cloneState: cloneState,
    normalizeState: normalizeState,

    computeRecords: computeRecords,
    teamStatus: teamStatus,
    activeTeams: activeTeams,
    qualifiedTeams: qualifiedTeams,
    standings: standings,
    countCompletedRounds: countCompletedRounds,
    isRoundDrawn: isRoundDrawn,
    roundMatches: roundMatches,
    pendingMatches: pendingMatches,
    groupOrder: groupOrder,
    groupLabel: groupLabel,
    matchBo: matchBo,

    analyzeR1: analyzeR1,
    analyzeCurrentDraw: analyzeCurrentDraw,
    listAllR1Draws: listAllR1Draws,
    r1Data: r1Data,

    drawRound: drawRound,
    setWinner: setWinner,
    changeWinner: changeWinner,
    hasLaterSwiss: hasLaterSwiss,
    simulatePendingRound: simulatePendingRound,
    simulateRemainingSwiss: simulateRemainingSwiss,

    manualGroups: manualGroups,
    canManualPair: canManualPair,
    findManualCompletion: findManualCompletion,
    commitManualDraw: commitManualDraw,

    manualKnockoutInfo: manualKnockoutInfo,
    canManualKnockoutPair: canManualKnockoutPair,
    findManualKnockoutCompletion: findManualKnockoutCompletion,
    commitManualKnockout: commitManualKnockout,

    drawKnockout: drawKnockout,
    setKnockoutWinner: setKnockoutWinner,
    changeKnockoutWinner: changeKnockoutWinner,
    hasLaterKnockout: hasLaterKnockout,
    simulateKnockoutState: simulateKnockoutState,
    ensureKnockoutStructure: ensureKnockoutStructure,

    runMonteCarlo: runMonteCarlo,
    buildSimBase: buildSimBase,
    simulateOne: simulateOne,
    buildProbMatrices: buildProbMatrices
  };
});
