// GlobalCorp SE as the procurement prototypes share it: company codes, plants, supplier accounts and
// the material-group taxonomy. Plain data, no code. The Data Quality Agent defines this file (decision
// N1); the Price Variance Agent copies it unchanged, and each prototype builds its own world on top.
//
// The accounts come from Rebate Hunter's data/world.js at commit 73c00f8: the 143 vendor accounts
// that belong to none of its five real corporate groups (neither by group key nor as members in its
// subscription register), less the 19 accounts that repeat a normalised name in the same country:
// of each such group the account with the lowest id is kept, so that duplicates appear only where a
// scenario plants one. Ids, names, cities, countries, currencies, categories and home company codes
// are Rebate Hunter's; tests/world.mjs re-derives the list from a Rebate Hunter checkout when one sits
// next to this repository. Everything here is fictional.

export const COMPANY_CODES = Object.freeze([
  {
    "id": "1000",
    "name": "GlobalCorp SE",
    "city": "Frankfurt am Main",
    "country": "DE",
    "currency": "EUR"
  },
  {
    "id": "2000",
    "name": "GlobalCorp UK Ltd",
    "city": "Birmingham",
    "country": "GB",
    "currency": "GBP"
  },
  {
    "id": "3000",
    "name": "GlobalCorp France SAS",
    "city": "Lyon",
    "country": "FR",
    "currency": "EUR"
  }
]);

export const PLANTS = Object.freeze([
  {
    "id": "1010",
    "name": "Frankfurt",
    "company_code": "1000",
    "role": "headquarters site and central warehouse"
  },
  {
    "id": "1020",
    "name": "Duisburg",
    "company_code": "1000",
    "role": "production"
  },
  {
    "id": "2010",
    "name": "Birmingham",
    "company_code": "2000",
    "role": "UK operations"
  },
  {
    "id": "3010",
    "name": "Lyon",
    "company_code": "3000",
    "role": "French operations"
  }
]);

/** The 124 supplier accounts, in id order. */
export const ACCOUNTS = Object.freeze([
  {"id":"30008","name":"Inno IT-Services AG","city":"Paris","country":"FR","currency":"EUR","category":"IT services","company_code":"3000"},
  {"id":"30009","name":"Chroma Robotics AG","city":"Amsterdam","country":"NL","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30010","name":"Vanguard Facility S.A.","city":"Zurich","country":"CH","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30011","name":"Chroma Logistics S.A.","city":"Madrid","country":"ES","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30012","name":"Sino IT-Services Ltd","city":"Madrid","country":"ES","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30013","name":"Nova Security GmbH","city":"Stuttgart","country":"DE","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30014","name":"Global Logistics AG","city":"Berlin","country":"DE","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30015","name":"Stellar Logistics S.A.","city":"Zurich","country":"CH","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30016","name":"Global Security S.A.","city":"Berlin","country":"DE","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30017","name":"Inno Consulting GmbH","city":"Vienna","country":"AT","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30018","name":"Global Security Ltd","city":"Milan","country":"IT","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30019","name":"Stellar Security S.A.","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30020","name":"Global Consulting S.A.","city":"Stuttgart","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30021","name":"Chroma Logistics AG","city":"Zurich","country":"CH","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30022","name":"Global Robotics S.A.","city":"Hamburg","country":"DE","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30023","name":"Vanguard Facility AG","city":"Paris","country":"FR","currency":"EUR","category":"Facility management","company_code":"3000"},
  {"id":"30024","name":"Chroma MRO AG","city":"Hamburg","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30025","name":"Inno Packaging AG","city":"Berlin","country":"DE","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30026","name":"Euro Fleet Ltd","city":"Hamburg","country":"DE","currency":"EUR","category":"Fleet services","company_code":"1000"},
  {"id":"30027","name":"Stellar Logistics GmbH","city":"Milan","country":"IT","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30028","name":"Chroma Security S.A.","city":"Zurich","country":"CH","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30029","name":"Chroma Chemicals Ltd","city":"Amsterdam","country":"NL","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30031","name":"Nova Packaging Ltd","city":"Milan","country":"IT","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30032","name":"Sino Logistics Ltd","city":"Berlin","country":"DE","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30033","name":"Euro Packaging GmbH","city":"Vienna","country":"AT","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30034","name":"Inno IT-Services S.A.","city":"Madrid","country":"ES","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30035","name":"Sino Security GmbH","city":"Amsterdam","country":"NL","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30036","name":"Sino Consulting Ltd","city":"Stuttgart","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30037","name":"Omni Chemicals GmbH","city":"Hamburg","country":"DE","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30038","name":"Euro Logistics Ltd","city":"Vienna","country":"AT","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30039","name":"Chroma IT-Services GmbH","city":"Zurich","country":"CH","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30040","name":"Sino Facility GmbH","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30041","name":"Sino MRO GmbH","city":"Stuttgart","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30042","name":"Vanguard Fleet AG","city":"Frankfurt","country":"DE","currency":"EUR","category":"Fleet services","company_code":"1000"},
  {"id":"30043","name":"Vanguard IT-Services Ltd","city":"Vienna","country":"AT","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30044","name":"Nova Consulting S.A.","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30045","name":"Euro Logistics GmbH","city":"Amsterdam","country":"NL","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30046","name":"Chroma Consulting GmbH","city":"Zurich","country":"CH","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30047","name":"Stellar Logistics GmbH","city":"Stuttgart","country":"DE","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30048","name":"Stellar Robotics Ltd","city":"Zurich","country":"CH","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30049","name":"Sino MRO GmbH","city":"Zurich","country":"CH","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30050","name":"Inno Consulting Ltd","city":"Berlin","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30052","name":"Chroma Facility S.A.","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30053","name":"Stellar IT-Services GmbH","city":"Paris","country":"FR","currency":"EUR","category":"IT services","company_code":"3000"},
  {"id":"30054","name":"Euro Facility GmbH","city":"Frankfurt","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30055","name":"Global Robotics GmbH","city":"Amsterdam","country":"NL","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30056","name":"Vanguard Chemicals GmbH","city":"Paris","country":"FR","currency":"EUR","category":"Chemicals","company_code":"3000"},
  {"id":"30057","name":"Inno Security AG","city":"Stuttgart","country":"DE","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30058","name":"Stellar IT-Services GmbH","city":"Hamburg","country":"DE","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30059","name":"Vanguard Consulting AG","city":"Berlin","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30060","name":"Omni IT-Services GmbH","city":"Paris","country":"FR","currency":"EUR","category":"IT services","company_code":"3000"},
  {"id":"30061","name":"Omni Packaging GmbH","city":"Amsterdam","country":"NL","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30062","name":"Nova MRO AG","city":"Hamburg","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30063","name":"Global MRO S.A.","city":"Stuttgart","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30064","name":"Inno Robotics Ltd","city":"Zurich","country":"CH","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30065","name":"Stellar MRO GmbH","city":"Berlin","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30066","name":"Chroma IT-Services S.A.","city":"Frankfurt","country":"DE","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30067","name":"Nova Security S.A.","city":"Milan","country":"IT","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30068","name":"Global Consulting Ltd","city":"Vienna","country":"AT","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30069","name":"Stellar Consulting Ltd","city":"Milan","country":"IT","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30070","name":"Euro Security Ltd","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30071","name":"Vanguard Fleet Ltd","city":"Madrid","country":"ES","currency":"EUR","category":"Fleet services","company_code":"1000"},
  {"id":"30073","name":"Chroma Security S.A.","city":"Stuttgart","country":"DE","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30074","name":"Stellar Robotics AG","city":"Milan","country":"IT","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30075","name":"Vanguard IT-Services Ltd","city":"Milan","country":"IT","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30076","name":"Nova Robotics Ltd","city":"Madrid","country":"ES","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30077","name":"Nova Logistics AG","city":"Hamburg","country":"DE","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30078","name":"Global Logistics GmbH","city":"Madrid","country":"ES","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30079","name":"Stellar Consulting S.A.","city":"Berlin","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30080","name":"Stellar Packaging Ltd","city":"Paris","country":"FR","currency":"EUR","category":"Packaging","company_code":"3000"},
  {"id":"30082","name":"Nova MRO GmbH","city":"Milan","country":"IT","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30083","name":"Stellar Packaging Ltd","city":"Hamburg","country":"DE","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30085","name":"Inno Chemicals Ltd","city":"Stuttgart","country":"DE","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30086","name":"Euro Security S.A.","city":"Madrid","country":"ES","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30089","name":"Omni Security AG","city":"Vienna","country":"AT","currency":"EUR","category":"Security services","company_code":"1000"},
  {"id":"30090","name":"Chroma Fleet AG","city":"Vienna","country":"AT","currency":"EUR","category":"Fleet services","company_code":"1000"},
  {"id":"30091","name":"Inno Chemicals Ltd","city":"Zurich","country":"CH","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30092","name":"Nova Fleet Ltd","city":"Paris","country":"FR","currency":"EUR","category":"Fleet services","company_code":"3000"},
  {"id":"30093","name":"Euro MRO S.A.","city":"Düsseldorf","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30094","name":"Euro IT-Services GmbH","city":"Vienna","country":"AT","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30095","name":"Inno Facility AG","city":"Berlin","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30096","name":"Vanguard Facility GmbH","city":"Frankfurt","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30097","name":"Global IT-Services Ltd","city":"Milan","country":"IT","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30102","name":"Chroma Facility AG","city":"Amsterdam","country":"NL","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30103","name":"Vanguard Logistics Ltd","city":"Berlin","country":"DE","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30104","name":"Chroma Robotics GmbH","city":"Madrid","country":"ES","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30105","name":"Sino IT-Services S.A.","city":"Vienna","country":"AT","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30106","name":"Omni Consulting Ltd","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30107","name":"Sino Security S.A.","city":"Paris","country":"FR","currency":"EUR","category":"Security services","company_code":"3000"},
  {"id":"30108","name":"Stellar Chemicals GmbH","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30109","name":"Chroma Packaging AG","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30110","name":"Sino IT-Services AG","city":"Paris","country":"FR","currency":"EUR","category":"IT services","company_code":"3000"},
  {"id":"30111","name":"Global IT-Services Ltd","city":"Berlin","country":"DE","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30114","name":"Omni Robotics GmbH","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30116","name":"Sino Facility AG","city":"Vienna","country":"AT","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30117","name":"Inno IT-Services Ltd","city":"Hamburg","country":"DE","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30119","name":"Nova Packaging GmbH","city":"Madrid","country":"ES","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30120","name":"Omni Packaging Ltd","city":"Zurich","country":"CH","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30121","name":"Euro Consulting Ltd","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30122","name":"Omni IT-Services Ltd","city":"Zurich","country":"CH","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30123","name":"Omni Packaging GmbH","city":"Vienna","country":"AT","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30124","name":"Euro Chemicals Ltd","city":"Stuttgart","country":"DE","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30125","name":"Nova Facility AG","city":"Vienna","country":"AT","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30127","name":"Nova IT-Services Ltd","city":"Berlin","country":"DE","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30128","name":"Global Consulting GmbH","city":"Paris","country":"FR","currency":"EUR","category":"Consulting","company_code":"3000"},
  {"id":"30129","name":"Inno IT-Services S.A.","city":"Milan","country":"IT","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30131","name":"Chroma Logistics GmbH","city":"Vienna","country":"AT","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30132","name":"Inno Robotics S.A.","city":"Berlin","country":"DE","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"30133","name":"Sino MRO S.A.","city":"Milan","country":"IT","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30135","name":"Vanguard MRO Ltd","city":"Stuttgart","country":"DE","currency":"EUR","category":"MRO supplies","company_code":"1000"},
  {"id":"30136","name":"Euro Fleet S.A.","city":"Paris","country":"FR","currency":"EUR","category":"Fleet services","company_code":"3000"},
  {"id":"30137","name":"Omni IT-Services GmbH","city":"Frankfurt","country":"DE","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30138","name":"Omni Facility GmbH","city":"Milan","country":"IT","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30139","name":"Inno IT-Services AG","city":"Amsterdam","country":"NL","currency":"EUR","category":"IT services","company_code":"1000"},
  {"id":"30140","name":"Chroma Logistics GmbH","city":"Berlin","country":"DE","currency":"EUR","category":"Logistics services","company_code":"1000"},
  {"id":"30141","name":"Global Chemicals AG","city":"Berlin","country":"DE","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30142","name":"Sino Packaging AG","city":"Zurich","country":"CH","currency":"EUR","category":"Packaging","company_code":"1000"},
  {"id":"30143","name":"Global Facility AG","city":"Berlin","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"30144","name":"Euro Consulting S.A.","city":"Milan","country":"IT","currency":"EUR","category":"Consulting","company_code":"1000"},
  {"id":"30145","name":"Chroma Chemicals AG","city":"Milan","country":"IT","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30146","name":"Omni Chemicals GmbH","city":"Madrid","country":"ES","currency":"EUR","category":"Chemicals","company_code":"1000"},
  {"id":"30147","name":"Stellar Facility S.A.","city":"Düsseldorf","country":"DE","currency":"EUR","category":"Facility management","company_code":"1000"},
  {"id":"40001","name":"Apex Robotics Solutions GmbH","city":"Stuttgart","country":"DE","currency":"EUR","category":"Automation and robotics","company_code":"1000"},
  {"id":"40002","name":"Apex Robotics Systems Ltd.","city":"Manchester","country":"GB","currency":"EUR","category":"Automation and robotics","company_code":"2000"}
]);

/** The material-group taxonomy: 20 groups under the accounts' categories, plus laboratory and office supplies. */
export const TAXONOMY = Object.freeze([
  {"code":"MRO-PPE","name":"Personal protective equipment","category":"MRO supplies"},
  {"code":"MRO-TOOLS","name":"Hand and power tools","category":"MRO supplies"},
  {"code":"MRO-SPARES","name":"Spare parts and components","category":"MRO supplies"},
  {"code":"MRO-LUBE","name":"Lubricants and oils","category":"MRO supplies"},
  {"code":"CHEM","name":"Process chemicals","category":"Chemicals"},
  {"code":"CHEM-CLEAN","name":"Cleaning agents","category":"Chemicals"},
  {"code":"PACK-CARTON","name":"Cartons and boxes","category":"Packaging"},
  {"code":"PACK-FILM","name":"Films, tapes and wraps","category":"Packaging"},
  {"code":"PACK-PALLET","name":"Pallets and load carriers","category":"Packaging"},
  {"code":"AUTO-ROB","name":"Robots and automation equipment","category":"Automation and robotics"},
  {"code":"AUTO-SVC","name":"Automation services","category":"Automation and robotics"},
  {"code":"SVC-IT","name":"IT services","category":"IT services"},
  {"code":"SVC-CONS","name":"Consulting","category":"Consulting"},
  {"code":"SVC-FM","name":"Facility management","category":"Facility management"},
  {"code":"SVC-LOG","name":"Logistics services","category":"Logistics services"},
  {"code":"SVC-SEC","name":"Security services","category":"Security services"},
  {"code":"SVC-FLEET","name":"Fleet services","category":"Fleet services"},
  {"code":"LAB-CONS","name":"Laboratory consumables","category":"Laboratory supplies"},
  {"code":"LAB-EQUIP","name":"Laboratory equipment","category":"Laboratory supplies"},
  {"code":"OFFICE","name":"Office supplies","category":"Office supplies"}
]);
