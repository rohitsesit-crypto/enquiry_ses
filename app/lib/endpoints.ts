// =============================================================================
// app/lib/endpoints.ts
// =============================================================================
// The browser never talks to Google directly. It calls this app's own route,
// which forwards the request to the Apps Script Web App using the server-only
// APPS_SCRIPT_URL environment variable (no NEXT_PUBLIC_ prefix needed).
// =============================================================================

/** Local proxy that fronts the Apps Script Web App. */
export const APPS_SCRIPT_PROXY = "/api/apps-script";
