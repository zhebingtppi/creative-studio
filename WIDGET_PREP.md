# Apple Widget / Live Activity preparation

The web app now exposes `window.CS_APP.getWidgetSnapshot()` for the data shape we want to mirror in a future native iOS shell.

Snapshot fields:
- `nextTask`: project, client, deliverable, task, why, due, priority, running
- `todayCompleted`
- `activeProjects`
- `focus`: elapsedSeconds, project, task

For the real iOS WidgetKit / Live Activity build, the native target can read the same Supabase `app_state` row and map it to this shape. A native iOS target is still required; a PWA alone cannot install a WidgetKit home-screen widget.
