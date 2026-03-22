# Fix API Issue - Plan

## Problem Identified

### 1. Wrong Endpoint
- **Your request**: `POST http://82.165.35.28:3002/api/v1/auth/register`
- **Correct endpoint**: `POST http://82.165.35.28:3002/api/v1/auth/signup`
- The auth controller uses `@Post('signup')`, not `@Post('register')`

### 2. Port 3002 Returning HTML
The HTML response you received indicates something else is running on port 3002 (likely a frontend React/Vite app), NOT the NestJS backend.

## Solution Steps

### Step 1: Test with Correct Endpoint
Run the test script to verify:
```powershell
.\test-api-fixed.ps1
```

### Step 2: Check Server Status
On the server, check what's running:
```bash
pm2 status
curl http://localhost:3002/api/v1/auth/signup
```

### Step 3: If NestJS not running on port 3002
Redeploy with the correct configuration:
```powershell
cd urco-backend
.\deploy-ionos.ps1
```

## Expected Results

After fix:
- `POST http://82.165.35.28:3002/api/v1/auth/signup` → Returns JSON (validation error or user created)
- `POST http://82.165.35.28:3002/api/v1/auth/register` → Returns 404 JSON (route not found)

