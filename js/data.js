/* S16 Worlds Swiss — static data (as of 2026-11-09) */
(function (root, factory) {
  var data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.S16Data = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TEAMS = [
    // Pool 1
    { id: "GEN",  name: "Gen.G",                  en: "Gen.G Esports",          region: "LCK",   pool: 1, seed: 1, seedLabel: "LCK #1",   color: "#d6b25e", color2: "#6d4d13", logo: "assets/teams/GEN.png" },
    { id: "AL",   name: "Anyone's Legend",        en: "Anyone's Legend",       region: "LPL",   pool: 1, seed: 1, seedLabel: "LPL #1",   color: "#ff5964", color2: "#7a1d27", logo: "assets/teams/AL.png" },
    { id: "TLAW", name: "Team Liquid Alienware",  en: "Team Liquid Alienware", region: "LCS",   pool: 1, seed: 1, seedLabel: "LCS #1",   color: "#5b9dff", color2: "#15366f", logo: "assets/teams/TLAW.png" },
    { id: "G2",   name: "G2 Esports",             en: "G2 Esports",            region: "LEC",   pool: 1, seed: 1, seedLabel: "LEC #1",   color: "#ff6b6b", color2: "#5b1c27", logo: "assets/teams/G2.png" },
    // Pool 2
    { id: "HLE",  name: "Hanwha Life Esports",    en: "Hanwha Life Esports",   region: "LCK",   pool: 2, seed: 2, seedLabel: "LCK #2",   color: "#ff9f43", color2: "#6e3512", logo: "assets/teams/HLE.png" },
    { id: "BLG",  name: "Bilibili Gaming",        en: "Bilibili Gaming",       region: "LPL",   pool: 2, seed: 2, seedLabel: "LPL #2",   color: "#69a8ff", color2: "#1b3f7a", logo: "assets/teams/BLG.png" },
    { id: "TSW",  name: "Team Secret Whales",     en: "Team Secret Whales",    region: "LCP",   pool: 2, seed: 2, seedLabel: "LCP #1",   color: "#4dd6c1", color2: "#145b53", logo: "assets/teams/TSW.png" },
    { id: "LOS",  name: "LOS",                    en: "LOS",                   region: "CBLOL", pool: 2, seed: 1, seedLabel: "CBLOL #1", color: "#c4e35b", color2: "#4e610f", logo: "assets/teams/LOS.png" },
    // Pool 3
    { id: "T1",   name: "T1",                     en: "T1",                    region: "LCK",   pool: 3, seed: 3, seedLabel: "LCK #3",   color: "#f06272", color2: "#681a24", logo: "assets/teams/T1.png" },
    { id: "TES",  name: "Top Esports",            en: "Top Esports",           region: "LPL",   pool: 3, seed: 3, seedLabel: "LPL #3",   color: "#ff7a59", color2: "#6f2413", logo: "assets/teams/TES.png" },
    { id: "LYON", name: "Lyon Gaming",            en: "Lyon Gaming",           region: "LCS",   pool: 3, seed: 2, seedLabel: "LCS #2",   color: "#b18cff", color2: "#3f2774", logo: "assets/teams/LYON.png" },
    { id: "MKOI", name: "Movistar KOI",           en: "Movistar KOI",          region: "LEC",   pool: 3, seed: 2, seedLabel: "LEC #2",   color: "#5fa8ff", color2: "#173d6b", logo: "assets/teams/MKOI.png" },
    // Pool 4
    { id: "DK",   name: "Dplus KIA",              en: "Dplus KIA",             region: "LCK",   pool: 4, seed: 4, seedLabel: "LCK #4",   color: "#54d7e8", color2: "#0b4f5b", logo: "assets/teams/DK.png" },
    { id: "IG",   name: "Invictus Gaming",        en: "Invictus Gaming",       region: "LPL",   pool: 4, seed: 4, seedLabel: "LPL #4",   color: "#e8edf5", color2: "#5e6878", logo: "assets/teams/IG.png" },
    { id: "CFO",  name: "CTBC Flying Oyster",     en: "CTBC Flying Oyster",    region: "LCP",   pool: 4, seed: 3, seedLabel: "LCP #2",   color: "#6fe3a1", color2: "#1b5c39", logo: "assets/teams/CFO.png" },
    { id: "KC",   name: "Karmine Corp",           en: "Karmine Corp",          region: "LEC",   pool: 4, seed: 3, seedLabel: "LEC #3 · 入围赛", color: "#7aa7ff", color2: "#243a7a", logo: "assets/teams/KC.png" }
  ];

  var ACTUAL_R1 = [
    { a: "GEN",  b: "IG",   groupKey: "P1-P4", winner: "GEN",  scoreA: 1, scoreB: 0 },
    { a: "AL",   b: "KC",   groupKey: "P1-P4", winner: "KC",   scoreA: 0, scoreB: 1 },
    { a: "TLAW", b: "CFO",  groupKey: "P1-P4", winner: "CFO",  scoreA: 0, scoreB: 1 },
    { a: "G2",   b: "DK",   groupKey: "P1-P4", winner: "DK",   scoreA: 0, scoreB: 1 },
    { a: "HLE",  b: "TES",  groupKey: "P2-P3", winner: "HLE",  scoreA: 1, scoreB: 0 },
    { a: "BLG",  b: "MKOI", groupKey: "P2-P3", winner: "MKOI", scoreA: 0, scoreB: 1 },
    { a: "TSW",  b: "LYON", groupKey: "P2-P3", winner: "LYON", scoreA: 0, scoreB: 1 },
    { a: "LOS",  b: "T1",   groupKey: "P2-P3", winner: "T1",   scoreA: 0, scoreB: 1 }
  ];

  var ACTUAL_R2 = [
    { a: "HLE",  b: "GEN",  groupKey: "1-0", bo: 1, winner: "GEN",  scoreA: 0, scoreB: 1 },
    { a: "MKOI", b: "CFO",  groupKey: "1-0", bo: 1, winner: "MKOI", scoreA: 1, scoreB: 0 },
    { a: "DK",   b: "T1",   groupKey: "1-0", bo: 1, winner: "DK",   scoreA: 1, scoreB: 0 },
    { a: "KC",   b: "LYON", groupKey: "1-0", bo: 1, winner: "LYON", scoreA: 0, scoreB: 1 },
    { a: "TES",  b: "AL",   groupKey: "0-1", bo: 1, winner: "TES",  scoreA: 1, scoreB: 0 },
    { a: "LOS",  b: "G2",   groupKey: "0-1", bo: 1, winner: "G2",   scoreA: 0, scoreB: 1 },
    { a: "TSW",  b: "IG",   groupKey: "0-1", bo: 1, winner: "IG",   scoreA: 0, scoreB: 1 },
    { a: "TLAW", b: "BLG",  groupKey: "0-1", bo: 1, winner: "BLG",  scoreA: 0, scoreB: 1 }
  ];

  var ACTUAL_R3 = [
    { a: "MKOI", b: "DK",   groupKey: "2-0", bo: 3, winner: "DK",   scoreA: 0, scoreB: 2 },
    { a: "GEN",  b: "LYON", groupKey: "2-0", bo: 3, winner: "GEN",  scoreA: 2, scoreB: 1 },
    { a: "HLE",  b: "IG",   groupKey: "1-1", bo: 1, winner: "IG",   scoreA: 0, scoreB: 1 },
    { a: "G2",   b: "TES",  groupKey: "1-1", bo: 1, winner: "TES",  scoreA: 0, scoreB: 1 },
    { a: "CFO",  b: "T1",   groupKey: "1-1", bo: 1, winner: "T1",   scoreA: 0, scoreB: 1 },
    { a: "BLG",  b: "KC",   groupKey: "1-1", bo: 1, winner: "BLG",  scoreA: 1, scoreB: 0 },
    { a: "LOS",  b: "TSW",  groupKey: "0-2", bo: 3, winner: "LOS",  scoreA: 2, scoreB: 0 },
    { a: "TLAW", b: "AL",   groupKey: "0-2", bo: 3, winner: "TLAW", scoreA: 2, scoreB: 0 }
  ];

  /* Round 4 — 2-1 group (advance) / 1-2 group (elimination), all Bo3 */
  var ACTUAL_R4 = [
    { a: "MKOI", b: "T1",   groupKey: "2-1", bo: 3, winner: "T1",   scoreA: 0, scoreB: 2 },
    { a: "IG",   b: "LYON", groupKey: "2-1", bo: 3, winner: "IG",   scoreA: 2, scoreB: 1 },
    { a: "TES",  b: "BLG",  groupKey: "2-1", bo: 3, winner: "TES",  scoreA: 2, scoreB: 1 },
    { a: "KC",   b: "CFO",  groupKey: "1-2", bo: 3, winner: "KC",   scoreA: 2, scoreB: 0 },
    { a: "TLAW", b: "LOS",  groupKey: "1-2", bo: 3, winner: "LOS",  scoreA: 1, scoreB: 2 },
    { a: "HLE",  b: "G2",   groupKey: "1-2", bo: 3, winner: "HLE",  scoreA: 2, scoreB: 0 }
  ];

  /* Round 5 — 2-2 group, all Bo3 */
  var ACTUAL_R5 = [
    { a: "KC",   b: "MKOI", groupKey: "2-2", bo: 3, winner: "KC",   scoreA: 2, scoreB: 0 },
    { a: "BLG",  b: "HLE",  groupKey: "2-2", bo: 3, winner: "BLG",  scoreA: 2, scoreB: 0 },
    { a: "LYON", b: "LOS",  groupKey: "2-2", bo: 3, winner: "LYON", scoreA: 2, scoreB: 1 }
  ];

  /* Knockout stage — Bo5, single elimination. QF1+QF2 = upper half, QF3+QF4 = lower half. */
  var ACTUAL_KNOCKOUT = [
    { id: "QF1", stage: "QF", slot: 1, a: "TES",  b: "IG",   note: "随机配对",     winner: "IG",  scoreA: 1, scoreB: 3 },
    { id: "QF2", stage: "QF", slot: 2, a: "GEN",  b: "LYON", note: "3-0 vs 3-2",   winner: "GEN", scoreA: 3, scoreB: 0 },
    { id: "QF3", stage: "QF", slot: 3, a: "DK",   b: "BLG",  note: "3-0 vs 3-2",   winner: "BLG", scoreA: 0, scoreB: 3 },
    { id: "QF4", stage: "QF", slot: 4, a: "T1",   b: "KC",   note: "随机配对",     winner: "T1",  scoreA: 3, scoreB: 1 },
    { id: "SF1", stage: "SF", slot: 1, a: "IG",   b: "GEN",  note: "上半区 · 11.08", winner: "GEN", scoreA: 0, scoreB: 3 },
    { id: "SF2", stage: "SF", slot: 2, a: "BLG",  b: "T1",   note: "下半区 · 11.09", winner: "BLG", scoreA: 3, scoreB: 1 },
    { id: "F",   stage: "F",  slot: 1, a: "BLG",  b: "GEN",  note: "总决赛 · 11.15 03:00", winner: null, scoreA: null, scoreB: null }
  ];

  var POOLS = {
    1: ["GEN", "AL", "TLAW", "G2"],
    2: ["HLE", "BLG", "TSW", "LOS"],
    3: ["T1", "TES", "LYON", "MKOI"],
    4: ["DK", "IG", "CFO", "KC"]
  };

  var REGIONS = {
    LCK:   { name: "LCK",   full: "韩国 LCK",     color: "#e8bd68", soft: "rgba(232,189,104,.14)" },
    LPL:   { name: "LPL",   full: "中国大陆 LPL", color: "#ff6272", soft: "rgba(255,98,114,.14)" },
    LEC:   { name: "LEC",   full: "欧洲 LEC",     color: "#67b7ff", soft: "rgba(103,183,255,.14)" },
    LCS:   { name: "LCS",   full: "北美 LCS",     color: "#b493ff", soft: "rgba(180,147,255,.14)" },
    LCP:   { name: "LCP",   full: "亚太 LCP",     color: "#4dd6c1", soft: "rgba(77,214,193,.14)" },
    CBLOL: { name: "CBLOL", full: "巴西 CBLOL",   color: "#b9de5a", soft: "rgba(185,222,90,.14)" }
  };

  /* Tournament-form Elo: start 1500, update each of the 39 completed series
     (K=32, BO1/BO3/BO5 expected series win probability), then shift the mean
     to 1700 so the scale matches the UI. */
  var RATINGS = {
    GEN: 1775, HLE: 1685, AL: 1650, BLG: 1750, T1: 1730, TES: 1715,
    G2: 1670, DK: 1730, KC: 1700, MKOI: 1685, CFO: 1670, TSW: 1650,
    IG: 1735, LYON: 1705, TLAW: 1670, LOS: 1685
  };

  var SCHEDULE = {
    1: { date: "10.24",        label: "第一轮", sub: "种子池抽签 · 8 场 BO1" },
    2: { date: "10.25",        label: "第二轮", sub: "1-0 / 0-1 · 8 场 BO1" },
    3: { date: "10.26 – 10.27", label: "第三轮", sub: "2-0 / 1-1 / 0-2 · 4 BO1 + 4 BO3" },
    4: { date: "10.29 – 10.31", label: "第四轮", sub: "2-1 / 1-2 · 6 场 BO3" },
    5: { date: "11.01",        label: "第五轮", sub: "2-2 决胜 · 3 场 BO3" },
    6: { date: "11.03 – 11.15", label: "淘汰赛", sub: "八强 / 四强 / 决赛 · BO5" }
  };

  var RULES = {
    regionAvoidR1: true,
    rematchAvoid: true,
    bo3When: "有队伍达到 2 胜或 2 负时，该场为 BO3",
    knockout: "3-0 队伍对阵 3-2 队伍，其余四队随机配对；八强起 BO5，不规避同赛区"
  };

  return {
    TEAMS: TEAMS,
    ACTUAL_R1: ACTUAL_R1,
    ACTUAL_R2: ACTUAL_R2,
    ACTUAL_R3: ACTUAL_R3,
    ACTUAL_R4: ACTUAL_R4,
    ACTUAL_R5: ACTUAL_R5,
    ACTUAL_KNOCKOUT: ACTUAL_KNOCKOUT,
    POOLS: POOLS,
    REGIONS: REGIONS,
    RATINGS: RATINGS,
    SCHEDULE: SCHEDULE,
    RULES: RULES,
    teamById: function (id) {
      for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].id === id) return TEAMS[i];
      return null;
    }
  };
});
