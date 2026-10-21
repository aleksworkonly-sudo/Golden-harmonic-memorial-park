# Migration Blueprint: Firebase to Supabase
**Project:** Golden Harmonic Memorial Park  
**Target Architecture:** Supabase (PostgreSQL, Supabase Auth, Realtime, Row-Level Security, Edge/Serverless)  
**Status:** ~~Planning & Requirements Specification~~ **CANCELLED** (2026-10-19 — User decision: staying on Firebase)

> [!IMPORTANT]
> This migration has been **cancelled**. The project will continue using **Firebase** (Firestore + Firebase Auth) as the primary backend. No Supabase code was written or deployed. This document is retained for reference only.


---

## 1. Executive Summary & Migration Goals

The **Golden Harmonic Memorial Park** platform consists of:
1. **Public Website & Customer Portal** ([`index.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/index.html), [`site.jsx`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/site.jsx)): Interactive plot showroom, cart checkout, brochure inquiry submissions, and self-service buyer portal (payment history, installment schedule tracking, and GCash/Bank receipt submission).
2. **Staff/Admin Management CRM** ([`admin.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin.html), [`admin-app.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js)): Visual plot block grid (interactive cemetery lots), customer ledger, sales pipeline, product pricing editor, TOTP 2FA, staff role management, and trash/restore audit bin.
3. **Backend Serverless Services** ([`api/send-reminders.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/send-reminders.js), [`api/send-email.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/send-email.js)): Vercel Cron serverless job triggered daily to scan installments and dispatch payment notifications via Brevo.

### Objective
Replace the Google Firebase stack (**Cloud Firestore, Firebase Authentication, Firebase Admin SDK**) with **Supabase** (**PostgreSQL, Supabase Auth / GoTrue, Supabase Realtime Channels, Supabase JavaScript SDK**), while:
- Maintaining the current **zero-bundler CDN architecture** (React 18 UMD, Babel standalone) without breaking existing workflows.
- Moving from a document NoSQL model to a robust, ACID-compliant relational SQL schema.
- Fixing architectural security and session workarounds currently present in the Firebase code.

---

## 2. System Inventory & Migration Scope

| Layer / Component | Current Implementation (Firebase) | Target Implementation (Supabase) | Complexity |
| :--- | :--- | :--- | :--- |
| **Client Core SDK** | Firebase v9 Compat (`firebase-app-compat.js`, `firestore`, `auth`) loaded via CDN in [`admin.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin.html) & [`index.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/index.html) | `@supabase/supabase-js@2` loaded via CDN (`jsdelivr` / `unpkg`) | Low |
| **Global Instance** | `window.db`, `window.auth` in [`firebase-config.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/firebase-config.js) | `window.supabase` in `supabase-config.js` | Low |
| **Database Engine** | Google Cloud Firestore (Document NoSQL) | PostgreSQL 15+ (Relational with JSONB support) | High |
| **Authentication** | Firebase Auth (Email/Password, password reset, client persistence) | Supabase Auth (GoTrue API, JWT sessions, local storage persistence) | Medium |
| **Admin User Provisioning** | Secondary App Instance Hack (`createPortalAccount`) in [`admin-app.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js#L1872) | Vercel Serverless Function calling `supabase.auth.admin.createUser()` via `SERVICE_ROLE_KEY` | High |
| **Realtime Listeners** | Firestore `onSnapshot()` across 12+ UI views | Supabase Realtime (`postgres_changes`) + initial `select()` fetch | High |
| **Array Mutations** | `FieldValue.arrayUnion()`, `FieldValue.delete()` | Relational tables (`INSERT INTO`) or PostgreSQL JSONB functions | Medium |
| **Security & Access** | Firestore Security Rules (or open rules) | PostgreSQL Row-Level Security (RLS) policies | High |
| **Daily Cron Reminders** | `firebase-admin` with base64 service account in [`api/send-reminders.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/send-reminders.js) | `@supabase/supabase-js` using `SUPABASE_SERVICE_ROLE_KEY` | Low |
| **Two-Factor Auth (2FA)** | Client-side `otpauth.umd.min.js` + unencrypted `totpSecret` stored in Firestore document | Supabase Native MFA (`supabase.auth.mfa.*`) or managed custom profile table | Medium |

---

## 3. Critical Problems, Constraints & Solutions

### Problem 1: The "Secondary App" Admin Session Problem
- **The Firebase Mechanism**: In [`admin-app.js:1873`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js#L1873), when an admin creates a customer portal account, Firebase would normally switch the current session to the new user. To bypass this, the code creates a temporary secondary app instance (`firebase.initializeApp(config, 'PortalCreate_' + Date.now())`), signs the user up, and deletes the instance.
- **The Supabase Constraint**: Supabase client SDK (`supabase.auth.signUp()`) **always replaces the active session in browser local storage**. There is no client-side concept of a "secondary app".
- **The Solution**: 
  - Do **not** register customer accounts directly from client-side JavaScript.
  - Create a new Vercel serverless endpoint: `/api/admin/create-customer-account.js`.
  - The endpoint verifies the caller's JWT (ensuring caller is an `admin` or `staff`), then calls `supabase.auth.admin.createUser()` or `supabase.auth.admin.inviteUserByEmail()` using the `SUPABASE_SERVICE_ROLE_KEY`.

---

### Problem 2: Denormalized Arrays vs. Relational Schema
- **The Firebase Mechanism**: In Firestore, a single customer document holds nested arrays:
  - `payments: [{ amount, date, method, loggedBy, ... }]`
  - `notes: [{ id, text, author, createdAt }]`
  - `paymentSubmissions: [{ referenceNumber, amount, method, status, ... }]`
  - Updates are made using `firebase.firestore.FieldValue.arrayUnion(...)`.
- **The Supabase Constraint**: Postgres does not have a native client-side `arrayUnion` API. Updating JSON arrays client-side requires reading the entire document and replacing it (susceptible to race conditions) or writing PostgreSQL PL/pgSQL stored procedures.
- **The Solution**: 
  - **Normalize into SQL tables**: Create separate relational tables (`customer_payments`, `customer_notes`, `payment_submissions`) with foreign keys referencing `customers.id`.
  - Appending a payment or submission becomes an atomic, standard `INSERT INTO payments (...)`.
  - Querying customer balance uses PostgreSQL aggregates (`SUM(amount)`), eliminating manual client-side array math.

---

### Problem 3: Realtime Listeners (`onSnapshot`) vs. Supabase Realtime Channels
- **The Firebase Mechanism**: Firestore's `onSnapshot()` performs two jobs in a single call:
  1. It performs the initial query fetch.
  2. It keeps the query continuously updated when documents match the criteria (e.g. `plots.where('blockId', '==', blockId)`).
- **The Supabase Constraint**: Supabase Realtime (`supabase.channel().on('postgres_changes', ...)`) **only broadcasts delta events (INSERT, UPDATE, DELETE)**. It does **not** return the initial snapshot.
- **The Solution**:
  - Encapsulate real-time subscriptions in a standard pattern:
  ```js
  // 1. Initial query fetch
  const { data } = await supabase.from('plots').select('*').eq('block_id', blockId);
  setPlots(data);

  // 2. Attach live delta listener
  const channel = supabase.channel('plots-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plots', filter: `block_id=eq.${blockId}` }, (payload) => {
      // update or refetch local state
    })
    .subscribe();
  ```

---

### Problem 4: Plaintext 2FA Secret Vulnerability
- **The Current Risk**: In [`admin-app.js:2698`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js#L2698), the user's TOTP secret key (`secret.base32`) is stored in plain text inside the Firestore `users/{uid}` collection. Any user with read access to the users collection can expose all staff 2FA secrets.
- **The Supabase Solution**:
  - Adopt Supabase's **Native MFA (TOTP)** via `supabase.auth.mfa.enroll()`, `supabase.auth.mfa.challenge()`, and `supabase.auth.mfa.verify()`.
  - Secrets are encrypted and handled inside the secure `auth` schema, never exposed in client tables.

---

### Problem 5: Row-Level Security (RLS) Setup
- **The Firebase Mechanism**: Firestore operations succeed unless blocked by Firestore rules.
- **The Supabase Constraint**: When RLS is enabled in Supabase, all operations are denied by default until specific SQL policies are defined.
- **The Solution**: Policies must be explicitly provisioned for:
  - **Public (Anon)**: Allowed to read available `products` and public `plots` status; allowed to insert new `inquiries` and `orders`.
  - **Customers**: Allowed to read and update only their own row where `auth_uid = auth.uid()`.
  - **Staff & Admins**: Allowed read/write across park records based on their role in `public.profiles`.

---

## 4. Target PostgreSQL Database Schema

Run this DDL script inside the Supabase SQL Editor during migration:

```sql
-- ============================================================================
-- 1. EXTENSIONS & ENUMS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'staff', 'viewer', 'customer');
CREATE TYPE plot_status AS ENUM ('available', 'reserved', 'sold');
CREATE TYPE inquiry_status AS ENUM ('new', 'contacted', 'resolved', 'archived');
CREATE TYPE order_status AS ENUM ('pending_payment', 'confirmed', 'cancelled');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');

-- ============================================================================
-- 2. USER PROFILES & ROLES (Maps to Supabase auth.users)
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 3. PRODUCTS & PACKAGES
-- ============================================================================
CREATE TABLE public.products (
  id TEXT PRIMARY KEY, -- e.g. 'regular', 'premium', 'family-vault'
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  terms JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 4. CUSTOMERS & INSTALLMENT PLANS
-- ============================================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || coalesce(middle_name || ' ', '') || last_name) STORED,
  email TEXT,
  phone TEXT,
  sex TEXT,
  status TEXT NOT NULL DEFAULT 'lead',
  source TEXT DEFAULT 'website',
  plan JSONB, -- { tierId, tierName, price, termKey, monthlyAmount, termMonths, startDate }
  interested_plan_id TEXT REFERENCES public.products(id),
  interested_plan_name TEXT,
  interested_plan_price NUMERIC(12, 2),
  reminders JSONB DEFAULT '{"lastSentForDueDate": ""}'::jsonb,
  terms_accepted BOOLEAN DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_auth_uid ON public.customers(auth_uid);

-- ============================================================================
-- 5. CEMETERY PLOTS (Interactive Grid)
-- ============================================================================
CREATE TABLE public.plots (
  id TEXT PRIMARY KEY, -- Formatted: blockId_lotNo, e.g. 'valor_101'
  block_id TEXT NOT NULL,
  lot_no INT NOT NULL,
  status plot_status NOT NULL DEFAULT 'available',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  reserved_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(block_id, lot_no)
);

CREATE INDEX idx_plots_block ON public.plots(block_id);

-- ============================================================================
-- 6. PAYMENTS & SUBMISSIONS (Normalized)
-- ============================================================================
CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL,
  method TEXT NOT NULL, -- 'Cash', 'GCash', 'Bank Transfer'
  note TEXT,
  logged_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.customer_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.payment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reference_number TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL,
  method TEXT NOT NULL,
  mobile_number TEXT,
  note TEXT,
  status submission_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ
);

-- ============================================================================
-- 7. INQUIRIES & ORDERS
-- ============================================================================
CREATE TABLE public.inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  interest TEXT,
  plan_id TEXT,
  plan_name TEXT,
  plan_price NUMERIC(12, 2),
  type TEXT DEFAULT 'brochure_request',
  status inquiry_status NOT NULL DEFAULT 'new',
  source TEXT DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  items JSONB NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  payment_term TEXT,
  term_months INT,
  term_surcharge NUMERIC(5, 2),
  payment_method TEXT,
  type TEXT DEFAULT 'cart_checkout',
  status order_status NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 8. RECYCLE / TRASH BIN
-- ============================================================================
CREATE TABLE public.trash (
  id TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  original_id TEXT NOT NULL,
  record_data JSONB NOT NULL,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

---

## 5. Row-Level Security (RLS) Policy Specifications

Execute these security policies to guard data access:

```sql
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;

-- Helper function to check staff status
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'staff')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Products: Public read, Staff write
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Staff write products" ON public.products FOR ALL USING (public.is_staff());

-- 2. Plots: Public read, Staff write
CREATE POLICY "Public read plots" ON public.plots FOR SELECT USING (true);
CREATE POLICY "Staff write plots" ON public.plots FOR ALL USING (public.is_staff());

-- 3. Inquiries: Public insert, Staff read/write
CREATE POLICY "Public insert inquiries" ON public.inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff manage inquiries" ON public.inquiries FOR ALL USING (public.is_staff());

-- 4. Orders: Public insert, Staff read/write
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff manage orders" ON public.orders FOR ALL USING (public.is_staff());

-- 5. Customers: Customer self-read/update, Staff full access
CREATE POLICY "Customer read self" ON public.customers FOR SELECT
  USING (auth_uid = auth.uid() OR public.is_staff());

CREATE POLICY "Customer update self" ON public.customers FOR UPDATE
  USING (auth_uid = auth.uid() OR public.is_staff());

CREATE POLICY "Public/Staff insert customers" ON public.customers FOR INSERT
  WITH CHECK (true);

-- 6. Payments & Submissions: Customer self-access, Staff full access
CREATE POLICY "Customer read submissions" ON public.payment_submissions FOR SELECT
  USING (customer_id IN (SELECT id FROM public.customers WHERE auth_uid = auth.uid()) OR public.is_staff());

CREATE POLICY "Customer create submissions" ON public.payment_submissions FOR INSERT
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE auth_uid = auth.uid()) OR public.is_staff());

CREATE POLICY "Staff manage payments" ON public.customer_payments FOR ALL
  USING (public.is_staff());

CREATE POLICY "Staff manage notes" ON public.customer_notes FOR ALL
  USING (public.is_staff());

CREATE POLICY "Staff manage trash" ON public.trash FOR ALL
  USING (public.is_staff());
```

---

## 6. Implementation Architecture & Code Adjustments

### 6.1 Replacement of `firebase-config.js`
Replace [`firebase-config.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/firebase-config.js) with `supabase-config.js`:

```javascript
// supabase-config.js
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialize Supabase Client
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
```

### 6.2 HTML Script Tags Update
In [`admin.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin.html#L16-L28) and [`index.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/index.html#L26-L31):
- **Remove:**
  ```html
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
  <script src="firebase-config.js"></script>
  ```
- **Insert:**
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="supabase-config.js"></script>
  ```

### 6.3 New Admin API: Provisioning Customer Accounts
Create `/api/admin/create-customer.js` to replace the secondary Firebase app hack:
```javascript
// /api/admin/create-customer.js (Vercel Serverless Function)
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Authenticate calling admin
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Check role in profiles
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['superadmin', 'admin', 'staff'].includes(profile.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 2. Provision customer user and trigger invite/reset email
  const { email, customerId } = req.body;
  const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (createErr) return res.status(400).json({ error: createErr.message });

  // 3. Link customer record
  if (customerId) {
    await supabaseAdmin
      .from('customers')
      .update({ auth_uid: newUser.user.id })
      .eq('id', customerId);
  }

  return res.status(200).json({ success: true, uid: newUser.user.id });
};
```

### 6.4 Refactoring `api/send-reminders.js`
Replace `firebase-admin` with `@supabase/supabase-js`:
```javascript
// In /api/send-reminders.js:
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch customers with active plans
const { data: customers, error } = await supabase
  .from('customers')
  .select(`
    id, first_name, last_name, full_name, email, plan, reminders,
    customer_payments ( amount )
  `);

// Update reminder status after dispatch:
await supabase
  .from('customers')
  .update({ reminders: { lastSentForDueDate: `before:${dueDateKey}` } })
  .eq('id', c.id);
```

---

## 7. Migration Checklist & Step-by-Step Execution Plan

### Phase 1: Environment & Cloud Provisioning
- [ ] Create a new project in the Supabase Dashboard.
- [ ] Note down `SUPABASE_URL`, `anon` key, and `service_role` key.
- [ ] In Supabase Auth Settings:
  - Enable **Email/Password** provider.
  - Configure Email templates (Invite, Confirmation, Password Recovery).
  - Configure redirect URLs to your custom domain/Vercel URL.
- [ ] In SQL Editor, execute the DDL Schema script (Section 4) and RLS Policies (Section 5).

### Phase 2: Backend & Vercel Configuration
- [ ] In Vercel Environment Variables:
  - Add `SUPABASE_URL`.
  - Add `SUPABASE_SERVICE_ROLE_KEY`.
  - Add `SUPABASE_ANON_KEY`.
  - (Keep `BREVO_API_KEY`, `CRON_SECRET`, `SENDER_EMAIL`).
- [ ] Update [`package.json`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/package.json):
  - Remove `"firebase-admin": "^12.0.0"`.
  - Add `"@supabase/supabase-js": "^2.45.0"`.
- [ ] Deploy new endpoint `/api/admin/create-customer.js`.
- [ ] Update [`api/send-reminders.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/send-reminders.js) to query Supabase.

### Phase 3: Public Website & Customer Portal Refactor
- [ ] Create `supabase-config.js`.
- [ ] In [`index.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/index.html) and [`Golden_Harmonic_Memorial_Park.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/Golden_Harmonic_Memorial_Park.html):
  - Swap Firebase scripts with Supabase CDN bundle and `supabase-config.js`.
- [ ] In [`site.jsx`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/site.jsx):
  - Replace product loading query with `window.supabase.from('products').select('*').order('sort_order')`.
  - Replace inquiry creation with `window.supabase.from('inquiries').insert(...)`.
  - Replace order creation with `window.supabase.from('orders').insert(...)`.
  - Update Customer Portal auth:
    - `window.supabase.auth.signInWithPassword({ email, password })`.
    - `window.supabase.auth.resetPasswordForEmail(email)`.
    - `window.supabase.auth.onAuthStateChange(...)`.
    - Replace payment submission with `window.supabase.from('payment_submissions').insert(...)`.

### Phase 4: Admin Dashboard Refactor
- [ ] In [`admin.html`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin.html):
  - Swap Firebase scripts with Supabase CDN bundle and `supabase-config.js`.
- [ ] In [`admin-app.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js):
  - Update `Login` component to use `window.supabase.auth.signInWithPassword`.
  - Replace `onSnapshot` queries with combined fetch + Realtime listeners:
    - Products catalog
    - Cemetery plot allocation grid
    - Customers ledger & inquiries
    - Soft-delete trash management
  - Replace `createPortalAccount` with a `fetch('/api/admin/create-customer', ...)` call.
  - Replace batch product reordering with `window.supabase.from('products').upsert(...)`.

### Phase 5: Verification & Cutover
- [ ] Test public inquiry form submission.
- [ ] Test cart checkout and reservation submission.
- [ ] Test customer login, receipt upload, and balance calculation.
- [ ] Test staff admin plot reservation / lot assignment grid.
- [ ] Run test trigger on `/api/send-reminders` to confirm Brevo payment reminder dispatch.
- [ ] Remove obsolete `firebase-config.js` and delete Firebase credentials.
