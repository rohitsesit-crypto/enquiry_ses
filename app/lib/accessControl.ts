
export interface UserAccess {
  assignedSteps: number[];
  viewSteps: number[];
  canViewAllSteps: boolean;
  canFillForm: boolean;
  officeAccess: string;
}

export const ALL_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const OFFICE_OPTIONS = ['Mumbai', 'Boisar', 'Mumbai&Boisar'] as const;

/** Parses "1,2,7" / [1,2,7] / "" into a clean, de-duplicated, sorted array */
export function parseStepList(raw: unknown): number[] {
  const source = Array.isArray(raw)
    ? raw.map((s) => Number(s))
    : String(raw ?? '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10));

  const set = new Set<number>();
  source.forEach((n) => {
    if (!isNaN(n) && n >= 1 && n <= 10) set.add(n);
  });
  return Array.from(set).sort((a, b) => a - b);
}

export function parseBool(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw === 1) return true;
  const str = String(raw ?? '').trim().toLowerCase();
  return str === 'true' || str === 'yes' || str === 'y' || str === '1';
}

/**
 * Only a real office value survives. This guard is what stops step numbers
 * from ever being rendered inside the "Office Access" column again.
 */
export function normalizeOfficeAccess(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  const compact = str.replace(/\s+/g, '').toLowerCase();
  if (compact === 'mumbai') return 'Mumbai';
  if (compact === 'boisar') return 'Boisar';
  if (compact === 'mumbai&boisar' || compact === 'boisar&mumbai') return 'Mumbai&Boisar';
  return ''; // anything else (e.g. "1,2,3") = no restriction
}

/** Human label for the admin table / modal */
export function officeAccessLabel(raw: unknown): string {
  const office = normalizeOfficeAccess(raw);
  if (!office) return 'All';
  return office === 'Mumbai&Boisar' ? 'Mumbai & Boisar' : office;
}

/** Builds the access object from a raw user row / dashboard payload */
export function readUserAccess(source: Record<string, unknown>): UserAccess {
  const assigned = parseStepList(
    source?.assignedStepsList !== undefined ? source.assignedStepsList : source?.assignedSteps
  );
  const view = parseStepList(
    source?.viewStepsList !== undefined ? source.viewStepsList : source?.viewSteps
  );

  return {
    assignedSteps: assigned,
    // a step that can be edited is never listed twice
    viewSteps: view.filter((s) => assigned.indexOf(s) === -1),
    canViewAllSteps: parseBool(source?.canViewAllSteps),
    canFillForm: parseBool(source?.canFillForm),
    officeAccess: normalizeOfficeAccess(source?.officeAccess),
  };
}

/**
 * Steps the user is allowed to SEE, sorted ascending.
 * FIXED: viewSteps now count even when canViewAllSteps is off.
 */
export function getVisibleSteps(access: UserAccess): number[] {
  if (access.canViewAllSteps && access.viewSteps.length === 0) return [...ALL_STEPS];

  const set = new Set<number>();
  access.assignedSteps.forEach((s) => set.add(s));
  access.viewSteps.forEach((s) => set.add(s));

  if (access.canViewAllSteps) ALL_STEPS.forEach((s) => set.add(s));

  return Array.from(set).sort((a, b) => a - b);
}

/** Steps the user may only READ (visible but not editable) */
export function getReadOnlySteps(access: UserAccess): number[] {
  return getVisibleSteps(access).filter((s) => access.assignedSteps.indexOf(s) === -1);
}

/** True when the user may open the submit form of this step */
export function canEditStep(access: UserAccess, stepNum: number): boolean {
  return access.assignedSteps.indexOf(Number(stepNum)) >= 0;
}

/** True when the user may see this step at all */
export function canViewStep(access: UserAccess, stepNum: number): boolean {
  return getVisibleSteps(access).indexOf(Number(stepNum)) >= 0;
}

/** Badge text used by both the admin table and the user step list */
export function describeStepAccess(access: UserAccess, stepNum: number): 'Edit' | 'View' | 'Hidden' {
  if (canEditStep(access, stepNum)) return 'Edit';
  if (canViewStep(access, stepNum)) return 'View';
  return 'Hidden';
}

/** Office (location) filter applied to the entry list */
export function matchesOffice(access: UserAccess, entry: Record<string, unknown>): boolean {
  const office = access.officeAccess;
  if (!office || office === 'Mumbai&Boisar') return true;
  return String(entry?.Location ?? '').trim().toLowerCase() === office.toLowerCase();
}

/** Entries a user should receive: office filter + at least one visible step */
export function filterEntriesForUser(
  access: UserAccess,
  entries: Record<string, unknown>[]
): Record<string, unknown>[] {
  const visible = getVisibleSteps(access);
  if (visible.length === 0) return [];
  return entries.filter((entry) => matchesOffice(access, entry));
}
