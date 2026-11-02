// =============================================================================
// app/lib/api.ts   —  CLIENT API LAYER
// =============================================================================
// The browser calls this app's own server route (/api/apps-script), which
// forwards each request to the Apps Script Web App. The script URL therefore
// lives in the server-only APPS_SCRIPT_URL variable and is never exposed to the
// browser bundle.
//
// Apps Script still requires the two quirks that are now handled server-side:
// a text/plain body (application/json triggers a rejected CORS preflight) and
// redirect: 'follow'. A deployment that answers with an HTML page is converted
// into a readable error instead of crashing with "Unexpected token <".
// =============================================================================

import { normalizeEntries } from './utils';
import { APPS_SCRIPT_PROXY } from './endpoints';

interface ApiOptions {
  body?: Record<string, unknown>;
}

async function callApi<T>(action: string, options: ApiOptions = {}): Promise<T> {
  const { body } = options;

  try {
    const response = await fetch(APPS_SCRIPT_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ action, ...(body || {}) }),
    });

    const text = await response.text();

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        'The Apps Script proxy did not return JSON. Check that APPS_SCRIPT_URL is set ' +
          'and that the Web App is deployed with "Execute as: Me" and ' +
          '"Who has access: Anyone".'
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`API Error [${action}]:`, message);
    throw new Error(message);
  }
}

// ===== Shared shapes =====

export interface AdminUserRow {
  email: string;
  name: string;
  mobile: string;
  /** comma string, e.g. "1,2,7" */
  assignedSteps: string;
  /** array form of the same value */
  assignedStepsList: number[];
  /** comma string of read-only steps */
  viewSteps: string;
  viewStepsList: number[];
  canFillForm: boolean;
  isAdmin: boolean;
  isActive: boolean;
  canViewAllSteps: boolean;
  /** 'Mumbai' | 'Boisar' | 'Mumbai&Boisar' | '' */
  officeAccess: string;
}

// ===== User APIs =====

export async function getItemNames() {
  return callApi<{ success: boolean; items: string[]; message?: string }>('getItemNames', { body: {} });
}

export async function verifyUser(email: string) {
  return callApi<{
    success: boolean;
    verified: boolean;
    name: string;
    isAdmin?: boolean;
    message?: string;
  }>('verifyUser', { body: { email } });
}

export async function getUserDashboardData(email: string) {
  const result = await callApi<{
    success: boolean;
    entries: Record<string, unknown>[];
    user: Record<string, unknown>;
    salesPersons: string[];
    companies: Record<string, unknown>[];
    assignedSteps: number[];
    viewSteps: number[];
    canFillForm: boolean;
    canViewAllSteps: boolean;
    officeAccess: string;
    stepNames: Record<string, string>;
    message?: string;
  }>('getUserDashboardData', { body: { email } });

  if (result.success && result.entries) {
    result.entries = normalizeEntries(result.entries);
  }
  return result;
}

export async function submitNewEntry(email: string, formData: Record<string, unknown>) {
  return callApi<{ success: boolean; entryId?: string; message?: string }>('submitNewEntry', {
    body: { email, formData },
  });
}

export async function submitStep(
  entryId: string,
  stepNum: number,
  email: string,
  data: Record<string, unknown>
) {
  return callApi<{ success: boolean; message?: string }>('submitStep', {
    body: { entryId, stepNum, email, ...data },
  });
}

export async function getCompanyAutoFill(companyName: string) {
  return callApi<{
    success: boolean;
    data?: { nameOfEnquirer: string; mobileNumber: string; emailId: string };
  }>('getCompanyAutoFill', { body: { companyName } });
}

// ===== Admin APIs =====

export async function getAdminData(email: string) {
  const result = await callApi<{
    success: boolean;
    message: string;
    users: AdminUserRow[];
    salesPersons: string[];
    companies: Record<string, unknown>[];
    entries: Record<string, unknown>[];
    gatePassCount: number;
    stepNames?: Record<string, string>;
  }>('getAdminData', { body: { email } });

  if (result.success && result.entries) {
    result.entries = normalizeEntries(result.entries);
  }
  return result;
}

export async function addUser(
  adminEmail: string,
  userData: { email: string; name: string; mobile: string }
) {
  return callApi<{ success: boolean; message?: string }>('addUser', {
    body: { adminEmail, userData },
  });
}

export async function bulkAddUsers(
  adminEmail: string,
  users: { email: string; name: string; mobile: string }[]
) {
  return callApi<{ success: boolean; message?: string; count?: number }>('bulkAddUsers', {
    body: { adminEmail, users },
  });
}

export async function updateUserAccess(
  adminEmail: string,
  userEmail: string,
  access: {
    assignedSteps: number[];
    viewSteps: number[];
    canFillForm: boolean;
    canViewAllSteps: boolean;
    officeAccess?: string;
  }
) {
  return callApi<{
    success: boolean;
    message?: string;
    saved?: {
      assignedSteps: number[];
      viewSteps: number[];
      canFillForm: boolean;
      canViewAllSteps: boolean;
      officeAccess: string;
    };
  }>('updateUserAccess', { body: { adminEmail, userEmail, access } });
}

export async function addSalesPerson(adminEmail: string, name: string) {
  return callApi<{ success: boolean; message?: string }>('addSalesPerson', {
    body: { adminEmail, name },
  });
}

export async function removeSalesPerson(adminEmail: string, name: string) {
  return callApi<{ success: boolean; message?: string }>('removeSalesPerson', {
    body: { adminEmail, name },
  });
}

export async function generateUserLink(adminEmail: string, userEmail: string) {
  // Send the real origin so the link is never hardcoded to localhost:3000
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return callApi<{ success: boolean; link?: string; message?: string }>('generateUserLink', {
    body: { adminEmail, userEmail, appUrl },
  });
}

export async function updateEntry(email: string, entryId: string, formData: Record<string, unknown>) {
  return callApi<{ success: boolean; message?: string }>('updateEntry', {
    body: { email, entryId, formData },
  });
}

// ===== Holidays & Sundays API =====

export async function getHolidaysAndSundays() {
  return callApi<{
    success: boolean;
    holidays: { date: string; reason: string }[];
    sundays: string[];
    message?: string;
  }>('getHolidaysAndSundays', { body: {} });
}

// ===== Entry ID diagnostics (test page) =====

export interface EntryIdReportRow {
  row: number;
  entryId: string;
  hasEntryId: boolean;
  idLooksValid: boolean;
  serialNo: string;
  companyName: string;
  submittedBy: string;
  timestamp: string;
  currentStep: string;
}

export interface EntryIdReport {
  success: boolean;
  message?: string;
  sheetTitle?: string;
  entryIdHeader?: string;
  entryIdColumn?: number;
  entryIdHeaderExact?: boolean;
  headers?: string[];
  totalRows?: number;
  withEntryId?: number;
  missingEntryId?: number;
  idsNotMatchingEnqShape?: number;
  duplicateEntryIds?: number;
  rows?: EntryIdReportRow[];
  viewer?: { email: string; isAdmin: boolean; isActive: boolean } | null;
}

/** Read-only report of what the Entries tab's Entry_ID column holds. */
export async function getEntryIdReport(email?: string) {
  return callApi<EntryIdReport>('getEntryIdReport', { body: { email: email || '' } });
}

/** One entry straight from the Entries tab, used to confirm the id round-trip. */
export async function getEntryById(email: string, entryId: string) {
  return callApi<{
    success: boolean;
    message?: string;
    rowNumber?: number;
    entry?: Record<string, unknown>;
  }>('getEntryById', { body: { email, entryId } });
}
