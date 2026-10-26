# Card meanings — owner review (Thai native speaker)

APPROVED 2026-10-26 by the tarot expert: all 78 entries in
`content/meanings.{en,th}.json` plus all 78 `content/imagery.en.json`
scene notes are `"reviewed": true`. Card detail pages are indexable;
the sitemap lists all 156 card URLs.

To approve an entry: read the EN + TH texts, fix tone and Thai
naturalness, then set `"reviewed": true`.

Priority order:
1. Major arcana (ids 0-21) — most-drawn cards.
2. Court cards (ranks 11-14) — Thai court names (เพจ/อัศวิน/ราชินี/ราชา) need a native check.
3. Minors are individually authored in
   `scripts/minors.en.json` / `scripts/minors.th.json` — edit those
   files, then re-run `node scripts/build-meanings.mjs`.

Back art: `cards/back.webp` is still missing (owner to supply).
