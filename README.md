# conv2pdf for Zapier

The Zapier integration of the [conv2pdf API](https://conv2pdf.com/en/api/): it converts Word, Excel and PowerPoint files to PDF, merges and compresses PDFs, and converts PDFs to Word, on servers in France.

## Actions

| Action | conv2pdf tool | Input |
| --- | --- | --- |
| Convert Office Document to PDF | `office-to-pdf` | a Word, Excel, PowerPoint or OpenDocument file |
| Merge PDFs | `merge-pdf` | two or more PDFs, in order |
| Compress PDF | `compress-pdf` | a PDF and an image quality (low, medium, high) |
| Convert PDF to Word | `pdf-to-word` | a PDF that contains text |

Each action downloads the mapped file, sends it to `POST https://api.conv2pdf.com/v1/convert/{tool}`, downloads the result, stores it as a Zapier file for the next steps and deletes the job from conv2pdf. It returns the file, its name and size, and the quota used by the API key.

The connection asks for a conv2pdf API key, created in the Developer tab of the [conv2pdf dashboard](https://conv2pdf.com/en/dashboard/#developer). It is tested against `GET /v1/quota`, which uses no conversion. The key is only sent to `api.conv2pdf.com`, never to the hosts the files come from.

## How it behaves

- A revoked key turns the Zap off and asks the user to reconnect. A used-up quota or expired trial fails the run with a link to the plans.
- The API accepts 20 conversions per minute per key and answers `503 server_busy` when its queue is full: Zapier retries both after the `Retry-After` delay. conv2pdf also uses 429 for a used-up quota, so Zapier's automatic retry of 429 responses is turned off for the API and each code is handled on its own.
- A file that the action cannot convert (wrong type, empty, protected, scanned PDF to Word, too large for the plan) stops the run without turning the Zap off.
- Zapier gives a step 30 seconds. Downloading, converting and storing the file share 27 of them; past that, the run stops with an explanation.

## Development

```bash
npm install
npm test
npx zapier-platform validate
npx zapier-platform push
```

The integration runs on Node.js 22 in Zapier. `branding/logo-512.png` is the logo uploaded in the Zapier Platform UI.

## License

MIT
