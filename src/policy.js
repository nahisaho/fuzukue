export const ACTIONS = Object.freeze({
  empty: Object.freeze({ open: true, reload: false, export: false, exit: true, switch: false, close: false, zoom: false }),
  ready: Object.freeze({ open: true, reload: true, export: true, exit: true, switch: true, close: true, zoom: true }),
  busy: Object.freeze({ open: false, reload: false, export: false, exit: false, switch: false, close: false, zoom: false })
});

/** @id CODE-FILES-POLICY @implements REQ-FILES-003 */
export function canAct(state, action) {
  return Object.hasOwn(ACTIONS, state) && Object.hasOwn(ACTIONS[state], action) && ACTIONS[state][action];
}
