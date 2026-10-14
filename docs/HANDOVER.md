# Plant Manager: maintainer handover

[One-screen summary](START-HERE.md) · [User manual](USER-MANUAL.md) · [Feature overview](../README.md) · [Recorded validation](../VALIDATION.md)

## Purpose and behaviour to preserve

Keep plant records and care tasks together, with a map/placement extension and Home Assistant reminders. The underlying plant-record application is HortusFox; this repository contains the custom integration and deployment work around it, not a claim of authorship over HortusFox.

- **Plant records:** Organise names, photos, locations and notes in the underlying plant application. (Hosted care workflow.)
- **Separate care tasks:** Track watering, fertilising and other tasks with their own dates/recurrence. (Hosted care workflow.)
- **Completion-based recurrence:** The custom worker schedules the next occurrence after processing completion. (Hosted care workflow.)
- **Reminders:** Send due/overdue summaries through a configured HA mobile notification target. (Hosted care workflow.)
- **Map and bottles:** Use the hosted plant-map extension alongside care records. (Hosted care workflow.)
- **Photo identification:** Optional connected Pl@ntNet recognition sends the selected photo to that service. (Hosted care workflow.)

The [demo](../demo.html) is a smaller, labelled simulation with fictional data. It explains cause and effect without the real service; it is not evidence of a working production installation. Numbered screenshots in the user manual distinguish actual-app captures from demo captures.

## Files and sources of truth

| Actual package path | Maintainer role |
| --- | --- |
| [projects-host/plant-manager/README.md](../projects-host/plant-manager/README.md) | Services, storage and historical operations |
| [projects-host/plant-manager/reminders.py](../projects-host/plant-manager/reminders.py) | Reminder scheduling and deduplication |
| [projects-host/plant-manager/map](../projects-host/plant-manager/map) | Plant map and HA integration |
| [projects-host/host/plant_tags.py](../projects-host/host/plant_tags.py) | Projects-side plant tag adapter |
| [demo-source](../demo-source) | Editable demo HTML/CSS/runtime and embedded screenshot tour |
| [SOURCE-MANIFEST.json](../SOURCE-MANIFEST.json) | Original copied-source paths and SHA-256 checkpoint values |

The original working source is under C:/Users/lamon/Desktop/AI TOOLS/NAS for NAS modules; adjacent CAD/watch source locations are recorded by the full backup’s reviewed source manifest. This package contains only the explicitly copied source, not an automatic mirror. The main private nas-projects backup retains the broader shared host context.

## Setup, run and tests

Run commands from this repository root unless a `cd` is shown. Use a disposable checkout and fictional data for first setup. Dependencies, SDKs, signing material and personal data are not bundled. The following are continuation instructions grounded in the retained source, **not commands executed or newly certified by this handover**.

Requires HortusFox, MariaDB, authenticated gateway and configured reminder workers. Read the retained service guide before installation; install.sh must not run over existing data.

Selected project check:

```powershell
cd projects-host/plant-manager
python -B -m unittest test_reminders
```

For the documentation demo alone, serve this repository on loopback with `python -m http.server 8765 --bind 127.0.0.1` and open `/demo.html`. Choose a free port if another preview is running. JavaScript syntax can be checked with `node --check demo-source/runtime.js`. `python demo-source/rebuild.py` rewrites demo.html, so run it only in a disposable checkout or an authorised demo-editing session. A local server cannot provide missing HA/CAD/NAS functions. Inspect browser tests for installed dependencies, fixture requirements and network targets before running them with the approved browser tooling.

## Data, configuration and backup boundaries

Documented NAS root: /mnt/cache_nvme/appdata/mungoon-plants, with database/, app/, private/ and reminders/. Back up MariaDB consistently with photos/configuration and reminder state. Pl@ntNet keys stay in protected application configuration; identification sends chosen photographs to that service.

The database, uploads, task state and reminder state live on the NAS. Back up the database consistently together with photos and configuration. The Git repository contains custom source, not the live collection or service keys.

Git preserves reviewed source and documentation. It does not copy browser storage, application databases, uploaded models/photos, accepted device settings, SDKs or credentials. Maintain independent recovery copies of the data identified above, including matching configuration and asset versions. Never add real secrets to examples, issues or logs. Private source copies on GitHub are not proof of a complete NAS/offsite data backup.

## Current verification and Git state

Before these documentation edits on 14 October 2026, this package was clean on branch `main` at `5bd7df767ab05e2a42a716d8bbf4b21219e2417d` and its private upload was verified. All 35 manifest-listed source entries matched their stored checksums before editing. The upload follow-up has completed all 17 repositories and is paused; it does not run this tool or back up its live data.

These handover pages and README links accompany the source package. Preserve them when continuing; stage only reviewed changes. Recheck current `git status --short --branch` and `git diff` before starting. No project-specific background schedule was inspected or changed in this documentation pass. Any service schedules in older notes are historical claims to verify in the actual deployment.

Earlier package checks and limits are recorded in [VALIDATION.md](../VALIDATION.md). This handover adds documentation/link/whitespace/secret and source-preservation checks only. No current NAS release, real hardware state, fresh installation, complete data restoration or offsite-backup freshness was verified here.

## Recovery approach

1. Preserve the current installation/data before changing it. Identify the exact code commit and data snapshot required; do not assume this package matches the running service.
2. Recover source into a new folder. Verify the source manifest and restore the project-specific configuration/assets described above separately. Recreate dependencies from the retained project files and guides.
3. Restore user data into an isolated instance or clean test browser. Check a representative editable record, associated files and save/reload behaviour, then compare to the original. Do not test recovery by overwriting production.
4. Record what actually restored and what remains missing. A demo opening or a passing syntax check is not a production recovery drill. Real deployment/device actions need the existing authorised workflow.

## Known limits and next work

HortusFox and its dependencies retain their upstream licences. This package requires the underlying plant application, database, gateway and configured reminder worker. The demo simulates a care queue without sending notifications.

**Priority:** Verify recurrence-from-completion, quiet hours, notification deduplication and a consistent database/photo restore. Reminder --test sends a real notification and is not a documentation check. Confirm current service/mount state rather than assuming the October 4 installation notes remain live.

Common symptoms to check for this tool:

- No notification: check due tasks, configured quiet hours, notification target and worker errors.
- Task repeats unexpectedly: check for a second recurrence mechanism.
- Photo recognition unavailable: check service configuration/quota without exposing the key.

Keep [the release checklist](../RELEASE-CHECKLIST.md) and [third-party notes](../THIRD-PARTY.md) with the package. Original contributions use MIT; bundled/upstream code and assets keep their own licences. Public publication is a separate decision; preparing documentation is not permission to publish.
