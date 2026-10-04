# MotoPOS Cloud Website

Static GitHub Pages dashboard for MotoPOS.

## Routes

- `#/login` — owner/staff authentication
- `#/dashboard/overview` — shop dashboard
- `#/admin` — protected MotoPOS developer license control

## Security

The browser contains only the Supabase **publishable** key. It does not contain a service-role or secret key. Authorization is enforced by Supabase Auth, PostgreSQL RLS and protected RPC functions.

## Hosting

The `.github/workflows/pages.yml` workflow validates `web/app.js` and deploys the `web/` directory using GitHub Pages.


## Plans & Entitlements v2

MotoPOS Cloud 1.1 moves pricing and plan entitlements into Supabase.

- Database-driven monthly and annual pricing
- Basic / Pro / Business feature entitlements
- Plan-aware dashboard navigation and locked-module screens
- 7-day Pro Trial entitlement handling
- Smart plan defaults for devices, staff and offline grace
- Monthly / annual / custom license terms
- License price snapshots and event history
- Administrator overrides for special device/staff contracts


## MotoPOS v2.2 Production Hardening

- Server-side entitlement gates for licensed modules
- API-free MotoPOS Auto Support with human handoff
- In-app shop notifications
- Custom license orders with manual payment verification
- Developer System Health Center
- CSV exports and full JSON shop backup
- Android Bluetooth + USB ESC/POS printing
- Barcode scanning for POS and inventory product setup
