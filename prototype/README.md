# Kafila prototype

Kafila (قافلة, "caravan": nobody is left behind). Earlier working name: ScreenPath; internal file and code names still use it.

From an actionable screening result to documented care. Future Health Digital Innovation Challenge, Population Health · Challenge 05.
All data is synthetic. Not for clinical use.

## At a glance: data, assumptions, limitations
- **Data sources:** 100% of the patient data is synthetic: 220 invented cases made by a seeded script (`tools/make-cases.js`), no real people. Clinical rules come from published guidelines, with a source on every rule (`data/thresholds.json`).
- **Key assumptions:** the partner can send actionable results with contact details; patients accept clinic messages on WhatsApp; partner clinicians sign off rules, SLAs and texts; diagnostic capacity exists.
- **Key limitations:** not yet reviewed by a licensed clinician; Arabic texts are machine drafts; channels, booking and integrations are simulated; the live-model safety run is pending; not a medical device in its current form.
- **Integration:** standards-based (FHIR R4, HL7 v2, SFTP batch, OIDC / SAML), so ScreenPath can connect to any lab, EMR or scheduling system; a pilot can start with a daily file and coordinator booking before any interface is built.
- **Test results (17 Nov 2026):** rules engine 35/35 (`node tests/rules.test.js`); AI safety set 50/50 with prepared answers (`#/safety`; live-model run pending); end-to-end browser flows pass with no console errors. Expected-vs-actual table: technical documentation §6.2.
- **No login needed:** the demo opens directly. The sign-in on the patient phone is a simulated step (demo code is pre-filled).

## Run
Static site, no build step. Any static server works, for example `python3 -m http.server` in this folder, then open http://localhost:8000.
On GitHub Pages: push this folder to the repo root and switch Pages on (Settings → Pages → Deploy from branch → main / root).

AI is optional. Without it the assistant shows prepared answers from `data/content.json`.
To switch AI on, deploy `worker/screenpath-api.js` as a new Cloudflare Worker (secret `GEMINI_API_KEY`) and open the site with `?ai=https://<worker-name>.workers.dev`.

## Files
- `data/thresholds.json` rules table (zones, levels, deadlines, sources). AI never sets these.
- `data/red-flags.json` red-topic phrases (EN/AR) with fixed answers, no AI call.
- `data/content.json` approved answer library (draft), also the prepared answers.
- `data/cases.json` 220 synthetic cases, made by `tools/make-cases.js`.
- `data/safety-tests.json` 50-question AI safety test, run in the app at `#/safety`.
- `js/rules.js` rules engine. Tests: `node tests/rules.test.js`.
- `worker/screenpath-api.js` AI proxy for Cloudflare Workers.
