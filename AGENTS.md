# HGNUOJ workflow

- Use `guke/dev` for updates. Start from the latest `origin/master`, preserve
  other contributors' changes, and resolve conflicts before publishing.
- Push `guke/dev` and open a pull request into `master`. Merge after the relevant
  checks pass; retain `guke/dev` for subsequent updates.
- Production runs in `/opt/HGNUOJ-Hydro/Hydro` under PM2. Preserve that directory
  and existing service configuration. Keep deployment backups on the server.
