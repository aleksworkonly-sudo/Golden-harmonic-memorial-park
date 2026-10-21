# Blueprint: PayMongo Payment Integration
**Project:** Golden Harmonic Memorial Park  
**Document:** `blueprint-payment.md`  
**Target:** Philippine Payment Gateway Integration (PayMongo Checkout & Webhooks)  
**Status:** Requirements Specification & Technical Plan (Awaiting User Review)

---

## 1. Executive Summary & Objectives

The goal of this project is to integrate **PayMongo** into the Golden Harmonic Memorial Park digital platform to enable seamless, automated online payments for plot reservations and installment balances.

### Current State
- **Customer Portal ([`site.jsx`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/site.jsx))**: Customers submit manual transaction reference numbers (GCash, Bank Transfer, or Cash) via a form. These land in `customer.paymentSubmissions` with status `pending`. Staff must manually cross-reference bank accounts/GCash apps and hit "Confirm" in the Admin portal ([`admin-app.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js#L3368)) before balances update.
- **Presale Flow ([`presale.jsx`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/presale.jsx), [`api/presale.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/presale.js))**: Plot reservations are held in Firestore with status `reserved`, and buyers are instructed to wait for a phone call from office staff to pay offline or manually.

### Target State with PayMongo
1. **Instant Digital Checkout**: Direct integration with PayMongo Checkout Sessions supporting:
   - **GCash**
   - **Maya (PayMaya)**
   - **Credit/Debit Cards (Visa, Mastercard)**
   - **GrabPay**
   - **BillEase** (Buy Now, Pay Later)
2. **Automated Webhook Reconciliation**: When a customer finishes payment, PayMongo dispatches a secure webhook (`checkout_session.payment.paid`). The serverless backend validates the cryptographic signature, atomically updates the Firestore ledger, updates customer balance, and issues an automated confirmation receipt via Brevo.
3. **Reduced Operational Overhead**: Eliminates the manual receipt verification bottleneck while still preserving audit logs.

---

## 2. Integration Points in Golden Harmonic Memorial Park

```
+-----------------------------------------------------------------------------------+
|                                  USER TOUCHPOINTS                                 |
+-----------------------------------------------------------------------------------+
       |                                                            |
       v                                                            v
[Customer Portal: site.jsx]                                [Presale: presale.jsx]
- Pay Monthly Due                                           - Pay Reservation Fee (e.g. ₱5,000)
- Pay Custom Balance / Advance                              - Spot Cash Full Payment
       |                                                            |
       +----------------------------+-------------------------------+
                                    |
                                    v  POST /api/paymongo-checkout
                      +----------------------------+
                      |   Vercel Serverless API    |
                      | (api/paymongo-checkout.js) |
                      +----------------------------+
                                    |
                                    v  Creates Checkout Session
                      +----------------------------+
                      |       PayMongo API         |
                      |   api.paymongo.com/v1      |
                      +----------------------------+
                                    |
                        Returns checkout_url
                                    v
                      [PayMongo Hosted Checkout UI]
                      (Customer pays via GCash/Card)
                                    |
       +----------------------------+-------------------------------+
       |                                                            |
       v  Redirect buyer                                            v  Async HTTP POST
[Customer returns to site]                                 [api/paymongo-webhook.js]
Success page: /?payment=success                            - Validates HMAC signature
Shows instant confirmation                                 - Atomically writes to Firestore
                                                           - Dispatches receipt via Brevo
```

### 2.1 Touchpoint A: Customer Portal (`site.jsx`)
- In [`PortalDashboard`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/site.jsx#L2224), add a primary **"Pay Online with PayMongo"** button alongside the manual reference submission form.
- The buyer can choose:
  - **Pay Current Monthly Due** (e.g., `customer.plan.monthlyAmount`)
  - **Pay Custom Amount** (minimum ₱100 up to remaining balance)
  - **Pay Off Remaining Balance in Full**
- Clicking triggers `/api/paymongo-checkout` and redirects to the official PayMongo checkout.

### 2.2 Touchpoint B: Presale Plot Reservation (`presale.jsx`)
- In [`PresaleFlow`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/presale.jsx#L649), under "How will you pay?", add **Pay Online (GCash, Maya, Card via PayMongo)** as a direct payment option.
- Locks the plot atomically in `plots` collection and generates the checkout session for either:
  - Fixed reservation downpayment fee (e.g., ₱5,000)
  - Full spot cash payment

### 2.3 Touchpoint C: Admin Portal (`admin-app.js`)
- In customer payment ledger, PayMongo transactions are tagged as `method: 'PayMongo (GCash)'` (or `Card`, `Maya`), with PayMongo payment ID `pay_...` and checkout session ID `cs_...`.
- In the Pending Payments queue, PayMongo-verified transactions are marked with a distinct badge: **Verified (Automated)** with no manual action required.

---

## 3. Serverless API Architecture

Two new Vercel serverless endpoints will be added to the `/api/` directory:

### 3.1 Endpoint 1: `/api/paymongo-checkout.js`
- **Method**: `POST`
- **Authentication**: Customer Auth Token (or verified session/customer ID)
- **Role**: Communicates with PayMongo API using secret key (`PAYMONGO_SECRET_KEY`) to generate a hosted checkout session.
- **Request Body**:
  ```json
  {
    "type": "portal_installment" | "presale_reservation" | "balance_paydown",
    "customerId": "cust_12345",
    "customerEmail": "customer@example.com",
    "customerName": "Juan Dela Cruz",
    "customerPhone": "09171234567",
    "amount": 2500, // in PHP (converted to 250000 centavos)
    "description": "Golden Harmonic - Monthly Installment - Plot A-0012",
    "metadata": {
      "customerId": "cust_12345",
      "plotCode": "A-0012",
      "planId": "3-year"
    }
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "checkoutUrl": "https://checkout.paymongo.com/cs_xyz...",
    "checkoutSessionId": "cs_xyz..."
  }
  ```

### 3.2 Endpoint 2: `/api/paymongo-webhook.js`
- **Method**: `POST`
- **Role**: Ingests PayMongo asynchronous lifecycle webhooks.
- **Primary Event**: `checkout_session.payment.paid`
- **Security Check**:
  1. Inspect `Paymongo-Signature` header containing `t=<timestamp>,te=<test_sig>,li=<live_sig>`.
  2. Compute HMAC-SHA256 signature using `PAYMONGO_WEBHOOK_SECRET_KEY`.
  3. Reject payloads with invalid signatures or timestamps older than 5 minutes.
- **Processing Logic (Idempotent Transaction)**:
  1. Extract `payment_id`, `checkout_session_id`, `amount`, `payment_method_type`, and `metadata`.
  2. Query `paymongoTransactions` collection in Firestore to verify if this `payment_id` has already been processed (preventing duplicate ledger entries on webhook retries).
  3. Atomically write to Firestore:
     - Push record into `customers/{id}.payments`:
       ```json
       {
         "date": "2026-10-19",
         "amount": 2500,
         "method": "PayMongo (GCash)",
         "ref": "pay_abc123xyz",
         "paymongoCheckoutId": "cs_abc123",
         "fee": 62.50,
         "net": 2437.50,
         "note": "Online payment via PayMongo",
         "verified": true,
         "paidAt": 1792400000000
       }
       ```
     - Record in `paymongoTransactions/{paymentId}` audit log.
     - If linked to a `presaleApplication`, update application status to `paid` and plot to `sold` or `active_reservation`.
  4. Trigger email confirmation to customer via Brevo API (`send-email.js`).

---

## 4. Firestore Database Schema Updates

### 4.1 Customer Document (`customers/{customerId}`)
```json
{
  "payments": [
    {
      "amount": 2500,
      "date": "2026-10-19",
      "method": "PayMongo (GCash)",
      "ref": "pay_5x9K1mX902L...",
      "checkoutSessionId": "cs_1M9X...",
      "source": "paymongo",
      "channel": "gcash",
      "fee": 62.50,
      "net": 2437.50,
      "note": "Monthly payment via PayMongo",
      "createdAt": 1792400000000
    }
  ],
  "paymentSubmissions": [
    {
      "referenceNumber": "pay_5x9K1mX902L...",
      "amount": 2500,
      "date": "2026-10-19",
      "method": "PayMongo (GCash)",
      "status": "confirmed",
      "submittedAt": 1792400000000,
      "confirmedAt": 1792400001000,
      "autoVerified": true
    }
  ]
}
```

### 4.2 Audit Collection: `paymongoTransactions/{paymentId}`
Every incoming PayMongo payment creates a permanent audit document:
```json
{
  "paymentId": "pay_5x9K1mX902L...",
  "checkoutSessionId": "cs_1M9X...",
  "status": "paid",
  "amountCentavos": 250000,
  "amountPhp": 2500.00,
  "feeCentavos": 6250,
  "netCentavos": 243750,
  "currency": "PHP",
  "paymentMethodType": "gcash",
  "customerId": "cust_12345",
  "customerEmail": "juan@example.com",
  "customerName": "Juan Dela Cruz",
  "metadata": {},
  "processedAt": "SERVER_TIMESTAMP",
  "livemode": false
}
```

---

## 5. Security & Secret Management

| Secret Variable | Purpose | Location |
| :--- | :--- | :--- |
| `PAYMONGO_SECRET_KEY` | Authenticates backend serverless requests (`/api/paymongo-checkout.js`) | `.env.local` & Vercel Environment Variables |
| `PAYMONGO_PUBLIC_KEY` | Client-side identifier (if needed for client elements) | `.env.local` & Vercel Environment Variables |
| `PAYMONGO_WEBHOOK_SECRET_KEY` | Cryptographic key to verify HMAC signatures of webhooks | `.env.local` & Vercel Environment Variables |
| `NEXT_PUBLIC_APP_URL` | Base redirect URL for checkout `success_url` & `cancel_url` | `.env.local` |

> [!CAUTION]
> The `PAYMONGO_SECRET_KEY` must **never** be imported or referenced inside client scripts (`site.jsx`, `presale.jsx`, `admin-app.js`). All checkout session generation and webhook handling must occur strictly inside Vercel serverless functions in `/api/`.

---

## 6. Implementation Stages & Phases

1. **Phase 1: Environment & Base Setup** (Complete)
   - `.env.local` created with full documentation.
   - `.gitignore` configured to prevent credential leaks.
   - Blueprint drafted for architectural review.
2. **Phase 2: Backend Endpoints Implementation**
   - Create [`/api/paymongo-checkout.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/paymongo-checkout.js).
   - Create [`/api/paymongo-webhook.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/api/paymongo-webhook.js) with signature verification.
3. **Phase 3: Customer Portal Integration**
   - Add PayMongo checkout modal & button in [`site.jsx`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/site.jsx).
   - Add return status banner (handling `?payment_status=success` and `?payment_status=cancelled`).
4. **Phase 4: Presale Flow Integration (Optional/Decided)**
   - Add Pay Online radio button in [`presale.jsx`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/presale.jsx).
5. **Phase 5: Admin Reconciliation & Ledger Display**
   - Style PayMongo payments in [`admin-app.js`](file:///d:/COMMI/Golden-harmonic-memorial-park-main/admin-app.js) with verified badges and transaction receipts.
6. **Phase 6: Testing with PayMongo Test Credentials**
   - Test GCash sandbox, Maya sandbox, 3DS Test Card, and simulated webhook events.

---

## 7. Confirmed Architectural Decisions (User Approved)

The following design decisions were confirmed by the user on 2026-10-19:
1. **Scope of Integration**: **Dual Integration**. Enabled in both:
   - **Customer Portal**: For registered plot buyers paying their monthly installments, custom balance paydowns, or full balances.
   - **Presale Flow**: For buyers reserving Blocks A, B, C, and D plots on the public website.
2. **Presale Reservation Pricing**: **Fixed Reservation Deposit**.
   - Buyers pay a fixed reservation deposit of **₱5,000 per plot** (e.g. 2 plots = ₱10,000) via PayMongo to immediately lock and hold the lot.
   - The remaining balance is financed or paid per their chosen spot cash or installment plan.
3. **Transaction Fee Handling**: **Passed to Buyer**.
   - The convenience fee charged by PayMongo (approx. 2.5% for GCash/Maya/GrabPay, 3.5% + ₱15 for Cards) is added as a separate line item at checkout so Golden Harmonic receives the exact net reservation/installment amount.
4. **Reconciliation & Balance Update**: **Instant Automated Update via Webhook**.
   - When PayMongo webhook `checkout_session.payment.paid` triggers and is cryptographically validated, the system automatically writes directly to the customer's `payments` ledger and updates plot status in Firestore in real time, with no manual staff intervention needed.

