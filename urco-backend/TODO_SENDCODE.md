# TODO: Fix send-code for non-existent users

## Task
Modify the auth logic so that `POST /auth/send-code` works even if the user doesn't exist yet in the database. This is for the initial registration flow where:
1. User enters email → code sent → user verifies → then completes signup

## Steps

### Step 1: Update Prisma Schema
- [x] Add `PendingEmailVerification` model to store verification codes temporarily

### Step 2: Modify AuthService
- [x] Update `resendVerificationCode` to handle new emails (create pending verification)
- [x] Update `verifyEmailCode` to verify against pending verifications
- [x] Update `signup` to handle pre-verified emails

### Step 3: Generate Prisma Client
- [x] Run prisma generate

### Step 4: Apply database changes
- [x] Run prisma db push

### Step 5: Build project
- [x] Run npm run build

