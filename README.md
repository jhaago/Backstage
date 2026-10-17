# BACKSTAGE

A focused, phone-first live production coordination PWA. One administrator controls the live scene. Volunteers select a role from a private link, read and edit that role's scene information, browse locally, and share one READY status for the upcoming live scene.

## Stack and layout

React + TypeScript + Vite; Firebase Authentication, Cloud Firestore, Hosting; IndexedDB-backed Firestore cache; generated PWA service worker. `src/domain.ts` contains scene/readiness rules, `src/store.ts` contains Firestore operations, `src/Volunteer.tsx` and `src/Admin.tsx` are the two interfaces, and `firestore.rules` enforces data access. There is no AI service or native app.

## Firebase setup

1. Create a Firebase project and add a **Web app**. Enable **Cloud Firestore** in production mode, **Authentication → Email/Password**, and **Authentication → Anonymous**. Add the intended Hosting domain to Authentication's authorized domains if needed.
2. Copy `.env.example` to `.env` and enter the Web app's Firebase configuration. These Web app values are public identifiers, not administrator secrets. Keep service-account credentials out of this repository.
3. In Firebase Authentication, add an email/password user for the show controller. Copy that user's **UID**. In Firestore's console, create `admins/{UID}` with a Boolean field `created: true`. This manual bootstrap is intentional: browser users cannot grant themselves administrator access.
4. Install Node.js 20.19+ or 22.12+. Run `npm ci`, `npm test`, `npm run test:rules`, and `npm run build`. The emulator test needs Java 17+.
5. Install/login to Firebase CLI with `npx firebase login`; select the Firebase project via `npx firebase use --add`. Deploy with `npx firebase deploy --only firestore,hosting`. The project serves the single page app from `dist/`; a production build embeds `.env` configuration.
6. Visit the deployed URL's `/admin` path, sign in, create a production, add roles/scenes and share the private volunteer link shown in Production setup. The link has the form `https://<your-host>/?join=<random-token>`.

For local development use `npm run dev`. Firebase Auth must allow your localhost domain. The configuration screen appears until `.env` is filled in. Run `npm run build` again after changing environment values.

## Show controller guide

- In **Production setup**, create or switch productions; set the active one, rename, archive, duplicate, or copy roles from another production. Add/reorder/rename/remove roles and scenes. Scene numbers follow their order. Add performers once and assign them within each role's scene editor.
- The **Show controller** shows the live, next and following scenes. **GO / NEXT SCENE** changes the one global live scene and brings volunteer screens back to it. The controller can advance regardless of READY.
- Clicking a running-order row only previews it. **Make previewed scene live** is a separate confirmed rehearsal action. Back one and Reset are available below the running order.
- A role without performers or instructions for the upcoming scene shows **Not required** on the controller. READY otherwise reads from that role and upcoming scene only.
- The private link is a bearer credential. **Replace link** revokes the old link and associated sessions on their next server request; distribute the new link to volunteers.

## Volunteer guide

Open the private production link and choose your role. The device remembers it. The header always names the production, role, connection state and live scene. Read your scene, tap **Edit** to change assignments or notes, and save. The shared performer directory can be updated from the editor. **Previous Scene** and **Next Scene** in the permanent bottom bar browse only on your device. The center **READY** control applies to the scene after the live one, even while browsing elsewhere. Green means your role is READY; tap again to cancel. A controller GO brings your screen to the new live scene. If an edit is open, finish saving or discard first; the app then follows the new live scene.

The show remains readable from previously cached data during a brief outage. A connection warning appears; editing and READY need a server response. Never treat a pending save as complete until it reports success.

## JSON import

Manual editing is the primary workflow. The optional `sample-import.json` demonstrates the import format. `name`, one or more `roles[].name`, and one or more `scenes[].title` are required. `year`, top-level `performers[].name`, and per-scene `roles[roleName].notes` and `performers[].{name,character}` are optional. Role names in scene details must match the role list exactly. The import preview shows the production and scene count; applying it creates a **new** production and does not replace existing work. Use a ChatGPT-generated JSON file externally if helpful; BACKSTAGE makes no AI requests.

## Access and reliability model

Administrator authentication is checked by both the UI and Firestore rules. Anonymous volunteer sessions must present an unguessable invitation token to enroll. After enrollment, role-specific scene documents and READY are restricted by the selected role in rules. Shared performer names are readable and editable by enrolled volunteers. Role selection has no PIN: anyone with the link can choose another role, and a person with access to a volunteer device can do the same. Do not treat role selection as strong identity. Do not put child contact details or sensitive information in notes. Revocation does not erase data already cached locally on someone's device.

Live changes use Firestore transactions with an expected revision and scene ID. Two controllers using stale state cannot both advance from the same position. The GO button also has a short local guard. Role-note saves use a revision transaction: a conflicting edit leaves the second person's draft open and requires reviewing the latest data. READY writes a requested Boolean value to one document per role and scene; simultaneous confirmations cannot cancel each other. Browser refreshes recover server state through listeners; Firestore caches prior reads in IndexedDB. If a scene or role is removed, old orphan note documents may remain in Firestore but are no longer shown.

## Test evidence and limits

Verified on 17 October 2026: `npm test` passed 14 pure state/import/guard tests; `npm run test:rules` passed 8 Firestore emulator tests; `npm run build` passed TypeScript and Vite/PWA compilation. The emulator tests are skipped by `npm test` unless the emulator is running. `npm run test:rules` starts the Firestore emulator and runs independent authenticated-client scenarios for enrollment, role boundaries, cross-client notes/READY, live-state recovery after a simulated disconnect, revocation and simultaneous controller transactions. `npm run build` checks TypeScript and produces the PWA.

No real Firebase project or administrator account is included. This source has not been deployed, and no physical Android/iPhone/tablet or browser UI test has been performed; the available cloud browser could not reach the workspace-local preview. Rehearse on the actual church Wi-Fi with several devices before using it for a live performance. Firestore offline cache is best-effort and specific to each browser; a fresh device without prior data cannot read the show while offline. Initial import and duplication make several writes, so a network failure mid-operation can leave a partially created production that an administrator must inspect before retrying.
