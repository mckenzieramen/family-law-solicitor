# Family Law Website

The complete site is in `docs/`. Open `docs/index.html` locally, or publish `main` from `/docs` in GitHub Pages.

Open the published site with `?staff=demo` to try the Legal Assistant and Solicitor workspaces. The internal screens use sample records and browser-local storage. Real staff use requires authenticated accounts, access permissions, and server-side storage. The consultation inbox is pending firm contact details and setup.

## Firebase staff access

Publish the repository's Firestore rules to the Family Law Firebase project. Enable Email/Password sign-in and create the first solicitor in Firebase Authentication. In Firestore create `users/{solicitor UID}` with a string field named `role` and value `solicitor`. Existing solicitor custom claims also work. Use `docs/lawyer/` to grant an existing Authentication UID the employee role. Employees sign in at `docs/admin/` and can access their own checklist only. Create each employee's sign-in account in Firebase Authentication before granting access.
