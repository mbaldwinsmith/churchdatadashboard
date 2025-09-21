# Church Attendance Dashboard

Interactive static dashboard for church attendance data.

## Getting started

1. Generate (or refresh) the placeholder dataset:

   ```bash
   node scripts/generateAttendanceData.js
   ```

   This produces both `data/attendance.json` and `data/attendance.csv`.

2. Launch any static file server (for example `python -m http.server`) and open
   [`index.html`](./index.html) in your browser to explore the dashboard.

### Features

- Filter controls for year, site, service and metric (attendance vs. kids
  check-ins).
- Summary cards that highlight totals, weekly averages, peaks and the leading
  grouping.
- Line, bar and pie charts that respond to the selected filters.
- Recent weeks table showing the latest 50 matching records for quick review.
