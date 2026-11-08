# Gallery at Home: application UI description

For Samsung's review team. Version 1.1.0, store build (USB drives, network
shares and web links; no Google Photos).

## Remote keys

| Key | Action |
|---|---|
| ◀ ▲ ▶ ▼ | Move the focus. While playing, ◀ ▶ show the previous or next photo |
| OK | Open or choose the focused item; pause or resume while playing |
| Return | Close a dialog, go back a page, stop playing. On Home, asks "Exit Gallery at Home?" |
| Exit | Left to the TV: closes the app |
| ▶ (Play), ⏯, Green | On Home or a collection: play it. While playing, ▶ and ⏯ pause or resume |
| ⏮ ⏭, CH ▲▼ | While playing: previous or next photo. On Home's Index layout, CH ▲▼ jumps a letter |
| Red | On a photo in a collection: "Show this photo" |
| Green / Yellow | In a folder: add the selected photos / select all |
| Blue | While playing: change how the collection plays |

Keys with no meaning on a page do nothing.

## Flow

```
Launch ─▶ [something "now showing"?] ── yes ─▶ Player ──Return──▶ Home
                    │ no                                         ▲
                    ▼                                            │
                  Home ─▶ Collection ─▶ Style ─▶ Play on the TV ─┘
                    │          └─▶ Add photos ─▶ Choose a source ─▶ Folder ─▶ add photos
                    ├─▶ Sources ─▶ Add a network share / Add web links
                    └─▶ Settings ─▶ Photo credits
```

The first launch has nothing "now showing", so it opens on Home.

## Screens

**Home.** The app's top level. Collections appear in one of four layouts
chosen from the switch in the top bar: Wall (A–Z grid), Shelves (rows:
Recently played, My collections, Included), Index (A–Z list with a large
preview) and Jump bar (the default: one row of posters under a Recent button
and an A–Z strip). The top bar also opens Sources and Settings. A "New
collection" card creates a collection, either from a new source or empty.
Return here asks to exit.

**Collection.** The photos in a collection, with Play, Style, Add photos and
More (Rename, Stop showing on the TV, Delete collection). OK on a photo
offers Show this photo, Play from here, Use as cover and Remove from
collection.

**Style.** How the collection plays, with a live preview: Look (Slideshow,
Ken Burns, Mosaic, Duo, Memories), Frame, Fit, Change photo every, Order,
Transition, Clock, Caption and Turn off (a sleep timer, after which the TV's
screensaver takes over). "Play on the TV" starts it.

**Player.** Full screen photos in the chosen look. Whatever plays last stays
"now showing": the app opens to it, and the menus return to it after a set
idle time (Settings). The TV's screensaver is held off while playing, through
Samsung's public `setScreenSaver` API, until the Turn off timer ends.

**Choose a source / Folder.** Lists the sources (USB drives, network shares,
web links); a folder view shows photos and subfolders. Photos can be selected
one by one (OK), all at once (Yellow) or as a whole folder ("Add folder").

**Add a network share.** Address, name, and an optional user name and
password for a WebDAV share or web folder. "Connect & save" checks the
address before saving.

**Add web links.** A name and one or more links: direct photos, web pages, or
text/JSON lists of photo addresses.

**Sources.** The saved sources, to edit or remove, and "Add source".

**Settings.** Back to "now showing" after (idle time), the default change
interval for new collections, Included collections (restore deleted ones),
Photo credits (the photographer and licence of every included photo) and the
version.

## States

- **Loading:** a spinner while folders and photos load.
- **No network:** a banner, "No network connection. USB and included photos
  still work.", until the connection returns (over a playing slideshow it
  hides after 10 seconds). Photos that failed to load reload when it returns.
- **Empty:** a collection with no photos offers Add photos; a source that
  can't be reached shows an error with the reason.
- **Multitasking:** returning to the app shows the same page. If the TV
  closed the app in the background, it reopens on the page it was on, unless
  that was longer ago than the idle time, when it opens to "now showing".
