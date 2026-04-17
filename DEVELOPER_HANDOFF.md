# QFS Wallet – Developer Handoff Document (Production-Ready)

## 1. Home Screen

**Purpose:** Minimal, clean, mobile-first screen. Only essential features.

### Components
- Hero Balance + Deposit/Withdraw Buttons — keep exactly as-is.
- Transaction History Tab — display 2 most recent transactions under hero buttons.

### Transaction Entry Display
- Date / Time
- Amount
- Transaction type (Deposit / Withdraw / Transfer)
- Status (Pending / Completed / Failed)

### Interaction
- Clicking a transaction opens the **Full Transaction Modal** with:
  - Full transaction list
  - Reference ID
  - Recipient/Source
  - Detailed status

### Text Flow (Home Screen → Transaction Modal)
```text
[Home Screen] --> [Transaction History Tab]
  |--> Show 2 most recent transactions
  |--> Click any transaction --> Open [Full Transaction Modal]
```

### Notes
- No other buttons/links on Home Screen.
- Keep UI minimal.

---

## 2. Transaction History Modal / Function

### Features
- Full list of transactions (Deposits, Withdrawals, Transfers, Investments)
- Filter by transaction type and date range
- Search by reference ID or amount
- Optional export (CSV/PDF)

### Transaction Details
- Date & Time
- Amount
- Type
- Status
- Reference ID
- Recipient / Sender

### Text Flow (Modal Navigation)
```text
[Full Transaction Modal]
  |--> Filter by Type / Date
  |--> Search by Ref ID / Amount
  |--> Select transaction --> Show transaction details
```

---

## 3. Menu / Slide-Out Section

**Purpose:** Houses navigation links. Only Settings has functional components.

### A. Main Menu Items (Link Only)
1. Transaction History → Redirects to full modal (optional)
2. Assets / Investments → Redirects to portfolio/asset page
3. Cards → Redirects to virtual card page
4. Buy Crypto / Investment Options → Redirects to external platform/API
5. Support → Opens Smartsupp chat or support page
6. About / Legal → Redirects to Terms, Privacy Policy, or app info page

### B. Settings Button (Functional)
- Opens Settings modal/page
- Features:
  - Change Password
  - Pass PIN Management (create, reset/change PIN, toggle biometric login)
  - Day/Night Mode toggle
  - Logout
  - Optional notification preferences

### Text Flow (Menu → Settings vs Links)
```text
[Menu / Slide-Out]
  |--> Transaction History --> Link page
  |--> Assets / Investments --> Link page
  |--> Cards --> Link page
  |--> Buy Crypto / Investment Options --> Link page
  |--> Support --> Link page
  |--> About / Legal --> Link page
  |--> Settings --> Functional Modal/Page
        |--> Change Password
        |--> Manage Pass PIN (create/reset, toggle biometric)
        |--> Day/Night Mode
        |--> Logout
        |--> Optional: notification preferences
```

---

## 4. Settings Modal / Page

### Features
1. Change Password
2. Pass PIN Management
   - Create / Reset / Change PIN
   - Enable / Disable Biometric Login (linked to PIN)
3. Day / Night Mode Toggle
4. Logout
5. Optional notification preferences

### Text Flow (Settings → PIN & Biometric)
```text
[Menu] --> [Settings]
  |--> Change Password
  |--> Manage Pass PIN
        |--> Create / Reset PIN
        |--> Toggle Biometric ON / OFF
  |--> Day/Night Mode
  |--> Logout
```

---

## 5. Pass PIN + Biometric Enhancement

**Purpose:** Secure access for returning users.

### First-Time Login Flow
```text
[Login: Email + Password]
  |--> Success
  |--> Prompt: Create 4-digit Pass PIN
  |--> Enter PIN
  |--> Confirm PIN
  |--> Toggle Biometric Login (optional)
```

### Returning User Flow
```text
[Open App]
  |--> Check if Pass PIN exists
      |--> Yes:
            |--> Prompt PIN
            |--> If Biometric ON --> Authenticate with Fingerprint/FaceID
            |--> 3 wrong attempts --> fallback to Email + Password
      |--> No: prompt for full Email + Password
```

### Logout Flow
```text
[Logout]
  |--> Invalidate Pass PIN
  |--> Next login: Email + Password + Prompt new PIN
```

### Implementation Notes
- Secure storage: hash + salt PIN or secure local storage
- Biometric auth is linked to PIN, not password

### UI/UX
- PIN creation modal after first login
- Toggle for biometric clearly visible
- Settings includes PIN reset + biometric toggle

### Error Handling
- 3 incorrect PIN attempts → force full login
- Biometric failure → fallback to PIN

---

## 6. KYC Management

### Statuses
- Pending
- Approved
- Rejected

### If Rejected
- Clear previous rejected submission automatically
- Allow new verification
- Display clear status messages (toast or modal)

### UI
- Keep KYC badge on Home Screen as indicator

### Text Flow
```text
[Home Screen] --> KYC Badge
  |--> Status: Pending / Approved / Rejected
  |--> Rejected --> Clear old submission --> Allow new submission
```

---

## 7. Security

- Authentication: Password + Biometric only (no 2FA)
- Data: AES-256 encryption + HTTPS
- Session: Auto-logout after inactivity

---

## 8. Layout & UX Notes

1. Home: Only hero balance + buttons + 2 recent transactions
2. Menu: Links to external pages; only Settings functional
3. Settings: Only user preferences / security functions
4. Transaction modal: Full history, filterable, scrollable
5. Cards, Promo Carousel, KYC Badge: Keep UI as-is
6. Ensure all modals and lists scroll properly on mobile

---

## ✅ Developer Summary

```text
[Home Screen]
  |--> Hero Balance + Deposit/Withdraw Buttons
  |--> 2 Recent Transactions
  |--> Click --> Full Transaction Modal

[Menu / Slide-Out]
  |--> Assets / Investments --> Link
  |--> Cards --> Link
  |--> Buy Crypto / Investment Options --> Link
  |--> Support --> Link
  |--> About / Legal --> Link
  |--> Settings --> Manage PIN, Biometric, Password, Day/Night, Logout

[Pass PIN + Biometric]
  |--> First-time login: Email + Password --> Create PIN --> Optional Biometric
  |--> Returning user: PIN / Biometric
  |--> Logout: Invalidate PIN

[KYC]
  |--> Badge on Home Screen
  |--> Clear rejected submission
  |--> Allow resubmission

[Security]
  |--> Password + Biometric only
  |--> AES-256 / HTTPS
  |--> Session management
```
