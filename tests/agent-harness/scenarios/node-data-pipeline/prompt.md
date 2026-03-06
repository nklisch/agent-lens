The transaction processing pipeline is producing incorrect monthly revenue summaries. The grand total should be $12,000.00 but the pipeline returns a much lower number. March should be the highest-revenue month at $6,550.00 but appears to have very little revenue, and some transactions seem to be missing entirely.

The pipeline files are `parser.js` (data and parsing), `transform.js` (business transforms), `aggregate.js` (monthly summaries), and `pipeline.js` (orchestration). Run `node --test test-pipeline.js` to see the failing tests.
