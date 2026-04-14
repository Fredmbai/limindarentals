// ── Auth ─────────────────────────────────────────────────
export interface User {
  id:              string;
  full_name:       string;
  phone:           string;
  email:           string | null;
  national_id:     string | null;
  role:            "landlord" | "tenant" | "caretaker";
  created_at:      string;
  next_of_kin?:    NextOfKin | null;
  landlord_profile?: LandlordProfile | null;
}

export interface NextOfKin {
  full_name:    string;
  relationship: string;
  phone:        string;
  email:        string | null;
}

export interface LandlordProfile {
  company_name: string;
  kra_pin:      string | null;
}

// ── Properties ───────────────────────────────────────────
export interface Property {
  id:             string;
  name:           string;
  address:        string;
  units_count:    number;
  vacant_count:   number;
  occupied_count: number;
  blocks:         Block[];
  units:          Unit[];
  created_at:     string;
}

export interface Block {
  id:          string;
  name:        string;
  units_count: number;
}

export interface Unit {
  id:          string;
  unit_number: string;
  unit_type:   string;
  rent_amount: string;
  status:      "vacant" | "occupied";
  block:       string | null;
  block_name:  string | null;
}

// ── Tenancy ──────────────────────────────────────────────
export interface PaymentStatus {
  status:    string;
  is_overdue: boolean;
  days_overdue: number;
  balance:   number;
  paid_until: string | null;
}

export interface Tenancy {
  id:                string;
  status:            "pending" | "active" | "ended";
  lease_start_date:  string;
  rent_snapshot:     string;
  deposit_amount:    string;
  landlord_name:     string;
  landlord_phone:    string;
  property_name:     string;
  unit:              Unit;
  agreement:         TenancyAgreement | null;
  initial_amount_due: InitialAmountDue;
  payment_status:    PaymentStatus | null;
  created_at:        string;
}

export interface TenancyAgreement {
  id:               string;
  tenant_name:      string;
  tenant_phone:     string;
  landlord_name:    string;
  company_name:     string;
  property_name:    string;
  unit_number:      string;
  rent_amount:      string;
  deposit_amount:   string;
  lease_start_date: string;
  signed_name:      string;
  signed_at:        string;
  agreement_pdf:    string | null;
}

export interface InitialAmountDue {
  deposit:       number;
  prorated_rent: number;
  total:         number;
}

// ── Payments ─────────────────────────────────────────────
export interface Payment {
  id:             string;
  tenancy:        string;
  tenancy_unit:   string;
  tenant_name:    string;
  payment_type:   "initial" | "monthly" | "custom";
  method:         "mpesa" | "card" | "bank";
  status:         "pending" | "success" | "failed";
  amount_due:     string;
  amount_paid:    string;
  balance:        number;
  transaction_id: string | null;
  period_start:   string | null;
  period_end:     string | null;
  due_date:       string | null;
  paid_at:        string | null;
  receipt_number: string | null;
  bank_proof:     string | null;
  created_at:     string;
}

export interface Receipt {
  id:             string;
  receipt_number: string;
  generated_at:   string;
  tenant_name:    string;
  unit_number:    string;
  property_name:  string;
  amount_paid:    string;
  payment_method: string;
  transaction_id: string | null;
  receipt_pdf:    string | null;
}

// ── Maintenance ──────────────────────────────────────────
export interface MaintenanceRequest {
  id:               string;
  issue:            string;
  priority:         "low" | "medium" | "high";
  status:           "open" | "in_progress" | "resolved";
  image:            string | null;
  resolution_notes: string;
  created_at:       string;
  resolved_at:      string | null;
}

// ── Notifications ────────────────────────────────────────
export interface Notification {
  id:                   string;
  title:                string;
  message:              string;
  notification_type:    string;
  is_read:              boolean;
  created_at:           string;
}

// ── API response wrappers ────────────────────────────────
export interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}