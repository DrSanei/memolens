# Privacy data map

| Data | Destination | Consent | Retention in this prototype |
| --- | --- | --- | --- |
| Video and audio | Browser memory only | Recording permission and test consent | Until deletion, session clear, route exit, refresh, or tab close |
| Exact typed prompt | Browser memory only | Caregiver configuration | Current tab session |
| Caregiver-recorded prompt | Browser memory only | Caregiver action | Current tab session |
| Caregiver evidence note | Browser memory only | Caregiver action | Current tab session |
| Allowlisted analytics events | `analytics_events` | Anonymous research consent | Project-owner policy |
| Minimized final test summary | `test_sessions` | Anonymous research consent | Project-owner policy |
| Research observations and note | `test_sessions` | Anonymous research consent | Project-owner policy |
| Name and phone | `leads` only | Separate required contact consent | Project-owner policy |
| Safe ingestion error metadata | `ingestion_errors`, Edge mode only | Operational processing | Project-owner policy |

## Never transmitted

Media, object URLs, exact prompts, transcripts, wearer identity, caregiver identity in test data, diagnoses, medication names, doses, precise location, addresses, advertising IDs, full user-agent strings, and application-level IP fields are not accepted.

Deleting local media does not retract structured records already confirmed by Supabase. The application states this distinction before deletion.
