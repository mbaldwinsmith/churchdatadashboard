# Church Attendance Dashboard

Interactive static dashboard for church attendance data.

## Getting started

1. (Optional) Generate or refresh the placeholder dataset:

   ```bash
   node scripts/generateAttendanceData.js
   ```
   
   This produces both `data/attendance.json` and `data/attendance.csv` which the
   dashboard loads by default.

2. Launch any static file server (for example `python -m http.server`) and open
   [`index.html`](./index.html) in your browser to explore the dashboard.

### Features

- Filter controls for year, site, service and metric (attendance vs. kids
  check-ins).
- Summary cards that highlight totals, weekly averages, peaks and the leading
  grouping.
- Line, bar and pie charts stacked vertically that respond to the selected
  filters.
- Recent weeks table showing the latest 50 matching records for quick review.
- CSV uploader that lets you swap in your own dataset without leaving the page.

### Uploading your own data

Use the **Upload CSV dataset** control near the top of the dashboard to replace
the placeholder data. The file must:

- Include a header row with `Week, Date, Year, Month, Site, Service, Attendance,
  Kids Checked-in` columns.
- Store dates in `YYYY-MM-DD` format so the dashboard can parse them reliably.
- Keep `Year` and `Month` as text values (for example `2024`, `September`).
- Provide whole numbers for `Attendance` and `Kids Checked-in`.
- Contain one row per site/service/Sunday combination.

The dashboard validates the file and immediately refreshes the summaries,
charts, and table. A sample CSV is available via the **Download sample CSV**
link next to the uploader.
