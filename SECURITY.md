# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub private vulnerability reporting](https://github.com/Ritesh-Root/utsav-planner/security/advisories/new),
not in a public issue. You will get a reply within a few days.

## What the app holds

- **On the server:** nothing. There are no accounts and no database. Logs record request ids, status codes,
  timings, prompt lengths and token counts, never the text people type.
- **In the browser:** plans in `localStorage`. Vendor names, contacts, quotes, notes and spending stay there
  and are never sent anywhere.
- **Sent to Gemini on Vertex AI:** the event brief (type, name, date, place, guests, budget, preferences,
  notes) and, when refining, an outline of the plan (ids, titles, shares, lead times and statuses).

## Threats and controls

| Threat                             | Control                                                                                                                                                                                                                                                          | Tested in                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Leaked credentials                 | No API keys: Vertex AI via the Cloud Run service identity, least-privilege service account (`roles/aiplatform.user` only); gitleaks scans the full history on every push                                                                                         | CI (`secrets` job)                                                      |
| Cross-site scripting               | Strict CSP with no inline scripts or styles; React text rendering only; `dangerouslySetInnerHTML` banned by lint; model output cleaned                                                                                                                           | `tests/server/api.test.ts`, `tests/server/normalize.test.ts`            |
| Prompt injection                   | User text embedded as escaped JSON inside data tags; system rules say tagged text is data; no tools; schema-bound output re-validated; brief changes re-checked                                                                                                  | `tests/server/schema-prompts.test.ts`, `tests/server/normalize.test.ts` |
| Invented or harmful vendor details | No name or contact fields in the schema; links, bare domains, emails and phone numbers scrubbed; safety settings on                                                                                                                                              | `tests/shared/sanitize.test.ts`, `tests/server/normalize.test.ts`       |
| Malformed or oversized input       | JSON only (415), 32 KB limit (413), strict schemas that reject unknown keys (400)                                                                                                                                                                                | `tests/server/api.test.ts`                                              |
| Quota abuse from other sites       | Same-origin guard on writes (403) using `Sec-Fetch-Site` and `Origin`                                                                                                                                                                                            | `tests/server/api.test.ts`                                              |
| Cost abuse on a public URL         | Per-IP rate limits (429 with `Retry-After`) keyed on the address one trusted proxy hop in (`TRUST_PROXY`), cache and in-flight de-duplication, a daily cap per instance, a circuit breaker that only counts service faults, at most 3 instances, a billing alert | `tests/server/planner.test.ts`, `tests/server/api.test.ts`              |
| Information leaks in errors        | Generic 500 messages; details only in structured logs                                                                                                                                                                                                            | `tests/server/static-config.test.ts`                                    |
| Clickjacking and sniffing          | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, HSTS                                                                                                                                                                                | `tests/server/api.test.ts`                                              |
| Tampered saved or imported plans   | Every stored or imported plan is validated with zod; imports capped at 256 KB                                                                                                                                                                                    | `tests/client/logic.test.ts`                                            |
| Vulnerable dependencies            | Exact version pins, `npm audit` in CI, GitHub Actions pinned by commit SHA with `persist-credentials: false`, container base images pinned by digest                                                                                                             | CI, `Dockerfile`                                                        |
| Container compromise               | Production dependencies only, root-owned files, runs as `node`                                                                                                                                                                                                   | `Dockerfile`                                                            |

## Dependency updates

The repository keeps a single `main` branch, as the PromptWars rules require, so Dependabot pull requests are
turned off. Dependencies are checked with `npm audit` in CI on every push and updated by hand.
