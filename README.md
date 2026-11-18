# Kafila (قافلة)

A screening-to-care accountability platform: after an abnormal screening result, every case has a named owner and a deadline at every step until a clinician closes it with evidence.

Submission for the Future Health Digital Innovation Challenge, Challenge 05 "Closing the Screening-to-Care Loop".

- **Presentation:** [index.html](index.html), plus [architecture.html](architecture.html) and [care-loop.html](care-loop.html) (Fatima's case, step by step)
- **Working prototype:** [prototype/](prototype/) (English). Arabic patient screens: `prototype/?lang=ar`

The prototype is a static web app: it runs entirely in the browser with synthetic data. AI is off by default and prepared, approved answers are used; `prototype/worker/` holds the optional Cloudflare Worker code (no keys in this repository).

All people, results, clinics and insurance plans are synthetic. Not a medical device. Not affiliated with or endorsed by DoH Abu Dhabi or ADPHC. Clinical content has not yet been reviewed by a licensed clinician.
