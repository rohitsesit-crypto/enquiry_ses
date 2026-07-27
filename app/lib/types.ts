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