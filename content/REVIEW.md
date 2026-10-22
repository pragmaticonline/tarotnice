# Card meanings \u2014 owner review (Thai native speaker)

Every entry in `content/meanings.{en,th}.json` is a DRAFT
(`"reviewed": false`). The card library shows only reviewed entries
as indexable; unreviewed pages get `noindex`.

To approve an entry: read the EN + TH texts, fix tone and Thai
naturalness, then set `"reviewed": true`.

Priority order:
1. Major arcana (ids 0-21) \u2014 most-drawn cards.
2. Court cards (ranks 11-14) \u2014 Thai court names (\u0e40\u0e1e\u0e08/\u0e2d\u0e31\u0e28\u0e27\u0e34\u0e19/\u0e23\u0e32\u0e0a\u0e34\u0e19\u0e35/\u0e23\u0e32\u0e0a\u0e32) need a native check.
3. Minors composed from suit \u00d7 rank tables in
   `scripts/build-meanings.mjs` \u2014 fix the tables, re-run the script.

Back art: `cards/back.webp` is still missing (owner to supply).
