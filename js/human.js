// The person's decisions, as the toolbox waits for them: option decisions, draft decisions and review
// decisions arrive as events (from the screen's buttons, or from a scripted person in the tests and
// the script checker) and queue up until a tool waits for one. A waiting tool takes the first queued
// event of its kind that passes its test; an event of that kind that fails the test (a decision on
// options no longer on screen, on a draft already decided, on another review) is dropped, and the
// test itself says so on screen. Nothing here knows which producer runs.

export const HUMAN_EVENTS = Object.freeze(["option_decision", "action_decision", "confirmation_decision"]);

export function createHumanQueue() {
  const queue = [];
  let waiter = null;

  function check() {
    if (!waiter) return;
    for (let i = 0; i < queue.length;) {
      const ev = queue[i];
      if (ev.type !== waiter.kind) { i += 1; continue; }
      queue.splice(i, 1);
      if (waiter.test(ev)) {
        const w = waiter;
        waiter = null;
        w.resolve(ev);
        return;
      }
    }
  }

  return {
    /** A person's event: { type, payload }. */
    push(ev) {
      if (!ev || !HUMAN_EVENTS.includes(ev.type)) return;
      queue.push(ev);
      check();
    },
    /** Resolves with the first queued or arriving event of `kind` that passes `test`. */
    waitFor(kind, test = () => true) {
      if (waiter) return Promise.reject(new Error(`already waiting for ${waiter.kind}`));
      return new Promise((resolve, reject) => {
        waiter = { kind, test, resolve, reject };
        check();
      });
    },
    /** Ends a wait (abort, reset): the waiting tool rejects with `reason`. */
    cancel(reason) {
      queue.length = 0;
      if (waiter) {
        const w = waiter;
        waiter = null;
        w.reject(reason);
      }
    },
    waiting: () => (waiter ? waiter.kind : null)
  };
}
