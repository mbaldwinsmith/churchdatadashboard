# Church Attendance Dashboard

Interactive static dashboard for church attendance data. It is designed to be
served as a set of static files, making it easy to host on Netlify, GitHub
Pages, or any plain file server while keeping the authoring and development
workflow lightweight.

## Technologies used

- **HTML5** for the semantic structure and accessible layout of the dashboard.
- **CSS3** (plain, framework-free) for styling, theming, and responsive design.
- **JavaScript ES modules** to orchestrate state management, filtering logic,
  and interactive behaviors without a build step.
- **Chart.js** (loaded from a CDN) to render the line, bar, and pie charts.
- **Node.js scripts** for generating sample datasets and validating CSV inputs
  during development.

## Getting started

1. (Optional) Generate or refresh the placeholder dataset:

   ```bash
   node scripts/generateAttendanceData.js
   ```
   
   This produces both `data/attendance.json` and `data/attendance.csv` which the
   dashboard loads by default.

2. Launch any static file server (for example `python -m http.server 8000`) and
   open [`index.html`](./index.html) in your browser to explore the dashboard.

   ```bash
   python -m http.server 8000
   # visit http://localhost:8000/index.html
   ```

3. (Recommended) Keep the dataset utilities in sync when iterating:

   ```bash
   # Validate CSV handling helpers
   node scripts/testCsvSecurity.mjs

   # Regenerate sample data after edits to scripts/generateAttendanceData.js
   node scripts/generateAttendanceData.js
   ```

### Features

- Filter controls for year, site, service and metric (attendance vs. kids
  check-ins).
- Summary cards that highlight totals, weekly averages, peaks and the leading
  grouping.
- Line, bar and pie charts stacked vertically that respond to the selected
  filters.
- Recent weeks table showing the latest 50 matching records for quick review.
- CSV uploader that lets you swap in your own dataset without leaving the page.

### Project structure

```
.
├── assets/               # Frontend JavaScript, styles, and shared modules
├── data/                 # Placeholder dataset served by default
├── scripts/              # Node utilities for data generation and validation
└── index.html            # Entry point that wires everything together
```

The dashboard is built with plain ES modules loaded directly from
`index.html`, so no bundler or framework build step is required. When adding
new functionality, prefer extending the existing modules to keep the footprint
small and the mental model simple.

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

### CSV column reference

| Column            | Example        | Notes                                                  |
| ----------------- | -------------- | ------------------------------------------------------ |
| `Week`            | `2024-W18`     | ISO week label used in charts and summaries.           |
| `Date`            | `2024-05-05`   | Sunday date in `YYYY-MM-DD` format.                    |
| `Year`            | `2024`         | Stored as text to simplify grouping and filtering.     |
| `Month`           | `May`          | Full month name; display copy shown in filters.        |
| `Site`            | `Downtown`     | Campus or location name.                               |
| `Service`         | `9:30 AM`      | Service identifier.                                    |
| `Attendance`      | `425`          | Whole number; used for trend visualizations.           |
| `Kids Checked-in` | `118`          | Whole number; optional but recommended for insights.   |

If you omit optional columns, keep the headers present and leave the cell
blank so the parser can safely coerce the value to `null`.

### Customising the experience

- Update `assets/styles.css` to tweak colors, typography, or layout. The file
  starts with design tokens that make it easy to align the dashboard with your
  brand.
- Add new charts or summaries by extending `assets/main.js`. Hook into the
  shared `state` object and `updateDashboard` pipeline to ensure everything
  stays in sync.
- Replace the default copy and headings directly in `index.html`. Semantic
  markup and ARIA attributes are already in place—mirror the existing patterns
  when adding new sections.

### Troubleshooting

- If the dashboard fails to load a CSV, check the browser console for detailed
  validation errors produced by the CSV security helpers.
- When hosting on a static provider, ensure `data/attendance.json` and
  `data/attendance.csv` are deployed alongside the HTML/JS files so the initial
  load succeeds.
- If Chart.js assets fail to load, confirm the device can reach the CDN URL
  referenced in `index.html`.
