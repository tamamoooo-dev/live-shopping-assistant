# Store and brand identity assets

Store controls and Browse brand tiles use local standalone identity images. The registry includes recently inactive brands as well as the live market.

| Brand asset type | Entries |
| --- | ---: |
| Sourced logos | 513 |
| Reconstructed marks | 349 |
| Created name marks | 11 |
| Product-image fallbacks | 0 |
| Total brand entries | 873 |

There are also 21 local store identities. The existing popular, alphabetical and most-offers brand tabs keep their ordering behaviour.

## Sources and classification

The source catalogue is [data/identity-assets.json](data/identity-assets.json). It records source URLs, product references, reviewed reconstructions and generation prompts. Reconstructed marks follow the printed label; small details can be approximate. A created name mark identifies a catalogue name without asserting that it is an official manufacturer logo.

The complete/visualCoverageComplete fields mean that every entry has a standalone mark with no product-photo fallback. verifiedLogoCoverageComplete stays false while name-only identities remain.

| Created name mark | Reference limitation |
| --- | --- |
| crystal | The catalogue combines Crystal edible products and Crystel household tools; a neutral name mark avoids assigning one company logo to different identities. |
| archive-farm | The catalogue combines Farm ghee and retailer private-label products; a neutral name mark is used. |
| archive-yamama | The catalogue combines bakery and molasses/flower-water identities with different observed marks. |
| archive-alnokhba | The catalogue groups cheese, charcoal and cookware under the same name with different or absent marks. |
| archive-naimi | Naimi is presented as a lamb descriptor in the available source, with no manufacturer mark. |
| archive-betello | The available source is an unbranded fresh-veal plate; do not present an invented cow emblem as a sourced brand logo. |
| archive-ski | No observable manufacturer logo was found in the available product references; this is an explicitly created typographic name mark. |
| archive-laziza | No observable manufacturer logo was found in the available product references; this is an explicitly created typographic name mark. |
| archive-furidi | No observable manufacturer logo was found in the available product references; this is an explicitly created typographic name mark. |
| archive-alwadi | No observable manufacturer logo was found in the available product references; this is an explicitly created typographic name mark. |
| archive-cheeseland | No observable manufacturer logo was found in the available product references; this is an explicitly created typographic name mark. |

## Updating assets

Save raster marks in icons/brands/logo-only/ as optimized WebP, simple vector wordmarks as SVG, created catalogue-name marks in icons/brands/name-marks/, and store logos in icons/stores/. Prefer a verified source in the correct product category; a namesake from another industry is not identity evidence. Keep the source and method in the catalogue.

Run node scripts/build-identity-assets.mjs after editing the catalogue. It validates paths, classification and optional background colors, then generates src/identityAssets.js for the browser.

Browser verification uses optional Playwright and Sharp development dependencies, or the bundled Codex runtime when available:

    node scripts/verify-identity-assets.cjs --logo-only --no-contact --out ../identity-verification

It checks all registered image files, renders the search/store/brand views at 320, 390 and 1280 pixels, loads every brand image, checks the store toggle and checks for script errors, failed images and horizontal overflow. The catalogue snapshot is a test fixture; the app continues to read the live Browse API.

The 2026-10-30 release passed 23 test modules and the complete browser image verification. Release cache key: 20261030.logos4.
