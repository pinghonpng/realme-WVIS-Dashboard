# realme WVIS Sales Dashboard

A browser-based sales dashboard for realme WVIS.

## Data sources

The dashboard supports two primary sales uploads using the same column format:

1. **Fixed Monthly Data** — completed historical sales through the previous month.
2. **Current Month Running Sales** — the latest current-month running sales file.

Accepted file types: `.xlsx`, `.xls`, `.csv`.

The two files are validated against each other. Their column names and order must match. Once valid, the dashboard combines the rows automatically. Uploading a newer current-month file **replaces** the older current-month upload, preventing accidental duplication.

Uploads are stored in the browser using IndexedDB, so they survive page refreshes on the same browser/device. Removing a file from Data Sources clears that stored copy.

## Google Sheet fallback

Configured workbook:
`https://docs.google.com/spreadsheets/d/1M770AM2aK4r2ZxxZtUOGKCSmXwrFbF56H_Qw9EDNT4s/edit?gid=2037206838#gid=2037206838`

Configured sales tab:
`SMARTPHONE COMBINED (AUTO)`

If no browser-uploaded files are present, the dashboard attempts to read this Google Sheet. The workbook/tab must be accessible to the browser for direct CSV access.

## Priority order

1. Uploaded Fixed + Current sales data (or either upload if only one is available)
2. Google Sheet `SMARTPHONE COMBINED (AUTO)`
3. Demo data if the Google Sheet cannot be read

## Running locally

Because browser security can restrict file access when opening HTML directly, serve the folder with a simple local web server. For example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

For deployment, upload the folder to a static host such as Vercel, Netlify, GitHub Pages, or your own web server.
