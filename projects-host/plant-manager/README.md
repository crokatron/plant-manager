# Mungoon Plant Manager

Live: https://plants.mungoon.net/ (also linked from the Projects library).

HortusFox v6.2 runs independently on Unraid. Use the existing Projects Google or email sign-in. The NAS checks that the signed-in identity is the owner before forwarding each request. No family access was added.

## Getting started

1. Add plants under **Indoor plants**, or create locations under **Admin area → Locations**.
2. Add separate watering and fertilizer tasks, choose a due date and recurrence interval, and associate them with the plant. Check soil and growing conditions before watering.
3. Mark the task done after care. The NAS processes completion within five minutes and schedules the next occurrence from that processing time. Overdue tasks remain due until completed. Do not also enable HortusFox's native recurring-task cron: it advances tasks independently of completion.
4. A daily summary of due and overdue tasks goes to `mobile_app_s25u_leras` (Galaxy S25 Ultra), from 09:00 Asia/Dubai. The worker retries during the day if sending fails and stays quiet from 21:00 until 09:00. It sends nothing when no tasks are due. Opening the notification opens the task list.
5. On Android, open the HTTPS site in Chrome and choose **Add to Home screen / Install app**. PWA support is enabled; this is a web app, not a separate Play Store application. Notifications use the existing Home Assistant Companion app.

## Photo identification — connected

The owner's Pl@ntNet developer account is active on the free 500-identifications/day plan. Its existing API key was copied directly into **Admin area → Environment → Pl@ntNet API Key** on 2026-10-04. Plant recognition and the quick-scan widget are enabled. Tap the floating microscope button and choose a clear photo. Identification submits selected photos to Pl@ntNet; care records and uploads are stored on the NAS. The key is saved in HortusFox's NAS database, not in this workspace or the Projects library; do not print it in logs or chat. If replacing it later, use the same admin field.

Connection validation used HortusFox's installed RecognitionModule on the NAS to submit the official Pl@ntNet sample flower photograph. It returned `Hibiscus rosa-sinensis L.` and a remaining quota of 499. This verifies the saved key and server-side photo identification. Automated browser file selection was unavailable due to the Opera extension's file-upload permission, so that UI upload path was not tested. No test plant was added to the collection.

## Runtime and storage

Data root: `/mnt/cache_nvme/appdata/mungoon-plants`.

- `mungoon-plants-db`: MariaDB 11.4; database under `database/`; private internal network.
- `mungoon-plants-web`: official HortusFox v6.2 image; app uploads, attachments, themes, logs, migration state and manual backups under `app/`; no published port.
- `mungoon-plants-gateway`: nginx 1.28; listens only on host `127.0.0.1:9073`; Cloudflare Tunnel routes `plants.mungoon.net` there.
- `mungoon-plants-reminders`: Python 3.12; `config/reminders.py` and persisted scheduling state under `reminders/`; no published port.

All containers use `unless-stopped` and are listed in `/var/lib/docker/unraid-autostart`. Image digests are recorded in `image-digests.txt`. These containers were installed with Docker CLI; no DockerMan edit templates were created. Avoid using an unrelated template to recreate them.

`private/` contains environment files and the internal HortusFox API configuration. It is outside published releases. The reminder workers read a protected copy of the existing Projects Home Assistant credential on the direct cache filesystem, refresh access tokens in memory, and never rewrite that connection. If Home Assistant is reconnected with a new refresh credential, update this private copy and recreate both reminder workers with their same restricted mounts. Do not expose the Docker socket or private directory to the web app or gateway.

HortusFox's upstream CLI requires debug mode during initialization. `start-plants.sh` allows that while the app is not serving; `run-plants.sh` disables debug and PHP error display before Apache starts. Do not substitute the vendor entrypoint without preserving this production-mode step.

## Operations

Do not rerun `install.sh` over an existing installation: it deliberately refuses. Preserve the database and app directories during upgrades. Back up this entire directory with the database stopped, or use a consistent MariaDB dump plus the uploads/configuration. HortusFox manual exports are available under **Admin area → Backup**. A scheduled off-device backup has not been configured by this installation.

Run `docker exec mungoon-plants-reminders python /app/reminders.py --once` for one reminder check. `--targets` lists HA phone services; `--test` sends a test notification. Routine state is in `reminders/state.json`; errors record only the exception class. Never print the private JSON or environment files.

The gateway validates the existing Cloudflare Access JWT through the NAS owner-only `/api/admin/users` endpoint and overwrites the upstream identity headers. An unavailable Projects authorization service fails closed. Cloudflare's existing Projects Access application includes both `projects.mungoon.net` and `plants.mungoon.net`; its sign-in policy was preserved. The plant gateway rejects missing/invalid JWTs, forged identity headers and foreign request origins. Local network access is not an authentication exemption.

## Validation on 2026-10-04

Four reminder tests passed, covering due dates, completion-based recurrence, quiet hours, daily deduplication and retry behavior. A live temporary plant/task test verified creation, due detection, task completion, seven-day recurrence and cleanup. Home Assistant accepted one test notification for the Galaxy S25 Ultra. Public owner sign-in and protected routing were verified. The Projects index was published through the signed index-only workflow; release `2026-10-04 14:31:05 UTC` preserved all eight existing apps and saved NAS data.

Official project: https://github.com/danielbrendel/hortusfox-web .


## HA plant care and linked tags — 9 October 2026

Open https://ha.mungoon.net/plant-map/home for the responsive Plants dashboard. Care, Stats, Water Schedule and Notifications work at desktop, tablet and phone widths. Each plant has a permanent HA subview and links to its native Plant Manager record and QR Print entry. Plant Manager detail pages also link directly to HA care and printing.

Plant Manager remains the source of names, scientific names and the main or newer gallery photo. Edit those there; the NAS worker copies updates to HA within five minutes. QR Print refreshes its linked names every minute while visible, and refreshes the collection before a batch export. HA selects a gallery upload when its upload date is newer than the main portrait date; a later main-portrait replacement takes priority. Older archived photos remain in Plant Manager.

The photo import added 33 records (IDs 4–36), preserving existing TEST (ID 3). Rooms: Hall 7, Guest Bedroom 6, Den 13, Man Cave Bathroom 7. Map positions are approximate within the confirmed rooms. Descriptive identifications remain provisional. Sixteen visible bottles were configured at the owner's initial 750 ml default, including two on plant 20. No refill dates, levels, fertiliser intervals or feeding history were invented.

### Logging and predictions

Dial an approximate level inside the inverted bottle, then save inspection. A 100% inspection is not a refill. Use Refilled / topped up or Empty & refilled to start a new cycle, and choose 750 ml or 1 L for its capacity. Multiple bottles are independent. Undo latest action restores the previous tracked state; the SQLite action log retains the audit trail. Notes, room moves, inspection dates, quarantine and feeding can all be recorded in HA.

Predictions use comparable completed cycles (same room and bottle setup), with observed level depletion as a fallback. New plants display Learning until sufficient history exists. The water schedule includes an earlier check when a bottle may run out before the next Friday 13:30 Dubai round. Feeding needs an appropriate interval plus an actual feed date; quarantine pauses feeding reminders.

The new worker sends one combined phone reminder per day, checking every five minutes during 13:30–21:00 Dubai. Friday includes all configured bottles; other days include due water checks and feeds. The Notifications section shows the policy and last actual care reminder. A silent setup notification was accepted by HA on 9 October; device receipt was not independently observed. Existing native HortusFox task reminders remain a separate 09:00 workflow; avoid creating duplicate recurring tasks for the same HA feeding schedule.

### Runtime and publishing

`mungoon-plants-map` serves the owner-protected `/plant-map/` API/UI; `mungoon-plants-map-sync` maintains HA state, images, owned dashboard views, and notifications. Both restart automatically and require no Windows PC. Runtime source is `config/map-release-20261008`; persistent SQLite, import checkpoints, photo hashes, notification state and HA ownership backups are in `plant-map/`. Never replace that directory with source seeds.

Both reminder workers use a protected copy of the existing HA refresh credential at `private/home-assistant.json` on the direct cache filesystem. This avoids stale file handles when Projects atomically replaces its credential file on the user-share filesystem. No additional HA access was granted. If the owner reconnects HA with a new refresh credential, copy the current Projects credential into this private file, retain mode 600 / owner 99:100, and recreate the worker with the same restricted mounts. Never print credentials.

Update source only after tests pass. Stage the signed runtime archive through `owner_request.py`, verify its SHA256 on the NAS, extract source without touching data, deploy the HA card through the guest agent with a readback hash check, and restart the two workers. HA resource version `20261009-plants-7` busts the previous card cache. QR Print / Projects publishing uses the scoped workflow below and preserves unrelated live apps.

Validation: 29 Python tests; live HA inspection, refill, capacity, feed scheduling, quarantine, clear and undo; native name/scientific-name/main and gallery photo propagation; exact original TEST photo restoration; responsive screenshots at 390, 768 and 1440 px; QR destination routing. The public QR reaches the correct HA view through normal HA login; the equivalent authenticated LAN view was audited.

### Photo identification and Companion navigation follow-up — 9 October 2026

Reviewed all 33 imported plants visually and updated native names, scientific names and identification notes. Cultivar-level uncertainty is labelled probable/type/pending; the quilted-leaf plant on the guest lower shelf remains an unidentified aroid. Each native note records the source image and visual rationale. The reviewed mapping is in `outputs/plant-map-20261008/identifications.json` at the workspace root. The NAS backup `plant-map/identifications-before-20261009.json` preserves the original native attributes and tracking snapshot; `identifications-result-20261009.json` records verified updates. The updater checks import identity and concurrent edits and preserves owner corrections. Photos and bottle/care history were verified unchanged.

Plant links in the HA card now use HA history navigation and its `location-changed` event for cards, map markers, schedule entries and All plants. External manager/print links remain explicit external links. When a physical map tap overlaps several nearby markers, a labelled dialog lets the user choose the exact plant; keyboard activation opens its exact target directly. No saved map positions are moved.

Run `node projects-host/plant-manager/map/test_ha_navigation.cjs` from the workspace root, alongside the 29 map Python tests. Live browser verification uses a 390 px mobile viewport and checks `Page.navigatedWithinDocument` history events without a new document navigation. A physical Android/iOS Companion session is not available on this PC; an already-open app may need a dashboard reload to obtain resource version 7.
Follow-up verification: live crowded-marker choice opened plant 8 exactly; Cancel dismissed it; photo-card, All plants, browser Back and Water Schedule navigation emitted in-document events. Native plant 19 showed the reviewed botanical note; QR plant 20 refreshed to Ficus lyrata. Runtime archive SHA256 185ba006b643d98c0456c46ba05704fe6604f7f1485bb1fdca376d75fd54cf74 was deployed and the HA asset readback matched. The required Projects publish command was attempted with the current QR base; it declined an empty release (zero changed files verified), so no new Projects release was made. HA and native data updates use the separate deployed plant runtime.

### Direct placement editing — 9 October 2026

The Plant Map now has an **Edit placements** toggle. It focuses a populated room (or the selected plant's room); drag a photo to save a new spot, click it to open its existing details, and use **Undo last move** to restore the last drop. **Fit home** permits moves between rooms. Normal mode pans without changing positions. All map markers use photos or a named fallback instead of numeric IDs. Desktop edit mode shows name labels; phone edit mode shows the selected name and photos to avoid crowding.

Pointer capture supports mouse and touch. A six-pixel movement threshold separates a click from a drag, multi-touch switches to map navigation, cancelled gestures and drops outside rooms revert, and saves retain existing revision/idempotency protection. Plant information, care history and native-record links remain in the details dialog. Runtime asset version is `20261009-gestures-1`.

Validation: all 29 Python tests and HA navigation tests passed. An isolated browser fixture verified mouse drag/save, touch drag/save, click-for-information while editing, cross-room moves, undo, invalid drops, touch cancellation, persistence after reload, keyboard activation and normal-mode panning without moving a plant. Live desktop verification confirmed all 33 real photos/names and the exact fig record. Saved production plant positions were not altered during this UI audit.


### Map camera and responsive workspace — 9 October 2026

The plant map uses the Layout Editor / HA camera conventions: cursor-anchored smooth wheel zoom, single-finger panning, combined two-finger pinch/pan/rotation, middle-button or Space-drag panning while editing, 15-degree rotation controls, editable angle, Drawing up, Fit home and zoom buttons. Tap/click opens plant information; a 650 ms touch hold also opens it. A second finger cancels a tentative plant drag before navigating. Escape cancels a tentative move and Ctrl/Cmd-Z undoes the last saved drag. The Help dialog lists gestures.

Photos grow gently with zoom (bounded between 36 and 104 screen pixels); name labels and room names stay constant in screen size and upright as the floor rotates. World coordinates are inverse-rotated before placement saves. Desktop uses map plus plant sidebar; tablet narrows the sidebar; phone uses the full map with bottom tabs for Plants, Water schedule and Stats. All layouts use the same records and care dialogs.

Validation: camera unit tests cover zoom anchoring, letterboxing, pinch/pan/rotation, rotation round trips and bounded portrait sizing; all 29 Python tests and HA navigation tests pass. Browser fixture checks covered 1440 px desktop, 1024 px tablet and 390 px phone layouts; a combined pinch/pan/twist reached 90 degrees and 150% zoom; rotated drag saved correct world coordinates and Undo restored them. Wheel zoom enlarged a photo from 53 to 64 px while its label stayed 15 px high. Middle-button panning, Escape cancellation, adding a second finger during a drag, long-press information and all four phone tabs were verified. Fixture revision stayed unchanged after cancelled gestures. Production plant positions are not changed by the UI audit.

Live gesture runtime deployed and verified: SHA256 `75a697eee62eabd133899e954e9de9a4f7654d1d5c378a7c41094e0ed8cc9a20`; both NAS workers restarted, HA card readback matched, and public asset version gestures-1 rendered all 33 photos. Live desktop/tablet/phone viewport checks passed, with phone pinch/rotation and exact fig details confirmed; browser console had no errors. The separate Projects publish command was attempted: an older base was rejected, then the matching active base was checked and rejected an empty scoped release (zero changed Projects files). Plant Map was published through its documented separate runtime route.

### HA map parity and drag-save correction — 9 October 2026

HA resource `20261009-plants-8` adds the shared camera, photo markers, fixed-size upright text, edit placements, room focus, Undo, Escape and Ctrl/Cmd-Z, mouse/middle/Space pan, wheel zoom and combined touch pinch/pan/twist. Tablet/desktop retain a plant sidebar; phone widths use bottom tabs for Map, Plants, Water schedule, Stats and Notifications. The map legend explains quarantine, water due, fertiliser due, empty bottles, active bottles and untracked plants. Crowded taps offer named choices. Details and care links remain inside HA history navigation.

The HA bundle is generated: edit `ha-plant-map.js`, `ha-plants-card-source.js` or shared `plant-camera.js`, then run `python projects-host/plant-manager/map/build_ha_card.py`. The runtime staging script runs the builder automatically. Do not edit the generated `ha-plants-card.js` directly.

Both maps retain a dropped photo at its tentative position while a save is pending, resolving the snap-back visible in the supplied recording. Confirmed state is only replaced after success; failures revert the tentative marker. HA uses the existing revision-protected, idempotent care event bridge and preserves safe retries.

Validation: 29 Python tests, shared camera tests, HA navigation tests and new HA map tests passed. Isolated browser tests used the actual map API with a two-second save delay: desktop and phone drags stayed in place while saving, Undo restored the original position, Escape and second-finger cancellation did not save, and native rejected saves restored the original marker. Combined phone pinch/pan/twist reached 90 degrees and 150% zoom; wheel zoom enlarged photos while text stayed 12 screen pixels high. All five tabs, edit-mode details and internal care links passed. Tablet (768 px), phone (390 px) and desktop (1440 px) layouts were checked. Production placement data is excluded from the source deployment.

Live verification: runtime SHA256 `bdebec35cbc446b204a2ffce6375183c08cc8476d3d1a4678c6a80acecff8774` deployed; both NAS workers restarted and the HA card readback matched. HA displayed all 33 real photos, its legend, desktop/tablet sidebar, phone bottom tabs and native care navigation to plant 20 with two bottles. Stats showed 33 plants and 16 bottles. Notifications showed enabled reminders and the actual 9 October 13:31 Dubai Friday round. Public Plant Manager loaded asset version `20261009-drag-save-1`. Live phone touch navigation and pinch/rotation were checked without changing production placements. Screenshot: `outputs/plant-map-20261008/live-ha-map-8.png` at the workspace root. Physical Android/iOS Companion hardware was not available; the HA frontend's internal navigation was verified in-browser.

The required Projects publisher was run with its matching active QR base. It declined an empty scoped release; a byte comparison confirmed zero changed Projects assets. The separate plant runtime publication above succeeded.


### Plant name cleanup (2026-10-09)

Removed room/pot suffixes after ` · ` from all 33 canonical plant names through the native Plant Manager update API. Before/after reads guarded each change; `/data/names-before-cleanup-20261009.json` and `names-cleanup-result-20261009.json` on the companion data volume preserve the audit. Scientific names, photos, notes, locations, placement and care history were checked unchanged. HA sync was restarted and the QR catalog returned 33 clean names. IDs and QR destinations are unchanged; duplicate plant varieties remain distinct records.

### Compact HA maps and water rings — 11 October 2026

HA maps now default to viewing and care: placement editing remains in Layout Studio and the Plant Manager map. The floor card does not mount the movement controller unless `allow_edit: true` is explicitly configured. Its compact header contains Home, Fit and zoom; pan/pinch/rotation and device controls remain available. The plant map hides placement/angle toolbars, uses the full map width, retains its care/stats/schedule/notifications tabs, and includes Home inside its header. Owned main cards remain top-level panel cards so scheduled sync preserves them; former separate Home tiles were removed from the main floor view and all plant views.

`water-status.js` is shared by the Plant Manager map and the generated HA card. Rings surround every plant photo on the map and in lists; HA detail photos also carry the ring. Green means a recent positive level/refill, yellow means <=25% estimated/observed water or an ageing check, and red means empty, predicted empty, unknown, stale without a prediction, or quarantine. Colours interpolate gradually. With no learned consumption, freshness fades to yellow at two days and red at four; this does not invent a water level. With a rate/empty-date forecast, the remaining water estimate drives colour. The worst bottle determines a multi-bottle plant's status. A later positive check invalidates a passed empty estimate and requests a fresh level. Fertiliser remains a separate schedule rather than overriding water colour.

Tests: water-status boundary tests, 29 plant Python tests, HA navigation and delayed-save tests, 30 floor-release/HA backend tests, and isolated browser layouts at 1024x600, 768x1024 and 390x844. Real HA showed 33 photo rings and a 406 px plant map at 1024x600, with editing hidden. Scope-published Projects release: `2026-10-11 19:48:56 UTC`. Plant runtime deployed separately with source backups and HA asset SHA256 verification; saved plant data and positions were not modified. HA resource versions: `20261011-hub-compact-1` and `20261011-water-status-2`.

### Crowded map selection and HA navigation (12 October 2026 Dubai)

`plant-clusters.js` groups intersecting photo hit areas using screen distance, without editing saved coordinates. Groups split as the map zooms in. Tapping or pressing Enter on a group opens a responsive grid with photos, names, rooms and water status; selection opens the existing care page inside HA. Group rings show the most urgent member status. Plant Manager uses the same grouping in view mode; placement editing retains individual draggable photos.

Validated deterministic grouping, complete membership, unchanged coordinates, zoom splitting, status logic and existing drag/undo/cancellation/navigation tests; all 29 Python tests passed. Browser tests at 1024×600, 768×1024 and 390×844 verified disjoint hit areas, all 33 plants reachable, photo selection, keyboard access and no dialog on pan. Plant Manager phone tests verified grouped details and individual placement editing. Live HA photo selection opened Zebrina's matching care page.

HA sidebar order was saved to the signed-in user's native sidebar preferences: Overview, My Home, Floor Plan, Plants, Remotes, Den curtains, Nest Hub, Energy, Calendar, To-do lists, Media, Map, Devices, Activity, History, Settings. Existing hidden-panel preferences were preserved. All 15 existing area records have appropriate icons, and 21 room/dashboard views were updated; room icons survive the publisher's existing view merge. No rooms, permissions, plant positions or care records were changed. Before-state backup: `outputs/plant-selection-20261012/ha-navigation-before.json`.

HA resource: `20261012-plant-groups-1`; deployed asset SHA256 `c940e10007c03c2bb95dac4d203aa1f17957340b63db9bc8f1370b3440fbb809`. The separate plant runtime was signed, backed up and deployed to the NAS, and both workers restarted. The required Projects publishing check passed and verified all 12 apps while preserving other projects. Live screenshot and browser tests are in `outputs/plant-selection-20261012/`.
