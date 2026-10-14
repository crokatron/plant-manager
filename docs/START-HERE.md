# Plant Manager: start here

**Continuing this tool? Read [the detailed handover](HANDOVER.md).** For pictures and operation, use the [manual](USER-MANUAL.md) and [offline demo](../demo.html).

Custom HortusFox integration, plant mapping, task recurrence and HA reminders. Care completion and recurrence state belong to the plant service, not the visual demo.

**Start with:** Start a plant record. Choose Add Plant and enter a useful name and location. Add a clear photo and notes that help distinguish it from similar plants.

**Source:** this is a private source checkpoint, not a live-system mirror. Check [the source manifest](../SOURCE-MANIFEST.json) and current working files before merging.

**Keep your work safe:** The database, uploads, task state and reminder state live on the NAS. Back up the database consistently together with photos and configuration. The Git repository contains custom source, not the live collection or service keys.

**Next maintainer action:** Verify recurrence-from-completion, quiet hours, notification deduplication and a consistent database/photo restore. Reminder --test sends a real notification and is not a documentation check. Confirm current service/mount state rather than assuming the October 4 installation notes remain live.

**Status:** private upload verified on 14 October 2026. These guides accompany the source package. Live runtime, data backups and full recovery were not retested. Public sharing was authorised on 14 October 2026; the NAS backup remains private.
