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
