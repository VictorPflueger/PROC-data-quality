// The run state a producer shows: Spot (scanning), Check (verifying), Calculate (simulating), Propose
// (options) and Prepare (executing), plus the waits for a person (awaiting_approval). A producer may
// ask for an earlier step (a lookup after the fix paths were costed); the run then stays on the
// furthest step reached, so the rail and the console never move back. Leaving a wait returns to the
// furthest step reached. Shared by the live agent and the simulation player.

const ORDER = { scanning: 0, diagnosing: 0, verifying: 1, simulating: 2, options: 3, executing: 4 };
const NAMES = ["scanning", "verifying", "simulating", "options", "executing"];

export function createPhaseGate(emit) {
  let phase = null;
  let reached = -1;
  return {
    set(state) {
      if (!state || state === phase) return;
      let next = state;
      const o = ORDER[next];
      if (o !== undefined && o < reached) next = NAMES[reached];
      if (next === phase) return;
      if (ORDER[next] !== undefined) reached = Math.max(reached, ORDER[next]);
      phase = next;
      emit(next);
    },
    get: () => phase
  };
}
