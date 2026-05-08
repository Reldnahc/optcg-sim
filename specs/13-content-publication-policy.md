---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "13-content-publication-policy"
doc_title: "Content Publication Policy"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Content Publication Policy

<!-- SECTION_REF: 13-content-publication-policy.s001 -->

Section Ref: `13-content-publication-policy.s001`

## Purpose

<!-- SECTION_REF: 13-content-publication-policy.s002 -->

Section Ref: `13-content-publication-policy.s002`

A public simulator using official card names, text, images, set symbols, and trademarks carries legal and platform risk. This document is not legal advice. It is a product-risk checklist to resolve before public launch.

## Risk areas

<!-- SECTION_REF: 13-content-publication-policy.s003 -->

Section Ref: `13-content-publication-policy.s003`

### Card images

<!-- SECTION_REF: 13-content-publication-policy.s004 -->

Section Ref: `13-content-publication-policy.s004`

Questions to answer:

- Are official card images displayed?
- Are images hotlinked, proxied, cached, transformed, or uploaded by users?
- Are alternate-art variants stored or merely referenced?
- Is there a fast operational switch to disable image rendering if needed?
- Is image access limited to private/local use or public matchmaking?

Lower-risk fallback:

- Text-only cards.
- Generic frames.
- User-provided local image URLs not stored by the service.
- Disable image caching on server.

### Card text

<!-- SECTION_REF: 13-content-publication-policy.s005 -->

Section Ref: `13-content-publication-policy.s005`

Printed card text may also be protected content. If stored locally, track source and update policy. Consider minimizing local storage to IDs + effect implementation overlays, loading display text from user/client-side sources where appropriate.

### Trademarks and branding

<!-- SECTION_REF: 13-content-publication-policy.s006 -->

Section Ref: `13-content-publication-policy.s006`

Avoid using official logos or names in a way that implies endorsement.

Checklist:

- App name does not imply official status.
- Landing page says the project is unofficial/fan-made if appropriate.
- No official logos in app branding unless permission is obtained.
- No monetization claim tied to official IP without review.

### Monetization

<!-- SECTION_REF: 13-content-publication-policy.s007 -->

Section Ref: `13-content-publication-policy.s007`

Monetization increases risk. Before any monetization:

- Review with counsel.
- Avoid selling access to copyrighted card images/text.
- Avoid lootbox/collection monetization around real card assets.
- Keep donations/support clearly separate from access to official content.

### Takedown process

<!-- SECTION_REF: 13-content-publication-policy.s008 -->

Section Ref: `13-content-publication-policy.s008`

Before public launch, define:

- Contact email.
- Takedown review process.
- How to disable specific images/assets quickly.
- How to run text-only mode if image use is challenged.
- Logging of removed content.

## Content operating modes

<!-- SECTION_REF: 13-content-publication-policy.s009 -->

Section Ref: `13-content-publication-policy.s009`

| Mode                  | Description                                             | Use case                           |
| --------------------- | ------------------------------------------------------- | ---------------------------------- |
| Text-only             | No official card images, generic UI                     | Lowest-risk public fallback        |
| Client-fetched images | Browser loads images from source; server does not cache | Casual display, still needs review |
| Server-cached images  | Server stores/proxies images                            | Higher risk; avoid until reviewed  |
| User-provided images  | User controls local/custom art                          | Private/local customization        |
| Licensed images       | Explicit permission                                     | Ideal but may be unavailable       |

## Launch blockers

<!-- SECTION_REF: 13-content-publication-policy.s010 -->

Section Ref: `13-content-publication-policy.s010`

Do not launch public ranked/tournament play until these decisions are made:

- Image handling mode selected.
- Branding reviewed.
- Takedown contact/process exists.
- Text-only fallback works.
- Source-card outage behavior is clear.
- Terms/community rules cover user conduct and content.

## Practical recommendation

<!-- SECTION_REF: 13-content-publication-policy.s011 -->

Section Ref: `13-content-publication-policy.s011`

For early development:

1. Build the engine and gameplay without relying on official images.
2. Support generic card rendering from metadata.
3. Keep card-image handling behind a feature flag.
4. Do not monetize.
5. Add text-only/proxy mode before public alpha.

This keeps the engine work unblocked while leaving room to adjust content strategy before public exposure.

## Poneglyph-specific content questions

<!-- SECTION_REF: 13-content-publication-policy.s012 -->

Section Ref: `13-content-publication-policy.s012`

Because the architecture uses Poneglyph as the card-data source, decide these before public launch:

- Does the server cache only Poneglyph metadata, or also image URLs/images?
- Are Poneglyph image URLs sent directly to the client, proxied through the server, or disabled behind a text-only mode?
- Are Poneglyph alternate-art variant indexes/generated variant keys stored permanently in decks?
- What happens if Poneglyph removes or changes an image/text entry?
- Is there a clear attribution or usage statement if appropriate?
- Is there a fallback for generic text-only cards if Poneglyph images cannot be used publicly?
- Does the takedown process disable image display, card text display, or both?

v4 product choice: images are enabled. Keep an operational image kill-switch and graceful fallback behavior if image availability or legal posture changes.

## Source repository publication

<!-- SECTION_REF: 13-content-publication-policy.s013 -->

Section Ref: `13-content-publication-policy.s013`

The repository's own source code, specifications, documentation, tests, and tooling may be licensed under the MIT License when a root `LICENSE` file is present.

The source repository may be made public on GitHub after the root `LICENSE` file and README license note land.

Source repository publication is not a public simulator launch, public alpha, public gameplay availability, public ranked play, public unranked play, public custom lobbies, package publication, deployment, or production service availability.

Neither the MIT source license nor making the repository public grants rights to redistribute, add, license, or use third-party card names, card text, images, set symbols, trademarks, logos, or other third-party content.

A follow-up license implementation story must use an explicitly human-confirmed copyright holder and year.
