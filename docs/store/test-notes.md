# Gallery at Home: test information for reviewers

Everything below works without an account or any setup. The app needs no
login and sends nothing to the developer.

## 1. Included collections (no network needed)

1. Launch the app. The first launch opens on Home with seven included
   collections (Masterpieces, Mountains, Still Waters, Coastlines, Forests &
   Waterfalls, After Dark, Space).
2. Press ▶ (or Green) on a collection to play it, or OK to open it.
3. In a collection, choose **Style** to change the look (Slideshow, Ken
   Burns, Mosaic, Duo, Memories) and frame, then **Play on the TV**.
4. While playing: ◀ ▶ previous and next photo, OK pause, Blue changes the
   look, Return goes back to the menus.
5. Press Return until Home, then Return again: the app asks "Exit Gallery at
   Home?".

## 2. Web links (needs internet)

1. On Home, choose **New collection** → **From a new source** → **Web links**.
2. Enter a name and these links (public-domain photos on Wikimedia Commons),
   using **Another link** for each one:
   - `https://commons.wikimedia.org/wiki/Special:FilePath/Jeju_Island.jpg?width=1920`
   - `https://commons.wikimedia.org/wiki/Special:FilePath/Aurora_borealis_over_Eielson_Air_Force_Base,_Alaska.jpg?width=1920`
   - `https://commons.wikimedia.org/wiki/Special:FilePath/Forest_road_Slavne_2017_G8.jpg?width=1920`
3. **Save**. The new collection holds the three photos and plays like the
   others.

## 3. USB drive

Plug in a USB drive with JPEG photos. In a collection, **Add photos** lists
the drive; open a folder and add photos one by one (OK, then Green), all at
once (Yellow) or the whole folder (**Add folder**).

## 4. Network share (optional)

Needs a WebDAV share or a web server that lists a folder of photos, for
example a NAS on the same network. **Sources** → **Add source** → **NAS or
network share**, then enter its address (such as `http://192.168.1.20:5005/photo`)
and, if it has one, a user name and password.

## Things to know

- **Now showing:** whatever played last stays pinned. Relaunching the app
  goes straight to it; Return shows the menus. To clear it, open the
  collection → **More** → **Stop showing on the TV**.
- **Screensaver:** while photos play the app keeps the TV's screensaver off
  through the public `setScreenSaver` API, as a photo frame needs to. The
  **Turn off** option in Style hands back to the screensaver after a set
  time.
- **No network:** unplugging the network shows a banner; included and USB
  photos keep working, and failed photos reload when the network returns.
- **Resume:** the Smart Hub key and reopening return to the same page.
