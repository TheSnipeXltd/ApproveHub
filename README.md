# ApproveHub (Static Demo)

Static, hash-routed demo app hosted on GitHub Pages. No backend. Data persists in `localStorage`.

## GitHub Pages setup
1. Repo: Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` / folder: `/ (root)`
4. Your base URL will be:
   `https://YOUR_GITHUB_USERNAME.github.io/ApproveHub/`

Replace `YOUR_GITHUB_USERNAME` in:
- `sitemap.xml`
- `robots.txt`

## Routing
- Hash routing only (e.g. `#/jobs`)
- Do not use `/jobs` routes.
- `404.html` redirects back to `#/jobs` to avoid blank refreshes.

## Local data
All demo data is stored in your browser’s `localStorage`.
- Use the in-app Settings → Reset demo to wipe and reseed (demo behavior).
- Export/Import demo JSON available in Settings (demo behavior).

## PDFs
Invoice Summary “Download” uses `html2pdf.js` in the browser.
- PDFs are not stored as files in GitHub Pages.
- In Messages, attachments store metadata snapshots.
- Use “Regenerate PDF” to recreate the PDF from snapshot data.

## Compliance
- VAT disclaimer shown on VAT-related views:
  “VAT depends on the project and each supplier’s VAT status. Savings vary. We charge VAT on our management fee where applicable. Not tax advice.”
- Footer and all Payments screens include:
  “We do not hold client funds. Funds are held and released by our escrow/PBA partner.”
