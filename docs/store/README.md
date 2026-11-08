# Samsung store submission kit

Everything the TV Seller Office asks for, ready to upload. See
[PUBLISHING.md](../PUBLISHING.md) for the process and the open questions.

| What | Where |
|---|---|
| Package | `scripts/tv.sh package-store` → `build-store/` |
| Listing text, tags, category, rating | [listing.md](listing.md) |
| Icon 512×423 | [`tizen/icon.png`](../../tizen/icon.png) |
| Icon 1920×1080 (logo + background) | [icon-logo.png](icon-logo.png), [icon-background.jpg](icon-background.jpg) |
| Screenshots | [screenshots/](screenshots/) (4, 1920×1080) |
| Privacy policy | [PRIVACY.md](../../PRIVACY.md) |
| UI description | [ui-description.md](ui-description.md) |
| Test information | [test-notes.md](test-notes.md) |

The icons are generated: `node scripts/brand/render.mjs`. The screenshots
are copies of `docs/screenshots/` chosen to show no Google Photos, which the
store build leaves out.
