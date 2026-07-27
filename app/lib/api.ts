// API Layer for communicating with Google Apps Script
// Replace SCRIPT_URL with your deployed Google Apps Script Web App URL

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
    url = `<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mrow><mi>S</mi><mi>C</mi><mi>R</mi><mi>I</mi><mi>P</mi><msub><mi>T</mi><mi>U</mi></msub><mi>R</mi><mi>L</mi></mrow><mo stretchy="false">?</mo></mrow><annotation encoding="application/x-tex">{SCRIPT_URL}?</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:0.8444em;vertical-align:-0.15em;"></span><span class="mord"><span class="mord mathnormal" style="margin-right:0.0576em;">S</span><span class="mord mathnormal" style="margin-right:0.0715em;">C</span><span class="mord mathnormal" style="margin-right:0.0077em;">R</span><span class="mord mathnormal" style="margin-right:0.0785em;">I</span><span class="mord mathnormal" style="margin-right:0.1389em;">P</span><span class="mord"><span class="mord mathnormal" style="margin-right:0.1389em;">T</span><span class="msupsub"><span class="vlist-t vlist-t2"><span class="vlist-r"><span class="vlist" style="height:0.3283em;"><span style="top:-2.55em;margin-left:-0.1389em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mathnormal mtight" style="margin-right:0.109em;">U</span></span></span></span><span class="vlist-s">​</span></span><span class="vlist-r"><span class="vlist" style="height:0.15em;"><span></span></span></span></span></span></span><span class="mord mathnormal" style="margin-right:0.0077em;">R</span><span class="mord mathnormal">L</span></span><span class="mclose">?</span></span></span></span>{searchParams.toString()}`;
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

export async function verifyUser(email: string) {
  return callApi<{ success: boolean; verified: boolean; name: string; message?: string }>('verifyUser', {
    body: { email },
  });
}

export async function getUserDashboardData(email: string) {
  return callApi<{
    success: boolean;
    entries: Record<string, unknown>[];
    user: Record<string, unknown>;
    salesPersons: string[];
    companies: Record<string, unknown>[];
    assignedSteps: number[];
    canFillForm: boolean;
    canViewAllSteps: boolean;
    stepNames: Record<string, string>;
    message?: string;
  }>('getUserDashboardData', { body: { email } });
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
  return callApi<{
    message: string;
    success: boolean;
    users: Record<string, unknown>[];
    salesPersons: string[];
    entries: Record<string, unknown>[];
    gatePassCount: number;
  }>('getAdminData', { body: { email } });
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
  access: { assignedSteps: number[]; canFillForm: boolean; canViewAllSteps: boolean }
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