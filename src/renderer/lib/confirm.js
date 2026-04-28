// Thin wrapper around window.confirm so we can swap to a styled modal later
// without touching every call site.
export function confirmAction(message) {
  return window.confirm(message);
}
