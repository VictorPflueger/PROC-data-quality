// Frozen reference figures of the world and its six scenarios, written by tools/build_world.mjs --freeze
// from the engine's results on data/world.js. tools/check_world.mjs and Diagnostics recompute them and
// compare: a change to the world or the engine that moves a figure fails until the figures are frozen
// again on purpose.
window.REFERENCE_CASES = {
  "world_version": "1.0.0",
  "seed": 1911,
  "rule_set_version": "1.0.0",
  "world": {
    "lines": 2052,
    "suppliers": 139,
    "suppliers_with_lines": 76,
    "base_accounts_with_lines": 61,
    "materials": 292,
    "contracts": 24,
    "users": 48,
    "log_entries": 648,
    "spend_window_eur": 8432005.400546117,
    "clean_spend_eur": 6340105.242286629,
    "clean_share": 0.7519095329179935,
    "open_spend_eur": 2091900.1582594877,
    "exceptions": 164,
    "by_rule": {
      "DQ-02": 40,
      "DQ-01": 36,
      "DQ-07": 24,
      "DQ-05": 16,
      "DQ-04": 10,
      "DQ-03": 6,
      "DQ-11": 6,
      "DQ-06": 5,
      "DQ-08": 5,
      "DQ-10": 5,
      "DQ-09": 4,
      "DQ-13": 3,
      "DQ-14": 2,
      "DQ-12": 1,
      "DQ-15": 1
    },
    "by_severity": {
      "high": 74,
      "medium": 84,
      "low": 6
    },
    "financing_cost_eur": 3614.3349141470726,
    "financing_cost_unpaid_eur": 1373.846488040548,
    "closure_rate_before": {
      "value": 0.5670995670995671,
      "closed": 131,
      "eligible": 231
    },
    "closure_rate_after": {
      "value": 0.5800865800865801,
      "closed": 134,
      "eligible": 231
    },
    "cohorts": [
      {
        "week": 1,
        "detected": 33,
        "closed": 13,
        "open": 18,
        "dismissed": 2
      },
      {
        "week": 2,
        "detected": 23,
        "closed": 12,
        "open": 7,
        "dismissed": 4
      },
      {
        "week": 3,
        "detected": 34,
        "closed": 18,
        "open": 13,
        "dismissed": 3
      },
      {
        "week": 4,
        "detected": 34,
        "closed": 16,
        "open": 17,
        "dismissed": 1
      },
      {
        "week": 5,
        "detected": 38,
        "closed": 22,
        "open": 15,
        "dismissed": 1
      },
      {
        "week": 6,
        "detected": 27,
        "closed": 17,
        "open": 9,
        "dismissed": 1
      },
      {
        "week": 7,
        "detected": 29,
        "closed": 16,
        "open": 12,
        "dismissed": 1
      },
      {
        "week": 8,
        "detected": 29,
        "closed": 17,
        "open": 9,
        "dismissed": 3
      }
    ]
  },
  "first_scan": {
    "still": 145,
    "closed": [
      "H0475",
      "H0546",
      "H0565"
    ],
    "fresh": 19,
    "open_after": 164
  },
  "cases": {
    "SC-PUNCHOUT": {
      "base": 30,
      "base_spend_eur": 29281.039999999997,
      "top_group": "punch-out",
      "group": {
        "count": 30,
        "share": 1,
        "spend_eur": 29281.039999999997
      },
      "n": 30,
      "spend_eur": 29281.039999999997,
      "financing_cost_eur": 0,
      "unpaid_cost_eur": 0,
      "suggestions": 30,
      "routed_to": {
        "U126": 30
      },
      "history": {
        "closed": 75,
        "eligible": 133
      },
      "inflow_per_month": 9,
      "paths": {
        "A": {
          "applicable": true,
          "closed": 30,
          "spend_covered_eur": 29281.039999999997,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 750,
          "days": 5,
          "prevents_after_days": null
        },
        "B": {
          "applicable": true,
          "closed": 16,
          "spend_covered_eur": 15616.554666666665,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 1050,
          "days": 14,
          "prevents_after_days": null
        },
        "C": {
          "applicable": true,
          "closed": 30,
          "spend_covered_eur": 29281.039999999997,
          "avoided_now_eur": 0,
          "prevented_per_year": 108,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4350,
          "days": 5,
          "prevents_after_days": 20
        },
        "D": {
          "applicable": true,
          "closed": 16,
          "spend_covered_eur": 15616.554666666665,
          "avoided_now_eur": 0,
          "prevented_per_year": 108,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4650,
          "days": 14,
          "prevents_after_days": 20
        },
        "nothing": {
          "applicable": true,
          "closed": 0,
          "spend_covered_eur": 0,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 0,
          "days": null,
          "prevents_after_days": null,
          "gains_per_year": 108,
          "gains_cost_eur_per_year": 0,
          "past_cost_eur": 0
        }
      },
      "exceptions": [
        "DQ-01|4500101060/10",
        "DQ-01|4500101060/20",
        "DQ-01|4500101079/10",
        "DQ-01|4500101079/20",
        "DQ-01|4500101086/10",
        "DQ-01|4500101086/20",
        "DQ-01|4500101123/10",
        "DQ-01|4500101160/10",
        "DQ-01|4500101166/10",
        "DQ-01|4500101166/20",
        "DQ-01|4500101173/10",
        "DQ-01|4500101180/10",
        "DQ-01|4500101180/20",
        "DQ-01|4500101181/10",
        "DQ-01|4500101181/20",
        "DQ-01|4500101219/10",
        "DQ-01|4500101219/20",
        "DQ-01|4500101230/10",
        "DQ-01|4500101230/20",
        "DQ-01|4500101239/10",
        "DQ-01|4500101264/10",
        "DQ-01|4500101275/10",
        "DQ-01|4500101275/20",
        "DQ-01|4500101276/10",
        "DQ-01|4500101276/20",
        "DQ-01|4500101282/10",
        "DQ-01|4500101282/20",
        "DQ-01|4500101330/10",
        "DQ-01|4500101336/10",
        "DQ-01|4500101336/20"
      ]
    },
    "SC-EARLY-PAY": {
      "base": 23,
      "base_spend_eur": 475350.43962635996,
      "top_group": "U190",
      "group": {
        "count": 23,
        "share": 1,
        "spend_eur": 475350.43962635996
      },
      "n": 23,
      "spend_eur": 475350.43962635996,
      "financing_cost_eur": 3481.5253809963883,
      "unpaid_cost_eur": 1373.846488040548,
      "suggestions": 23,
      "routed_to": {
        "U124": 18,
        "U125": 5
      },
      "history": {
        "closed": 79,
        "eligible": 124
      },
      "inflow_per_month": 5.666666666666667,
      "paths": {
        "A": {
          "applicable": true,
          "closed": 23,
          "spend_covered_eur": 475350.43962635996,
          "avoided_now_eur": 1373.846488040548,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 715,
          "days": 5,
          "prevents_after_days": null
        },
        "B": {
          "applicable": true,
          "closed": 14,
          "spend_covered_eur": 289343.7458595235,
          "avoided_now_eur": 836.2543840246814,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 875,
          "days": 14,
          "prevents_after_days": null
        },
        "C": {
          "applicable": true,
          "closed": 23,
          "spend_covered_eur": 475350.43962635996,
          "avoided_now_eur": 1373.846488040548,
          "prevented_per_year": 68,
          "future_avoided_eur_per_year": 10293.205474250191,
          "effort_eur": 4315,
          "days": 5,
          "prevents_after_days": 20
        },
        "D": {
          "applicable": true,
          "closed": 14,
          "spend_covered_eur": 289343.7458595235,
          "avoided_now_eur": 836.2543840246814,
          "prevented_per_year": 68,
          "future_avoided_eur_per_year": 10293.205474250191,
          "effort_eur": 4475,
          "days": 14,
          "prevents_after_days": 20
        },
        "nothing": {
          "applicable": true,
          "closed": 0,
          "spend_covered_eur": 0,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 0,
          "days": null,
          "prevents_after_days": null,
          "gains_per_year": 68,
          "gains_cost_eur_per_year": 10293.205474250191,
          "past_cost_eur": 3481.5253809963883
        }
      },
      "exceptions": [
        "DQ-06|4500101125/30",
        "DQ-06|4500101179/10",
        "DQ-07|4500101077/10",
        "DQ-07|4500101078/10",
        "DQ-07|4500101125/10",
        "DQ-07|4500101125/20",
        "DQ-07|4500101157/10",
        "DQ-07|4500101168/10",
        "DQ-07|4500101168/20",
        "DQ-07|4500101172/10",
        "DQ-07|4500101204/10",
        "DQ-07|4500101205/10",
        "DQ-07|4500101205/20",
        "DQ-07|4500101205/30",
        "DQ-07|4500101224/10",
        "DQ-07|4500101249/10",
        "DQ-07|4500101318/10",
        "DQ-07|4500101318/20",
        "DQ-07|4500101318/30",
        "DQ-07|4500101329/10",
        "DQ-07|4500101335/10",
        "DQ-07|4500101335/20",
        "DQ-07|4500101345/10"
      ]
    },
    "SC-UNCLASSIFIED": {
      "base": 36,
      "base_spend_eur": 65642.38,
      "top_group": "free-text requisition",
      "group": {
        "count": 36,
        "share": 1,
        "spend_eur": 65642.38
      },
      "n": 36,
      "spend_eur": 65642.38,
      "financing_cost_eur": 0,
      "unpaid_cost_eur": 0,
      "suggestions": 4,
      "routed_to": {
        "U123": 20,
        "U122": 16
      },
      "history": {
        "closed": 71,
        "eligible": 132
      },
      "inflow_per_month": 11.333333333333334,
      "paths": {
        "A": {
          "applicable": true,
          "closed": 4,
          "spend_covered_eur": 4428.66,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 620.0000000000001,
          "days": 5,
          "prevents_after_days": null
        },
        "B": {
          "applicable": true,
          "closed": 19,
          "spend_covered_eur": 34644.58944444445,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 1200,
          "days": 14,
          "prevents_after_days": null
        },
        "C": {
          "applicable": true,
          "closed": 4,
          "spend_covered_eur": 4428.66,
          "avoided_now_eur": 0,
          "prevented_per_year": 136,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4220,
          "days": 5,
          "prevents_after_days": 20
        },
        "D": {
          "applicable": true,
          "closed": 19,
          "spend_covered_eur": 34644.58944444445,
          "avoided_now_eur": 0,
          "prevented_per_year": 136,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4800,
          "days": 14,
          "prevents_after_days": 20
        },
        "nothing": {
          "applicable": true,
          "closed": 0,
          "spend_covered_eur": 0,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 0,
          "days": null,
          "prevents_after_days": null,
          "gains_per_year": 136,
          "gains_cost_eur_per_year": 0,
          "past_cost_eur": 0
        }
      },
      "exceptions": [
        "DQ-02|4500101059/10",
        "DQ-02|4500101062/10",
        "DQ-02|4500101065/10",
        "DQ-02|4500101075/10",
        "DQ-02|4500101094/10",
        "DQ-02|4500101097/10",
        "DQ-02|4500101098/10",
        "DQ-02|4500101115/10",
        "DQ-02|4500101119/10",
        "DQ-02|4500101129/30",
        "DQ-02|4500101141/10",
        "DQ-02|4500101142/10",
        "DQ-02|4500101148/10",
        "DQ-02|4500101153/10",
        "DQ-02|4500101155/10",
        "DQ-02|4500101176/10",
        "DQ-02|4500101177/10",
        "DQ-02|4500101182/10",
        "DQ-02|4500101185/10",
        "DQ-02|4500101186/10",
        "DQ-02|4500101188/10",
        "DQ-02|4500101202/10",
        "DQ-02|4500101218/10",
        "DQ-02|4500101234/10",
        "DQ-02|4500101238/10",
        "DQ-02|4500101253/10",
        "DQ-02|4500101263/10",
        "DQ-02|4500101263/20",
        "DQ-02|4500101268/10",
        "DQ-02|4500101271/10",
        "DQ-02|4500101279/10",
        "DQ-02|4500101291/10",
        "DQ-02|4500101313/10",
        "DQ-02|4500101321/10",
        "DQ-02|4500101322/10",
        "DQ-02|4500101334/10"
      ]
    },
    "SC-REQUESTER": {
      "base": 26,
      "base_spend_eur": 68859.90999999999,
      "top_group": "1010",
      "group": {
        "count": 21,
        "share": 0.8076923076923077,
        "spend_eur": 61636.31999999999
      },
      "n": 21,
      "spend_eur": 61636.31999999999,
      "financing_cost_eur": 0,
      "unpaid_cost_eur": 0,
      "suggestions": 0,
      "routed_to": {
        "U101": 9,
        "U120": 6,
        "U110": 5,
        "U121": 1
      },
      "history": {
        "closed": 47,
        "eligible": 80
      },
      "inflow_per_month": 6.666666666666667,
      "paths": {
        "A": {
          "applicable": false,
          "closed": null,
          "spend_covered_eur": null,
          "avoided_now_eur": null,
          "prevented_per_year": null,
          "future_avoided_eur_per_year": null,
          "effort_eur": null,
          "days": null,
          "prevents_after_days": null
        },
        "B": {
          "applicable": true,
          "closed": 12,
          "spend_covered_eur": 35220.754285714276,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 825,
          "days": 14,
          "prevents_after_days": null
        },
        "C": {
          "applicable": false,
          "closed": null,
          "spend_covered_eur": null,
          "avoided_now_eur": null,
          "prevented_per_year": null,
          "future_avoided_eur_per_year": null,
          "effort_eur": null,
          "days": null,
          "prevents_after_days": null
        },
        "D": {
          "applicable": true,
          "closed": 12,
          "spend_covered_eur": 35220.754285714276,
          "avoided_now_eur": 0,
          "prevented_per_year": 80,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4425,
          "days": 14,
          "prevents_after_days": 20
        },
        "nothing": {
          "applicable": true,
          "closed": 0,
          "spend_covered_eur": 0,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 0,
          "days": null,
          "prevents_after_days": null,
          "gains_per_year": 80,
          "gains_cost_eur_per_year": 0,
          "past_cost_eur": 0
        }
      },
      "exceptions": [
        "DQ-04|4500100928/10",
        "DQ-04|4500100928/20",
        "DQ-04|4500101017/10",
        "DQ-04|4500101049/10",
        "DQ-04|4500101049/20",
        "DQ-04|4500101232/10",
        "DQ-04|4500101312/10",
        "DQ-05|4500100874/10",
        "DQ-05|4500100874/20",
        "DQ-05|4500100874/30",
        "DQ-05|4500100950/10",
        "DQ-05|4500100950/20",
        "DQ-05|4500100997/10",
        "DQ-05|4500100997/20",
        "DQ-05|4500100997/30",
        "DQ-05|4500101054/10",
        "DQ-05|4500101083/10",
        "DQ-05|4500101083/20",
        "DQ-05|4500101349/10",
        "DQ-05|4500101349/20",
        "DQ-05|4500101349/30"
      ]
    },
    "SC-ONBOARDING": {
      "base": 15,
      "base_spend_eur": 801995.51,
      "top_group": "self-registration portal",
      "group": {
        "count": 11,
        "share": 0.7333333333333333,
        "spend_eur": 81454.72000000002
      },
      "n": 11,
      "spend_eur": 81454.72000000002,
      "financing_cost_eur": 0,
      "unpaid_cost_eur": 0,
      "suggestions": 0,
      "routed_to": {
        "U102": 11
      },
      "history": {
        "closed": 4,
        "eligible": 20
      },
      "inflow_per_month": 3,
      "paths": {
        "A": {
          "applicable": false,
          "closed": null,
          "spend_covered_eur": null,
          "avoided_now_eur": null,
          "prevented_per_year": null,
          "future_avoided_eur_per_year": null,
          "effort_eur": null,
          "days": null,
          "prevents_after_days": null
        },
        "B": {
          "applicable": true,
          "closed": 2,
          "spend_covered_eur": 14809.949090909095,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 575,
          "days": 14,
          "prevents_after_days": null
        },
        "C": {
          "applicable": false,
          "closed": null,
          "spend_covered_eur": null,
          "avoided_now_eur": null,
          "prevented_per_year": null,
          "future_avoided_eur_per_year": null,
          "effort_eur": null,
          "days": null,
          "prevents_after_days": null
        },
        "D": {
          "applicable": true,
          "closed": 2,
          "spend_covered_eur": 14809.949090909095,
          "avoided_now_eur": 0,
          "prevented_per_year": 36,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4175,
          "days": 14,
          "prevents_after_days": 20
        },
        "nothing": {
          "applicable": true,
          "closed": 0,
          "spend_covered_eur": 0,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 0,
          "days": null,
          "prevents_after_days": null,
          "gains_per_year": 36,
          "gains_cost_eur_per_year": 0,
          "past_cost_eur": 0
        }
      },
      "exceptions": [
        "DQ-09|80006@3000",
        "DQ-09|80009@3000",
        "DQ-09|80012@3000",
        "DQ-10|80005",
        "DQ-10|80008",
        "DQ-10|80009",
        "DQ-10|80011",
        "DQ-11|80005",
        "DQ-11|80007",
        "DQ-11|80010",
        "DQ-11|80012"
      ]
    },
    "SC-DUPLICATE": {
      "base": 6,
      "base_spend_eur": 55270.45999999998,
      "top_group": "80013",
      "group": {
        "count": 6,
        "share": 1,
        "spend_eur": 55270.45999999998
      },
      "n": 6,
      "spend_eur": 55270.45999999998,
      "financing_cost_eur": 0,
      "unpaid_cost_eur": 0,
      "suggestions": 0,
      "routed_to": {
        "U123": 5,
        "U102": 1
      },
      "history": {
        "closed": 5,
        "eligible": 16
      },
      "inflow_per_month": 1.6666666666666667,
      "paths": {
        "A": {
          "applicable": false,
          "closed": null,
          "spend_covered_eur": null,
          "avoided_now_eur": null,
          "prevented_per_year": null,
          "future_avoided_eur_per_year": null,
          "effort_eur": null,
          "days": null,
          "prevents_after_days": null
        },
        "B": {
          "applicable": true,
          "closed": 1,
          "spend_covered_eur": 9211.74333333333,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 450,
          "days": 14,
          "prevents_after_days": null
        },
        "C": {
          "applicable": false,
          "closed": null,
          "spend_covered_eur": null,
          "avoided_now_eur": null,
          "prevented_per_year": null,
          "future_avoided_eur_per_year": null,
          "effort_eur": null,
          "days": null,
          "prevents_after_days": null
        },
        "D": {
          "applicable": true,
          "closed": 1,
          "spend_covered_eur": 9211.74333333333,
          "avoided_now_eur": 0,
          "prevented_per_year": 20,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 4050,
          "days": 14,
          "prevents_after_days": 20
        },
        "nothing": {
          "applicable": true,
          "closed": 0,
          "spend_covered_eur": 0,
          "avoided_now_eur": 0,
          "prevented_per_year": 0,
          "future_avoided_eur_per_year": 0,
          "effort_eur": 0,
          "days": null,
          "prevents_after_days": null,
          "gains_per_year": 20,
          "gains_cost_eur_per_year": 0,
          "past_cost_eur": 0
        }
      },
      "exceptions": [
        "DQ-08|4500101144/10",
        "DQ-08|4500101145/10",
        "DQ-08|4500101216/10",
        "DQ-08|4500101223/10",
        "DQ-08|4500101244/10",
        "DQ-12|30041+80013"
      ]
    }
  }
};
