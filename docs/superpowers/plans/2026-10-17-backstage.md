# BACKSTAGE Implementation Plan

> For agentic workers: implement tasks with tests first, then run the whole suite and build.

**Goal:** Build a functional Firebase-backed, responsive PWA for live scene coordination.

**Architecture:** Static React client, Auth and Firestore with rules. Controller writes global scene transactions; volunteers subscribe to role data and retain drafts while navigating.

**Tech Stack:** React, TypeScript, Vite, Firebase, Vitest, CSS, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-10-17-backstage-design.md`.

## Global constraints

No volunteer account setup or PIN. No checklists or unrelated theatre systems. Private production invite links. No hardcoded BETHLEHEM content.

## Review Focus

- Expired invitation must remove access on the next server request.
- Cross-role direct document access must be denied by rules.
- Concurrent controller advances must not skip scenes.
- Concurrent note edits must retain a local draft and surface a conflict.
- An open edit must survive a live scene change and navigate after save/discard.

## Tasks

### 1. Domain and rules

- [x] Write failing tests for scene progression, next-scene readiness key, and import validation; run to confirm red.
- [x] Implement `src/domain.ts`, `src/import.ts`, `firestore.rules`, indexes, and Firebase initialization; run green.
- [x] Add emulator rules tests if Java/emulator can run.

### 2. Data operations and subscriptions

- [x] Write tests for expected-revision conflicts and scene-change deferral; confirm red.
- [x] Implement `src/store.ts` transactions, CRUD, enrollment, and listener hooks; run green.

### 3. Volunteer PWA

- [x] Build role picker, scene view, edit form, performer directory, connection and offline state, permanent bottom bar.
- [x] Confirm TypeScript build and correct observed defects.
- [ ] Browser and physical-device QA on a configured Firebase project (local browser cannot reach this workspace).

### 4. Controller and production setup

- [x] Build protected admin sign-in, production management, scene/role CRUD/reorder/duplicate, live controller, import review.
- [x] Run tests and build; review responsive CSS and interactions in code.
- [ ] Inspect the live UI on mobile devices after Firebase setup.

### 5. Delivery

- [x] Document Firebase setup, deployment and limitations; package source and sample JSON.
- [x] Run final tests/build and report only validated claims.
