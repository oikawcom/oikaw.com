# Legacy migration inventory

Coverage status: **FINAL for migration design; PARTIAL only for Codex HTTP access.** Archive inventory and normalization cover all 71 discovered legacy paths. Production routes and redirects are not implemented here.

The three CSV files in this directory are the source of truth for legacy-page inventory, Project normalization, and URL migration behavior.

## Project-centered model

The confirmed unit is:

```text
1 production output = 1 Project = 1 detail page
```

One Project never contains multiple outputs. Music Video, Cover Art, Portrait, Sculpture, Broadcast, and other independently released outputs remain separate Projects, including when they share the same song, artist, campaign, or legacy grouped page.

The Adobe Portfolio grouping was used to reduce thumbnail count. It is not inherited as the new site's normal information architecture.

## Taxonomy and relationships

`project-normalization.csv` uses the confirmed taxonomy order: `media`, `type`, `roles`, `techniques`, `context`. `scope=solo-production` remains separate from Role. Unknown attributes remain blank.

- Repeated occurrences of the same output across legacy URLs become one canonical Project with every source retained in `source_legacy_urls`.
- Of 12 multi-source Projects, 11 are duplicate occurrences of one output; Kerala to Kathmandu merges two explicitly paginated galleries into one Photography Project.
- Matching artist or year alone does not create a relationship.
- Five verified same-work Cover Art ↔ Music Video pairs remain separate Projects and are retained symmetrically in `related_project_ids`.
- `series_collection` records explicit series metadata. It does not create a multi-output Project or a normal-IA Collection page.

## Decision status

Across 77 Project-normalization rows and 71 URL-migration rows:

| Decision class | Count |
| --- | ---: |
| auto-approvable | 139 |
| ai-decidable | 9 |
| human-required | 0 |

All remaining Human Validation decisions covered by this migration design are resolved. The nine AI-decidable Project rows are evidence-based normalization interpretations, not pending Human approvals. Every `human_review_required` value is `false`.

## Final counts

| Item | Final | Result |
| --- | ---: | --- |
| Unique legacy paths | 71 | Inventory and URL map have identical path sets |
| Project candidates | 77 | No multi-output Project |
| Split-from-group Projects | 39 | All boundaries confirmed |
| Multi-source Projects | 12 | 11 duplicate source sets, 1 paginated-gallery merge |
| Grouped legacy URLs | 14 | 13 compatibility views, 1 canonical alias |
| Blank target paths | 5 | Photography deferrals only |

## Grouped legacy URL migration

The rejected design is `/collections/[collection-slug]`. No Collection feature or grouped-content type is added to the normal IA.

### Thirteen unique subsets

Thirteen grouped legacy paths are preserved as future HTTP 200 **migration compatibility views**:

- `/4s4ki-artwork-2020`
- `/4s4ki-artwork-2021`
- `/4s4ki-artwork-2022`
- `/4s4ki-h-o-h`
- `/4s4ki-mvs-2020`
- `/4s4ki-mvs-2021-1st`
- `/4s4ki-mvs-2021-2nd`
- `/4s4ki-mvs-2022-1st`
- `/4s4ki-mvs-2022-2nd`
- `/4s4ki-mvs-undeadcyborg`
- `/animistic-sculpture`
- `/klooz-seasons`
- `/tentere-ending`

For these rows, `url-migration-map.csv` records:

- `target_path` equal to the legacy path;
- `canonical_path` equal to the legacy path;
- `migration_action=compatibility-view-200`;
- an explicit semicolon-separated Project ID array in `target_project_ids`.

The explicit array is the historical-subset source of truth. It is not recalculated from future WORKS filters, so later metadata or Project additions cannot silently change a legacy page's scope.

Compatibility views are an implementation contract, not a normal navigation feature. They will reuse the standard WORKS UI and Project Card presentation, link to each Project detail, avoid duplicating Project body/media, remain absent from normal navigation, use self-canonical URLs, and be included in the sitemap. Canonical, sitemap, and route-collision validation happen during production implementation.

Attributes such as `2021-1st` and `2021-2nd` remain migration-only mapping concepts. They are not added as normal Project tags.

### Canonical alias

`/4s4ki-singles-2021` contains exactly the same three Cover Art Projects as `/4s4ki-artwork-2021` and is not a fourteenth unique view.

```text
/4s4ki-singles-2021 → /4s4ki-artwork-2021
```

The confirmed future Astro static behavior is a zero-second meta refresh, canonical `/4s4ki-artwork-2021`, and a visible fallback link. No CDN or edge dependency is added. The redirect is documented but not implemented here.

## WORKS filters and migration mapping

Normal WORKS filtering is driven by Project metadata and may support Client / Artist, Type, Series, Year, Role, Technique, and other facets. Project-detail facet links may populate future filter state.

This normal browsing behavior is separate from legacy migration compatibility:

- Filters recompute a current view from metadata.
- Migration mapping preserves a historical subset from explicit Project IDs.
- Arbitrary filter combinations are not made indexable merely to support migration.
- Group compatibility views do not establish a reusable Collection content model.

The legacy category paths `/video`, `/graphic`, `/others`, and `/musicvideo` map to the root WORKS listing. Future filter UI and filter URL-state remain production responsibilities rather than migration targets.

## Project slug policy

New or blank Project slugs follow these rules:

1. Use the formal title or a verified English title as the base.
2. Normalize to lowercase ASCII kebab-case and remove non-semantic punctuation.
3. Add disambiguation only when needed: Type for the same work across outputs, artist for same-title works by different artists, and year for annual versions.
4. Do not rename an existing nonblank slug solely for stylistic uniformity when it has no error, collision, or migration problem.
5. Do not invent an English translation for a Japanese-only title. Leave the slug blank until an official English title or confirmed romanization is available.

Examples of confirmed collision handling include `fairytale-cover-art` / `fairytale-music-video` and `log-out-cover-art` / `log-out-music-video`.

Human Validation supplied the required official or confirmed Latin forms, so all 77 Projects now have nonblank unique slugs:

- `project-4s4ki-mvs-2020-04` — クロニクル → `chronicle`
- `project-4s4ki-mvs-2022-1st-01` — ブラックホール → `blackhole`
- `project-4s4ki-mvs-2022-2nd-02` — 電脳郷 → `cyberspace`
- `project-4s4ki-mvs-undeadcyborg-01` — ☆メガジョッキ☆ → `megajokki`
- `project-4s4ki-mvs-undeadcyborg-04` — 幸福論 → `happiness-theory`

No AI-generated translation was used for these slugs.

## Confirmed Portrait and About decisions

`project-4s4ki-artwork-2022-01` is confirmed as:

```text
Title: Portrait of 4s4ki 2022
Slug:  portrait-4s4ki-2022
```

The archived expression `マジカル阿修羅 / Magical Ashura` remains evidence but is not treated as the formal Project title.

The About/Profile migration is confirmed as:

```text
/about-1 → /about
```

The `/about` route and redirect are not implemented here.

## Photography: 4 / 3 / 5

- Four legacy Photography detail pages: `/emily-2023`, `/india-2017-1-2`, `/india-2017-2-2`, `/thai-2016`
- Three Project candidates: Emily 2023; Kerala to Kathmandu 2017; Thailand 2016
- Five deferred URL mappings: the four detail URLs plus `/photo`

The two India URLs are continuation galleries for one Project. Photography remains outside the initial release, but all five URLs stay in SEO migration scope. Their blank targets are deliberate deferrals, not unresolved Project decisions.

## Evidence and HTTP limitation

- 59 paths were reconstructed from 2025 public Internet Archive captures of `oikaw.oikaw.com`.
- 12 older `oikaw.com` paths were verified from saved public HTML.
- No image/video assets or private Adobe account data were accessed.
- Codex HTTP observed 404 responses on representative Adobe-host URLs on 2026-08-19. Human Validation in normal Chrome confirmed the Adobe Portfolio site displayed normally. The CSV statuses distinguish Codex-environment behavior from production availability.

No production content, route, WORKS filter, redirect, dependency, configuration, commit, or push is part of this migration-data update.
