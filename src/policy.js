export const ACTIONS = Object.freeze({
  empty: Object.freeze({ open: true, export: false, exit: true }),
  ready: Object.freeze({ open: true, export: true, exit: true }),
  busy: Object.freeze({ open: false, export: false, exit: false })
});

/** @id CODE-FILES-POLICY @implements REQ-FILES-003 */
export function canAct(state, action) {
  return Object.hasOwn(ACTIONS, state) && Object.hasOwn(ACTIONS[state], action) && ACTIONS[state][action];
}
