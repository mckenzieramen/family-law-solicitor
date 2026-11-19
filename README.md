# Family Law Website

The complete site is in `docs/`. Open `docs/index.html` locally, or publish `main` from `/docs` in GitHub Pages.

Open the published site with `?staff=demo` to try the Legal Assistant and Solicitor workspaces. The internal screens use sample records and browser-local storage. Real staff use requires authenticated accounts, access permissions, and server-side storage. The consultation inbox is pending firm contact details and setup.

## Firebase staff access

Publish the repository's Firestore rules to the Family Law Firebase project. Enable Email/Password sign-in and create the first solicitor in Firebase Authentication. In Firestore create `users/{solicitor UID}` with a string field named `role` and value `solicitor`. Existing solicitor custom claims also work. Use `docs/lawyer/` to grant an existing Authentication UID the employee role. Employees sign in at `docs/admin/` and can access their own checklist only. Create each employee's sign-in account in Firebase Authentication before granting access.

For a separate Admin account, create `users/{admin UID}` with `role` set to the string `admin` and `Active` set to the boolean `true`. This account signs in at `docs/admin/` and accesses its own checklist.

## Google reviews

Set Cloudflare Pages production variables `GOOGLE_PLACE_ID` (the Etheringtons Solicitors Google Places ID) and `GOOGLE_PLACES_API_KEY` (encrypted secret, restricted to Places API (New), on a billing-enabled Google Cloud project). Redeploy after configuring the variables. The /api/reviews Pages Function retrieves the live review sample when the section approaches the viewport. No credential is bundled into the website.
