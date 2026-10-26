# conv2pdf for Zapier

The Zapier integration of the [conv2pdf API](https://conv2pdf.com/en/api/): it converts documents, images, iPhone photos, e-books, PostScript and HTML files and web pages to PDF, and merges, splits, rotates, numbers, watermarks, compresses, protects, unlocks and converts PDFs, hosted in the EU (France).

It is published on Zapier: [conv2pdf integrations](https://zapier.com/apps/conv2pdf/integrations). AI assistants can also call its actions through Zapier MCP.

## Actions

| Action | conv2pdf tool | Input |
| --- | --- | --- |
| Convert Office Document to PDF | `office-to-pdf` | a Word, Excel, PowerPoint, OpenDocument or Apple Pages file |
| Convert Image to PDF | `image-to-pdf` | a PNG, JPG, WebP, GIF or TIFF image |
| Convert HEIC to PDF | `heic-to-pdf` | a HEIC or HEIF photo |
| Convert HEIC to JPG | `heic-to-jpg` | a HEIC or HEIF photo |
| Convert EPUB to PDF | `epub-to-pdf` | an EPUB e-book without DRM |
| Convert PostScript to PDF | `ps-to-pdf` | a PostScript or EPS file |
| Convert HTML File to PDF | `html-to-pdf` | an HTML file |
| Convert Web Page to PDF | `url-to-pdf` | the address of a public web page, no file |
| Merge PDFs | `merge-pdf` | two or more PDFs, in order |
| Extract Pages From PDF | `extract-pages` | a PDF and the pages to keep, such as `1-5,7`, in the order written |
| Split PDF | `split-pdf` | a PDF; returns a ZIP with one PDF per page |
| Rotate PDF | `rotate-pdf` | a PDF and a clockwise rotation (90, 180, 270) |
| Add Page Numbers to PDF | `page-numbers-pdf` | a PDF, a position and a format (`3 / 12` or `3`) |
| Add Watermark to PDF | `watermark-pdf` | a PDF and a text of up to 50 characters |
| Compress PDF | `compress-pdf` | a PDF and an image quality (low, medium, high) |
| Protect PDF With Password | `protect-pdf` | a PDF, a password and optional print and copy restrictions |
| Unlock PDF | `unlock-pdf` | a PDF and its current password, if it opens with one |
| Convert PDF to Word | `pdf-to-word` | a PDF that contains text |
| Convert PDF to Images | `pdf-to-image` | a PDF and an image format (PNG, JPG); returns a ZIP |

Each action downloads the mapped file, sends it to `POST https://api.conv2pdf.com/v1/convert/{tool}`, downloads the result, stores it as a Zapier file for the next steps and deletes the job from conv2pdf. Convert Web Page to PDF sends the address instead of a file: conv2pdf opens the page itself, without signing in. It returns the file, its name and size, and the quota used by the API key.

The connection asks for a conv2pdf API key, created in the Developer tab of the [conv2pdf dashboard](https://conv2pdf.com/en/dashboard/#developer). It is tested against `GET /v1/quota`, which uses no conversion. The key is only sent to `api.conv2pdf.com`, never to the hosts the files come from.

## How it behaves

- A revoked key turns the Zap off and asks the user to reconnect. A used-up quota or expired trial fails the run with a link to the plans.
- The API accepts 20 conversions per minute per key and answers `503 server_busy` when its queue is full: Zapier retries both after the `Retry-After` delay. conv2pdf also uses 429 for a used-up quota, so Zapier's automatic retry of 429 responses is turned off for the API and each code is handled on its own.
- A file that the action cannot convert (wrong type, empty, protected, scanned PDF to Word, too large for the plan) or a field it cannot use (pages out of range, password too short) stops the run without turning the Zap off. When the file belongs to another action, such as an e-book sent to Convert Office Document to PDF, the message names that action.
- Compress PDF, Convert PDF to Word, Convert PDF to Images, Extract Pages From PDF, Split PDF, Rotate PDF, Add Watermark to PDF and Add Page Numbers to PDF take the password of a PDF that asks for one to open, in the optional PDF password field. The result has no password. Merge PDFs has no such field: unlock a protected PDF first with Unlock PDF.
- A Pages file must keep its `.pages` name, since only the name tells a Pages document from a Numbers spreadsheet. A file without a name gets the extension of its type. Numbers and Keynote files are not converted.
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
