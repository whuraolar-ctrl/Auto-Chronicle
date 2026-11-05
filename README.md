# Auto Chronicle
AltSchool Capstone Project

Mobile first app for tracking a car's repair history and building a savings habit for upkeep. AltSchool Capstone project.

## Stack
- Frontend: React/Vite
- Backend: Node.js/NestJS
- Database: PostgreSQL
- Auth & Storage: Supabase
- Styling: Tailwind CSS
- Hosting: TBD

## Branch strategy
- `main` — stable, tested code only
- `preview` — active development, all work merges here first before main

## Folders
- `/Frontend` — React/Vite client app
- `/Backend` — NestJS API and server logic
- `/supabase/migrations` — ordered database migrations

## Running locally

1. Configure `Backend/.env` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set `FRONTEND_URL` for fleet invitation links; optional email delivery settings are described below.
2. Copy `Frontend/.env.example` to `Frontend/.env` and set the API URL and Supabase project URL/publishable key. Do not expose the service-role key in the frontend.
3. Start the API from `Backend` with `npm run start:dev`.
4. Start the client from `Frontend` with `npm run dev`.

The API exposes unauthenticated health checks at `/health` and `/api/health`. Protected application routes require a signed-in Supabase session; the frontend API client sends the saved access token as a bearer token. The client’s Vite development server is normally available at `http://localhost:5173`.

## Frontend pages and integration status

The in-app pages share a responsive navigation bar and use the ivory, forest-green, and coral visual theme. The expense analytics page reads the authenticated `GET /api/expenses/monthly` response and displays the selected month total, six-month trend, part and vehicle breakdowns, unallocated repair costs, and currency conversion context. The fleet dashboard first loads `GET /api/fleets`, then requests `GET /api/fleet/dashboard?fleetId=<uuid>`. Driver reports use the paginated `GET /api/driver-reports` response and the backend convert/dismiss actions; logged reports can be marked under review or fixed and closed. Issue reports can be submitted for a selected vehicle at `/reports/new` or directly at `/vehicles/:vehicleId/reports/new`. The dashboard links to the general issue-report form, which lets the signed-in user choose an active vehicle. The Car Fund page loads and updates goals, tracks contributions and off-site spending, and carries the saved balance into a new target. The welcome page retains its existing dark visual design and connects the four feature icons with arrows in the desktop flow.

Protected page URLs:

| Page | URL | Current status |
| --- | --- | --- |
| Welcome | `/` | Available |
| Sign in / account creation | `/login`, `/create-account` | Available |
| Password recovery | `/forgot-password`, `/reset-password` | Available |
| Auth callback / profile completion | `/auth/callback`, `/complete-profile` | Available; verify Supabase redirect configuration |
| Fleet dashboard | `/dashboard` | Connected; requires membership in at least one fleet |
| Submit an issue report | `/reports/new` | Dashboard-accessible; select an active vehicle before submitting |
| Expense analytics | `/expenses` | Connected; requires sign-in and repair records |
| Repairs | `/vehicles/:vehicleId/repairs/new` | Repair and optional part breakdown entry; requires the repairs migration |
| Vehicles and issues | `/vehicles` | Vehicle list, create/edit, archive/unarchive, repair links, and issue-report entry connected; delete and detail history remain |
| Driver reports | `/reports` | List, owner conversion/dismissal, and logged-issue status follow-up connected; vehicle metadata and pagination remain |
| Fleet management | `/fleet` | Fleet creation, selection, and driver invitation connected; vehicle assignment remains |
| Car Fund | `/car-fund` | Goal setup/progress, contributions, and off-site spending connected; history pagination and contribution deletion remain |
| Accept fleet invitation | `/fleet-invitations/accept?token=...` | Invitation session, profile form, and acceptance request connected; verify Supabase redirect configuration |


## API Notes
- Health checks: `GET /health` and `GET /api/health` return `{ "status": "ok" }`.
- Creating an issue requires an `Idempotency-Key` header (1-128 letters, digits, `.`, `_`, `:`, or `-`). Generate one key per new issue and reuse that same key for retries of that request. Reusing a key with different issue data returns `409 Conflict`.
- Driver reports use the statuses `new` (submitted, awaiting a decision), `logged` (converted into an issue), and `dismissed`. Submit with `POST /api/driver-report` and `{ "vehicleId": "<uuid>", "category": "...", "severity": "...", "timing": "...", ... }`. The vehicle-scoped submit/list routes remain available at `/api/vehicles/:vehicleId/driver-reports`. `GET /api/driver-reports?status=new&page=1&limit=20` lists reports for vehicles the caller owns or belongs to; `GET /api/driver-reports/:reportId` retrieves one authorized report. Fleet owners can `POST /api/driver-reports/:reportId/convert` to create an issue or `/dismiss` to dismiss it. Conversion is transactional and safe to retry; the resulting issue stores the report ID in `source_driver_report_id`.
- `GET /api/fleet/dashboard?fleetId=<uuid>&month=<1-12>&year=<year>` returns active vehicle totals, vehicles needing attention, vehicles ready to drive, the new-report count and five newest new reports, and monthly repair expenses in the fleet's preferred currency. “Needs attention” means an active vehicle has a non-fixed issue or service due today/overdue. “Ready to drive” means no active issue marked `cannot_be_driven`. Month and year default to the current month. Fleet owners and drivers can view the dashboard.
- `GET /api/notifications?page=1&limit=20` returns the signed-in user's active service-due, insurance-expiry, and Car Fund reminders/goals. Each item includes a stable `id`, `type`, `title`, `message`, `priority`, `dueDate`, `actionUrl`, and `entityId`. This is a live feed, not a persisted read/unread inbox; the frontend can display the returned item count and link to the provided action URL.
- Fleets have two roles: the fleet owner and driver members. `POST /api/fleets` creates a fleet, `GET /api/fleets` lists fleets the caller owns or belongs to, `POST /api/fleets/:fleetId/vehicles/:vehicleId` assigns an owned vehicle (owner only), and `POST /api/fleets/:fleetId/invitations` invites a driver using `{ "email": "driver@example.com" }` (owner only). Invitation email expires after seven days. Re-inviting the same email revokes the previous pending link.
- Repair tables, part breakdowns, receipt metadata, and the private `receipts` storage bucket are created by `supabase/migrations/20261023000001_repairs_and_receipts.sql`. Apply this migration before deploying repair entry or receipt upload.
- `POST /api/vehicles/:vehicleId/repairs` records `{ "workPerformed": "Replaced front brake pads", "repairDate": "2026-10-23", "amount": 85000, "currency": "NGN", "parts": [{ "partName": "Front brake pads", "amount": 60000 }] }`. Part costs are included in (not added to) the repair total. Reuse the same `Idempotency-Key` when retrying an unchanged repair submission.
- Invitation acceptance: the email link returns the driver to `/fleet-invitations/accept?token=<token>` after Supabase email-link authentication. The frontend must retain the token and send the authenticated access token with `POST /api/fleet-invitations/accept`, with `{ "token": "<token>", "firstName": "...", "lastName": "...", "password": "...", "confirmPassword": "...", "acceptedTerms": true }`. The server verifies the authenticated account's email matches the invitation, creates a minimal fleet profile (email, first/last name, terms acceptance; no phone or username required), adds the driver membership atomically, and sets the submitted password. Acceptance can be retried by the same account if password setup needs retrying. Add the frontend callback URL under Supabase Auth's allowed redirect URLs. The frontend now has an initial acceptance screen, but the email-link session callback and complete profile form still need to be wired. Drivers can submit and view reports for their fleet's vehicles; only the fleet owner can convert or dismiss reports and manage fleet membership/vehicle assignments.
- Car Fund is a savings tracker only; it does not receive, hold, or transfer money. `GET /api/car-fund` loads the signed-in user's goal and computed progress. `PUT /api/car-fund/goal` saves `{ "targetAmount": 500000, "currency": "NGN", "targetDate": "2027-10-16", "contributionCadence": "weekly", "plannedContributionAmount": 5000, "remindersEnabled": true }`. Goal date and reminder plan are optional. Suggested daily, weekly, and monthly amounts are calculated from the remaining balance and target date. `POST /api/car-fund/contributions` records `{ "amount": 5000, "contributedAt": "2026-10-16T12:00:00.000Z", "note": "October savings" }`; `GET /api/car-fund/contributions?page=1&limit=20` lists the activity and `DELETE /api/car-fund/contributions/:contributionId` removes a mistaken entry. Contributions use the fund currency; that currency cannot be changed once any entry exists.
- `POST /api/car-fund/spending` records a manually tracked expense paid outside the app using `{ "amount": 2500, "note": "Replacement tyre" }`; the amount is deducted from the tracker balance and cannot exceed the available balance. `GET /api/car-fund/spending?page=1&limit=20` lists spending. The spending ledger is created by `supabase/migrations/20261023000000_car_fund_spending.sql`; apply it before deploying these routes.
- Email reminders run every 15 minutes. A service reminder is sent once per service date to the vehicle owner's profile email on or after its `next_service` date. A Car Fund reminder is sent at or after 09:00 in the user's profile timezone on each selected cadence date; reminders stop once recorded contributions meet the goal. Messages include a greeting, due date or planned amount, next steps, and a clear note that Car Fund reminders do not make payments or move money. The sender uses Resend.
- To enable email delivery locally, create a Resend account, add and verify a domain in Resend (including its requested DNS records), and create an API key. Put `RESEND_API_KEY` and `EMAIL_FROM` in `Backend/.env`, for example `EMAIL_FROM="Auto-Chronicle <reminders@your-verified-domain.example>"`. Use an address on the verified domain. Do not commit `.env` or put the API key in frontend code. For deployment, the cloud engineer should add these as encrypted backend service environment variables/secrets, verify the sender domain with DNS, redeploy, and check the provider's delivery logs. Resend may restrict testing to the account owner's address until a sender domain is verified.
- **Service reminder email** (example): “Hello Ada, This is a friendly reminder that Corolla is due for service on 2026-10-20. Booking a service appointment can help you stay ahead of maintenance and keep your vehicle in good condition. You can review the vehicle and update its service date in Auto-Chronicle once the service is complete. Take care, The Auto-Chronicle team.”
- **Car Fund email** (example): “Hello Ada, This is your weekly Car Fund reminder. You planned to set aside NGN 5,000.00 toward your goal of NGN 500,000.00. Your current target date is 2027-10-16. When you have made a contribution outside the app, you can record it in Car Fund to keep your progress up to date. Auto-Chronicle does not collect, hold, or transfer this money; this reminder does not make a payment. Every step toward your goal counts. The Auto-Chronicle team.”
- Apply database migrations from the repository-root `/supabase/migrations` directory in filename order: `001_profiles.sql`, `002_profile_vehicles_issues.sql`, then timestamped migrations. Do not edit/re-run migrations already applied to a shared database; check the Supabase migration history first and apply only pending migrations. The Car Fund/reminder schema and RPCs are in `20261016000003_car_fund_and_email_reminders.sql`; the persistent notifications table and policies are in `20261019000000_persistent_notifications.sql`.
- Profile photos use the public `profile-avatars` Storage bucket, restricted to JPEG, PNG, and WebP files up to 5 MB. The bucket and user-folder upload policy, as well as the `profiles.avatar_url` column, are created by `20261020000000_profile_avatars.sql`.
