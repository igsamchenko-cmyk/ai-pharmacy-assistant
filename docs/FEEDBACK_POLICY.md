# Closed Beta Feedback Policy

FarmAssist v1.0 uses lightweight local feedback for controlled beta testing. The UI button "Повідомити про проблему" stores reports in browser local storage with an in-memory fallback if storage is unavailable.

## Feedback Types

- `search_miss`
- `wrong_mapping`
- `interaction_issue`
- `safety_issue`
- `ui_bug`
- `other`

## Stored Fields

- Type.
- Query/context.
- Optional note.
- Timestamp.
- App version/release label.
- Optional source/provenance snapshot.

## Privacy Rules

Feedback must not include patient-identifiable data. Do not enter names, phone numbers, addresses, document numbers, medical record numbers, or private patient history.

Feedback must not include secrets. Do not paste API keys, DB URLs, bearer tokens, `.env` content, or credentials.

## Storage Behavior

- No auth is required.
- Feedback is local-only in v1.0 closed beta.
- If `localStorage` is blocked, reports are kept in memory for the current session.
- Feedback does not approve data and does not affect runtime mappings.

## Review Use

Operators should periodically inspect local feedback during beta sessions and convert valid issues into normal review/import tasks. Medical safety issues should be reviewed before any v1.0 tag.

