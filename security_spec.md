# Security Specification - Musa Traders Inventory & Logistics

## Data Invariants
1. A Product must have a name, unit, and non-negative stock levels.
2. A Production log must reference a valid Product.
3. A Sale must reference a valid Product and Client.
4. A Builty (Consignment) must have a unique builty number and valid sender/receiver info.
5. Credit balances for clients must be updated only via authorized transactions.

## The "Dirty Dozen" Payloads (Deny Test Cases)
1. **Identity Spoofing**: User A trying to update User B's profile.
2. **Product Price Injection**: Staff member trying to set product price to 0.01 internally.
3. **Negative Stock**: Creating a sale that results in negative stock (if enforcement is in rules).
4. **Illegal ID**: Creating a product with a 2KB string as ID.
5. **Admin Escalation**: Staff member trying to update their own role to 'admin'.
6. **Ghost Field**: Adding `isVerified: true` to a Sale document.
7. **Orphaned Production**: Production log for a `productId` that doesn't exist.
8. **Client Spoofing**: Setting `senderName` of a Builty to someone else's name without permission.
9. **History Manipulation**: Modifying a `stockControlHistory` record from last month.
10. **Global Lockdown Bypass**: Reading `monthlyReports` without being an admin.
11. **Mass Quota Attack**: Sending 100 writes in one batch (beyond batch limits).
12. **PII Leak**: Reading all client emails via a blanket query without filtering.

## Test Runner (Logic Overview)
- `isOwner(uid)`: `request.auth.uid == uid`
- `isAdmin()`: `exists(/databases/$(database)/documents/users/$(request.auth.uid)) && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'`
- `isValidProduct(data)`: Strictly enforces types and sizes.
- `isValidBuilty(data)`: Enforces `builtyNumber` regex and size.
