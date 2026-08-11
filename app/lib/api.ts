// API Layer for communicating with Google Apps Script
// Enhanced with data normalization for bidirectional Google Sheets sync

import { normalizeEntries } from './utils';

const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || '';

interface ApiOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

async function callApi<T>(action: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'POST', body, params } = options;

  let url = SCRIPT_URL;

  if (method === 'GET' || params) {
    const searchParams = new URLSearchParams({ action, ...params });
    url = `${SCRIPT_URL}?${searchParams.toString()}`;
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
    };

    if (method === 'POST' && body) {
      fetchOptions.body = JSON.stringify({ action, ...body });
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`API Error [${action}]:`, error);
    throw new Error(`Failed to communicate with server: ${error}`);
  }
}


// ===== User APIs =====

export async function getItemNames() {
  return callApi<{ success: boolean; items: string[]; message?: string }>('getItemNames', {
    body: {},
  });
}

export async function verifyUser(email: string) {
  return callApi<{ success: boolean; verified: boolean; name: string; message?: string }>('verifyUser', {
    body: { email },
  });
}

export async function getUserDashboardData(email: string) {
  const result = await callApi<{
    success: boolean;
    entries: Record<string, unknown>[];
    user: Record<string, unknown>;
    salesPersons: string[];
    companies: Record<string, unknown>[];
    assignedSteps: number[];
    canFillForm: boolean;
    canViewAllSteps: boolean;
    officeAccess: string;
    stepNames: Record<string, string>;
    message?: string;
  }>('getUserDashboardData', { body: { email } });

  // Normalize entries to handle manually-entered data from Google Sheets
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
    message: string;
    success: boolean;
    users: Record<string, unknown>[];
    salesPersons: string[];
    entries: Record<string, unknown>[];
    gatePassCount: number;
  }>('getAdminData', { body: { email } });

  // Normalize entries to handle manually-entered data from Google Sheets
  if (result.success && result.entries) {
    result.entries = normalizeEntries(result.entries);
  }

  return result;
}

export async function addUser(adminEmail: string, userData: { email: string; name: string; mobile: string }) {
  return callApi<{ success: boolean; message?: string }>('addUser', {
    body: { adminEmail, userData },
  });
}

export async function bulkAddUsers(adminEmail: string, users: { email: string; name: string; mobile: string }[]) {
  return callApi<{ success: boolean; message?: string; count?: number }>('bulkAddUsers', {
    body: { adminEmail, users },
  });
}

export async function updateUserAccess(
  adminEmail: string,
  userEmail: string,
  access: { assignedSteps: number[]; canFillForm: boolean; canViewAllSteps: boolean; officeAccess?: string }
) {
  return callApi<{ success: boolean; message?: string }>('updateUserAccess', {
    body: { adminEmail, userEmail, access },
  });
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
  return callApi<{ success: boolean; link?: string; message?: string }>('generateUserLink', {
    body: { adminEmail, userEmail },
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
