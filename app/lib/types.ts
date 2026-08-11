// Types for Enquiry Capture O2D - Flowchart Management System

export interface RequirementItem {
  itemName: string;
  quantity: number;
  unit: string;
}

export interface EnquiryFormData {
  location: 'Mumbai' | 'Boisar' | '';
  companyName: string;
  nameOfEnquirer: string;
  mobileNumber: string;
  emailId: string;
  requirements: RequirementItem[];
  salesPersonAccountable: string;
  salesCloseDate: string;
  typeOfEnquiry: 'Purchase' | 'General' | 'Order Received' | '';
  remark: string;
}

export interface StepData {
  stepNumber: number;
  stepName: string;
  status: 'Locked' | 'Pending' | 'Completed' | 'Stopped' | 'Skipped';
  plannedDate: string | null;
  actualDate: string | null;
  delayDays: number | null;
  attachment: string | null;
  completedBy: string | null;
  completedTimestamp: string | null;
  conditionAnswer: string | null;
  remark: string | null;
}

export interface EnquiryEntry {
  entryId: string;
  serialNo: number;
  timestamp: string;
  formData: EnquiryFormData;
  steps: StepData[];
  submittedBy: string;
  currentStep: number;
  isCompleted: boolean;
  isStopped: boolean;
}

export interface User {
  email: string;
  name: string;
  mobile: string;
  assignedSteps: number[];
  canFillForm: boolean;
  isAdmin: boolean;
  isActive: boolean;
  officeAccess?: 'Mumbai' | 'Boisar' | 'Mumbai&Boisar' | '';
}

export interface PurchaseOrderForm {
  poNumber: string;
  location: string;
  qNo: string;
  deliveryDate: string;
  payTerms: number;
}

export interface DispatchForm {
  name: string;
  mobNo: string;
  invoiceChallanNo: string;
  gatePassNo: string;
  lrNo: string;
  mode: 'Transport' | 'Courier' | 'By Hand' | 'Collect by Client' | 'Porter' | 'Direct by Client';
}

export interface InvoiceEntry {
  itemName: string;
  quantityReceived: number;
  totalQuantity: number;
  attachment: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DashboardData {
  entries: EnquiryEntry[];
  user: User;
  salesPersons: string[];
  companies: { companyName: string; nameOfEnquirer: string; mobileNumber: string; emailId: string }[];
}

export const STEP_NAMES: Record<number, string> = {
  1: 'Quotation',
  2: 'Follow Up 1',
  3: 'Follow Up 2',
  4: 'Purchase Date',
  5: 'Acknowledgement',
  6: 'Inventory Check',
  7: 'Invoice and E-Way Bill',
  8: 'Dispatch',
  9: 'IMS Entry Outward',
  10: 'Reminder',
};

// ==================== SYNC & REAL-TIME TYPES ====================

export interface SyncState {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  syncError: string | null;
  dataHash: string | null;
}

export interface SyncNotification {
  id: string;
  type: 'new_entry' | 'updated_entry' | 'new_entries' | 'step_changed' | 'data_refreshed';
  message: string;
  timestamp: Date;
  entryId?: string;
  count?: number;
}

export interface NormalizedEntry {
  Entry_ID: string;
  Serial_No: number;
  Timestamp: string;
  Submitted_By: string;
  Location: string;
  Company_Name: string;
  Name_of_Enquirer: string;
  Mobile_Number: string;
  Email_Id: string;
  Requirements_JSON: string;
  Sales_Person_Accountable: string;
  Sales_Close_Date: string;
  Type_of_Enquiry: string;
  Remark: string;
  Current_Step: number;
  Is_Completed: boolean;
  Is_Stopped: boolean;
  Challan_Number?: string;
  [key: string]: unknown;
}

export interface SyncConfig {
  /** Polling interval in milliseconds (default: 5000 = 5 seconds) */
  pollInterval: number;
  /** Whether to show notifications for changes */
  showNotifications: boolean;
  /** Maximum number of notifications to keep */
  maxNotifications: number;
  /** Whether sync is enabled */
  enabled: boolean;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  pollInterval: 5000,
  showNotifications: true,
  maxNotifications: 10,
  enabled: true,
};

// ==================== HOLIDAY & SUNDAY TYPES ====================

export interface HolidayEntry {
  date: string;       // DD-MM-YYYY format
  reason: string;
}

export interface HolidaysAndSundaysData {
  holidays: HolidayEntry[];
  sundays: string[];  // Array of DD-MM-YYYY date strings
}
