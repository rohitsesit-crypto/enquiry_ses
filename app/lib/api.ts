// =============================================================================
// app/lib/api.ts   —  CORRECTED VERSION
// =============================================================================
// WHAT CHANGED
// 1) Apps Script requires "text/plain" + redirect:follow. Kept, but the body is
//    now sent for BOTH GET-less and POST calls consistently, and a non-JSON
//    reply (Google's HTML error page) no longer crashes the app with an
//    unhelpful "Unexpected token <" error.
// 2) getAdminData / getUserDashboardData now surface the NEW backend fields:
//    viewSteps, viewStepsList, assignedStepsList, officeAccess, isActive.
//    Without these, the admin table could never render the "View: 1,2,3" badge
//    and the user page never knew which steps to show.
// 3) generateUserLink now sends the real app origin, so the generated link is
//    the deployed URL instead of a hardcoded localhost:3000.
// 4) A missing NEXT_PUBLIC_APPS_SCRIPT_URL now fails with a clear message
//    instead of silently fetching the current page.
// =============================================================================

import { normalizeEntries } from './utils';
import {
  DEMO_COMPANIES,
  DEMO_EMAIL,
  DEMO_ENTRIES,
  DEMO_SALES_PERSONS,
  DEMO_STEP_NAMES,
  DEMO_USER,
} from './demoData';

const SCRIPT_URL = (process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || '').trim();

/**
 * True when no Apps Script deployment is configured.
 *
 * In that case the app serves the local demo dataset so the project runs with
 * `pnpm dev` alone. Set NEXT_PUBLIC_APPS_SCRIPT_URL in .env.local to talk to the
 * real Google Sheet instead — nothing else has to change.
 */
export const IS_DEMO_MODE = SCRIPT_URL === '';

/** Local answers for the actions the UI needs while in demo mode. */
function demoResponse<T>(action: string, body: Record<string, unknown>): T | null {
  switch (action) {
    case 'verifyUser':
      return {
        success: true,
        verified: true,
        name: DEMO_USER.name,
        isAdmin: DEMO_USER.isAdmin,
      } as T;

    case 'getUserDashboardData':
      return {
        success: true,
        entries: DEMO_ENTRIES,
        user: DEMO_USER,
        salesPersons: DEMO_SALES_PERSONS,
        companies: DEMO_COMPANIES,
        assignedSteps: DEMO_USER.assignedSteps,
        viewSteps: DEMO_USER.viewSteps,
        viewOnlySteps: DEMO_USER.viewOnlySteps,
        bothSteps: DEMO_USER.bothSteps,
        canFillForm: DEMO_USER.canFillForm,
        canViewAllSteps: DEMO_USER.canViewAllSteps,
        officeAccess: DEMO_USER.officeAccess,
        stepNames: DEMO_STEP_NAMES,
      } as T;

    case 'getAdminData':
      return {
        success: true,
        message: 'Demo mode',
        users: [],
        salesPersons: DEMO_SALES_PERSONS,
        companies: DEMO_COMPANIES,
        entries: DEMO_ENTRIES,
        gatePassCount: 2,
        stepNames: DEMO_STEP_NAMES,
      } as T;

    case 'getItemNames':
      return {
        success: true,
        items: [
          'MS Flange 4 inch',
          'GI Bend 2 inch',
          'MS Pipe 2 inch',
          'SS Fastener M8',
          'Structural Bracket',
          'Control Panel',
          'Gear Coupling',
        ],
      } as T;

    case 'getHolidaysAndSundays':
      return { success: true, holidays: [], sundays: [] } as T;

    case 'getCompanyAutoFill': {
      const name = String(body.companyName || '').trim().toLowerCase();
      const found = DEMO_COMPANIES.find((c) => c.companyName.toLowerCase() === name);
      return (found
        ? {
            success: true,
            data: {
              nameOfEnquirer: found.nameOfEnquirer,
              mobileNumber: found.mobileNumber,
              emailId: found.emailId,
            },
          }
        : { success: false }) as T;
    }

    case 'submitNewEntry':
      return {
        success: true,
        entryId: 'DEMO-NEW',
        message: 'Demo mode: entry accepted locally, nothing was written to a sheet.',
      } as T;

    case 'submitStep':
      return {
        success: true,
        message: 'Demo mode: step accepted locally, nothing was written to a sheet.',
      } as T;

    case 'updateEntry':
      return { success: true, message: 'Demo mode: entry updated locally.' } as T;

    default:
      return null;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

async function callApi<T>(action: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'POST', body, params } = options;

  // No deployment configured: answer from the local demo dataset instead of
  // failing, so the app is runnable out of the box.
  if (IS_DEMO_MODE) {
    const local = demoResponse<T>(action, body || {});
    if (local !== null) return local;
  }

  if (!SCRIPT_URL) {
    throw new Error(
      'NEXT_PUBLIC_APPS_SCRIPT_URL is not set. Add it to .env.local and restart the dev server.'
    );
  }

  let url = SCRIPT_URL;
  if (method === 'GET' || params) {
    const searchParams = new URLSearchParams({ action, ...(params || {}) });
    url = `${SCRIPT_URL}?${searchParams.toString()}`;
  }

  const fetchOptions: RequestInit = {
    method,
    // Apps Script rejects application/json preflight; text/plain avoids CORS preflight.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
  };

  if (method === 'POST') {
    fetchOptions.body = JSON.stringify({ action, ...(body || {}) });
  }

  try {
    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    try {
      return JSON.parse(text) as T;
    } catch {
      // Google returned an HTML page (not deployed as "Anyone", wrong URL, or
      // the script threw before ContentService could reply).
      throw new Error(
        'Apps Script did not return JSON. Re-deploy the Web App with "Execute as: Me" and ' +
          '"Who has access: Anyone", then update NEXT_PUBLIC_APPS_SCRIPT_URL.'
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
