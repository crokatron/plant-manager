# Plant Manager

Keep plant records and care tasks together, with a map/placement extension and Home Assistant reminders. The underlying plant-record application is HortusFox; this repository contains the custom integration and deployment work around it, not a claim of authorship over HortusFox.

**Private preview · not published.**

[Open the visual manual](docs/USER-MANUAL.md) · [Download the self-contained demo](demo.html) · [Release notes](CHANGELOG.md)

Download `demo.html` using GitHub’s Download raw file control, then open it in your browser. GitHub displays HTML source; it does not run the demo on this page. The demo is an offline simulation with fictional data and makes no network requests.

## See it

### Try the working offline example

Screenshot of this project’s interactive demo. Side-by-side services are explicitly simulated.

![Plant Manager — numbered controls](docs/images/guide-1.jpg)

1. **Set a care interval.** The example schedules from completion, not from an ignored overdue date.
2. **Record completed care.** Only mark done after the care was performed.
3. **See the reminder outcome.** Completed care moves the next occurrence forward; no real notification is sent.

## What this tool does

| Feature | What it lets you do | Where |
| --- | --- | --- |
| Plant records | Organise names, photos, locations and notes in the underlying plant application. | Hosted care workflow |
| Separate care tasks | Track watering, fertilising and other tasks with their own dates/recurrence. | Hosted care workflow |
| Completion-based recurrence | The custom worker schedules the next occurrence after processing completion. | Hosted care workflow |
| Reminders | Send due/overdue summaries through a configured HA mobile notification target. | Hosted care workflow |
| Map and bottles | Use the hosted plant-map extension alongside care records. | Hosted care workflow |
| Photo identification | Optional connected Pl@ntNet recognition sends the selected photo to that service. | Hosted care workflow |

## A first useful workflow

### Start a plant record

1. Choose Add Plant and enter a useful name and location. Add a clear photo and notes that help distinguish it from similar plants.
2. Keep identification uncertainty explicit. A probable identification should not silently become a confirmed species.
3. Use Search or Locations to return to the plant; the map is a placement aid rather than a replacement for its care record.

## Saving and outputs

The database, uploads, task state and reminder state live on the NAS. Back up the database consistently together with photos and configuration. The Git repository contains custom source, not the live collection or service keys.

## Running the actual tool

Use the existing authenticated plant application; the source deployment notes cover the required services.

The demo has no prerequisites; the real tool may need the services described in the manual and retained source notes.

## Current boundaries

HortusFox and its dependencies retain their upstream licences. This package requires the underlying plant application, database, gateway and configured reminder worker. The demo simulates a care queue without sending notifications.

## Licence and sharing

MIT applies to original project contributions. Bundled/upstream software and assets retain their own terms; see [third-party notes](THIRD-PARTY.md). Keep this repository private until its own [release checklist](RELEASE-CHECKLIST.md) is complete and the owner authorises publication.
