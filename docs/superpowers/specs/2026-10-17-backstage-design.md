# BACKSTAGE design

Goal: a phone-first, simple live show view with one authoritative controller and role-scoped collaborative scene notes. Multiple productions stay independent. No production content is hardcoded.

## Architecture

React/TypeScript/Vite static PWA hosted on Firebase Hosting. Firebase Auth email/password for administrators and anonymous Auth for volunteers. Firestore onSnapshot streams for production, scenes, roles, performers, role-specific notes, and next-scene readiness. Persistent IndexedDB cache for existing reads. Writes require server acknowledgement; cached content carries an offline label. No automatic scene progression.

## Data

`admins/{uid}`: administrator marker provisioned manually in Firebase console. `config/current`: `{activeProductionId}`. `invites/{128-bit-token}`: `{productionId}`; document can be fetched only by exact ID. `productions/{p}`: `{name,year,archived,liveSceneId,liveRevision}`. Subcollections `roles/{id}` `{name,order}`, `scenes/{id}` `{title,order}`, `performers/{id}` `{name}`, `roleNotes/{sceneId_roleId}` `{sceneId,roleId,notes,assignments:[{performerId,character}],revision}`, `ready/{sceneId_roleId}` `{sceneId,roleId,ready}`, `access/{uid}` `{invitationId,roleId}`. Role selections are stored per anonymous UID, and device local storage remembers the selected role. Empty next-scene role notes imply Not Required in controller.

Only admins list productions or change production/scene/role structure and live position. Members enroll using an unguessable invitation ID and may read production metadata and shared directory, read/write selected role notes and readiness, and edit directory entries. Firestore rules are the enforcement layer. A link holder can select any role; the link is a bearer credential, not an identity. Invites can be revoked by deleting the invite document, invalidating associated memberships. Existing document cache remains readable on a device after revocation.

## Flow and conflicts

Controller GO runs a transaction with expected `liveRevision` and expected scene ID; double taps are locally locked/cooldown. A different controller's advance makes the transaction abort rather than skip. Backward/jump/reset use the same compare-and-set transaction. Volunteers track the last server/cached live revision; changes force view to live scene unless an edit is open, in which case navigation is deferred until save/discard. A role note save runs a revision transaction and rejects concurrent replacement, preserving the draft for explicit reload. READY toggles run a transaction against the next live scene's document, so role devices share a single value. Reconnection refreshes show state from server. No save confirmation until commit resolves.

## Screens

Landing/join link; role picker; volunteer view with always-visible Previous / READY / Next bar, scene card, next preview, running order, edit sheet; admin sign-in, production list, setup panels and controller. Dark high-contrast styling, green for ready/connected, responsive mobile touch targets.

## Validation

Unit tests for progression, import parsing, scene classification, notes conflict, and readiness targeting. Firebase rules emulator tests when dependencies permit, browser smoke checks without credentials; real two-device Firestore verification requires a configured project. README records setup, operational guide and actual test evidence.
