# CP2 access controls — review artifact, not deployment rules

This fragment is deliberately outside the root Firebase configuration. It is NOT a complete ruleset and must not replace the deployed rules. The `.agents` Firebase authentication skill's rules-author review recommended this boundary.

```text
// Inside the existing match /databases/{database}/documents block:
match /reservationAccess/{document=**} { allow read, write: if false; }
match /reservationSessions/{document=**} { allow read, write: if false; }
match /paymentAccessLimits/{document=**} { allow read, write: if false; }
```

These collections are server-only, including against authenticated admin browsers. Firestore overlapping allows are OR-combined: the fragment does not override a broad `allow` elsewhere. The actual composed rules must exclude all three collections from broad grants and be tested before setting `PAYMENT_ACCESS_ENABLED=true`.

Also protect `presaleApplications.email`, `mobileKey`, `accessVersion`, `customers.authUid` and `users.role` against unauthorized changes. Authorize contact corrections through the office; increment `accessVersion` monotonically in the SAME transaction as each contact change. A fingerprint catches current mismatches but not a change away and back. Existing records with no positive accessVersion are deliberately ineligible for links; initial trusted version provisioning and fixing legacy contact writers are enabling prerequisites, not automatic changes by this checkpoint.

Emulator scenarios required against the real composed baseline: anonymous, owner, other buyer, staff and admin cannot get/list/write any private access collection; unauthorized users cannot relink customers/change contacts/raise roles; authorized legacy operations remain compatible. Add a broad-allow counterexample to ensure the review catches overlapping grants. Unit transaction doubles are not a substitute for these tests.

Server-side checks still apply because Admin SDK bypasses rules. Test token replay, two simultaneous exchanges, contact/version changes racing exchange and reads, logout racing idle renewal, expiry boundaries, scoped guest reads and request limits. CP2 closes the legacy reference/mobile lookup rather than providing a bypass.

Sources: [Firebase rule structure](https://firebase.google.com/docs/firestore/security/rules-structure), [Firebase rules tests](https://firebase.google.com/docs/rules/unit-tests).
