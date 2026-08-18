# Memolens

Memolens is an opensource, research and demonstration prototype for medication-routine support. A caregiver configures and arms a routine, the wearer receives a deterministic spoken prompt while the browser captures a short camera-and-microphone window, and the caregiver reviews the local recording and records a disposition.

> Memolens is a supervised research prototype. It supports caregiver review but does not provide medication instructions or verify ingestion.

Use an empty pillbox, candy, or another safe non-medication prop. This repository is not a clinically validated or production medical system.

## What is implemented

- Presentation-ready landing, privacy, test-consent, caregiver setup, preflight, wearer, inbox, and review screens.
- Real browser camera and microphone capture through `getUserMedia()` and `MediaRecorder`.
- Typed speech-synthesis prompts and optional in-memory caregiver voice prompts.
- Five-second Run Test Now countdown and foreground-only scheduled triggering.
- Fixed prompt repeats, fixed capture duration, automatic stopping, and optional wearer privacy stop.
- Real in-memory Blob playback, object-URL revocation, and MediaStream cleanup.
- Role switching without reload or media loss.
- Explicit research consent with no telemetry before consent and no browser persistence.
- Separate contact consent for pre-order interest.
- Direct Supabase writes protected by RLS and database constraints.
- Optional hardened Supabase Edge Function with payload validation, bot checks, safe errors, deduplication, and test-session upserts.
- Vitest and React Testing Library coverage for workflow, capture, consent, logging, Supabase validation, schema controls, and cleanup.

No recognition, transcript generation, AI interpretation, medication recognition, automated adherence conclusion, email, SMS, push notification, advertising tracker, or session replay is included.

## Stack

- React, TypeScript, Vite, Tailwind CSS, React Router, and Lucide icons.
- React Context plus `useReducer`.
- Supabase Postgres and the generated REST API.
- Optional Supabase Edge Function.
- Vitest and React Testing Library.

## Run locally

Requirements: Node.js 20.19 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your public Supabase project URL and anon key to `.env.local`. Camera and microphone access requires HTTPS or a browser-trusted localhost context.

The interface still runs without configured research values. Research writes and contact confirmations fail visibly and safely until Supabase is configured.

## Supabase setup

1. Create a Supabase Free-tier project.
2. Apply [the migration](supabase/migrations/202608160001_memolens_research.sql) using the SQL Editor or Supabase CLI.
3. Confirm the four tables:
   - `analytics_events`
   - `test_sessions`
   - `leads`
   - `ingestion_errors`
4. Copy the project URL and public anon key into `.env.local`.
5. Keep `VITE_RESEARCH_TRANSPORT=direct` for the no-function architecture.
6. For stronger public-form abuse protection, deploy the included Edge Function and set `VITE_RESEARCH_TRANSPORT=edge`.

Detailed commands and security checks are in [Supabase setup](docs/SUPABASE_SETUP.md).

### Direct mode

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_RESEARCH_TRANSPORT=direct
```

The browser uses the Supabase client. It writes only to the three permitted research tables. Public SELECT access is absent. Database constraints and RLS revalidate record shape, event names, consent, lengths, and media-like content.

Client-side honeypot and timing checks improve ordinary form behavior but can be bypassed by a hostile client. Use Edge mode for a public campaign where server-side bot validation is important.

### Edge mode

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_RESEARCH_TRANSPORT=edge
VITE_SUPABASE_EDGE_FUNCTION_URL=https://your-project-ref.supabase.co/functions/v1/ingest
```

The browser sends the same minimized envelope to the Edge Function. The function enforces origin, JSON, body-size, batch, key, media, consent, honeypot, timing, deduplication, and upsert rules before writing with its server-only service-role credential.

Never put `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable, frontend source, HTML, Git, screenshots, or browser configuration.

## Data transmitted

Anonymous research transmission occurs only after analytics consent:

- allowlisted page, CTA, workflow, permission, capture, review, and closure events;
- anonymous in-memory session, event, and request IDs;
- coarse device type, browser family, operating-system family, language, time zone, and online state;
- prompt type, character count, delivery result, repeat count, technical outcomes, and durations;
- recording duration and Blob byte count, never Blob contents;
- caregiver disposition and voluntarily submitted research ratings or notes.

A contact-interest lead uses its own required consent and may be submitted even when anonymous analytics is declined. Contact details go only to `leads` and are not linked to detailed test-session records by default.

## Data that remains local

- Video, audio, MediaStreams, MediaRecorder chunks, Blobs, and object URLs.
- Caregiver-recorded prompt audio and exact typed prompt text.
- Caregiver notes attached to local evidence.
- Current workflow, routine, event, and media state.

Refresh, tab close, route exit, recording deletion, or session clearing erases local media. Object URLs are revoked and live tracks are stopped.

## Data rejected by the research pipeline

- Video, audio, encoded media, thumbnails, data URLs, Blob representations, or media links.
- Exact prompt text or transcripts.
- Wearer names or caregiver names in test data.
- Diagnoses, medication names, doses, addresses, or precise locations.
- Advertising identifiers, browser fingerprints, full user-agent strings, or IP addresses as application fields.

The browser validator, RLS/database constraints, and optional Edge Function enforce these boundaries independently.

## Quality commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run validate:artifact
npm test
```

Unit tests never write to a real Supabase project.

## Production deployment

```bash
npm run build
npm run preview
```

The static `dist/` output works on Vercel, Netlify, or GitHub Pages. Configure SPA rewrites for `/test` and `/privacy`. The included GitHub Pages workflow and `404.html` fallback support repository-path deployments; set `VITE_BASE_PATH` when needed.

Deployment environment variables contain only the Supabase URL, public anon key, transport choice, and optional public Edge Function URL.

## Repository map

- `src/routes` — landing, privacy, and state-driven test route.
- `src/components/test` — consent, setup, preflight, wearer capture, inbox, and review.
- `src/state` — Context and reducer-driven in-memory workflow.
- `src/services/media.ts` — browser capture, audio, URL, track, and wake-lock lifecycle.
- `src/services/researchLogger.ts` — consent-gated queue, batching, retry, and critical submissions.
- `src/services/supabaseClient.ts` — direct REST or Edge Function transport.
- `src/services/researchValidation.ts` — frontend allowlists and data-minimization validation.
- `supabase/migrations` — tables, constraints, indexes, grants, and RLS.
- `supabase/functions/ingest` — optional hardened ingestion function.
- `docs` — setup, privacy data map, and real-integration QA.
- `tests` — workflow, logger, media, UI, Supabase transport, and schema tests.

## Known browser limitations

- Scheduled triggering is a foreground demonstration. The page must remain open, visible, active, and armed.
- Camera and microphone APIs require a secure context and explicit browser permission.
- MediaRecorder codecs differ by browser; the app selects a supported format at runtime.
- iOS and Safari may pause capture when the device locks, focus changes, or another app takes camera control.
- Speech-synthesis voice and audibility depend on browser and operating-system voices.
- Screen Wake Lock is optional and can be released by the operating system.
- Refresh or tab close intentionally erases media and in-memory state.

## Integration status

The repository, migration, optional function, and automated tests can be verified locally without private credentials. Real database rows must be confirmed in the target Supabase project before live ingestion is described as complete. Follow [the integration QA checklist](docs/SUPABASE_INTEGRATION_QA.md) and record the matching IDs.
