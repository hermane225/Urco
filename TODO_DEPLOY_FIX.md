# Deployment Fix TODO

Status: In progress

## Steps
- [x] Step 1: Edit deploy-ionos.ps1 to fix PowerShell sed quoting issue (sed -i double quotes causing parse error).
- [x] Step 2: Test by running cd urco-backend && .\\deploy-ionos.ps1 (approved by user?).
- [ ] Step 3: Verify remote deployment: SSH to server, pm2 status/logs urco-backend, check http://server-ip:3002/api/health if endpoint exists.

## Context
Fixed PowerShell parsing in bash script generation for .env cleanup (SMTP vars).
