# MotoPOS email verification

MotoPOS uses normal email verification links. It does **not** use email OTP.

## Why the confirmation email uses a MotoPOS landing page

Some enterprise and school email systems automatically prefetch links for malware scanning. A direct Supabase `{{ .ConfirmationURL }}` can therefore be consumed before the user clicks it.

The MotoPOS template uses a two-step link:

1. The email opens `#/confirm-email?token={{ .TokenHash }}` on MotoPOS Cloud.
2. The MotoPOS page does not verify automatically.
3. The user manually presses **Confirm email address**.
4. JavaScript then sends the token hash to the Supabase `/auth/v1/verify` endpoint.
5. Supabase redirects to `?email-confirmed=1`, where MotoPOS shows the success page.

Because the token is placed in the URL fragment (`#...`), it is not sent to GitHub Pages in the HTTP request.

## Hosted Supabase configuration

In Supabase Dashboard:

**Authentication → Email Templates → Confirm signup**

Subject:

`MotoPOS Confirmation - Confirm your email address`

Paste the contents of:

`supabase/email-templates/confirm-signup.html`

The existing Gmail/custom SMTP credentials do not need to change for this flow.

## Redirect URL

The application currently uses:

`https://markyyy-lolz.github.io/MotoPOS-Web/?email-confirmed=1`

Ensure this URL is allowed in the project's Authentication URL Configuration.
