# Supabase real-integration QA report

Status: **Pending private project configuration and real-row verification**

Do not mark live Supabase ingestion complete until real rows are visually confirmed and the matching IDs are recorded below. Unit tests never write to a real project.

## Environment record

| Item | Result |
| --- | --- |
| Supabase project reference | Pending |
| Migration applied at | Pending |
| Frontend deployment URL | Pending |
| Transport mode: direct or edge | Pending |
| Edge Function deployment version | Not applicable / Pending |
| QA operator and date | Pending |

## Schema and access

- [ ] Exactly four application tables exist.
- [ ] All expected columns and types match the migration.
- [ ] Unique constraints exist for `event_id`, `session_id`, and `lead_id`.
- [ ] RLS is enabled on all four tables.
- [ ] An anon request cannot SELECT any research records.
- [ ] An anon request cannot insert into `ingestion_errors`.
- [ ] An authorized project administrator can inspect the tables.

## Product-path verification

- [ ] Accept anonymous research data on the landing page.
- [ ] Press hero, final, and sticky Test Memolens CTAs.
- [ ] Open both pre-order CTA locations.
- [ ] Submit one clearly marked test lead with contact consent.
- [ ] Complete one safe-prop test using real camera and microphone capture.
- [ ] Review the local clip.
- [ ] Select a caregiver disposition.
- [ ] Submit research observations.
- [ ] Finish review the event.

## Row verification

| Record | Expected table | Recorded ID | Confirmed |
| --- | --- | --- | --- |
| Landing view | `analytics_events` | Pending | No |
| Hero test CTA | `analytics_events` | Pending | No |
| Final or sticky test CTA | `analytics_events` | Pending | No |
| Pre-order open | `analytics_events` | Pending | No |
| Test lead | `leads` | Pending | No |
| Final test summary | `test_sessions` | Pending | No |

- [ ] Analytics rows share the expected anonymous session ID.
- [ ] Sequence numbers are monotonic.
- [ ] CTA IDs match the pressed buttons.
- [ ] The lead exists only in `leads`.
- [ ] One test-session row exists for the session.
- [ ] No row contains media, object URLs, encoded media, exact prompt text, transcript, diagnosis, medication identity, or dose.

## Deduplication and concurrency

- [ ] Resend an identical event and confirm no duplicate `event_id`.
- [ ] Resend an identical lead and confirm no duplicate `lead_id`.
- [ ] Submit an updated test summary with the same `session_id` and confirm one row is updated.
- [ ] Send several event batches concurrently and confirm no malformed rows.

## Rejection tests

- [ ] Unexpected event name is rejected.
- [ ] Unexpected nested analytics object is rejected.
- [ ] Data URL is rejected.
- [ ] Base64-like media is rejected.
- [ ] Media, transcript, exact-prompt, diagnosis, and dose fields are rejected.
- [ ] Missing contact consent is rejected.
- [ ] In Edge mode, the wrong origin is rejected.
- [ ] In Edge mode, a filled honeypot is rejected.
- [ ] In Edge mode, a too-fast lead is rejected.
- [ ] Body above 60 KiB and any batch above 50 are rejected.
- [ ] Safe error metadata contains no rejected body, phone number, research note, or credential.

## Final sign-off

Live ingestion result: **Pending**

Notes:

> Record only technical identifiers and row locations here. Do not copy phone numbers, research notes, or health information into this report.
