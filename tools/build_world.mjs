// Builds data/world.js, the procurement data of GlobalCorp SE for the Data Quality Agent (a developer
// tool; the app needs no build step and loads the generated file). With --freeze it also writes
// data/reference_cases.js, the frozen reference figures of the six scenarios and of the whole world,
// which tools/check_world.mjs and Diagnostics compare the engine against.
// Usage from the repository root:  node tools/build_world.mjs [--freeze] [--out <file>]
//
// What it combines, all fictional and generated with a fixed seed, so the same seed gives the same bytes:
//   - GlobalCorp SE's company codes, plants, the 124 supplier accounts and the material-group taxonomy
//     of tools/globalcorp_base.mjs (shared with the Price Variance Agent, decision N1), each account
//     given a VAT ID in its country's format that fails the country's check digit, bank details (a
//     country and four digits), payment terms per company code and an onboarding channel;
//   - new accounts from 80001 for the scenarios, materials, contracts, users (given names and an initial
//     only), about 2,000 order lines over the last 365 days and a 26-week exception log;
//   - the root cause of each of the six scenarios, planted on purpose, and other exceptions at low
//     background rates (calibrated so the whole world's clean spend share lands near 75 %).
// Day numbers are relative to the day the app is opened (day 0 is today), so the data stays current.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY_CODES, PLANTS, ACCOUNTS, TAXONOMY } from "./globalcorp_base.mjs";
import { passesCheckDigit } from "../js/vat_check.js";
import { normaliseVat, vatProblem } from "../js/vat.js";
import { scan, totals, normaliseName, isLive } from "../js/engine.js";
import { closureRate, reconcile, cohorts } from "../js/history.js";
import { groupExceptions, caseFigures } from "../js/cases.js";
import { RULE_SET_VERSION } from "../js/rules.js";
import { PARAMS } from "../js/params.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORLD_VERSION = "1.0.0";
const SEED = 1911;
const FIRST_DAY = -364;  // the analysis window: the last 365 days
const LOG_FROM = -181;   // the exception log: 26 weeks
// ECB euro reference rate of 19 November 2026 (1 EUR = 0.83581 GBP), via api.frankfurter.dev: one
// rate per currency for the window (DATA_SOURCES.md).
const FX = { EUR: 1, GBP: Number((1 / 0.83581).toFixed(6)) };
const FX_SOURCE = "ECB euro reference rate of 19 Nov 2026 (1 EUR = 0.83581 GBP), via api.frankfurter.dev; one rate per currency for the window";

// ---- Python's random.Random (MT19937), moved here from Rebate Hunter's tools/legacy_seed.mjs ----
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER = 0x80000000;
const LOWER = 0x7fffffff;

/** Python's random.Random, limited to what the legacy generator calls. */
class PyRandom {
  constructor(seed) {
    this.mt = new Uint32Array(N);
    this.mti = N + 1;
    this.seed(seed);
  }

  initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  /** random.seed(int): the absolute value split into 32-bit words, fed to init_by_array. */
  seed(a) {
    let n = BigInt(Math.abs(Number(a)));
    const key = [];
    do { key.push(Number(n & 0xffffffffn)); n >>= 32n; } while (n > 0n);
    this.initByArray(key);
  }

  initByArray(key) {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  genrandInt32() {
    const mt = this.mt;
    if (this.mti >= N) {
      let kk = 0;
      for (; kk < N - M; kk++) {
        const y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      const y = (mt[N - 1] & UPPER) | (mt[0] & LOWER);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** random.random(): 53-bit float in [0, 1). */
  random() {
    const a = this.genrandInt32() >>> 5;
    const b = this.genrandInt32() >>> 6;
    return (a * 67108864 + b) * (1 / 9007199254740992);
  }

  /** getrandbits(k) for 1 ≤ k ≤ 32 (all the legacy generator needs). */
  getrandbits(k) {
    if (k < 1 || k > 32) throw new Error("getrandbits: only 1 to 32 bits are implemented");
    return this.genrandInt32() >>> (32 - k);
  }

  randbelow(n) {
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  /** random.randint(a, b), both ends included. */
  randint(a, b) {
    return a + this.randbelow(b - a + 1);
  }

  choice(seq) {
    return seq[this.randbelow(seq.length)];
  }

  uniform(a, b) {
    return a + (b - a) * this.random();
  }
}

// ---- random helpers (all draws in a fixed order) --------------------------------------------------------
const rnd = new PyRandom(SEED);
const int = (a, b) => rnd.randint(a, b);
const pick = (xs) => xs[rnd.randbelow(xs.length)];
const chance = (p) => rnd.random() < p;
const uniform = (a, b) => rnd.uniform(a, b);
const money = (x) => Math.round(x * 100) / 100;
function sample(xs, n) {
  const a = xs.slice();
  const out = [];
  while (out.length < n && a.length) out.push(a.splice(rnd.randbelow(a.length), 1)[0]);
  return out;
}
const byId = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
const digits = (n) => Array.from({ length: n }, () => String(int(0, 9))).join("");

// ---- users: role and team, a given name and an initial ---------------------------------------------------
// [id, name, role, team, company code, active until (day), manager]
const USER_ROWS = [
  ["U101", "Katrin W.", "procurement lead", "Group procurement, Frankfurt", "1000", null, null],
  ["U102", "Jonas M.", "supplier master steward", "Master data, Frankfurt", "1000", null, "U101"],
  ["U103", "Aylin T.", "material master steward", "Master data, Frankfurt", "1000", null, "U101"],
  ["U110", "Stefan R.", "manager", "MRO, Frankfurt", "1000", null, "U101"],
  ["U111", "Petra L.", "manager", "Production, Duisburg", "1000", null, "U101"],
  ["U112", "Oliver H.", "manager", "Indirect, Birmingham", "2000", null, "U101"],
  ["U113", "Claire D.", "manager", "Laboratory and MRO, Lyon", "3000", null, "U101"],
  ["U114", "Markus B.", "manager", "IT and services, Frankfurt", "1000", null, "U101"],
  ["U115", "Sabine K.", "manager", "Engineering, Frankfurt", "1000", -121, "U101"],
  ["U120", "Lena K.", "buyer", "MRO, Frankfurt", "1000", null, "U110"],
  ["U121", "Tobias F.", "buyer", "Facilities, Frankfurt", "1000", null, "U110"],
  ["U122", "Mehmet A.", "buyer", "Production, Duisburg", "1000", null, "U111"],
  ["U123", "Julia S.", "buyer", "MRO, Duisburg", "1000", null, "U111"],
  ["U124", "James P.", "buyer", "Indirect, Birmingham", "2000", null, "U112"],
  ["U125", "Hannah C.", "buyer", "Indirect, Birmingham", "2000", null, "U112"],
  ["U126", "Camille R.", "buyer", "Laboratory, Lyon", "3000", null, "U113"],
  ["U127", "Lucas M.", "buyer", "MRO, Lyon", "3000", null, "U113"],
  ["U128", "Anna Z.", "buyer", "IT, Frankfurt", "1000", null, "U114"],
  ["U129", "David N.", "buyer", "Services, Frankfurt", "1000", -40, "U114"],
  ["U130", "Felix G.", "contract owner", "Category management, Frankfurt", "1000", null, "U101"],
  ["U131", "Ines V.", "contract owner", "Category management, Frankfurt", "1000", -200, "U101"],
  ["U132", "Élodie B.", "contract owner", "Category management, Lyon", "3000", null, "U113"],
  ["U133", "Sarah T.", "contract owner", "Category management, Birmingham", "2000", null, "U112"],
  ["U140", "Max E.", "requester", "Maintenance, Frankfurt", "1000", null, "U110"],
  ["U141", "Nina P.", "requester", "Warehouse, Frankfurt", "1000", null, "U110"],
  ["U142", "Paul J.", "requester", "Facilities, Frankfurt", "1000", null, "U110"],
  ["U143", "Ralf S.", "requester", "Engineering, Frankfurt", "1000", -121, "U115"],
  ["U144", "Birgit H.", "requester", "Engineering, Frankfurt", "1000", -121, "U115"],
  ["U145", "Uwe D.", "requester", "Maintenance, Frankfurt", "1000", -121, "U110"],
  ["U146", "Leonie F.", "requester", "Engineering, Frankfurt", "1000", null, "U110"],
  ["U147", "Daniel W.", "requester", "IT, Frankfurt", "1000", null, "U114"],
  ["U150", "Sven K.", "requester", "Production, Duisburg", "1000", null, "U111"],
  ["U151", "Erik B.", "requester", "Maintenance, Duisburg", "1000", null, "U111"],
  ["U152", "Marta G.", "requester", "Production, Duisburg", "1000", null, "U111"],
  ["U153", "Kai L.", "requester", "Logistics, Duisburg", "1000", null, "U111"],
  ["U154", "Fatma Y.", "requester", "Quality, Duisburg", "1000", null, "U111"],
  ["U155", "Dirk M.", "requester", "Production, Duisburg", "1000", -60, "U111"],
  ["U160", "Emily R.", "requester", "Operations, Birmingham", "2000", null, "U112"],
  ["U161", "George W.", "requester", "Facilities, Birmingham", "2000", null, "U112"],
  ["U162", "Priya S.", "requester", "Office, Birmingham", "2000", null, "U112"],
  ["U163", "Liam O.", "requester", "Warehouse, Birmingham", "2000", null, "U112"],
  ["U170", "Chloé M.", "requester", "Laboratory, Lyon", "3000", null, "U113"],
  ["U171", "Hugo P.", "requester", "Laboratory, Lyon", "3000", null, "U113"],
  ["U172", "Manon L.", "requester", "Laboratory, Lyon", "3000", null, "U113"],
  ["U173", "Antoine G.", "requester", "Maintenance, Lyon", "3000", null, "U113"],
  ["U174", "Julien R.", "requester", "Laboratory, Lyon", "3000", -90, "U113"],
  ["U190", null, "buying profile", "Indirect, Birmingham", "2000", null, "U112"],
  ["U191", null, "interface", "MRP, Duisburg", "1000", null, "U111"]
];
const users = USER_ROWS.map(([id, name, role, team, company_code, active_until, manager]) => ({ id, name, role, team, company_code, active_until, manager }));
const userById = new Map(users.map((u) => [u.id, u]));
const activeOn = (uid, day) => { const u = userById.get(uid); return !!u && (u.active_until === null || u.active_until >= day); };

// Requesters and buyers by plant (requesters who left are used only before they left).
const REQUESTERS = { 1010: ["U140", "U141", "U142", "U143", "U144", "U145", "U146", "U147"], 1020: ["U150", "U151", "U152", "U153", "U154", "U155"], 2010: ["U160", "U161", "U162", "U163"], 3010: ["U170", "U171", "U172", "U173", "U174"] };
const PLANT_CC = Object.fromEntries(PLANTS.map((p) => [p.id, p.company_code]));
function requesterFor(plant, day) {
  const active = REQUESTERS[plant].filter((u) => activeOn(u, day));
  return pick(active);
}
const BUYERS = {
  1010: { goods: "U120", facility: "U121", it: "U128", services: "U129", servicesAfter: "U121" },
  1020: { goods: "U123", production: "U122", facility: "U122", it: "U122", services: "U122" },
  2010: { goods: "U124", facility: "U125", it: "U124", services: "U125" },
  3010: { goods: "U127", lab: "U126", facility: "U127", it: "U127", services: "U127" }
};
const KIND = {
  "MRO-PPE": "goods", "MRO-TOOLS": "goods", "MRO-SPARES": "goods", "MRO-LUBE": "goods", CHEM: "production", "CHEM-CLEAN": "facility",
  "PACK-CARTON": "production", "PACK-FILM": "production", "PACK-PALLET": "production", "AUTO-ROB": "production", "AUTO-SVC": "production",
  "SVC-IT": "it", "SVC-CONS": "services", "SVC-FM": "facility", "SVC-LOG": "services", "SVC-SEC": "facility", "SVC-FLEET": "services",
  "LAB-CONS": "lab", "LAB-EQUIP": "lab", OFFICE: "goods"
};
function buyerFor(plant, group, day) {
  const b = BUYERS[plant];
  let id = b[KIND[group]] || b.goods;
  if (id === "U129" && !activeOn("U129", day)) id = b.servicesAfter;
  return id;
}
const SERVICE = (g) => g.startsWith("SVC-") || g === "AUTO-SVC";

// ---- materials: [description with {v}, variants, unit, unit price range (EUR), quantity range] ------------
const MATERIAL_TEMPLATES = {
  "MRO-PPE": [["Nitrile gloves, size {v}, box of 100", ["S", "M", "L", "XL"], "BOX", [6, 12], [20, 160]], ["Cut-resistant gloves, level C, size {v}", ["7", "8", "9", "10", "11"], "PAA", [4, 9], [30, 240]],
    ["Safety goggles, anti-fog, {v}", ["clear", "tinted"], "EA", [6, 14], [10, 50]], ["Safety helmet EN 397, {v}", ["white", "yellow", "blue", "red", "green"], "EA", [12, 25], [10, 60]],
    ["Ear plugs, foam, box of 200", [""], "BOX", [18, 30], [2, 12]], ["Hi-vis vest, size {v}", ["S", "M", "L", "XL", "XXL"], "EA", [4, 9], [20, 120]],
    ["Safety shoes S3, size {v}", ["38", "39", "40", "41", "42", "43", "44", "45", "46", "47"], "PAA", [55, 95], [4, 24]], ["FFP2 respirator mask, box of 20", [""], "BOX", [14, 28], [5, 40]]],
  "MRO-TOOLS": [["Torque wrench {v} Nm", ["5-25", "20-100", "40-200", "60-340"], "EA", [85, 240], [1, 6]], ["Cordless drill 18 V with two batteries", [""], "EA", [180, 320], [1, 3]],
    ["Screwdriver set, {v}-piece", ["6", "7", "12", "18"], "EA", [25, 60], [2, 12]], ["Socket set 1/2 inch, 24-piece", [""], "EA", [70, 140], [1, 4]],
    ["Combination pliers {v} mm", ["160", "180", "200"], "EA", [14, 30], [4, 24]], ["Angle grinder discs 125 mm, pack of 25", [""], "PAK", [22, 45], [2, 12]],
    ["HSS drill bit set {v} mm", ["1-10", "1-13", "6-20"], "EA", [30, 120], [2, 12]], ["Digital caliper 150 mm", [""], "EA", [35, 80], [1, 4]],
    ["Hex key set, metric, 9-piece", [""], "EA", [12, 30], [2, 8]], ["Rotary hammer drill 800 W", [""], "EA", [260, 420], [1, 2]]],
  "MRO-SPARES": [["Deep groove ball bearing {v}-2RS", ["6202", "6203", "6204", "6205", "6206", "6207", "6208", "6209", "6304", "6305", "6306", "6307"], "EA", [6, 28], [10, 120]],
    ["V-belt {v}", ["SPZ 1000", "SPZ 1250", "SPA 1250", "SPA 1500", "SPB 1600", "SPB 2000"], "EA", [12, 40], [4, 40]], ["Shaft seal {v}", ["25x40x7", "30x47x7", "35x52x7", "40x62x8", "50x72x8", "60x80x8"], "EA", [4, 12], [20, 150]],
    ["Solenoid valve 24 V DC, G1/2", [""], "EA", [65, 140], [1, 8]], ["Hydraulic filter element {v} micron", ["3", "10", "25", "40"], "EA", [40, 95], [4, 30]],
    ["Inductive proximity sensor, M18 thread", [""], "EA", [35, 80], [2, 12]], ["Pneumatic cylinder {v} mm", ["25x50", "32x100", "40x150", "50x200", "63x250"], "EA", [90, 260], [2, 10]],
    ["Flat gasket DN{v}, PTFE", ["25", "40", "50", "80", "100", "150"], "EA", [8, 25], [20, 120]], ["Three-phase motor {v} kW", ["0.75", "1.5", "2.2", "4", "7.5", "11"], "EA", [280, 1400], [1, 3]],
    ["Gear coupling, size {v}", ["19", "28", "38", "42", "48"], "EA", [120, 320], [1, 6]]],
  "MRO-LUBE": [["Hydraulic oil HLP {v}, 20 l drum", ["22", "32", "46", "68", "100"], "EA", [70, 120], [4, 30]], ["Multipurpose grease, 400 g cartridge", [""], "EA", [5, 11], [10, 80]],
    ["Gear oil CLP {v}, 20 l", ["150", "220", "320", "460"], "EA", [90, 150], [2, 16]], ["Cutting fluid concentrate, 20 l", [""], "EA", [85, 140], [1, 6]],
    ["Chain lubricant spray, 400 ml", [""], "EA", [8, 15], [6, 48]], ["Compressor oil, {v}", ["5 l", "20 l"], "EA", [35, 160], [2, 10]],
    ["Food-grade lubricant H1, {v}", ["400 ml spray", "5 l", "20 l"], "EA", [12, 190], [2, 24]], ["Slideway oil, 20 l", [""], "EA", [80, 130], [1, 8]]],
  CHEM: [["Isopropyl alcohol 99.9 percent, {v} l", ["1", "5", "25"], "EA", [12, 140], [6, 60]], ["Sodium hydroxide solution 50 percent, 25 kg", [""], "EA", [40, 70], [4, 40]],
    ["Epoxy resin, 10 kg kit", [""], "EA", [160, 290], [2, 20]], ["Hydrochloric acid 32 percent, 30 kg", [""], "EA", [35, 60], [4, 30]],
    ["Acetone, technical grade, 25 l", [""], "EA", [55, 90], [2, 20]], ["Corrosion inhibitor, 25 l", [""], "EA", [140, 260], [1, 10]],
    ["Nitrogen, 50 l cylinder", [""], "EA", [45, 80], [4, 30]], ["Soldering flux, 1 l", [""], "EA", [18, 35], [4, 24]], ["Silicone sealant, 310 ml, {v}", ["clear", "white", "grey"], "EA", [6, 12], [12, 96]],
    ["Two-component adhesive, {v}", ["50 ml", "400 ml"], "EA", [9, 60], [6, 48]], ["Thread-locking compound, {v}", ["medium strength, 50 ml", "high strength, 50 ml"], "EA", [14, 28], [6, 36]], ["Release agent spray, 400 ml", [""], "EA", [9, 16], [12, 96]]],
  "CHEM-CLEAN": [["Industrial degreaser, {v} l", ["1", "5", "10", "25"], "EA", [9, 90], [6, 60]], ["Surface disinfectant, 5 l", [""], "EA", [20, 40], [2, 20]],
    ["Floor cleaner concentrate, 10 l", [""], "EA", [25, 45], [2, 16]], ["Hand cleaning paste, 2 l tin", [""], "EA", [9, 18], [6, 48]], ["Cleaning wipes, pack of {v}", ["100", "500"], "PAK", [6, 40], [10, 80]],
    ["Paper towels, {v}", ["roll of 150 m", "box of 3,750 sheets"], "PAK", [18, 45], [10, 80]], ["Glass cleaner, 1 l", [""], "EA", [3, 7], [12, 96]], ["Sanitary cleaner, 1 l", [""], "EA", [3, 8], [12, 96]]],
  "PACK-CARTON": [["Corrugated carton {v} mm, bundle of 25", ["200x150x100", "300x200x150", "400x300x200", "500x400x300", "600x400x400", "800x600x400"], "PAK", [18, 70], [40, 400]],
    ["Folding box, white, {v}", ["A3", "A4", "A5", "A6"], "PAK", [20, 40], [20, 200]], ["Shipping carton, double wall, 800x600x600 mm, bundle of 10", [""], "PAK", [45, 90], [5, 60]],
    ["Cardboard divider set, bundle of 50", [""], "PAK", [30, 60], [4, 40]]],
  "PACK-FILM": [["Stretch film 500 mm x 300 m, {v} micron", ["12", "17", "20", "23"], "ROL", [9, 16], [60, 600]], ["Shrink film 750 mm, roll", [""], "ROL", [45, 80], [5, 40]],
    ["Bubble wrap 1000 mm x 100 m", [""], "ROL", [30, 55], [4, 40]], ["Packing tape {v}", ["50 mm x 66 m, brown", "50 mm x 66 m, clear", "75 mm x 66 m, brown", "50 mm x 66 m, printed FRAGILE"], "ROL", [1.5, 4.5], [72, 720]]],
  "PACK-PALLET": [["Euro pallet 1200x800 mm, {v}", ["new", "used"], "EA", [9, 22], [100, 900]], ["Plastic load carrier {v} mm", ["300x200x150", "400x300x220", "600x400x280", "600x400x420"], "EA", [9, 28], [40, 400]],
    ["Pallet collar, wood, 1200x800 mm", [""], "EA", [8, 15], [20, 200]], ["Mesh box pallet", [""], "EA", [140, 230], [2, 20]]],
  "AUTO-ROB": [["Six-axis industrial robot, {v} kg payload", ["6", "10", "25", "50"], "EA", [38000, 92000], [1, 1]], ["Collaborative robot arm, 10 kg payload", [""], "EA", [26000, 39000], [1, 2]],
    ["Vacuum gripper module", [""], "EA", [1800, 4200], [1, 4]], ["Parallel gripper, {v} mm stroke", ["40", "80"], "EA", [1200, 2600], [1, 4]], ["Servo motor {v} kW with drive", ["0.75", "1.5", "3"], "EA", [1400, 3600], [1, 6]],
    ["Belt conveyor module, 2 m", [""], "EA", [3200, 6800], [1, 4]], ["Safety light curtain, {v} mm", ["600", "900", "1200"], "EA", [900, 2100], [1, 4]], ["PLC CPU module", [""], "EA", [1200, 2800], [1, 3]]],
  "AUTO-SVC": [["Robot commissioning, per day", [""], "TAG", [1100, 1500], [2, 12]], ["Robot programming, per hour", [""], "H", [95, 140], [8, 80]],
    ["Preventive maintenance, robot cell", [""], "EA", [1800, 4200], [1, 2]], ["Calibration service, torque tools", [""], "EA", [450, 900], [1, 2]]],
  "SVC-IT": [["Software licence, CAD seat, annual", [""], "EA", [2200, 4800], [1, 6]], ["Service desk support, monthly fee", [""], "MON", [6000, 14000], [1, 1]],
    ["Cloud hosting, monthly fee", [""], "MON", [3500, 9000], [1, 1]], ["Network maintenance, quarterly", [""], "EA", [7000, 16000], [1, 1]], ["Notebook rental, per month", [""], "MON", [45, 80], [20, 120]]],
  "SVC-CONS": [["Advisory services, per day", [""], "TAG", [1300, 2200], [3, 20]], ["Process assessment, fixed price", [""], "EA", [18000, 45000], [1, 1]],
    ["Project support, per day", [""], "TAG", [1100, 1700], [5, 25]], ["Training day, on site", [""], "TAG", [1500, 2600], [1, 4]]],
  "SVC-FM": [["Office cleaning, monthly fee", [""], "MON", [4000, 12000], [1, 1]], ["Site services, monthly fee", [""], "MON", [18000, 32000], [1, 1]], ["HVAC maintenance, quarterly", [""], "EA", [3000, 8000], [1, 1]],
    ["Waste disposal, per container", [""], "EA", [180, 420], [4, 20]], ["Grounds maintenance, monthly", [""], "MON", [1500, 4000], [1, 1]], ["Building repairs, per hour", [""], "H", [55, 85], [10, 80]]],
  "SVC-LOG": [["Road freight, full truckload", [""], "EA", [650, 1600], [2, 12]], ["Courier service, per shipment", [""], "EA", [25, 90], [10, 80]],
    ["Warehousing, per pallet and month", [""], "EA", [8, 15], [100, 900]], ["Customs clearance, per declaration", [""], "EA", [45, 110], [5, 40]]],
  "SVC-SEC": [["Site guarding, per hour", [""], "H", [28, 42], [150, 700]], ["Access control maintenance, monthly", [""], "MON", [900, 2400], [1, 1]], ["Mobile patrol, monthly", [""], "MON", [1200, 3000], [1, 1]]],
  "SVC-FLEET": [["Vehicle leasing, per month", [""], "MON", [450, 900], [3, 20]], ["Fuel card charges, monthly", [""], "MON", [1500, 6000], [1, 1]],
    ["Tyre change service", [""], "EA", [70, 140], [4, 20]], ["Vehicle servicing", [""], "EA", [280, 900], [1, 6]]],
  "LAB-CONS": [["Pipette tips {v} microlitre, rack of 96", ["10", "20", "200", "300", "1000", "5000"], "PAK", [6, 14], [40, 300]], ["Petri dishes {v} mm, pack of 500", ["60", "90", "140"], "PAK", [55, 95], [4, 30]],
    ["Sample vials {v} ml, pack of 100", ["1.5", "2", "4", "10", "20"], "PAK", [18, 35], [6, 60]], ["Nitrile laboratory gloves, size {v}, box of 100", ["XS", "S", "M", "L", "XL"], "BOX", [7, 13], [20, 160]],
    ["Filter paper 125 mm, pack of 100", [""], "PAK", [9, 18], [2, 20]], ["Glass beakers 250 ml, pack of 10", [""], "PAK", [25, 45], [1, 8]],
    ["pH buffer solution {v}, 500 ml", ["4", "7", "9", "10"], "EA", [12, 24], [4, 30]], ["Centrifuge tubes {v} ml, pack of 500", ["15", "50"], "PAK", [70, 120], [4, 24]], ["Weighing boats, pack of 500", [""], "PAK", [20, 40], [1, 6]]],
  "LAB-EQUIP": [["Analytical balance, 220 g", [""], "EA", [2400, 4200], [1, 1]], ["Benchtop centrifuge", [""], "EA", [3800, 7500], [1, 1]],
    ["Laboratory incubator, 100 l", [""], "EA", [4200, 8800], [1, 1]], ["Single-channel pipette, {v} microlitre", ["2", "10", "20", "100", "200", "1000", "5000"], "EA", [180, 320], [1, 6]],
    ["Magnetic stirrer with hot plate", [""], "EA", [450, 900], [1, 2]], ["Benchtop pH meter", [""], "EA", [650, 1300], [1, 1]]],
  OFFICE: [["Copy paper {v}, box of 5 reams", ["A4, 80 g", "A4, 100 g", "A3, 80 g", "A4, recycled"], "BOX", [18, 34], [20, 160]], ["Toner cartridge, {v}", ["black", "black, high yield", "cyan", "magenta", "yellow"], "EA", [60, 140], [4, 24]],
    ["Ballpoint pens, blue, pack of 50", [""], "PAK", [8, 16], [2, 12]], ["Lever arch files, pack of 10", [""], "PAK", [12, 22], [2, 12]],
    ["Notebooks {v}, pack of 10", ["A4", "A5", "A6"], "PAK", [14, 26], [2, 12]], ["Sticky notes, pack of 12", [""], "PAK", [6, 12], [2, 12]],
    ["Whiteboard markers, set of {v}", ["4", "8"], "PAK", [6, 14], [2, 12]], ["Printer labels, {v}, box of 100 sheets", ["A4 24-up", "A4 21-up"], "BOX", [18, 32], [2, 12]], ["Envelopes {v}, box of 500", ["DL", "C4", "C5"], "BOX", [14, 45], [1, 8]]]
};
const GROUPS = TAXONOMY.map((t) => t.code);
const materials = [];
const matInfo = new Map(); // id → { group, price, qty: [a, b] }
const matsByGroup = Object.fromEntries(GROUPS.map((g) => [g, []]));
let matSeq = 10000;
for (const g of GROUPS) {
  for (const [tpl, variants, unit, [pa, pb], qty] of MATERIAL_TEMPLATES[g]) {
    for (const v of variants) {
      const id = `M${++matSeq}`;
      const description = tpl.replace("{v}", v).replace(/ ,/g, ",").replace(/\s+/g, " ").trim();
      materials.push({ id, description, material_group: g, base_unit: unit });
      matInfo.set(id, { group: g, price: money(uniform(pa, pb)), qty });
      matsByGroup[g].push(id);
    }
  }
}

// ---- suppliers ---------------------------------------------------------------------------------------
const CATEGORY_GROUPS = {
  "MRO supplies": ["MRO-PPE", "MRO-TOOLS", "MRO-SPARES", "MRO-LUBE"], Chemicals: ["CHEM", "CHEM-CLEAN"], Packaging: ["PACK-CARTON", "PACK-FILM", "PACK-PALLET"],
  "Automation and robotics": ["AUTO-ROB", "AUTO-SVC"], "IT services": ["SVC-IT"], Consulting: ["SVC-CONS"], "Facility management": ["SVC-FM", "CHEM-CLEAN"],
  "Logistics services": ["SVC-LOG", "PACK-PALLET"], "Security services": ["SVC-SEC"], "Fleet services": ["SVC-FLEET"],
  "Laboratory supplies": ["LAB-CONS", "LAB-EQUIP"], "Office supplies": ["OFFICE"]
};
const TERMS_BY_CATEGORY = {
  "MRO supplies": [30, 45], Chemicals: [30, 45, 60], Packaging: [30, 45], "Automation and robotics": [45, 60], "IT services": [30, 45],
  Consulting: [30], "Facility management": [30], "Logistics services": [30], "Security services": [30], "Fleet services": [30],
  "Laboratory supplies": [30, 45], "Office supplies": [30]
};
// VAT IDs: each country's format, changed until it fails the country's check digit (published, or the
// rule in wide use for France and Spain), and unique.
const usedVat = new Set();
function newVat(country) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let v;
    if (country === "DE") v = `DE${int(1, 9)}${digits(8)}`;
    else if (country === "AT") v = `ATU${digits(8)}`;
    else if (country === "IT") v = `IT${int(1, 9)}${digits(6)}${String(int(1, 100)).padStart(3, "0")}${digits(1)}`;
    else if (country === "NL") v = `NL${int(1, 9)}${digits(8)}B${String(int(1, 3)).padStart(2, "0")}`;
    else if (country === "GB") v = `GB${int(1, 9)}${digits(8)}`;
    else if (country === "CH") v = `CHE${int(1, 9)}${digits(8)}`;
    else if (country === "FR") v = `FR${digits(2)}${int(1, 9)}${digits(8)}`;
    else if (country === "ES") v = `ES${pick(["A", "B"])}${digits(7)}${digits(1)}`;
    else throw new Error(`no VAT format for ${country}`);
    if (vatProblem(country, v) !== null) throw new Error(`generated ${v} breaks the format of ${country}`);
    if (passesCheckDigit(country, v) !== false || usedVat.has(v)) continue;
    usedVat.add(v);
    return v;
  }
  throw new Error(`no VAT ID found for ${country}`);
}
// Rebate Hunter's Apex accounts keep their tax ids: already in their countries' formats, and both fail
// the check digit (tests/world.mjs checks every VAT ID).
const KEEP_VAT = { 40001: "DE606060602", 40002: "GB707070702" };
for (const v of Object.values(KEEP_VAT)) usedVat.add(v);
const suppliers = [];
for (const a of ACCOUNTS) {
  const terms = { [a.company_code]: pick(TERMS_BY_CATEGORY[a.category] || [30]) };
  suppliers.push({
    id: a.id, name: a.name, country: a.country, city: a.city, currency: a.currency, category: a.category,
    vat_id: KEEP_VAT[a.id] || newVat(a.country), bank: { country: a.country, last4: digits(4) }, payment_terms: terms, block_from: null,
    created_day: -int(800, 3000), onboarding_channel: chance(0.35) ? "migrated" : "central onboarding", origin: "Rebate Hunter"
  });
}
const supplierById = new Map(suppliers.map((s) => [s.id, s]));
function addSupplier(s) {
  const full = { block_from: null, origin: "this world", ...s };
  full.vat_id = s.vat_id === undefined ? newVat(s.country) : s.vat_id;
  if (full.bank === undefined) full.bank = { country: s.country, last4: digits(4) };
  suppliers.push(full);
  supplierById.set(full.id, full);
  return full;
}
// New accounts: the scenarios' suppliers and two for office supplies.
addSupplier({ id: "80001", name: "Lumen Labware SAS", country: "FR", city: "Lyon", currency: "EUR", category: "Laboratory supplies", payment_terms: { 3000: 45 }, created_day: -700, onboarding_channel: "central onboarding" });
addSupplier({ id: "80002", name: "Brindley Packaging Ltd", country: "GB", city: "Birmingham", currency: "GBP", category: "Packaging", payment_terms: { 2000: 60 }, created_day: -900, onboarding_channel: "central onboarding" });
addSupplier({ id: "80003", name: "Severn Facility Services Ltd", country: "GB", city: "Worcester", currency: "GBP", category: "Facility management", payment_terms: { 2000: 60 }, created_day: -800, onboarding_channel: "central onboarding" });
addSupplier({ id: "80004", name: "Ruhr Industriebedarf GmbH", country: "DE", city: "Duisburg", currency: "EUR", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -1200, onboarding_channel: "central onboarding" });
addSupplier({ id: "80014", name: "Taunus Bürobedarf GmbH", country: "DE", city: "Oberursel", currency: "EUR", category: "Office supplies", payment_terms: { 1000: 30 }, created_day: -1500, onboarding_channel: "central onboarding" });
addSupplier({ id: "80015", name: "Midland Office Supplies Ltd", country: "GB", city: "Birmingham", currency: "GBP", category: "Office supplies", payment_terms: { 2000: 30 }, created_day: -1100, onboarding_channel: "central onboarding" });
// Scenario 5: suppliers from the self-registration portal, onboarded between day -120 and day -30,
// with half their data: terms missing in a company code they order in (DQ-09), a VAT ID missing or
// malformed (DQ-10), no bank details or a bank abroad (DQ-11).
const PORTAL = [
  { id: "80005", name: "Kessler Prüftechnik GmbH", country: "DE", city: "Mannheim", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -118, vat_id: "DE30871462", bank: null, plants: ["1010", "1020"] },
  { id: "80006", name: "Atelier Morel SARL", country: "FR", city: "Grenoble", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -104, plants: ["1010", "3010"] },
  { id: "80007", name: "Van Dijk Industrial Supplies B.V.", country: "NL", city: "Eindhoven", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -95, bank: { country: "LT", last4: "4417" }, plants: ["1020"] },
  { id: "80008", name: "Nordlicht Arbeitsschutz GmbH", country: "DE", city: "Bremen", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -83, vat_id: null, plants: ["1010"] },
  { id: "80009", name: "Officine Brambilla S.r.l.", country: "IT", city: "Bergamo", category: "MRO supplies", payment_terms: { 1000: 45 }, created_day: -71, vat_id: "IT0529481036", plants: ["1020", "3010"] },
  { id: "80010", name: "Técnicas Álvarez S.L.", country: "ES", city: "Zaragoza", category: "Packaging", payment_terms: { 1000: 30 }, created_day: -58, bank: null, plants: ["1020"] },
  { id: "80011", name: "Alpine Messtechnik AG", country: "CH", city: "Winterthur", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -46, vat_id: "CHE-104.583.21 MWST", plants: ["1010"] },
  { id: "80012", name: "Wiener Werkzeughandel GmbH", country: "AT", city: "Graz", category: "MRO supplies", payment_terms: { 1000: 30 }, created_day: -33, bank: { country: "DE", last4: "8830" }, plants: ["1010", "3010"] }
];
for (const p of PORTAL) {
  const { plants, ...rest } = p;
  addSupplier({ ...rest, currency: "EUR", onboarding_channel: "self-registration portal" });
}

// ---- which base accounts buy where ------------------------------------------------------------------------
// About sixty of the 124 accounts get order lines: a sample per category, at the plants of their home
// company code; a few are extended to another company code (with payment terms there).
const PICKS = { "MRO supplies": 8, Chemicals: 6, Packaging: 6, "Automation and robotics": 4, "IT services": 8, Consulting: 6, "Facility management": 6, "Logistics services": 6, "Security services": 5, "Fleet services": 4 };
const base = ACCOUNTS.map((a) => supplierById.get(a.id));
const chosen = [];
for (const [cat, n] of Object.entries(PICKS)) {
  const pool = base.filter((s) => s.category === cat && !["40001", "40002"].includes(s.id));
  // Every French account of the category first (they serve Lyon), then a sample of the others.
  const fr = pool.filter((s) => s.country === "FR" && s.payment_terms[3000] !== undefined).slice(0, 2);
  const rest = sample(pool.filter((s) => !fr.includes(s) && s.payment_terms[1000] !== undefined), n - fr.length);
  chosen.push(...fr, ...rest);
}
chosen.push(supplierById.get("40001"), supplierById.get("40002"));
chosen.sort((a, b) => byId(a.id, b.id));
// The plants each account serves: home company code 1000 → Frankfurt and Duisburg by category; 2000 →
// Birmingham; 3000 → Lyon.
const PLANTS_1000 = {
  "MRO supplies": ["1010", "1020"], Chemicals: ["1020"], Packaging: ["1020", "1010"], "Automation and robotics": ["1020"], "IT services": ["1010"],
  Consulting: ["1010"], "Facility management": ["1010", "1020"], "Logistics services": ["1020", "1010"], "Security services": ["1010", "1020"], "Fleet services": ["1010"]
};
const serves = new Map(); // supplier id → [plant]
for (const s of chosen) {
  const cc = Object.keys(s.payment_terms)[0];
  serves.set(s.id, cc === "1000" ? [...PLANTS_1000[s.category]] : cc === "2000" ? ["2010"] : ["3010"]);
}
// Extensions to a second company code: an MRO, an IT and a logistics account also serve Birmingham, an
// MRO account also serves Lyon.
function extend(category, plant, terms) {
  const s = chosen.find((x) => x.category === category && x.payment_terms[1000] !== undefined && !serves.get(x.id).includes(plant) && x.payment_terms[PLANT_CC[plant]] === undefined);
  s.payment_terms[PLANT_CC[plant]] = terms;
  serves.get(s.id).push(plant);
  return s;
}
const extMroUk = extend("MRO supplies", "2010", 30);
const extItUk = extend("IT services", "2010", 30);
const extLogUk = extend("Logistics services", "2010", 30);
const extMroLyon = extend("MRO supplies", "3010", 45);
// Scenario 6: the original of the duplicate is an MRO account of company code 1000 that buys at both
// German plants (not one of the extended ones).
const original = chosen.find((s) => s.category === "MRO supplies" && s.country === "DE" && serves.get(s.id).join() === "1010,1020" && ![extMroUk, extMroLyon].includes(s));
// The new accounts' plants.
for (const [id, plants] of [["80001", ["3010"]], ["80002", ["2010"]], ["80003", ["2010"]], ["80004", ["1020"]], ["80014", ["1010"]], ["80015", ["2010"]]]) serves.set(id, plants);
for (const p of PORTAL) serves.set(p.id, p.plants);

// ---- contracts ---------------------------------------------------------------------------------------
const contracts = [];
let contractSeq = 4600000100;
function addContract({ supplier, cc, group, from = -int(420, 560), to = int(120, 500), terms = null, owner }) {
  const s = supplierById.get(supplier);
  const k = { id: String(++contractSeq), supplier, company_code: cc, material_group: group, valid_from: from, valid_to: to, payment_terms_days: terms ?? s.payment_terms[cc], owner };
  contracts.push(k);
  return k;
}
const OWNER = { 1000: "U130", 2000: "U133", 3000: "U132" };
// Scenario 1 and 2: the framework contracts the tips speak of.
const kLab = addContract({ supplier: "80001", cc: "3000", group: "LAB-CONS", from: -480, to: 250, terms: 45, owner: "U132" });
const kPack = addContract({ supplier: "80002", cc: "2000", group: "PACK-CARTON", from: -420, to: 310, terms: 60, owner: "U133" });
const kFm = addContract({ supplier: "80003", cc: "2000", group: "SVC-FM", from: -390, to: 340, terms: 60, owner: "U133" });
// Framework contracts with accounts that buy regularly, one per (account, company code, group).
const contractPlan = [];
for (const s of chosen) {
  const cc = Object.keys(s.payment_terms)[0];
  const g = CATEGORY_GROUPS[s.category][0];
  contractPlan.push({ s, cc, g });
}
for (const { s, cc, g } of sample(contractPlan, 21).sort((a, b) => byId(a.s.id, b.s.id))) addContract({ supplier: s.id, cc, group: g, owner: OWNER[cc] });
// Background: one contract whose owner left on day -200 (DQ-14, accepted until the renewal), one without
// an owner (DQ-14), and one that expired 90 days ago but is still referenced (DQ-15).
const sampled = contracts.slice(3);
const kOwnerLeft = sampled.find((k) => k.material_group === "SVC-FM" && k.company_code === "1000") || sampled.find((k) => k.material_group.startsWith("SVC-"));
kOwnerLeft.owner = "U131";
const kNoOwner = sampled.find((k) => k !== kOwnerLeft && ["SVC-IT", "SVC-SEC", "SVC-LOG"].includes(k.material_group) && k.company_code === "1000");
kNoOwner.owner = null;
const kExpired = sampled.find((k) => ![kOwnerLeft, kNoOwner].includes(k) && !k.material_group.startsWith("SVC-") && k.company_code === "1000" && k.supplier !== original.id);
kExpired.valid_to = -90;
const contractFor = (supplier, cc, group, day) => contracts.filter((k) => k.supplier === supplier && k.company_code === cc && k.material_group === group && k.valid_from <= day && day <= k.valid_to)
  .sort((a, b) => b.valid_from - a.valid_from || byId(a.id, b.id))[0] || null;

// ---- order lines ---------------------------------------------------------------------------------------
// Orders per year of one stream (an account, a plant and a material group).
const ORDERS_PER_YEAR = {
  "MRO-PPE": 9, "MRO-TOOLS": 7, "MRO-SPARES": 10, "MRO-LUBE": 6, CHEM: 8, "CHEM-CLEAN": 4, "PACK-CARTON": 8, "PACK-FILM": 6, "PACK-PALLET": 4,
  "AUTO-ROB": 2, "AUTO-SVC": 4, "SVC-IT": 12, "SVC-CONS": 4, "SVC-FM": 12, "SVC-LOG": 10, "SVC-SEC": 12, "SVC-FLEET": 12, "LAB-CONS": 22, "LAB-EQUIP": 3, OFFICE: 10
};
const lines = [];
let lineSeq = 0;
// Birmingham's two contract suppliers serve the whole site: larger orders than the sister accounts'.
const VALUE_FACTOR = { 80002: 5, 80003: 1 };
function addLine(l) {
  const line = {
    key: ++lineSeq, order: l.order, day: l.day, company_code: PLANT_CC[l.plant], plant: l.plant, supplier: l.supplier, material: l.material ?? null,
    short_text: l.short_text, material_group: l.group, quantity: l.quantity, unit: l.unit, value: l.value, currency: l.currency,
    payment_terms_days: l.terms, contract: l.contract ?? null, requester: l.requester, buyer: l.buyer, created_by: l.created_by, channel: l.channel, tags: new Set(l.tags || [])
  };
  lines.push(line);
  return line;
}
let orderSeq = 0;
/** An item of a material (or a free-text item of a group), priced from the material's unit price. */
function item(group, { freeText = false, material = null } = {}) {
  const mat = material || pick(matsByGroup[group]);
  const info = matInfo.get(mat);
  const m = materials.find((x) => x.id === mat);
  const quantity = int(info.qty[0], info.qty[1]);
  const price = freeText ? money(info.price * uniform(0.9, 1.15)) : info.price;
  return { material: freeText ? null : mat, short_text: m.description, unit: m.base_unit, quantity, value: money(quantity * price), group };
}
function agreedTerms(supplier, cc, contract) {
  if (contract) return contract.payment_terms_days;
  const t = supplierById.get(supplier).payment_terms[cc];
  return t === undefined ? 30 : t;
}
/** One order: 1 to 3 items of one stream, with the channel, contract, people and terms of a clean order. */
function order({ day, plant, supplier, group, channel = null }) {
  const cc = PLANT_CC[plant];
  const s = supplierById.get(supplier);
  const k = contractFor(supplier, cc, group, day);
  const service = SERVICE(group);
  if (!channel) {
    if (k) channel = chance(0.75) ? "contract call-off" : "catalog";
    else if (service) channel = chance(0.7) ? "direct order" : "free-text requisition";
    else channel = pick(["catalog", "catalog", "direct order", "direct order", "free-text requisition"]);
  }
  const requester = requesterFor(plant, day);
  const buyer = buyerFor(plant, group, day);
  const byBuyer = channel === "direct order" || channel === "contract call-off";
  // Birmingham's indirect team orders through one shared buying profile; at Duisburg the MRP interface
  // places the spare-part orders.
  let created_by = byBuyer ? buyer : requester;
  if (plant === "2010" && byBuyer) created_by = "U190";
  if (plant === "1020" && group === "MRO-SPARES" && channel === "direct order") created_by = "U191";
  const n = service ? 1 : int(1, 3);
  const o = ++orderSeq;
  const out = [];
  for (let i = 0; i < n; i++) {
    const it = item(group, { freeText: channel === "free-text requisition" });
    const factor = VALUE_FACTOR[supplier] || 1;
    if (factor !== 1) { it.quantity *= factor; it.value = money(it.value * factor); }
    out.push(addLine({ order: o, day, plant, supplier, group, ...it, currency: s.currency, terms: agreedTerms(supplier, cc, k), contract: k && channel !== "free-text requisition" ? k.id : null,
      requester, buyer, created_by, channel: k && channel === "free-text requisition" ? "contract call-off" : channel }));
  }
  return out;
}
/** Days of `n` orders spread over [from, to], in order. */
function daysOf(n, from, to) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(int(from, to));
  return out.sort((a, b) => a - b);
}
// Background streams.
for (const [sid, plants] of [...serves].sort((a, b) => byId(a[0], b[0]))) {
  const s = supplierById.get(sid);
  if (PORTAL.some((p) => p.id === sid)) continue;
  const groups = CATEGORY_GROUPS[s.category];
  for (const plant of plants) {
    const gs = groups.length > 2 ? sample(groups, 2) : groups;
    for (const g of gs) {
      let n = ORDERS_PER_YEAR[g];
      if (sid === "80001" && g === "LAB-CONS") continue; // planted below (scenario 1)
      const from = Math.max(FIRST_DAY, s.created_day + 1);
      for (const day of daysOf(Math.max(1, Math.round(n * (1 + uniform(-0.25, 0.25)))), from, 0)) order({ day, plant, supplier: sid, group: g });
    }
  }
}

// ---- scenario 1: the punch-out catalog of Lumen Labware drops the contract number --------------------------
// Until day -70 the laboratory ordered under the framework contract (call-offs and catalog orders that
// carry it); since the punch-out catalog went live on day -70, its order lines arrive without it.
const PUNCHOUT_LIVE = -70;
for (const day of daysOf(17, FIRST_DAY, PUNCHOUT_LIVE - 1)) order({ day, plant: "3010", supplier: "80001", group: "LAB-CONS" });
for (const day of daysOf(18, PUNCHOUT_LIVE + 1, -1)) {
  const requester = pick(["U170", "U171", "U172"]);
  const o = ++orderSeq;
  for (let i = 0, n = int(1, 2); i < n; i++) {
    const it = item("LAB-CONS");
    addLine({ order: o, day, plant: "3010", supplier: "80001", group: "LAB-CONS", ...it, material: null, currency: "EUR", terms: 45, contract: null,
      requester, buyer: "U126", created_by: requester, channel: "punch-out", tags: ["S1"] });
  }
}
// The same buyers' call-offs after day -70 still carry the contract: the gap is the punch-out mapping.
for (const day of daysOf(4, PUNCHOUT_LIVE + 1, -1)) order({ day, plant: "3010", supplier: "80001", group: "LAB-CONS", channel: "contract call-off" });

// ---- scenario 2: Birmingham's buying profile carries a 14-day payment-terms key since day -75 --------------
const PROFILE_KEY_CHANGED = -75;
for (const l of lines) {
  if (l.created_by !== "U190" || l.day < PROFILE_KEY_CHANGED) continue;
  l.payment_terms_days = chance(0.16) ? null : 14;
  l.tags.add("S2");
}
// More orders of the profile in the last weeks (the indirect team's packaging and facility orders).
// Two of them in the last thirteen days: on 14-day terms they are not yet paid.
for (const day of [...daysOf(1, PROFILE_KEY_CHANGED, -14), ...daysOf(2, -13, -1)]) {
  const [supplier, group] = pick([["80002", "PACK-CARTON"], ["80003", "SVC-FM"]]);
  for (const l of order({ day, plant: "2010", supplier, group, channel: "contract call-off" })) {
    l.payment_terms_days = chance(0.16) ? null : 14;
    l.tags.add("S2");
  }
}

// ---- scenario 3: Duisburg's free-text form lets the material group stay empty since day -70 ------------------
const FORM_CHANGED = -70;
const FREE_TEXTS = [
  ["Hydraulic oil HLP 46, 20 l drum", "MRO-LUBE", 4, 95], ["Safety goggles, anti-fog, clear", "MRO-PPE", 20, 9], ["Angle grinder discs 125 mm, pack of 25", "MRO-TOOLS", 8, 32],
  ["Ball bearing 6205-2RS for conveyor drive", "MRO-SPARES", 20, 14], ["Industrial degreaser, 10 l canister", "CHEM-CLEAN", 6, 48], ["Stretch film 500 mm, 23 micron, 6 rolls", "PACK-FILM", 6, 14],
  ["Euro pallets, used, grade A", "PACK-PALLET", 120, 11], ["Copy paper A4 80 g, 5 reams", "OFFICE", 10, 23], ["Nitrile gloves size XL, box of 100", "MRO-PPE", 30, 9],
  ["Gear oil CLP 220 for gearbox, 20 l", "MRO-LUBE", 3, 130], ["V-belt SPA 1500 for fan drive", "MRO-SPARES", 10, 22], ["Cutting fluid concentrate, 20 l", "MRO-LUBE", 4, 110],
  ["Corrugated cartons 600x400x400 mm, 50 pieces", "PACK-CARTON", 4, 85], ["Torque wrench 20-100 Nm with case", "MRO-TOOLS", 2, 160], ["Earplugs, foam, box of 200", "MRO-PPE", 6, 24],
  ["Acetone, technical grade, 25 l", "CHEM", 4, 72], ["Hydraulic filter element 10 micron", "MRO-SPARES", 6, 70], ["Packing tape 50 mm, brown, 36 rolls", "PACK-FILM", 2, 75],
  ["Hi-vis vests, size L, 20 pieces", "MRO-PPE", 2, 120], ["Solenoid valve 24 V DC for cooling line", "MRO-SPARES", 3, 115], ["Multipurpose grease cartridges, 40 pieces", "MRO-LUBE", 2, 290],
  ["Epoxy resin kit, 10 kg, for floor repair", "CHEM", 3, 230], ["Cordless drill 18 V with two batteries", "MRO-TOOLS", 2, 260], ["Toner cartridge, black, for shift office printer", "OFFICE", 4, 95]
];
const MRO_1020 = [...serves].filter(([id, ps]) => ps.includes("1020") && supplierById.get(id).category === "MRO supplies" && !PORTAL.some((p) => p.id === id)).map(([id]) => id).sort(byId);
for (const l of lines) {
  if (l.plant === "1020" && l.channel === "free-text requisition" && l.day > FORM_CHANGED && chance(0.3)) { l.material_group = null; l.tags.add("S3"); }
}
for (const [i, [text, group, qty, price]] of FREE_TEXTS.entries()) {
  const day = int(FORM_CHANGED + 1, -1);
  const requester = pick(["U150", "U151", "U152", "U153", "U154"]);
  const supplier = group.startsWith("MRO") || group === "OFFICE" ? pick([...MRO_1020, "80004", "80004"]) : pick(["80004", ...MRO_1020]);
  addLine({ order: ++orderSeq, day, plant: "1020", supplier, group: null, material: null, short_text: text, quantity: qty * 4, unit: "EA", value: money(qty * 4 * price * uniform(0.9, 1.1)),
    currency: "EUR", terms: agreedTerms(supplier, "1000", null), requester, buyer: i % 3 ? "U123" : "U122", created_by: requester, channel: "free-text requisition", tags: ["S3"] });
}
// A few catalog items ordered through the same form: they have a material, whose master gives the group.
for (const day of daysOf(4, FORM_CHANGED + 1, -1)) {
  const supplier = pick(MRO_1020);
  const it = item(pick(["MRO-SPARES", "MRO-PPE"]));
  const requester = pick(["U150", "U151"]);
  addLine({ order: ++orderSeq, day, plant: "1020", supplier, ...it, group: null, currency: "EUR", terms: agreedTerms(supplier, "1000", null), requester, buyer: "U123", created_by: requester, channel: "free-text requisition", tags: ["S3"] });
}

// ---- scenario 4: Frankfurt's reorganisation on day -120 -------------------------------------------------------
// Requisition templates still name requesters who left in the reorganisation (DQ-05), and a new form
// lets the requester stay empty (DQ-04).
const REORG = -120;
const after1010 = lines.filter((l) => l.plant === "1010" && l.day > REORG && l.tags.size === 0 && !SERVICE(l.material_group || "x") && l.channel !== "direct order");
const ordersAfter = [...new Set(after1010.map((l) => l.order))];
const templateOrders = sample(ordersAfter, 6);
const emptyOrders = sample(ordersAfter.filter((o) => !templateOrders.includes(o)), 5);
for (const l of lines) {
  if (templateOrders.includes(l.order)) { l.requester = pick(["U143", "U144", "U145"]); l.tags.add("S4"); }
  if (emptyOrders.includes(l.order)) { l.requester = null; l.tags.add("S4"); }
}
// The template orders keep one requester per order.
for (const o of templateOrders) { const ls = lines.filter((l) => l.order === o); for (const l of ls) l.requester = ls[0].requester; }

// ---- scenario 5: the portal suppliers' orders, after onboarding ---------------------------------------------
for (const p of PORTAL) {
  const s = supplierById.get(p.id);
  for (const plant of p.plants) {
    const g = pick(CATEGORY_GROUPS[s.category]);
    for (const day of daysOf(int(2, 4), p.created_day + 3, -1)) order({ day, plant, supplier: p.id, group: g }).forEach((l) => l.tags.add("S5"));
  }
}

// ---- scenario 6: an interface load created a duplicate of an existing account ---------------------------------
// Same name, VAT ID, country and bank, created on day -150; blocked for purchasing on day -60 when
// someone noticed; the MRP interface at Duisburg still sends spare-part orders to it.
const dup = addSupplier({
  id: "80013", name: original.name, country: original.country, city: original.city, currency: original.currency, category: original.category,
  vat_id: original.vat_id, bank: { ...original.bank }, payment_terms: { 1000: original.payment_terms[1000] }, block_from: -60, created_day: -150, onboarding_channel: "migrated"
});
usedVat.add(dup.vat_id);
serves.set(dup.id, ["1020"]);
for (const day of [...daysOf(4, -149, -61), ...daysOf(5, -60, -2)]) {
  const it = item("MRO-SPARES");
  addLine({ order: ++orderSeq, day, plant: "1020", supplier: dup.id, ...it, currency: "EUR", terms: dup.payment_terms[1000], requester: "U151", buyer: "U123",
    created_by: "U191", channel: "direct order", tags: ["S6"] });
}

// ---- background exceptions, at low rates and outside the scenarios' groups ---------------------------------------
const untouched = (l) => l.tags.size === 0;
const pickLines = (pred, n) => sample(lines.filter((l) => untouched(l) && pred(l)), n);
// DQ-01: call-offs placed as direct orders, without the contract (Frankfurt and Duisburg).
for (const l of pickLines((l) => l.contract && ["1010", "1020"].includes(l.plant) && l.day < -3, 6)) { l.contract = null; l.channel = "direct order"; l.created_by = l.buyer; l.tags.add("B"); }
// DQ-02: a catalog item without its group (the master has one).
for (const l of pickLines((l) => l.material && ["1010", "2010", "3010"].includes(l.plant) && l.created_by !== "U190", 4)) { l.material_group = null; l.tags.add("B"); }
// DQ-03: a group that differs from the material master's.
const SIBLING = { "MRO-SPARES": "MRO-TOOLS", "MRO-TOOLS": "MRO-SPARES", "MRO-PPE": "MRO-TOOLS", "MRO-LUBE": "CHEM", "PACK-CARTON": "PACK-FILM", "PACK-FILM": "PACK-CARTON", CHEM: "CHEM-CLEAN", "CHEM-CLEAN": "CHEM" };
for (const l of pickLines((l) => l.material && SIBLING[l.material_group] && l.created_by !== "U190" && !l.contract && !contractFor(l.supplier, l.company_code, SIBLING[l.material_group], l.day), 6)) { l.material_group = SIBLING[l.material_group]; l.tags.add("B"); }
// DQ-04: requester empty or not a user, at other plants than Frankfurt.
const [r1, r2, r3] = pickLines((l) => ["1020", "2010", "3010"].includes(l.plant) && l.created_by !== "U190", 3);
r1.requester = null; r2.requester = "WAREHOUSE"; r3.requester = null;
for (const l of [r1, r2, r3]) l.tags.add("B");
// DQ-05: requesters who had left (Duisburg on day -60, Lyon on day -90).
for (const [plant, who, left] of [["1020", "U155", -60], ["3010", "U174", -90]]) {
  const [l] = pickLines((x) => x.plant === plant && x.day > left + 5, 1);
  l.requester = who;
  l.tags.add("B");
}
// DQ-06 and DQ-07 outside Birmingham: no terms, or shorter terms than agreed.
for (const l of pickLines((l) => l.company_code !== "2000", 3)) { l.payment_terms_days = null; l.tags.add("B"); }
for (const l of pickLines((l) => l.company_code !== "2000" && l.payment_terms_days >= 30, 3)) { l.payment_terms_days = l.payment_terms_days - 16; l.tags.add("B"); }
// DQ-15: two orders after day -90 that still reference the contract that expired then.
for (const l of pickLines((l) => l.supplier === kExpired.supplier && l.company_code === kExpired.company_code && l.material_group === kExpired.material_group && l.day > -90 && !l.contract, 2)) {
  l.contract = kExpired.id;
  l.channel = "contract call-off";
  l.tags.add("B");
}
// DQ-13: three materials without a group in the master, each with order lines.
const usedMaterials = [...new Set(lines.filter((l) => l.material && untouched(l)).map((l) => l.material))].sort(byId);
const materialSpend = (m) => lines.filter((l) => l.material === m).reduce((t, l) => t + l.value * FX[l.currency], 0);
const groupless = usedMaterials.filter((m) => lines.filter((l) => l.material === m).length >= 2 && !["MRO-SPARES", "LAB-CONS"].includes(matInfo.get(m).group))
  .sort((a, b) => materialSpend(b) - materialSpend(a) || byId(a, b)).slice(14, 17);
for (const m of groupless) materials.find((x) => x.id === m).material_group = null;
// Supplier level: an account ordered at Lyon without terms there (DQ-09), one with a malformed VAT ID
// (DQ-10), one without bank details (DQ-11), and one whose bank sits in Germany by design (DQ-11,
// dismissed in the log).
const small = (cat) => chosen.filter((s) => s.category === cat && s.id !== original.id && ![extMroUk, extItUk, extLogUk, extMroLyon].includes(s));
const secLyon = small("Security services").find((s) => s.payment_terms[1000] !== undefined);
serves.get(secLyon.id).push("3010");
for (const day of daysOf(3, -150, -5)) order({ day, plant: "3010", supplier: secLyon.id, group: "SVC-SEC" }).forEach((l) => l.tags.add("B"));
// The background supplier-level exceptions sit on two of the larger accounts (a logistics and a
// packaging account), so that the whole world's clean spend share lands near 75 %.
const spendOf = (sid) => lines.filter((l) => l.supplier === sid).reduce((t, l) => t + l.value * FX[l.currency], 0);
const largest = (cat, not = []) => small(cat).filter((s) => s.payment_terms[1000] !== undefined && !not.includes(s) && s.id !== kNoOwner.supplier && s.id !== kOwnerLeft.supplier)
  .sort((a, b) => spendOf(b.id) - spendOf(a.id) || byId(a.id, b.id))[0];
const vatBad = largest("Logistics services");
vatBad.vat_id = vatBad.vat_id.slice(0, -1);
const noBank = largest("Packaging", [vatBad]);
const foreignBank = largest("IT services", [vatBad, noBank]);
foreignBank.bank = { country: "IE", last4: foreignBank.bank.last4 };
noBank.bank = null;
const germanBank = chosen.find((s) => s.country === "CH" && ![noBank, vatBad, original, secLyon, foreignBank].includes(s)) || small("IT services").find((s) => s.country !== "DE" && ![noBank, vatBad, foreignBank].includes(s));
germanBank.bank = { country: "DE", last4: germanBank.bank.last4 };

// ---- order numbers: by day, then plant, supplier and order; items 10, 20, 30 --------------------------------------
const orderKeys = [...new Set(lines.map((l) => l.order))];
const firstLine = new Map();
for (const l of lines) if (!firstLine.has(l.order)) firstLine.set(l.order, l);
orderKeys.sort((a, b) => {
  const x = firstLine.get(a);
  const y = firstLine.get(b);
  return x.day - y.day || byId(x.plant, y.plant) || byId(x.supplier, y.supplier) || a - b;
});
const poOf = new Map(orderKeys.map((o, i) => [o, String(4500100001 + i)]));
const itemCount = new Map();
const poLines = lines.slice().sort((a, b) => orderKeys.indexOf(a.order) - orderKeys.indexOf(b.order) || a.key - b.key).map((l) => {
  const po = poOf.get(l.order);
  const n = (itemCount.get(po) || 0) + 10;
  itemCount.set(po, n);
  return {
    id: `${po}/${n}`, po, item: n, company_code: l.company_code, plant: l.plant, supplier: l.supplier, material: l.material, short_text: l.short_text,
    material_group: l.material_group, quantity: l.quantity, unit: l.unit, value: l.value, currency: l.currency, day: l.day, payment_terms_days: l.payment_terms_days,
    contract: l.contract, requester: l.requester, buyer: l.buyer, created_by: l.created_by, channel: l.channel
  };
});
const tagOf = new Map(lines.map((l) => [l, l.tags]));
const lineTags = new Map(poLines.map((pl, i) => [pl.id, null]));
{
  const sorted = lines.slice().sort((a, b) => orderKeys.indexOf(a.order) - orderKeys.indexOf(b.order) || a.key - b.key);
  sorted.forEach((l, i) => lineTags.set(poLines[i].id, [...tagOf.get(l)].sort()));
}

// ---- the world without its log ----------------------------------------------------------------------------
suppliers.sort((a, b) => byId(a.id, b.id));
const world = {
  meta: {
    name: "GlobalCorp SE", note: "Fictional company, no client data. Every company, account, person and figure here is invented.",
    world_version: WORLD_VERSION, seed: SEED, built_by: "tools/build_world.mjs", base: "tools/globalcorp_base.mjs", today: 0, window_days: PARAMS.window_days,
    log_from_day: LOG_FROM, fx_to_eur: FX, fx_source: FX_SOURCE, rule_set_version: RULE_SET_VERSION, planned_corrections: []
  },
  company_codes: COMPANY_CODES.map((c) => ({ ...c })),
  plants: PLANTS.map((p) => ({ ...p })),
  taxonomy: TAXONOMY.map((t) => ({ ...t })),
  users,
  suppliers,
  materials,
  contracts: contracts.slice().sort((a, b) => byId(a.id, b.id)),
  po_lines: poLines,
  exception_log: []
};

// ---- the exception log: 26 weeks, consistent with the data ------------------------------------------------------
// Built from a scan of the finished data: every exception the scan finds either sits in the log as a
// live entry (routed, open or accepted) or is new today; the history behind the closure rate is made
// of closed and dismissed entries on records that are clean today; three entries are "planned
// corrections": routed, but their records were corrected since, so the first scan closes them.
const found = scan(world, { day: 0 }).exceptions;
const lineById = new Map(poLines.map((l) => [l.id, l]));
const log = [];
let logSeq = 0;
const entry = (e) => { const x = { id: `H${String(++logSeq).padStart(4, "0")}`, responsible: null, routed_to: null, routed_day: null, closed_day: null, reason: null, reopens: null, ...e }; log.push(x); return x; };
const firstDayOf = (e) => {
  // The day a daily scan would first have found it: the day after its earliest line (or after the
  // supplier was created, for the duplicate pair).
  const days = e.lines.map((id) => lineById.get(id).day);
  let d = Math.min(...days) + 1;
  if (e.rule === "DQ-12") d = Math.max(...e.record.pair.map((s) => supplierById.get(s).created_day)) + 1;
  if (e.rule === "DQ-14") d = Math.max(d, (userById.get(contracts.find((k) => k.id === e.record.id)?.owner)?.active_until ?? d - 1) + 1);
  return Math.max(d, LOG_FROM);
};
const scenarioOf = (e) => {
  const tags = new Set(e.lines.flatMap((id) => lineTags.get(id) || []));
  if (e.rule === "DQ-12" || e.rule === "DQ-08") return "S6";
  if (["DQ-09", "DQ-10", "DQ-11"].includes(e.rule)) return supplierById.get(e.record.supplier || e.record.id)?.onboarding_channel === "self-registration portal" ? "S5" : "B";
  for (const t of ["S1", "S2", "S3", "S4"]) if (tags.has(t)) return t;
  return "B";
};
const dismissed = new Set();
// The dismissed exception: a bank in Germany by design.
const dismissedId = `DQ-11|${germanBank.id}`;
for (const e of found) {
  if (e.id === dismissedId) {
    const d = firstDayOf(e);
    entry({ rule: e.rule, record: e.record.id, detected_day: d, routed_day: d + 1, responsible: e.responsible, routed_to: e.routed_to, status: "dismissed", closed_day: d + 6,
      reason: "The account's bank sits in Germany by design (confirmed with the supplier)." });
    dismissed.add(e.id);
    continue;
  }
  const d = firstDayOf(e);
  const sc = scenarioOf(e);
  const fresh = sc === "B" ? d > -4 : d > -14;
  if (fresh) continue; // new at the first scan
  const routed = d + int(1, 3);
  let status = routed <= -1 ? "routed" : "open";
  if (sc === "B" && chance(0.15)) status = "open";
  const x = entry({ rule: e.rule, record: e.record.id, detected_day: d, routed_day: status === "open" ? null : routed, responsible: e.responsible, routed_to: e.routed_to, status });
  // The accepted risk: the contract whose owner left, until its renewal.
  if (e.rule === "DQ-14" && e.record.id === kOwnerLeft.id) Object.assign(x, { status: "accepted", routed_day: x.routed_day ?? d + 1, reason: "Accepted until the contract's renewal; the new owner takes over then." });
}
// One reopened exception: a background exception that was corrected, closed, and came back (someone
// changed the record again); its live entry links to the closed one.
{
  const back = log.find((x) => x.status === "routed" && scenarioOf(found.find((e) => e.id === `${x.rule}|${x.record}`)) === "B" && x.detected_day <= -60 && lineById.has(x.record));
  if (back) {
    const first = back.detected_day;
    const closedOn = first + int(5, 12);
    const old = entry({ rule: back.rule, record: back.record, detected_day: first, routed_day: first + 1, responsible: back.responsible, routed_to: back.routed_to, status: "closed", closed_day: closedOn, reason: null });
    back.detected_day = closedOn + int(8, 20);
    back.routed_day = back.detected_day + 1;
    back.reopens = old.id;
  }
}
// History: closed and dismissed entries on records that are clean today, about fourteen a week.
const flagged = new Set(found.flatMap((e) => e.lines));
const cleanLines = poLines.filter((l) => !flagged.has(l.id) && l.day >= LOG_FROM - 1 && l.day <= -3);
const HISTORY_RULES = [["DQ-01", 22], ["DQ-02", 18], ["DQ-03", 10], ["DQ-04", 12], ["DQ-05", 4], ["DQ-06", 8], ["DQ-07", 14], ["DQ-08", 2], ["DQ-15", 3]];
const taken = new Set(log.map((x) => `${x.rule}|${x.record}`));
const historyDays = [];
for (let w = 0; w < 26; w++) for (let k = 0, n = int(17, 23); k < n; k++) historyDays.push(-1 - 7 * w - int(0, 6));
historyDays.sort((a, b) => a - b);
for (const target of historyDays) {
  const rule = (() => { const total = HISTORY_RULES.reduce((t, [, wgt]) => t + wgt, 0); let r = rnd.random() * total; for (const [id, wgt] of HISTORY_RULES) { r -= wgt; if (r < 0) return id; } return "DQ-01"; })();
  const candidates = cleanLines.filter((l) => l.day < target && l.day >= target - 6 && !taken.has(`${rule}|${l.id}`));
  if (!candidates.length) continue;
  const l = pick(candidates);
  const d = Math.max(l.day + 1, LOG_FROM);
  const routed = d + int(1, 3);
  const r = rnd.random();
  const days = r < 0.66 ? int(2, 14) : r < 0.92 ? int(15, 40) : null;
  let close = days === null ? routed + int(1, 6) : routed + days;
  if (close > -1) continue; // still open today: not part of the history
  const responsible = rule === "DQ-05" ? (userById.get(l.requester)?.manager ?? "U101") : rule === "DQ-03" ? "U103" : l.buyer;
  const routedTo = activeOn(responsible, 0) ? responsible : activeOn(userById.get(responsible)?.manager, 0) ? userById.get(responsible).manager : "U101";
  entry({ rule, record: l.id, detected_day: d, routed_day: routed, responsible, routed_to: routedTo, status: days === null ? "dismissed" : "closed", closed_day: close,
    reason: days === null ? pick(["Correct as ordered: agreed with the requester.", "Not an error: a one-off order outside the contract's scope.", "Duplicate finding of another exception."]) : null });
  taken.add(`${rule}|${l.id}`);
}
// Supplier-level history: a few closed entries on accounts that are clean today.
const cleanSuppliers = chosen.filter((s) => !found.some((e) => (e.record.supplier || e.record.id) === s.id || e.record.pair?.includes(s.id)));
for (const [rule, n] of [["DQ-10", 3], ["DQ-11", 3], ["DQ-09", 2], ["DQ-12", 2]]) {
  for (const s of sample(cleanSuppliers, n)) {
    const d = int(LOG_FROM, -30);
    const other = rule === "DQ-12" ? pick(cleanSuppliers.filter((x) => x.id !== s.id && x.category === s.category)) : null;
    const key = rule === "DQ-09" ? `${s.id}@${Object.keys(s.payment_terms)[0]}` : rule === "DQ-12" ? [s.id, other.id].sort(byId).join("+") : s.id;
    entry({ rule, record: key, detected_day: d, routed_day: d + 1, responsible: "U102", routed_to: "U102", status: "closed", closed_day: d + int(3, 20) });
  }
}
// Planned corrections: routed entries whose records were corrected since; the first scan closes them.
const corrections = [];
for (const [rule, pred] of [["DQ-01", (l) => l.contract && l.day <= -20 && l.day >= -60], ["DQ-02", (l) => l.material_group && l.day <= -20 && l.day >= -60], ["DQ-07", (l) => l.payment_terms_days && l.day <= -20 && l.day >= -60]]) {
  const l = pick(cleanLines.filter((x) => pred(x) && !taken.has(`${rule}|${x.id}`)));
  const d = l.day + 1;
  corrections.push(entry({ rule, record: l.id, detected_day: d, routed_day: d + 1, responsible: l.buyer, routed_to: activeOn(l.buyer, 0) ? l.buyer : userById.get(l.buyer).manager, status: "routed" }).id);
  taken.add(`${rule}|${l.id}`);
}
log.sort((a, b) => a.detected_day - b.detected_day || byId(a.rule, b.rule) || byId(a.record, b.record));
// Number the entries in time order; links (reopens) follow the new ids.
const renumber = new Map(log.map((x, i) => [x.id, `H${String(i + 1).padStart(4, "0")}`]));
for (const x of log) { x.id = renumber.get(x.id); if (x.reopens) x.reopens = renumber.get(x.reopens); }
world.exception_log = log.map((x) => ({ id: x.id, rule: x.rule, record: x.record, detected_day: x.detected_day, routed_day: x.routed_day, responsible: x.responsible, routed_to: x.routed_to, status: x.status, closed_day: x.closed_day, reason: x.reason, reopens: x.reopens }));
world.meta.planned_corrections = corrections.map((id) => renumber.get(id)).sort(byId);

// ---- checks before writing: the builder refuses a world that breaks its own promises ---------------------------
function assertWorld(cond, what) { if (!cond) throw new Error(`world: ${what}`); }
for (const s of world.suppliers) {
  if (!s.vat_id) continue;
  const country = s.country;
  assertWorld(passesCheckDigit(country, s.vat_id) !== true, `${s.id} ${s.vat_id} passes its country's check digit`);
}
const vatSeen = new Map();
for (const s of world.suppliers) {
  const v = normaliseVat(s.vat_id);
  if (!v) continue;
  if (vatSeen.has(v)) assertWorld([vatSeen.get(v), s.id].sort().join() === [original.id, dup.id].sort().join(), `${s.id} shares VAT ID ${v} with ${vatSeen.get(v)}`);
  vatSeen.set(v, s.id);
}
const names = new Map();
for (const s of world.suppliers) {
  const k = `${s.country}|${normaliseName(s.name)}`;
  if (names.has(k)) assertWorld([names.get(k), s.id].sort().join() === [original.id, dup.id].sort().join(), `${s.id} repeats the name of ${names.get(k)}`);
  names.set(k, s.id);
}
assertWorld(world.suppliers.filter((s) => s.origin === "Rebate Hunter").length === 124, "the 124 accounts of the base");

// ---- output ---------------------------------------------------------------------------------------------
/** data/world.js: one record per line, so a diff shows what changed. */
function serialise(w) {
  const rows = (list) => `[\n${list.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`;
  const parts = Object.entries(w).map(([k, v]) => `  ${JSON.stringify(k)}: ${Array.isArray(v) ? rows(v) : JSON.stringify(v)}`);
  return `// Generated by tools/build_world.mjs (seed ${SEED}); do not edit by hand. GlobalCorp SE and everything in\n// it are fictional: no client data, no real person. Day numbers are relative to today (day 0).\nwindow.WORLD = {\n${parts.join(",\n")}\n};\n`;
}
export function build() { return world; }
export const text = serialise(world);

const args = process.argv.slice(2);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, "data", "world.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`${path.relative(ROOT, out) || out}: ${world.po_lines.length} order lines, ${world.suppliers.length} suppliers (${new Set(world.po_lines.map((l) => l.supplier)).size} with lines), ${world.materials.length} materials, ${world.contracts.length} contracts, ${world.users.length} users, ${world.exception_log.length} log entries, ${Buffer.byteLength(text)} bytes`);
  if (args.includes("--freeze")) {
    const { freezeReferences } = await import("../js/world_check.js");
    const refs = freezeReferences(world);
    const file = path.join(ROOT, "data", "reference_cases.js");
    fs.writeFileSync(file, `// Frozen reference figures of the world and its six scenarios, written by tools/build_world.mjs --freeze\n// from the engine's results on data/world.js. tools/check_world.mjs and Diagnostics recompute them and\n// compare: a change to the world or the engine that moves a figure fails until the figures are frozen\n// again on purpose.\nwindow.REFERENCE_CASES = ${JSON.stringify(refs, null, 2)};\n`);
    console.log(`data/reference_cases.js: ${Object.keys(refs.cases).length} scenarios frozen; clean spend share ${(refs.world.clean_share * 100).toFixed(1)}%`);
  }
}
