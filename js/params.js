// The method's parameters (decision D4): the fix paths' effort and timing, the cost of capital and
// the analysis window. All are assumptions, labelled as such wherever they show. They are edited
// only in the Method dialog (Live mode, logged), shown read-only in Diagnostics, and locked in
// Simulation so that the scripted runs stay valid.

export const PARAMS = Object.freeze({
  day_rate_eur: 1200,            // blended person-day (Rebate Hunter's day_rate_eur)
  hours_per_day: 8,              // working hours per day
  mass_setup_days: 0.5,          // mass change: setup
  mass_minutes_per_record: 2,    // mass change: per record
  mass_lead_days: 5,             // mass change: lead time
  followup_prep_days: 0.25,      // owner follow-up: preparation
  followup_owner_minutes: 10,    // owner follow-up: the owner's time per exception
  followup_window_days: 14,      // owner follow-up: window
  source_fix_days: 3,            // fix at source: effort
  source_lead_days: 20,          // fix at source: lead time
  cost_of_capital: 0.06,         // a year
  window_days: 365               // analysis window
});

/** What kind of figure each parameter is, for the figure audit: amount, share, count or days. */
export const PARAM_TYPES = Object.freeze({
  day_rate_eur: "amount", hours_per_day: "count", mass_setup_days: "days", mass_minutes_per_record: "count",
  mass_lead_days: "days", followup_prep_days: "days", followup_owner_minutes: "count", followup_window_days: "days",
  source_fix_days: "days", source_lead_days: "days", cost_of_capital: "share", window_days: "days"
});

/** Labels and units, as the Method dialog and Diagnostics show them. */
export const PARAM_LABELS = Object.freeze({
  day_rate_eur: ["Day rate (blended person-day)", "€"],
  hours_per_day: ["Working hours per day", "hours"],
  mass_setup_days: ["Mass change: setup", "days"],
  mass_minutes_per_record: ["Mass change: per record", "minutes"],
  mass_lead_days: ["Mass change: lead time", "days"],
  followup_prep_days: ["Owner follow-up: preparation", "days"],
  followup_owner_minutes: ["Owner follow-up: owner's time per exception", "minutes"],
  followup_window_days: ["Owner follow-up: window", "days"],
  source_fix_days: ["Fix at source: effort", "days"],
  source_lead_days: ["Fix at source: lead time", "days"],
  cost_of_capital: ["Cost of capital", "a year"],
  window_days: ["Analysis window", "days"]
});
