# Publishing Gallery at Home on the Samsung TV app store

What it would take to offer the app in **Samsung TV Apps** (the store on
Samsung TVs), researched November 2026. Samsung's pages don't always agree
with each other and change without notice, so treat the specifics below as a
starting point and confirm them in the Seller Office before relying on them.

## Summary

| | Status |
|---|---|
| Account | Free **TV Seller Office** membership with a Samsung account; individuals allowed |
| Where it could launch | **United States only** as a "Public Seller". Canada (or any other country) needs a **Partner Seller** contract with Samsung |
| App readiness | Mostly there; a few gaps listed below |
| Biggest risk | The **Google Photos** source reads Google's public album pages, which isn't an official interface |
| Effort | Store assets and documents: a few days. Partner contract, if pursued: weeks to months, at Samsung's discretion |

## 1. Seller account and where the app can be sold

- Sign up at the [TV Seller Office](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html)
  with a Samsung account: email, country, time zone, and acceptance of the
  terms. No fee is mentioned.
- Individual accounts are allowed and don't need a business registration
  number (DUNS/VAT/EIN); company accounts do
  ([Managing Seller Groups](https://developer.samsung.com/tv-seller-office/guides/membership/managing-seller-group.html)).
- **Every new member is a Public Seller, who can launch apps only in the
  United States.** Launching anywhere else (including Canada, where this app
  is being developed and tested) requires becoming a **Partner Seller**:
  "an offline contract with Samsung HQ or a local subsidiary", then a
  partnership request approved by a Samsung Content Manager. Partners also
  get partner-only APIs and engineering support.
- An app listed only in the US store won't appear on TVs set to other
  countries, so a US-only launch wouldn't reach the TV used for testing here.

## 2. The publication process

From [Application Publication Process](https://developer.samsung.com/tv-seller-office/application-publication-process.html):

1. **Register** the app in the Seller Office (name, type, default language),
   which creates its store ID.
2. **Upload the package** (`.wgt`). An automatic **pre-test** checks the
   package, its configuration and its privileges.
3. **Enter the store information** (section 4).
4. **Request release** for a TV model group (for example, 2020 models). The
   pre-test runs again.
5. **Samsung review and verification**: a QA team tests the app against the
   checklists (section 5). It can be rejected; fix and resubmit. Samsung
   publishes no timeline; community reports suggest about a week per round.
6. **Release** in the chosen countries and model groups.

Updates go through the same pre-test and verification. Optional **beta
releases** to chosen testers are possible before going public.

## 3. Package requirements

From the [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html):

- **Signing:** the package is signed with an **author certificate**, and
  every future update must be signed with the **same** one. The Samsung
  certificate used for development (with device IDs) is for testing; for the
  store, Samsung adds its own distributor signature.
  **Keep the author certificate (`author.p12`) and its password safe.**
  (Copied to the OneDrive project folder; keep the password in a password
  manager.) Losing them means the app can never be updated in the store.
- **App ID** (`GalleryAtH.GalleryAtHome`) stays fixed forever. The
  **version** must be `x.y.z` and increase with every update (currently 1.1.0).
- **Title:** `<name>` in `tizen/config.xml` ("Gallery at Home") must match the
  store's default-language title exactly, or the pre-test fails.
- **Privileges:** partner-only APIs fail the pre-test. The store version
  (`scripts/tv.sh package-store`) declares `internet`, `filesystem.read`,
  `externalstorage` and `tv.inputdevice`, which should be public-level, to be
  confirmed by the pre-test. The version for your own TVs adds `download`,
  needed only for Google Photos on newer TVs.
- **Size:** the package is about 35 MB, almost all of it the included photos.
  No size limit was found, but smaller is kinder to TVs, which have little
  storage (installing updates on the test TV already fails intermittently).

## 4. Store listing

From [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html):

| Item | Requirement | Status |
|---|---|---|
| Icon, 512×423 | 24-bit PNG, ≤300 KB | Ready: `tizen/icon.png` (28 KB) |
| Icon, 1920×1080 | Logo as a transparent 32-bit PNG plus a background PNG/JPG, each ≤300 KB | Ready: `docs/store/icon-logo.png`, `icon-background.jpg` |
| Screenshots | Exactly 4, 1920×1080 JPG, ≤500 KB | Ready: `docs/store/screenshots/` |
| Description | Up to 4,000 characters per language, plus at least 3 search tags | Ready: [listing](store/listing.md) |
| Category | Lifestyle | Chosen |
| Age rating | All ages (the included content is landscapes and classic paintings) | Chosen |
| Privacy policy URL | Required if the app collects personal information | Ready: [PRIVACY.md](../PRIVACY.md) |
| Seller information | Name, support email, home page, phone, mailing address | **You** provide |
| Price | Free | — |
| App UI description | Document of the app's screens and user flows ([guide](https://developer.samsung.com/smarttv/develop/distribute/launch-checklist/application-ui-description.html)) | Ready: [UI description](store/ui-description.md) |
| Test information | Steps and test material for reviewers, such as a test web link | Ready: [test notes](store/test-notes.md) |

**Privacy:** the app sends nothing to the developer. Everything (collections,
sources, network-share passwords, album links) stays on the TV. It does,
however, contact services the user chooses (Google Photos, NAS, web links)
and stores credentials locally. A short privacy policy saying exactly that,
hosted for example as a page on the GitHub repository, avoids ambiguity in
review.

## 5. Quality requirements to check

Samsung tests against its [Development Checklist](https://developer.samsung.com/smarttv/develop/development-checklist/development-checklist.html),
mainly the [Common](https://developer.samsung.com/smarttv/develop/development-checklist/common.html)
cases. Items most relevant to this app:

| Case | Requirement | App today |
|---|---|---|
| CO-US-05 Return key | Closes popups, goes back a page; on the home page, exits (shows the TV channel on 2016+ models) | Back works; on Home it asks "Exit Gallery at Home?". Samsung's pages disagree: the checklist describes exiting, while [Terminating applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html) says Return on the home page "must display an exit confirmation popup". The app follows that guide. **Confirm with Samsung (1:1 Q&A ticket) which the reviewers expect.** |
| CO-US-04 Exit key | Closes popups and the keyboard; exits the app | Exit is left to the system; to verify on the TV |
| CO-GE-01 Responsiveness | Responds within at most 30 s | Opens in well under a second |
| CO-GE-07 / CO-MT-01 Multitasking | Smart Hub key backgrounds the app; resuming shows the same state | Resuming keeps the same page; to verify on the TV |
| CO-GE-08 Power cycle | The previous screen or page appears after power off and on | Opens to "now showing"; to verify |
| CO-CN-01/02 Network loss | No freeze; a clear message; recovers on reconnect | A message shows until reconnecting (for 10 s over playing photos), and failed pictures reload. Tested in a browser; to verify on the TV |
| CO-CN-03 Loading | A progress indicator while loading | Present (spinners) |
| CO-UI-04/06/09 Focus | Every item reachable, focus never lost, stops at edges | Built for this (focus recovery, row end stops); to test fully |
| CO-SO-* Sound | Volume and mute behave normally | The app plays no sound; to verify the TV's own sound UI |
| CO-US-01 Remote keys | Undefined keys do nothing | To verify |

Also worth checking:

- **Screensaver:** the app keeps the TV's screensaver off while showing
  photos, through Samsung's public `setScreenSaver` API. It's legitimate for
  a photo frame, but the review may ask about it; the "Turn off" timer in
  Style is the answer.
- **Burn-in and energy:** not a concern on the LCD TVs tested, but a photo
  frame running all day may draw questions for OLED models.

## 6. Content and legal risks

**Google Photos shared albums (the main risk).** Google offers no API for
reading a shared album from its link, so the app reads the album's public web
page and the page's own data endpoint, the way a browser does.

- Google's [Terms of Service](https://policies.google.com/terms) prohibit
  "using automated means to access content from any of our services in
  violation of the machine-readable instructions" (robots.txt), and list
  "scraping content that doesn't belong to you" as grounds for suspension.
  Google's robots.txt disallows paths such as `/album/`, `/shared` and
  `/photo/`; the `/share/…` album pages and the data endpoint the app uses are
  not listed, and users read albums they shared themselves or were given a
  link to. That's a defensible position for a personal tool, not a guarantee
  for a store app with many users.
- It can break whenever Google changes the page, which in a store app means
  support requests and possibly emergency updates.
- Samsung's reviewers may question an undocumented third-party integration.

Options for a store release, from safest:

1. **Ship without the Google Photos source** at first (USB, network shares and
   web links), and add it back once its standing is clearer.
2. **Switch to Google's official [Photos Picker API](https://developers.google.com/photos/picker)**:
   the user picks photos on their phone (for example by scanning a QR code
   shown on the TV). This needs a Google Cloud project, OAuth consent-screen
   verification and Google's review of the requested scope. **Not yet
   researched in detail:** whether the picker works with the TV-style
   sign-in, how long picked photos stay accessible, and whether it can keep
   an album in sync. To investigate before committing to it.
3. **Keep it as is**, clearly labelled as reading public share links, and
   accept the risk of rejection or breakage.

**The included photos.** All are public domain, CC0, CC BY or CC BY-SA, which
allow redistribution in a free app with attribution. The in-app Photo credits
screen and `CREDITS.md` provide that. CC BY-SA asks that adaptations be shared
alike; resizing isn't generally considered an adaptation, but replacing the
CC BY-SA photos (31 of the 56) with public-domain or CC0 ones would remove any
doubt.

**The app's own licence.** The PolyForm Strict licence restricts other people;
as the copyright holder you can still publish the app in the store. Samsung's
seller terms grant Samsung the rights it needs to distribute it.

**Name.** "Gallery at Home" sits next to Samsung's own "Gallery" app on the
same TVs. A trademark search before launch is worth doing.

## 7. Suggested path

1. Finish testing on the TV.
2. Decide the Google Photos question (section 6).
3. Settle the Return-on-Home behaviour with Samsung and run the Common
   checklist on the TV. (Done: `productinfo` removed, "no network" message,
   same page on resume, and a store build without Google Photos.)
4. Back up the author certificate. (Done.)
5. Prepare the listing: the 1920×1080 icon pair, 4 screenshots, description
   and tags, a privacy policy page, the UI description and test notes.
   (Done: [docs/store/](store/README.md).)
6. Join the Seller Office. To reach Canadian TVs, ask Samsung Canada about a
   partner contract. Otherwise launch in the US only, perhaps as a beta first.
7. Submit for the 2019+ model groups and respond to review feedback.

## Sources

- [Becoming Seller Office members](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html)
- [Managing seller groups](https://developer.samsung.com/tv-seller-office/guides/membership/managing-seller-group.html)
- [Application publication process](https://developer.samsung.com/tv-seller-office/application-publication-process.html)
- [Launch checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html)
- [Entering application information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- [App icons and screenshots](https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html)
- [Development checklist](https://developer.samsung.com/smarttv/develop/development-checklist/development-checklist.html) and its [Common test cases](https://developer.samsung.com/smarttv/develop/development-checklist/common.html)
- [Terminating applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html)
- [Application UI description](https://developer.samsung.com/smarttv/develop/distribute/launch-checklist/application-ui-description.html)
- [Google Terms of Service](https://policies.google.com/terms); `https://photos.google.com/robots.txt`
- [Google Photos Picker API](https://developers.google.com/photos/picker)
- Community: [Jellyfin for Tizen, Seller Office application thread](https://github.com/jellyfin/jellyfin-tizen/issues/222)
