// =============================================================================
// app/lib/partialSubmission.ts   (REPLACE THE WHOLE FILE)
// =============================================================================
// Part wise partial submission engine for Steps 7, 8, 9 and 10.
//
// QUANTITY RULE (as confirmed by the user)
//   Total quantity of EVERY quantity step is the form quantity (Requirements_JSON).
//        100 total, 40 submitted  ->  "Partially Submitted"  (Part 2 stays Pending)
//        100 total, 100 submitted ->  "Completed"
//
// CHANGE 6  (NEW — fixes "sheet is on Step 9 but UI still shows Step 8 Pending")
//   1) The sheet status is now TRUSTED. If the backend already wrote
//      Step_8_Status = "Completed", the UI can never downgrade it back to
//      "Pending"/"Partially Submitted". This was the real bug: older entries
//      (and entries submitted before Parts_JSON existed) have no part records,
//      so the UI recalculated 0 of 100 and showed "Pending" forever even though
//      the sheet had already moved Current_Step to 9.
//   2) A step whose sheet status is "Completed" is no longer actionable, so it
//      disappears from the Pending Tasks list.
//   3) Steps 8/9/10 still cannot submit more than the previous step released,
//      BUT when the previous step is already "Completed" without part records
//      (legacy data) the full remaining quantity is released, so the step never
//      gets stuck at 0.
//
// Existing rules kept exactly as they were
//   - Every submission of a partial step creates its own "Part" record, so a new
//     submission NEVER overwrites the previous one.
//   - Step 7 Part 2 (remaining) and Step 8 Part 1 (released) stay submittable at
//     the same time. There is NO "go back" logic.
// =============================================================================

/** Steps that support quantity based partial submission */
export const PARTIAL_STEPS = [7, 8, 9, 10];

/** Steps whose quantity is inherited (read only) from the previous step */
export const QUANTITY_INHERITED_STEPS = [8, 9, 10];

export interface RequirementItem {
  itemName: string;
  quantity: number;
  unit: string;
}

export interface StepPartItem {
  itemName: string;
  quantity: number;
  totalQuantity: number;
  attachment?: string;
}

export interface StepPart {
  stepNumber: number;
  partNumber: number;
  submittedQuantity: number;
  remainingQuantity: number;
  totalQuantity: number;
  status: 'Completed' | 'Pending';
  submittedAt: string;
  submittedBy: string;
  reference: string;
  attachment: string;
  remark: string;
  items: StepPartItem[];
}

export interface StepItemProgress {
  itemName: string;
  unit: string;
  totalQuantity: number;
  submitted: number;
  remaining: number;
  /** How much of this item is released by the previous step (steps 8/9/10) */
  availableFromPrevious: number;
  /** Max quantity that can be submitted right now for this item */
  maxSubmittable: number;
}

export interface StepPartSummary {
  stepNumber: number;
  totalQuantity: number;
  submittedQuantity: number;
  remainingQuantity: number;
  parts: StepPart[];
  /** Completed parts + the derived pending part (if any) */
  allParts: StepPart[];
  pendingPart: StepPart | null;
  overallStatus: string;
  isFullySubmitted: boolean;
  hasPartialSubmission: boolean;
  /** Part number that the next submission will create */
  nextPartNumber: number;
  /** Quantity that may be submitted right now */
  maxSubmittable: number;
  /** true => a Submit button must be shown for this step right now */
  isActionable: boolean;
}

export type EntryRecord = Record<string, unknown>;

/** True when the step uses part wise partial submission */
export function isPartialStep(stepNum: number): boolean {
  return PARTIAL_STEPS.indexOf(Number(stepNum)) >= 0;
}

/** True when the step inherits its quantity from the previous step (8/9/10) */
export function isQuantityInherited(stepNum: number): boolean {
  return QUANTITY_INHERITED_STEPS.indexOf(Number(stepNum)) >= 0;
}

function toNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  return isNaN(num) ? 0 : num;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  const str = toText(value);
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/** Raw status written in the Google Sheet for a step */
export function getRawStepStatus(entry: EntryRecord, stepNum: number): string {
  return toText(entry?.[`Step_${stepNum}_Status`]) || 'Locked';
}

/** CHANGE 6 — the sheet already marked this step as finished */
export function isStepCompletedInSheet(entry: EntryRecord, stepNum: number): boolean {
  return getRawStepStatus(entry, stepNum) === 'Completed';
}

/** Requirement items of the entry (the total quantity source of truth) */
export function getRequirements(entry: EntryRecord): RequirementItem[] {
  return parseArray(entry?.Requirements_JSON).map((r) => ({
    itemName: toText(r.itemName),
    quantity: toNumber(r.quantity),
    unit: toText(r.unit),
  }));
}

/** Total quantity of a step = sum of all requirement quantities (form quantity) */
export function getStepTotalQuantity(entry: EntryRecord): number {
  return getRequirements(entry).reduce((sum, r) => sum + r.quantity, 0);
}

/** Target quantity a step must reach to be Completed = the form quantity */
export function getStepTargetQuantity(entry: EntryRecord, _stepNum?: number): number {
  return getStepTotalQuantity(entry);
}

function normalizePartItems(raw: unknown): StepPartItem[] {
  return parseArray(raw).map((item) => ({
    itemName: toText(item.itemName),
    quantity: toNumber(item.quantity !== undefined ? item.quantity : item.quantityReceived),
    totalQuantity: toNumber(item.totalQuantity),
    attachment: toText(item.attachment),
  }));
}

/** Legacy Step 7 batches (Step_7_Invoices_JSON) converted into parts */
function getLegacyStep7Parts(entry: EntryRecord, total: number): StepPart[] {
  const batches = parseArray(entry?.Step_7_Invoices_JSON);
  let cumulative = 0;
  return batches.map((batch, idx) => {
    const items = normalizePartItems(batch.items);
    const submittedQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
    cumulative += submittedQuantity;
    const withFile = items.find((it) => !!toText(it.attachment));
    return {
      stepNumber: 7,
      partNumber: toNumber(batch.batch) || idx + 1,
      submittedQuantity,
      remainingQuantity: Math.max(0, total - cumulative),
      totalQuantity: total,
      status: 'Completed' as const,
      submittedAt: toText(batch.date),
      submittedBy: toText(batch.submittedBy),
      reference: toText(batch.invoiceNo),
      attachment: withFile ? toText(withFile.attachment) : '',
      remark: toText(batch.remark),
      items,
    };
  });
}

/** All recorded (submitted) parts of a step, oldest first */
export function getStepParts(entry: EntryRecord, stepNum: number): StepPart[] {
  const total = getStepTotalQuantity(entry);
  const raw = parseArray(entry?.[`Step_${stepNum}_Parts_JSON`]);

  let parts: StepPart[] = raw.map((part, idx) => {
    const items = normalizePartItems(part.items);
    const submittedQuantity =
      part.submittedQuantity !== undefined
        ? toNumber(part.submittedQuantity)
        : items.reduce((sum, it) => sum + it.quantity, 0);
    return {
      stepNumber: toNumber(part.stepNumber) || Number(stepNum),
      partNumber: toNumber(part.partNumber) || idx + 1,
      submittedQuantity,
      remainingQuantity: toNumber(part.remainingQuantity),
      totalQuantity: toNumber(part.totalQuantity) || total,
      status: toText(part.status).toLowerCase() === 'pending' ? 'Pending' : 'Completed',
      submittedAt: toText(part.submittedAt),
      submittedBy: toText(part.submittedBy),
      reference: toText(part.reference),
      attachment: toText(part.attachment),
      remark: toText(part.remark),
      items,
    };
  });

  if (parts.length === 0 && Number(stepNum) === 7) {
    parts = getLegacyStep7Parts(entry, total);
  }

  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

/** Quantity submitted per item name for a step */
export function getSubmittedItemMap(entry: EntryRecord, stepNum: number): Record<string, number> {
  const map: Record<string, number> = {};
  getStepParts(entry, stepNum).forEach((part) => {
    part.items.forEach((item) => {
      if (!item.itemName) return;
      map[item.itemName] = (map[item.itemName] || 0) + item.quantity;
    });
  });
  return map;
}

/**
 * Total quantity submitted so far for a step.
 * CHANGE 6 — when the sheet already says "Completed" but no part records exist
 * (legacy rows), the step counts as fully submitted.
 */
export function getSubmittedQuantity(entry: EntryRecord, stepNum: number): number {
  const fromParts = getStepParts(entry, stepNum).reduce((sum, p) => sum + p.submittedQuantity, 0);
  if (fromParts > 0) return fromParts;
  if (isStepCompletedInSheet(entry, stepNum)) return getStepTotalQuantity(entry);
  return 0;
}

/** Quantity still pending for a step */
export function getRemainingQuantity(entry: EntryRecord, stepNum: number): number {
  return Math.max(0, getStepTotalQuantity(entry) - getSubmittedQuantity(entry, stepNum));
}

/** True when every unit of the step has been submitted */
export function isStepFullySubmitted(entry: EntryRecord, stepNum: number): boolean {
  if (isStepCompletedInSheet(entry, stepNum)) return true;
  const total = getStepTotalQuantity(entry);
  if (total <= 0) return false;
  return getSubmittedQuantity(entry, stepNum) >= total;
}

/**
 * Quantity per item that the PREVIOUS step released to this step.
 * Step 7 has no previous quantity step, so it uses the requirement quantity.
 * CHANGE 6 — if the previous step is already "Completed" in the sheet but has no
 * part records (legacy data), it is treated as having released everything.
 */
export function getReleasedItemMap(entry: EntryRecord, stepNum: number): Record<string, number> {
  const requirements = getRequirements(entry);

  if (!isQuantityInherited(stepNum)) {
    const map: Record<string, number> = {};
    requirements.forEach((r) => { map[r.itemName] = r.quantity; });
    return map;
  }

  const prevStep = Number(stepNum) - 1;
  const prevMap = getSubmittedItemMap(entry, prevStep);
  const prevTotal = Object.keys(prevMap).reduce((sum, k) => sum + (prevMap[k] || 0), 0);

  if (prevTotal <= 0 && isStepCompletedInSheet(entry, prevStep)) {
    const fallback: Record<string, number> = {};
    requirements.forEach((r) => { fallback[r.itemName] = r.quantity; });
    return fallback;
  }
  return prevMap;
}

/** Total quantity released to this step by the previous step */
export function getStepReleasedQuantity(entry: EntryRecord, stepNum: number): number {
  const map = getReleasedItemMap(entry, stepNum);
  return Object.keys(map).reduce((sum, key) => sum + (map[key] || 0), 0);
}

/**
 * Per item progress for the submission form.
 * Steps 8/9/10 can never submit more than the previous step has released,
 * which is exactly what allows "Step 7 Part 2" and "Step 8 Part 1" to be
 * submittable at the same time.
 */
export function getStepItemProgress(entry: EntryRecord, stepNum: number): StepItemProgress[] {
  const requirements = getRequirements(entry);
  const submitted = getSubmittedItemMap(entry, stepNum);
  const completedInSheet = isStepCompletedInSheet(entry, stepNum);
  const inherited = isQuantityInherited(stepNum);
  const released = inherited ? getReleasedItemMap(entry, stepNum) : null;

  return requirements.map((req) => {
    let done = submitted[req.itemName] || 0;
    // legacy completed row without part records -> treat as fully done
    if (done === 0 && completedInSheet) done = req.quantity;

    const remaining = Math.max(0, req.quantity - done);
    const availableFromPrevious = released
      ? Math.max(0, (released[req.itemName] || 0) - done)
      : remaining;

    return {
      itemName: req.itemName,
      unit: req.unit,
      totalQuantity: req.quantity,
      submitted: done,
      remaining,
      availableFromPrevious,
      maxSubmittable: Math.min(remaining, availableFromPrevious),
    };
  });
}

/** Quantity that can be submitted right now for the whole step */
export function getStepMaxSubmittable(entry: EntryRecord, stepNum: number): number {
  if (isStepCompletedInSheet(entry, stepNum)) return 0;
  return getStepItemProgress(entry, stepNum).reduce((sum, item) => sum + item.maxSubmittable, 0);
}

/** The derived pending part representing the remaining quantity */
export function getPendingPart(entry: EntryRecord, stepNum: number): StepPart | null {
  if (isStepCompletedInSheet(entry, stepNum)) return null;

  const total = getStepTotalQuantity(entry);
  if (total <= 0) return null;
  const remaining = getRemainingQuantity(entry, stepNum);
  if (remaining <= 0) return null;

  const parts = getStepParts(entry, stepNum);
  const submittedMap = getSubmittedItemMap(entry, stepNum);
  const items: StepPartItem[] = getRequirements(entry)
    .map((req) => ({
      itemName: req.itemName,
      quantity: Math.max(0, req.quantity - (submittedMap[req.itemName] || 0)),
      totalQuantity: req.quantity,
    }))
    .filter((item) => item.quantity > 0);

  return {
    stepNumber: Number(stepNum),
    partNumber: parts.length + 1,
    submittedQuantity: 0,
    remainingQuantity: remaining,
    totalQuantity: total,
    status: 'Pending',
    submittedAt: '',
    submittedBy: '',
    reference: '',
    attachment: '',
    remark: '',
    items,
  };
}

/**
 * Overall step status calculated from all of its parts.
 * CHANGE 6 — a step that the sheet already marked "Completed" stays Completed.
 */
export function getOverallStepStatus(entry: EntryRecord, stepNum: number): string {
  const rawStatus = getRawStepStatus(entry, stepNum);
  if (!isPartialStep(stepNum)) return rawStatus;
  if (rawStatus === 'Locked' || rawStatus === 'Skipped' || rawStatus === 'Stopped') return rawStatus;
  if (rawStatus === 'Completed') return 'Completed';

  const total = getStepTotalQuantity(entry);
  if (total <= 0) return rawStatus;

  const submitted = getSubmittedQuantity(entry, stepNum);
  if (submitted >= total) return 'Completed';
  if (submitted > 0) return 'Partially Submitted';
  return 'Pending';
}

/**
 * Complete part wise summary of a step, ready for UI / history rendering.
 * `isActionable` is the single flag the dashboard uses to decide whether a
 * Submit button must be shown, which keeps Step 7 Part 2 and Step 8 Part 1
 * simultaneously submittable.
 */
export function getStepPartSummary(entry: EntryRecord, stepNum: number): StepPartSummary {
  const parts = getStepParts(entry, stepNum);
  const total = getStepTotalQuantity(entry);
  const completedInSheet = isStepCompletedInSheet(entry, stepNum);
  const partsQuantity = parts.reduce((sum, p) => sum + p.submittedQuantity, 0);
  const submittedQuantity = partsQuantity > 0 ? partsQuantity : (completedInSheet ? total : 0);
  const pendingPart = getPendingPart(entry, stepNum);
  const maxSubmittable = getStepMaxSubmittable(entry, stepNum);
  const rawStatus = getRawStepStatus(entry, stepNum);
  const unlocked = rawStatus !== 'Locked' && rawStatus !== 'Skipped' && rawStatus !== 'Stopped';

  return {
    stepNumber: Number(stepNum),
    totalQuantity: total,
    submittedQuantity,
    remainingQuantity: Math.max(0, total - submittedQuantity),
    parts,
    allParts: pendingPart ? [...parts, pendingPart] : parts,
    pendingPart,
    overallStatus: getOverallStepStatus(entry, stepNum),
    isFullySubmitted: completedInSheet || (total > 0 && submittedQuantity >= total),
    hasPartialSubmission: !completedInSheet && parts.length > 0 && submittedQuantity < total,
    nextPartNumber: parts.length + 1,
    maxSubmittable,
    // CHANGE 6 — a step completed in the sheet is never actionable again
    isActionable: unlocked && !completedInSheet && maxSubmittable > 0,
  };
}

/** "Step 7 Part 2" style label used everywhere in the UI, history and sheet */
export function getStepPartLabel(stepNum: number, partNumber: number, hasParts: boolean = true): string {
  if (!isPartialStep(stepNum) || !hasParts) return `Step ${stepNum}`;
  return `Step ${stepNum} Part ${partNumber}`;
}

/** Label of the part that the NEXT submission of this step will create */
export function getNextPartLabel(entry: EntryRecord, stepNum: number): string {
  if (!isPartialStep(stepNum)) return `Step ${stepNum}`;
  const summary = getStepPartSummary(entry, stepNum);
  return `Step ${stepNum} Part ${summary.nextPartNumber}`;
}

/**
 * Item wise invoice attachments recorded in Step 7, grouped per item.
 * Step 8 renders exactly this:
 *     Item A : quantity : all Item A invoice attachments
 *     Item B : quantity : all Item B invoice attachments
 */
export interface ItemAttachmentGroup {
  itemName: string;
  unit: string;
  totalQuantity: number;
  submittedQuantity: number;
  files: { partNumber: number; quantity: number; reference: string; attachment: string; submittedAt: string }[];
}

export function getItemAttachmentGroups(entry: EntryRecord, sourceStep: number = 7): ItemAttachmentGroup[] {
  const requirements = getRequirements(entry);
  const parts = getStepParts(entry, sourceStep);

  return requirements.map((req) => {
    const files: ItemAttachmentGroup['files'] = [];
    let submittedQuantity = 0;

    parts.forEach((part) => {
      part.items.forEach((item) => {
        if (item.itemName !== req.itemName || item.quantity <= 0) return;
        submittedQuantity += item.quantity;
        const file = toText(item.attachment) || part.attachment;
        files.push({
          partNumber: part.partNumber,
          quantity: item.quantity,
          reference: part.reference,
          attachment: file,
          submittedAt: part.submittedAt,
        });
      });
    });

    return {
      itemName: req.itemName,
      unit: req.unit,
      totalQuantity: req.quantity,
      submittedQuantity,
      files,
    };
  });
}

/**
 * Builds the payload sent to the backend for one partial submission.
 * The backend assigns the part number and the remaining quantity.
 */
export function buildPartialPayload(options: {
  stepNumber: number;
  entry: EntryRecord;
  items: { itemName: string; quantity: number }[];
  reference?: string;
  attachment?: string;
  remark?: string;
}): Record<string, unknown> {
  const { stepNumber, entry, items, reference = '', attachment = '', remark = '' } = options;
  const requirements = getRequirements(entry);
  const cleanItems: StepPartItem[] = items
    .map((item) => ({
      itemName: item.itemName,
      quantity: Math.max(0, toNumber(item.quantity)),
      totalQuantity: requirements.find((r) => r.itemName === item.itemName)?.quantity || 0,
      attachment,
    }))
    .filter((item) => item.quantity > 0);

  const submittedQuantity = cleanItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = getStepTotalQuantity(entry);
  const alreadySubmitted = getSubmittedQuantity(entry, stepNumber);
  const remainingAfter = Math.max(0, total - alreadySubmitted - submittedQuantity);
  const summary = getStepPartSummary(entry, stepNumber);

  return {
    stepNumber: Number(stepNumber),
    partNumber: summary.nextPartNumber,
    partLabel: `Step ${stepNumber} Part ${summary.nextPartNumber}`,
    submittedQuantity,
    totalQuantity: total,
    remainingQuantity: remainingAfter,
    isPartial: remainingAfter > 0,
    /** true => the full form quantity is covered, so the step is Completed */
    isFullyCovered: remainingAfter <= 0,
    items: cleanItems,
    reference,
    attachment,
    remark,
  };
}

// -----------------------------------------------------------------------------
// HISTORY  (part wise rows, e.g. "Step 7 Part 2 — Pending")
// -----------------------------------------------------------------------------

export interface HistoryRow {
  entryId: string;
  stepNumber: number;
  partNumber: number;
  /** "Step 7 Part 2" for partial steps, "Step 4" otherwise */
  label: string;
  submittedQuantity: number;
  remainingQuantity: number;
  totalQuantity: number;
  status: string;
  submittedAt: string;
  submittedBy: string;
  reference: string;
  attachment: string;
  remark: string;
  isPartial: boolean;
}

export function getEntryHistoryRows(entry: EntryRecord, steps?: number[]): HistoryRow[] {
  const entryId = toText(entry?.Entry_ID);
  const stepList = steps && steps.length > 0 ? steps : Array.from({ length: 10 }, (_, i) => i + 1);
  const rows: HistoryRow[] = [];

  stepList
    .slice()
    .sort((a, b) => a - b)
    .forEach((stepNum) => {
      const rawStatus = getRawStepStatus(entry, stepNum);
      if (rawStatus === 'Locked') return;

      if (isPartialStep(stepNum)) {
        const summary = getStepPartSummary(entry, stepNum);

        if (summary.allParts.length === 0) {
          rows.push({
            entryId,
            stepNumber: stepNum,
            partNumber: 1,
            label: `Step ${stepNum} Part 1`,
            submittedQuantity: summary.submittedQuantity,
            remainingQuantity: summary.remainingQuantity,
            totalQuantity: summary.totalQuantity,
            status: summary.overallStatus,
            submittedAt: toText(entry?.[`Step_${stepNum}_Completed_Timestamp`]),
            submittedBy: toText(entry?.[`Step_${stepNum}_Completed_By`]),
            reference: '',
            attachment: toText(entry?.[`Step_${stepNum}_Attachment`]),
            remark: toText(entry?.[`Step_${stepNum}_Remark`]),
            isPartial: true,
          });
          return;
        }

        summary.allParts.forEach((part) => {
          rows.push({
            entryId,
            stepNumber: stepNum,
            partNumber: part.partNumber,
            label: `Step ${stepNum} Part ${part.partNumber}`,
            submittedQuantity: part.submittedQuantity,
            remainingQuantity: part.remainingQuantity,
            totalQuantity: part.totalQuantity,
            status: part.status,
            submittedAt: part.submittedAt,
            submittedBy: part.submittedBy,
            reference: part.reference,
            attachment: part.attachment,
            remark: part.remark,
            isPartial: true,
          });
        });
        return;
      }

      rows.push({
        entryId,
        stepNumber: stepNum,
        partNumber: 1,
        label: `Step ${stepNum}`,
        submittedQuantity: 0,
        remainingQuantity: 0,
        totalQuantity: 0,
        status: rawStatus,
        submittedAt: toText(entry?.[`Step_${stepNum}_Completed_Timestamp`]),
        submittedBy: toText(entry?.[`Step_${stepNum}_Completed_By`]),
        reference: toText(entry?.[`Step_${stepNum}_Condition_Answer`]),
        attachment: toText(entry?.[`Step_${stepNum}_Attachment`]),
        remark: toText(entry?.[`Step_${stepNum}_Remark`]),
        isPartial: false,
      });
    });

  return rows;
}
