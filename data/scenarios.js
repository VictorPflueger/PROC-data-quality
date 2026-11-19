// The six preset scenarios: a short, unverified tip each, written the way a first hint arrives. In Live
// mode the agent gets the tip and nothing else; in Simulation the scripted run starts from it. Some tips
// mention invoices, because that is where the pain shows: the agent works on the order data, and the
// method names the payment assumption (invoices are paid on the order's payment terms).
window.SCENARIOS = [
  {
    id: "SC-PUNCHOUT",
    n: 1,
    title: "Contract references lost in punch-out",
    hint: "Lyon: order lines and contracts",
    tip: "The Lyon lab-supply orders never show up in the contract compliance report, although we have a framework contract with that supplier."
  },
  {
    id: "SC-EARLY-PAY",
    n: 2,
    title: "Paying too early",
    hint: "Birmingham: payment terms",
    tip: "Treasury says some Birmingham invoices are paid within 14 days although the contracts say 60."
  },
  {
    id: "SC-UNCLASSIFIED",
    n: 3,
    title: "Unclassified spend",
    hint: "Duisburg: material groups",
    tip: "The spend cube shows a large block of unclassified spend at Duisburg."
  },
  {
    id: "SC-REQUESTER",
    n: 4,
    title: "Who ordered this?",
    hint: "Frankfurt: requesters",
    tip: "Internal audit asks who requested a batch of Frankfurt orders; the requester field is empty or names people who have left."
  },
  {
    id: "SC-ONBOARDING",
    n: 5,
    title: "New suppliers, half the data",
    hint: "Supplier master data",
    tip: "Accounts payable has blocked invoices from suppliers onboarded last quarter."
  },
  {
    id: "SC-DUPLICATE",
    n: 6,
    title: "Two Apexes?",
    hint: "Supplier master data: duplicates",
    tip: "The same supplier seems to appear twice in our master data."
  }
];
