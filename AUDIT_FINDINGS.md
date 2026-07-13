# SchoolCore Production Audit Findings

**Date:** 2026-07-13  
**Status:** In Progress  
**Scope:** Complete backend-frontend integration audit

---

## Critical Issues Found

### 1. Backend Services Analysis

#### ✅ Complete Services
- **academic.js**: Session, term, class, arm, subject CRUD; grading config; context (88%)
- **students.js**: Create, update, transfer, alumni, reactivate, password reset (100%)
- **teachers.js**: Create, update, delete, password reset (100%)
- **results.js**: Process, publish with grading (100%)
- **pins.js**: Result and fee PIN generation (95%) — *Minor: debug console.log remains*
- **audit.js**: School and platform logging (100%)
- **settings.js**: School settings, directory profile, fee structure, debtors (100%)
- **wallet.js**: Fund wallet, approve/reject deposits (100%)
- **calendar.js**: Event CRUD (100%)
- **announcements.js**: Announcement CRUD (100%)
- **awards.js**: Award CRUD (100%)
- **timetable.js**: Timetable CRUD (100%)

#### ⚠️ Incomplete/Undocumented Services
- **dashboard.js**: Loads data but no dedicated endpoints exposed
- **commissions.js**: Has `writeCommission()` but signature doesn't match pins.js usage
- **partners.js**: Has different `writeCommission()` signature — potential conflict

---

## Issues by Module

### Dashboard
- ❌ No endpoint to reload specific dashboard sections
- ❌ No endpoint for recent activity list
- ⚠️ Frontend may directly access Firebase for dashboard data

### Students
- ✅ Create, update, transfer, alumni, reactivate, password reset
- ❌ **Missing**: Bulk import/export
- ❌ **Missing**: Photo upload endpoint
- ❌ **Missing**: Advanced search/filtering
- ❌ **Missing**: Student profile retrieval endpoint

### Teachers
- ✅ Create, update, delete, password reset
- ❌ **Missing**: Bulk import/export
- ❌ **Missing**: Photo/profile image
- ❌ **Missing**: Subject assignment validation

### PINs
- ✅ Generate result PINs (batch)
- ✅ Generate fee PINs (single)
- ✅ List PIN history
- ⚠️ **Issue**: Debug console.log at lines 64-69 in pins.js
- ❌ **Missing**: Search/filter endpoint
- ❌ **Missing**: PIN statistics endpoint
- ❌ **Missing**: Mark PIN as used/redemption tracking
- ❌ **Missing**: Resend PIN function
- ❌ **Missing**: Visual inventory dashboard

### Results
- ✅ Process results
- ✅ Publish results
- ⚠️ **Issue**: No preview endpoint before processing
- ❌ **Missing**: Result modification/correction
- ❌ **Missing**: Bulk raw score import
- ❌ **Missing**: Result validation before processing
- ❌ **Missing**: Export results

### Activity Log / Audit
- ✅ `logAudit()` called in all major operations
- ❌ **Missing**: Audit log retrieval/search endpoint
- ❌ **Missing**: Audit log filtering
- ❌ **Missing**: Audit log export

### Settings & Configuration
- ✅ Save settings, directory profile, fee structure
- ✅ Get debtors
- ⚠️ **Issue**: Directory profile uses wrong field names (postedAt)
- ❌ **Missing**: Get settings endpoint
- ❌ **Missing**: Get school profile endpoint

### Wallet
- ✅ Fund wallet, get wallet, approve deposit, reject deposit
- ⚠️ **Issue**: Transaction module referenced but not reviewed
- ❌ **Missing**: Wallet statistics endpoint
- ❌ **Missing**: Transaction download

### Academic Setup
- ✅ Create/delete sessions, terms, classes, arms, subjects
- ⚠️ **Issue**: No update operations for most entities
- ❌ **Missing**: Bulk operations
- ❌ **Missing**: Reorder operations

### Timetable
- ✅ Save, load, delete timetable
- ❌ **Missing**: Timetable validation
- ❌ **Missing**: Get all timetables

### Calendar
- ✅ Create, get, delete events
- ⚠️ **Issue**: No sorting by start date working
- ❌ **Missing**: Update events

### Announcements
- ✅ Create, get, delete announcements
- ⚠️ **Issue**: Sort using wrong field (postedAt vs createdAt)
- ❌ **Missing**: Update announcements
- ❌ **Missing**: Pin/feature announcements

### Awards
- ✅ Create, get, delete awards
- ❌ **Missing**: Update awards
- ❌ **Missing**: Award categories/bulk assign

### Commission/Partners
- ⚠️ **CRITICAL**: TWO `writeCommission()` functions with different signatures
  - `pins.js` calls: `writeCommission(school, quantity, 'result')`
  - `commissions.js` expects: `writeCommission(school, data, userEmail)`
  - `partners.js` has: `writeCommission(school, pinCount, pinType)`
- ❌ **Issue**: Duplicate logic across modules
- ❌ **Missing**: Commission verification/tracking

---

## Functional Gaps

### PIN Inventory (Priority 1)
Current: Pins are generated but history has no filtering/search
Required:
- ✅ `listPinHistory()` exists
- ❌ Search by PIN code
- ❌ Filter by status (used/unused)
- ❌ Filter by date range
- ❌ Filter by student (fee pins)
- ❌ Statistics: total, used, unused, generation rate
- ❌ Redemption tracking
- ❌ Visual PIN inventory UI backend

### Activity Log (Priority 1)
Current: Audit entries written but no retrieval
Required:
- ❌ Get audit log endpoint
- ❌ Filter by action type
- ❌ Filter by date range
- ❌ Filter by user
- ❌ Search by detail text
- ❌ Export audit log
- ❌ Dashboard recent activity endpoint

### Frontend Integration Issues
- ❌ No HTTP endpoint routing layer documented
- ❌ No request/response format specification
- ❌ No authentication middleware visible
- ❌ No error handling standardization
- ❌ No rate limiting

---

## Data Consistency Issues

1. **Field Name Inconsistencies**
   - `createdAt` vs `postedAt` (announcements)
   - `studentPassword` vs `teacherPassword` vs `accessKey`
   - `fullName` vs `name` (teachers)

2. **Data Model Issues**
   - Award.studentId references `students/${school.id}` but should be global
   - Students stored at global level, not school level
   - Enrollment stored separately, adding complexity

---

## Code Quality Issues

1. **Debug Code**
   - `pins.js` lines 64-69: Console.log in production

2. **Duplicate Code**
   - Commission logic in two places (commissions.js vs partners.js)
   - Validators referenced but not reviewed

3. **Missing Null Checks**
   - Various places don't verify returned data exists before accessing

4. **Error Handling**
   - Inconsistent error messages
   - No standardized error codes

---

## Recommended Fixes (Priority Order)

### Phase 1: Critical (Today)
1. Fix commission writing conflict (commissions.js vs partners.js)
2. Remove debug console.log from pins.js
3. Create PIN search/filter endpoint
4. Create audit log retrieval endpoint
5. Standardize error responses

### Phase 2: Important (This Week)
1. Add missing CRUD endpoints (update operations)
2. Add bulk operations for academic setup
3. Implement photo upload endpoints
4. Create dashboard statistics endpoint
5. Add result validation endpoint

### Phase 3: Polish (Next Week)
1. Add export/download endpoints
2. Optimize data loading queries
3. Add caching layer
4. Create analytics endpoints
5. Add batch operation support

---

## Frontend Audit Checklist

### Dashboard
- [ ] Verify dashboard loads all data via backend
- [ ] Check recent activity section
- [ ] Verify statistics calculation

### Students
- [ ] Create student flow
- [ ] Edit student flow
- [ ] Search/filter functionality
- [ ] Transfer student flow
- [ ] Mark alumni flow
- [ ] Password reset flow
- [ ] Bulk import (if exists)
- [ ] Export (if exists)

### Teachers
- [ ] Create teacher flow
- [ ] Edit teacher flow
- [ ] Delete teacher flow
- [ ] Subject assignment
- [ ] Class assignment
- [ ] Password/access key reset

### Results
- [ ] Raw score submission view
- [ ] Processing engine flow
- [ ] Result preview
- [ ] Publish flow
- [ ] Result checker

### PINs
- [ ] Generate result pins
- [ ] Generate fee pins
- [ ] PIN history/inventory view
- [ ] Search pins
- [ ] Filter pins
- [ ] Download PIN list

### Settings
- [ ] School settings form
- [ ] Directory profile form
- [ ] Fee structure form
- [ ] Grading config

### Wallet
- [ ] Fund wallet flow
- [ ] Transaction history
- [ ] Balance display

### Audit Log
- [ ] Display recent activities
- [ ] Search activities
- [ ] Filter activities

---

## Production Readiness Checklist

- [ ] All console.log statements removed
- [ ] All debug code removed
- [ ] All duplicate functions consolidated
- [ ] All error messages standardized
- [ ] All null checks in place
- [ ] All endpoints documented
- [ ] All rate limits configured
- [ ] All audit logging working
- [ ] All transactions atomic
- [ ] All data validated
