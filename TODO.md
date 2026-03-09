# TODO - Port reliability fix (local + VPS)

- [ ] Update `src/main.ts` with robust port fallback when `EADDRINUSE`
- [ ] Update `package.json` scripts with explicit production port helper
- [ ] Update `deploy.sh` PM2 start logic to avoid duplicate running instance
- [ ] Run build verification
- [ ] Run runtime verification and curl checks
