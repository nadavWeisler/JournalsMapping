# AcademicsMapping / ATLAS

Interactive static site for exploring academic journals and conferences by domain:

- **Journals — impact factor** comparison with distribution charts (illustrative)
- **Journals — quartiles** (Q1–Q4) with filters and donut mix (illustrative)
- **Journals — predatory** flags and risk filters (educational composites)
- **Conferences — series identity**: acronym, organizer, cadence (annual or biennial), and format (conference, symposium, or workshop)
- **Deep domain drill-down** across STM, social sciences, and humanities, shared by both
- **Clear data provenance** (local `data.js` + linked primary databases)

Conference rows do **not** include journal quartiles, predatory flags, acceptance rates, or CORE / JCR / Scopus ranks. Format and cadence are illustrative labels for navigation, not a ranking.

The site is separate screens, not one long page: a **journals catalog**, a **conferences catalog**, and a **detail** view for one journal or conference (`#/journals`, `#/conferences`, `#/journal/<issn>`, `#/conference/<acronym>`). Fields, legend, domain health, and sources are screens of their own.

## Local preview

```bash
npm run preview
# or: cd public && python3 -m http.server 8080
```

## Validate / expand data

```bash
npm run validate          # structural + provenance checks
npm run coverage          # merge coverage JSON expansions + validate
npm run expand            # full rebuild helpers + coverage + validate
```

Dataset scale (illustrative snapshot): **~850 journals** and a **modest conference set** across **~300 domains**. The conference list is a handful of widely known series placed in the existing tree so drill-down and filters have something to show — not a ranking database.

## GitHub Pages

Deploys `public/` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) (includes dataset validation).

1. **Settings → Pages → Source = GitHub Actions** (or rely on workflow `enablement: true`)
2. Site URL (typical): `https://<user>.github.io/AcademicsMapping/`

## Data sources

**Runtime fetch: none.** Browser loads [`public/data.js`](public/data.js) only.

| Field | Verify / origin |
|---|---|
| Journals: Impact Factor | [Clarivate JCR](https://jcr.clarivate.com/) |
| Journals: Quartiles | JCR category rank; [Scopus](https://www.scopus.com/) / [SCImago](https://www.scimagojr.com/) |
| Journals: Open access | [DOAJ](https://doaj.org/) |
| Journals: Predatory risk | [Think. Check. Submit.](https://thinkchecksubmit.org/) |
| Journals: ISSN | [ISSN portal](https://portal.issn.org/) |
| Conferences: identity | Organizer / society pages. This snapshot stores illustrative labels only. |
| Conferences: computing record | [dblp](https://dblp.org/) — series lookup; citation counts are not copied |
| Conferences: ranks | [CORE Conference Portal](https://portal.core.edu.au/conf-ranks/) — **not stored** here |
| Conferences: quality checks | [Think. Check. Attend.](https://thinkchecksubmit.org/think-check-attend/) |

Details: [`public/docs/DATA_SOURCES.md`](public/docs/DATA_SOURCES.md).

Snapshot metrics are **illustrative** — not a live Clarivate, Scopus, or CORE pull. Conference numbers you might expect (CORE rank, acceptance rate, citations) are omitted on purpose.
