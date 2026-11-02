const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const files = require('../lib/files');
const { USER_AGENT } = require('../middleware');

const appTester = zapier.createAppTester(App);
const API = 'https://api.conv2pdf.com';
const SOURCE = 'https://files.example.com';
const KEY = 'cpdf_live_test_key';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const bundleFor = (inputData, meta = {}) => ({ authData: { apiKey: KEY }, inputData, meta });
const perform = (key) => App.creates[key].operation.perform;

// The source host must never see the Conv2pdf key.
const source = () => nock(SOURCE, { badheaders: ['authorization'] });
const api = () =>
  nock(API, { reqheaders: { authorization: `Bearer ${KEY}`, 'user-agent': (ua) => ua.includes(USER_AGENT) } });

function mockDownloadAndDelete(jobId, body, fileName, type) {
  api()
    .get(`/v1/download/${jobId}`)
    .reply(200, body, { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${fileName}"` });
  api().delete(`/v1/job/${jobId}`).reply(204);
}

let stash;
beforeAll(() => nock.disableNetConnect());
beforeEach(() => {
  stash = jest.spyOn(files, 'stash').mockImplementation(async (z, buffer, fileName) => `https://stash.example/${fileName}`);
});
afterEach(() => {
  nock.abortPendingRequests();
  nock.cleanAll();
  jest.restoreAllMocks();
  delete process.env.CONV2PDF_BUDGET_MS;
});
afterAll(() => nock.enableNetConnect());

describe('Convert Office Document to PDF', () => {
  it('uploads the document, stores the PDF in Zapier and deletes the job', async () => {
    source()
      .get('/docs/demo')
      .reply(200, 'DOCX-BYTES', { 'Content-Type': DOCX, 'Content-Disposition': 'attachment; filename="demo.docx"' });
    api()
      .post('/v1/convert/office-to-pdf', (body) => body.includes('filename="demo.docx"') && body.includes('DOCX-BYTES'))
      .reply(200, { job_id: 'job1', status: 'success', size_bytes: 13, quota: { used: 8, quota: 300 } });
    mockDownloadAndDelete('job1', '%PDF-1.7 fake', 'demo.pdf', 'application/pdf');

    const result = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/docs/demo` }));

    expect(result).toEqual({
      file: 'https://stash.example/demo.pdf',
      file_name: 'demo.pdf',
      size_bytes: 13,
      quota_used: 8,
      quota: 300,
    });
    const [, buffer, fileName, type] = stash.mock.calls[0];
    expect(buffer.toString()).toBe('%PDF-1.7 fake');
    expect([fileName, type]).toEqual(['demo.pdf', 'application/pdf']);
    expect(nock.isDone()).toBe(true);
  });

  it('gives a file without a name the extension of its type', async () => {
    source().get('/x/report').reply(200, 'DOCX-BYTES', { 'Content-Type': DOCX });
    api()
      .post('/v1/convert/office-to-pdf', (body) => body.includes('filename="report.docx"'))
      .reply(200, { job_id: 'job2', status: 'success' });
    mockDownloadAndDelete('job2', '%PDF', 'report.pdf', 'application/pdf');

    const result = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/x/report` }));

    expect(result.file_name).toBe('report.pdf');
    expect(result.quota_used).toBeNull();
  });

  it('keeps the run going when the job cannot be deleted', async () => {
    source().get('/a.docx').reply(200, 'DOCX-BYTES', { 'Content-Type': DOCX });
    api().post('/v1/convert/office-to-pdf').reply(200, { job_id: 'job3', status: 'success' });
    api().get('/v1/download/job3').reply(200, '%PDF', { 'Content-Type': 'application/pdf' });
    api().delete('/v1/job/job3').reply(500, { error: 'internal_error' });

    const result = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/a.docx` }));

    expect(result.file_name).toBe('conv2pdf-job3');
  });

  it('stops the run when the source file cannot be downloaded', async () => {
    source().get('/missing.docx').reply(404, 'Not found');

    const error = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/missing.docx` })).catch((e) => e);

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/files\.example\.com \(HTTP 404\)/);
  });
});

describe('Conv2pdf errors', () => {
  const convertWith = (status, body, headers) => {
    source().get('/a.docx').reply(200, 'DOCX-BYTES', { 'Content-Type': DOCX });
    api().post('/v1/convert/office-to-pdf').reply(status, body, headers);
    return appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/a.docx` })).catch((e) => e);
  };

  it('fails, without retrying, when the quota is used up', async () => {
    const error = await convertWith(429, { error: 'quota_exceeded' });

    expect(error.name).toBe('AppError');
    expect(error.message).toMatch(/quota of this API key is used up/);
  });

  it('retries after Retry-After when the key is rate-limited', async () => {
    const error = await convertWith(429, { error: 'rate_limited', retry_after: 12 }, { 'Retry-After': '12' });

    expect(error.name).toBe('ThrottledError');
    expect(JSON.parse(error.message).delay).toBe(12);
  });

  it('retries when the conversion queue is full', async () => {
    const error = await convertWith(503, { error: 'server_busy' }, { 'Retry-After': '5' });

    expect(error.name).toBe('ThrottledError');
    expect(JSON.parse(error.message).delay).toBe(5);
  });

  it('stops only this run on a file that does not match the action', async () => {
    const error = await convertWith(415, { error: 'unsupported_content' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/does not match this action/);
  });

  it('asks the user to reconnect when the key is revoked', async () => {
    const error = await convertWith(401, { error: 'invalid_api_key' });

    expect(error.name).toBe('ExpiredAuthError');
    expect(error.message).toMatch(/Developer tab/);
  });

  it('reports a result that expired before the download', async () => {
    source().get('/a.docx').reply(200, 'DOCX-BYTES', { 'Content-Type': DOCX });
    api().post('/v1/convert/office-to-pdf').reply(200, { job_id: 'job4', status: 'success' });
    api().get('/v1/download/job4').reply(410, { error: 'file_expired' });

    const error = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/a.docx` })).catch((e) => e);

    expect(error.name).toBe('AppError');
    expect(error.message).toMatch(/no longer available/);
  });

  it("halts the run before Zapier's 30-second limit cuts it", async () => {
    process.env.CONV2PDF_BUDGET_MS = '300';
    source().get('/a.docx').reply(200, 'DOCX-BYTES', { 'Content-Type': DOCX });
    api().post('/v1/convert/office-to-pdf').delay(2000).reply(200, { job_id: 'job5', status: 'success' });

    const error = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/a.docx` })).catch((e) => e);

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/30-second limit/);
  });
});

describe('Merge PDFs', () => {
  it('sends every file, in order, to merge-pdf', async () => {
    source().get('/one.pdf').reply(200, 'PDF-ONE', { 'Content-Type': 'application/pdf' });
    source().get('/two.pdf').reply(200, 'PDF-TWO', { 'Content-Type': 'application/pdf' });
    api()
      .post('/v1/convert/merge-pdf', (body) => body.indexOf('filename="one.pdf"') < body.indexOf('filename="two.pdf"'))
      .reply(200, { job_id: 'job6', status: 'success' });
    mockDownloadAndDelete('job6', '%PDF merged', 'merged.pdf', 'application/pdf');

    const result = await appTester(perform('merge_pdfs'), bundleFor({ files: [`${SOURCE}/one.pdf`, `${SOURCE}/two.pdf`] }));

    expect(result.file_name).toBe('merged.pdf');
  });

  it('refuses a single file before calling conv2pdf', async () => {
    const error = await appTester(perform('merge_pdfs'), bundleFor({ files: `${SOURCE}/one.pdf` })).catch((e) => e);

    expect(error.name).toBe('HaltedError');
  });
});

describe('Compress PDF', () => {
  it('sends the chosen image quality', async () => {
    source().get('/big.pdf').reply(200, 'PDF-BIG', { 'Content-Type': 'application/pdf' });
    api()
      .post('/v1/convert/compress-pdf', (body) => /name="quality"\r\n\r\nhigh\r\n/.test(body))
      .reply(200, { job_id: 'job7', status: 'success' });
    mockDownloadAndDelete('job7', '%PDF small', 'big.pdf', 'application/pdf');

    const result = await appTester(perform('compress_pdf'), bundleFor({ file: `${SOURCE}/big.pdf`, quality: 'high' }));

    expect(result.file_name).toBe('big.pdf');
  });
});

describe('Convert PDF to Word', () => {
  it('returns the Word document', async () => {
    source().get('/letter.pdf').reply(200, 'PDF-LETTER', { 'Content-Type': 'application/pdf' });
    api().post('/v1/convert/pdf-to-word').reply(200, { job_id: 'job8', status: 'success' });
    mockDownloadAndDelete('job8', 'DOCX-OUT', 'letter.docx', DOCX);

    const result = await appTester(perform('convert_pdf_to_word'), bundleFor({ file: `${SOURCE}/letter.pdf` }));

    expect(result.file_name).toBe('letter.docx');
  });
});

// Runs an action on a PDF and returns the multipart body Conv2pdf received.
async function sentBy(key, tool, inputData, download = ['%PDF out', 'in.pdf', 'application/pdf']) {
  let sent;
  source().get('/in.pdf').reply(200, 'PDF-IN', { 'Content-Type': 'application/pdf' });
  api()
    .post(`/v1/convert/${tool}`, (body) => {
      sent = body;
      return true;
    })
    .reply(200, { job_id: 'jobF', status: 'success' });
  mockDownloadAndDelete('jobF', ...download);
  const result = await appTester(perform(key), bundleFor({ file: `${SOURCE}/in.pdf`, ...inputData }));
  return { sent, result };
}

// A text field of a multipart body, or undefined when it was not sent.
const fieldOf = (body, name) => {
  const match = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(body);
  return match ? match[1] : undefined;
};

// Runs an action on a PDF that Conv2pdf refuses.
function refusedBy(key, tool, status, body, inputData = {}) {
  source().get('/in.pdf').reply(200, 'PDF-IN', { 'Content-Type': 'application/pdf' });
  api().post(`/v1/convert/${tool}`).reply(status, body);
  return appTester(perform(key), bundleFor({ file: `${SOURCE}/in.pdf`, ...inputData })).catch((e) => e);
}

describe('Apple Pages documents', () => {
  it('names a Pages file after its type, since only the name tells Pages from Numbers', async () => {
    source().get('/x/memo').reply(200, 'PAGES-BYTES', { 'Content-Type': 'application/vnd.apple.pages' });
    api()
      .post('/v1/convert/office-to-pdf', (body) => body.includes('filename="memo.pages"'))
      .reply(200, { job_id: 'job9', status: 'success' });
    mockDownloadAndDelete('job9', '%PDF', 'memo.pdf', 'application/pdf');

    const result = await appTester(perform('convert_office_to_pdf'), bundleFor({ file: `${SOURCE}/x/memo` }));

    expect(result.file_name).toBe('memo.pdf');
  });

  it('explains that Numbers files are not converted', async () => {
    const error = await refusedBy('convert_office_to_pdf', 'office-to-pdf', 415, {
      error: 'unsupported_content',
      detected_type: 'iwork_numbers',
    });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/Numbers spreadsheet.*Export To > PDF/);
  });
});

describe('Convert Image to PDF', () => {
  it('sends an image without a name under the extension of its type', async () => {
    source().get('/img/photo').reply(200, 'PNG-BYTES', { 'Content-Type': 'image/png' });
    api()
      .post('/v1/convert/image-to-pdf', (body) => body.includes('filename="photo.png"'))
      .reply(200, { job_id: 'job10', status: 'success' });
    mockDownloadAndDelete('job10', '%PDF', 'photo.pdf', 'application/pdf');

    const result = await appTester(perform('convert_image_to_pdf'), bundleFor({ file: `${SOURCE}/img/photo` }));

    expect(result.file_name).toBe('photo.pdf');
  });
});

describe('HEIC photos', () => {
  it('returns the JPG of a HEIC photo', async () => {
    source().get('/IMG_0001.HEIC').reply(200, 'HEIC-BYTES', { 'Content-Type': 'image/heic' });
    api()
      .post('/v1/convert/heic-to-jpg', (body) => body.includes('filename="IMG_0001.HEIC"'))
      .reply(200, { job_id: 'job11', status: 'success' });
    mockDownloadAndDelete('job11', 'JPG-OUT', 'IMG_0001.jpg', 'image/jpeg');

    const result = await appTester(perform('convert_heic_to_jpg'), bundleFor({ file: `${SOURCE}/IMG_0001.HEIC` }));

    expect(result.file_name).toBe('IMG_0001.jpg');
    expect(stash.mock.calls[0][3]).toBe('image/jpeg');
  });

  it('converts a HEIC photo to PDF', async () => {
    source().get('/IMG_0002.heic').reply(200, 'HEIC-BYTES', { 'Content-Type': 'image/heic' });
    api().post('/v1/convert/heic-to-pdf').reply(200, { job_id: 'job12', status: 'success' });
    mockDownloadAndDelete('job12', '%PDF', 'IMG_0002.pdf', 'application/pdf');

    const result = await appTester(perform('convert_heic_to_pdf'), bundleFor({ file: `${SOURCE}/IMG_0002.heic` }));

    expect(result.file_name).toBe('IMG_0002.pdf');
  });
});

describe('Convert EPUB to PDF', () => {
  it('sends an e-book without a name under the .epub extension', async () => {
    source().get('/ebooks/1342').reply(200, 'EPUB-BYTES', { 'Content-Type': 'application/epub+zip' });
    api()
      .post('/v1/convert/epub-to-pdf', (body) => body.includes('filename="1342.epub"'))
      .reply(200, { job_id: 'job13', status: 'success' });
    mockDownloadAndDelete('job13', '%PDF', '1342.pdf', 'application/pdf');

    const result = await appTester(perform('convert_epub_to_pdf'), bundleFor({ file: `${SOURCE}/ebooks/1342` }));

    expect(result.file_name).toBe('1342.pdf');
  });

  it('explains an e-book whose pages would come out blank', async () => {
    const error = await refusedBy('convert_epub_to_pdf', 'epub-to-pdf', 422, { error: 'epub_blank_output' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/full-screen images/);
  });
});

describe('Convert PostScript to PDF', () => {
  it('sends a PostScript file without a name under the .ps extension', async () => {
    source().get('/print/job').reply(200, '%!PS', { 'Content-Type': 'application/postscript' });
    api()
      .post('/v1/convert/ps-to-pdf', (body) => body.includes('filename="job.ps"'))
      .reply(200, { job_id: 'jobP', status: 'success' });
    mockDownloadAndDelete('jobP', '%PDF', 'job.pdf', 'application/pdf');

    const result = await appTester(perform('convert_postscript_to_pdf'), bundleFor({ file: `${SOURCE}/print/job` }));

    expect(result.file_name).toBe('job.pdf');
  });

  it('explains a PostScript file that draws no page', async () => {
    const error = await refusedBy('convert_postscript_to_pdf', 'ps-to-pdf', 422, { error: 'ps_blank_output' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/draws no page/);
  });
});

describe('Convert HTML File to PDF', () => {
  it('sends an HTML file without a name under the .html extension', async () => {
    source().get('/export/invoice').reply(200, '<!doctype html>', { 'Content-Type': 'text/html; charset=utf-8' });
    api()
      .post('/v1/convert/html-to-pdf', (body) => body.includes('filename="invoice.html"'))
      .reply(200, { job_id: 'jobH', status: 'success' });
    mockDownloadAndDelete('jobH', '%PDF', 'invoice.pdf', 'application/pdf');

    const result = await appTester(perform('convert_html_to_pdf'), bundleFor({ file: `${SOURCE}/export/invoice` }));

    expect(result.file_name).toBe('invoice.pdf');
  });

  it('explains an HTML file that prints blank', async () => {
    const error = await refusedBy('convert_html_to_pdf', 'html-to-pdf', 422, { error: 'html_blank_output' });

    expect(error.message).toMatch(/prints as a blank page/);
  });
});

describe('Convert Web Page to PDF', () => {
  it('sends the address and no file', async () => {
    let sent;
    api()
      .post('/v1/convert/url-to-pdf', (body) => {
        sent = body;
        return true;
      })
      .reply(200, { job_id: 'jobU', status: 'success', quota: { used: 9, quota: 300 } });
    mockDownloadAndDelete('jobU', '%PDF', 'example-com.pdf', 'application/pdf');

    const result = await appTester(perform('convert_url_to_pdf'), bundleFor({ url: ' https://example.com/pricing ' }));

    expect(fieldOf(sent, 'url')).toBe('https://example.com/pricing');
    expect(sent).not.toMatch(/filename=/);
    expect(result).toMatchObject({ file_name: 'example-com.pdf', quota_used: 9 });
    expect(nock.isDone()).toBe(true);
  });

  it('stops before calling Conv2pdf when no address is given', async () => {
    const error = await appTester(perform('convert_url_to_pdf'), bundleFor({ url: '  ' })).catch((e) => e);

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/Web page address field is empty/);
  });

  it.each([
    [422, { error: 'invalid_url', cause: 'local_name' }, /^This web page address cannot be converted\. Conv2pdf only opens public web pages, not names of a local network\.\n/],
    [422, { error: 'invalid_url', cause: 'something_new' }, /^This web page address cannot be converted\.\n/],
    [422, { error: 'url_http_error', http_status: 404 }, /answered with an error \(HTTP 404\)/],
    [422, { error: 'url_unreachable' }, /could not be reached/],
    [422, { error: 'url_blank_page' }, /prints as a blank page/],
  ])('explains a refused address (%s %o)', async (status, body, expected) => {
    api().post('/v1/convert/url-to-pdf').reply(status, body);

    const error = await appTester(perform('convert_url_to_pdf'), bundleFor({ url: 'https://example.com/' })).catch((e) => e);

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(expected);
  });
});

describe('Split PDF', () => {
  it('returns the ZIP of the pages', async () => {
    const { sent, result } = await sentBy('split_pdf', 'split-pdf', {}, ['PK', 'in.zip', 'application/zip']);

    expect(sent).not.toMatch(/name="ranges"/);
    expect(result.file_name).toBe('in.zip');
    expect(stash.mock.calls[0][3]).toBe('application/zip');
  });

  it('explains a PDF of a single page', async () => {
    const error = await refusedBy('split_pdf', 'split-pdf', 422, { error: 'pdf_single_page' });

    expect(error.message).toMatch(/single page: there is nothing to split/);
  });
});

describe('Extract Pages from PDF', () => {
  it('sends the pages to keep', async () => {
    const { sent } = await sentBy('extract_pdf_pages', 'extract-pages', { ranges: ' 1-3,5 ' });

    expect(fieldOf(sent, 'ranges')).toBe('1-3,5');
  });

  it('stops before calling Conv2pdf when no page is given', async () => {
    const error = await appTester(perform('extract_pdf_pages'), bundleFor({ file: `${SOURCE}/in.pdf`, ranges: ' ' })).catch(
      (e) => e,
    );

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/Pages field is empty/);
  });

  it('names the page count of the PDF when the pages are out of range', async () => {
    const error = await refusedBy('extract_pdf_pages', 'extract-pages', 400, {
      error: 'invalid_page_range',
      range: '9',
      cause: 'beyond_last_page',
      total_pages: 4,
    }, { ranges: '9' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/^The pages "9" are not valid\. The PDF has 4 pages\.\n/);
  });

  it('says "page" for a PDF of one page', async () => {
    const error = await refusedBy('extract_pdf_pages', 'extract-pages', 400, {
      error: 'invalid_page_range',
      range: '2',
      cause: 'beyond_last_page',
      total_pages: 1,
    }, { ranges: '2' });

    expect(error.message).toMatch(/^The pages "2" are not valid\. The PDF has 1 page\.\n/);
  });

  it.each([
    ['page_zero', /Page numbers start at 1\./],
    ['whole_document', /the whole document, in its order/],
    ['syntax', /Use page numbers and ranges separated by commas/],
  ])('says why a range is refused (%s)', async (cause, expected) => {
    const error = await refusedBy('extract_pdf_pages', 'extract-pages', 400, { error: 'invalid_page_range', range: '0', cause }, {
      ranges: '0',
    });

    expect(error.message).toMatch(expected);
  });
});

describe('Rotate PDF', () => {
  it('sends the chosen rotation', async () => {
    const { sent } = await sentBy('rotate_pdf', 'rotate-pdf', { rotation: '180' });

    expect(fieldOf(sent, 'rotation')).toBe('180');
  });

  it('turns the pages by 90 degrees when no rotation is chosen', async () => {
    const { sent } = await sentBy('rotate_pdf', 'rotate-pdf', { rotation: '' });

    expect(fieldOf(sent, 'rotation')).toBe('90');
  });
});

describe('Add Page Numbers to PDF', () => {
  it('sends the position and the format', async () => {
    const { sent } = await sentBy('add_page_numbers', 'page-numbers-pdf', { position: 'bottom-right', format: 'simple' });

    expect([fieldOf(sent, 'position'), fieldOf(sent, 'format')]).toEqual(['bottom-right', 'simple']);
  });

  it('numbers at the bottom center with the page count by default', async () => {
    const { sent } = await sentBy('add_page_numbers', 'page-numbers-pdf', {});

    expect([fieldOf(sent, 'position'), fieldOf(sent, 'format')]).toEqual(['bottom-center', 'full']);
  });
});

describe('Add Watermark to PDF', () => {
  it('sends the watermark text', async () => {
    const { sent } = await sentBy('add_watermark', 'watermark-pdf', { text: 'CONFIDENTIAL' });

    expect(fieldOf(sent, 'text')).toBe('CONFIDENTIAL');
  });

  it('stops before calling Conv2pdf when the text is empty', async () => {
    const error = await appTester(perform('add_watermark'), bundleFor({ file: `${SOURCE}/in.pdf`, text: '  ' })).catch((e) => e);

    expect(error.name).toBe('HaltedError');
  });

  it('explains a text that Conv2pdf cannot print', async () => {
    const error = await refusedBy('add_watermark', 'watermark-pdf', 422, { error: 'unsupported_characters', field: 'text' }, {
      text: '機密',
    });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/Latin letters/);
  });
});

describe('Protect PDF with Password', () => {
  it('sends the password and only the restrictions that are on', async () => {
    const { sent } = await sentBy('protect_pdf', 'protect-pdf', {
      pdf_passphrase: 's3cret pass',
      prevent_print: true,
      prevent_copy: false,
    });

    expect(fieldOf(sent, 'password')).toBe('s3cret pass');
    expect(fieldOf(sent, 'prevent_print')).toBe('on');
    expect(fieldOf(sent, 'prevent_copy')).toBeUndefined();
  });

  it('reads mapped yes/no values', async () => {
    const { sent } = await sentBy('protect_pdf', 'protect-pdf', {
      pdf_passphrase: 's3cret pass',
      prevent_print: 'false',
      prevent_copy: 'yes',
    });

    expect(fieldOf(sent, 'prevent_print')).toBeUndefined();
    expect(fieldOf(sent, 'prevent_copy')).toBe('on');
  });

  it('explains a password that is too short', async () => {
    const error = await refusedBy('protect_pdf', 'protect-pdf', 400, { error: 'password_too_short', min: 6 }, {
      pdf_passphrase: 'abc',
    });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/^The password must have at least 6 characters\./);
  });
});

describe('Unlock PDF', () => {
  it('sends the password', async () => {
    const { sent } = await sentBy('unlock_pdf', 'unlock-pdf', { pdf_passphrase: 'open-me' });

    expect(fieldOf(sent, 'password')).toBe('open-me');
  });

  it('sends no password for a PDF that only restricts printing or copying', async () => {
    const { sent } = await sentBy('unlock_pdf', 'unlock-pdf', { pdf_passphrase: '' });

    expect(fieldOf(sent, 'password')).toBeUndefined();
  });

  it('asks for the password when the PDF needs one', async () => {
    const error = await refusedBy('unlock_pdf', 'unlock-pdf', 422, { error: 'needs_password' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/fill in the Password field/);
  });

  it('says when the password does not open the PDF', async () => {
    const error = await refusedBy('unlock_pdf', 'unlock-pdf', 422, { error: 'wrong_password' }, { pdf_passphrase: 'guess' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/does not guess it/);
  });

  it('explains a PDF that has nothing to unlock', async () => {
    const error = await refusedBy('unlock_pdf', 'unlock-pdf', 422, { error: 'pdf_not_protected' });

    expect(error.message).toMatch(/no password or restriction/);
  });
});

describe('Convert PDF to Images', () => {
  it('sends the image format and returns the ZIP of the pages', async () => {
    const { sent, result } = await sentBy('convert_pdf_to_images', 'pdf-to-image', { format: 'jpg' }, [
      'ZIP-OUT',
      'in.zip',
      'application/zip',
    ]);

    expect(fieldOf(sent, 'format')).toBe('jpg');
    expect(result.file_name).toBe('in.zip');
  });
});

describe('Files that do not match the action', () => {
  it('points an e-book to the EPUB action', async () => {
    const error = await refusedBy('convert_office_to_pdf', 'office-to-pdf', 415, {
      error: 'unsupported_content',
      detected_type: 'epub',
    });

    expect(error.message).toMatch(/Convert EPUB to PDF action/);
  });

  it('recognizes a web page mapped instead of the file', async () => {
    const error = await refusedBy('compress_pdf', 'compress-pdf', 415, { error: 'unsupported_content', detected_type: 'html' });

    expect(error.message).toMatch(/share or preview link/);
  });

  it('keeps the general message for other contents', async () => {
    const error = await refusedBy('compress_pdf', 'compress-pdf', 415, { error: 'unsupported_content', detected_type: 'zip' });

    expect(error.message).toMatch(/does not match this action/);
  });

  it('names the page limit of the action', async () => {
    const error = await refusedBy('rotate_pdf', 'rotate-pdf', 422, { error: 'too_many_pages', max_pages: 2000 }, {
      rotation: '90',
    });

    expect(error.message).toMatch(/more than the 2,000 pages/);
  });

  it('names the empty field', async () => {
    const error = await refusedBy('add_watermark', 'watermark-pdf', 400, { error: 'field_required', field: 'text' }, {
      text: 'DRAFT',
    });

    expect(error.message).toMatch(/^The Watermark text field is empty\./);
  });

  it('does not read an error code as a property every object has', async () => {
    const error = await refusedBy('compress_pdf', 'compress-pdf', 400, { error: 'constructor' });

    expect(error.name).toBe('AppError');
    expect(error.message).toMatch(/refused the request \(constructor\)/);
  });
});

// The actions whose tool opens a protected PDF with its password.
const PDF_PASSWORD_ACTIONS = [
  'compress_pdf',
  'convert_pdf_to_word',
  'convert_pdf_to_images',
  'extract_pdf_pages',
  'split_pdf',
  'rotate_pdf',
  'add_watermark',
  'add_page_numbers',
];

describe('PDF password', () => {
  it.each(Object.keys(App.creates))('offers the PDF password on %s only when its tool can use it', (key) => {
    const field = App.creates[key].operation.inputFields.find((f) => f.label === 'PDF password');
    expect(Boolean(field)).toBe(PDF_PASSWORD_ACTIONS.includes(key));
  });

  it('sends the password of a protected PDF', async () => {
    const { sent } = await sentBy('compress_pdf', 'compress-pdf', { quality: 'low', pdf_passphrase: 'open sesame' });

    expect(fieldOf(sent, 'password')).toBe('open sesame');
    expect(fieldOf(sent, 'quality')).toBe('low');
  });

  it('sends no password when the field is empty', async () => {
    const { sent } = await sentBy('rotate_pdf', 'rotate-pdf', { rotation: '180', pdf_passphrase: '' });

    expect(fieldOf(sent, 'password')).toBeUndefined();
  });

  it('points to the PDF password field when the PDF needs one', async () => {
    const error = await refusedBy('add_page_numbers', 'page-numbers-pdf', 422, { error: 'needs_password' });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/fill in the PDF password field/);
  });

  it('says when the PDF password does not open the PDF', async () => {
    const error = await refusedBy('convert_pdf_to_word', 'pdf-to-word', 422, { error: 'wrong_password' }, {
      pdf_passphrase: 'guess',
    });

    expect(error.name).toBe('HaltedError');
    expect(error.message).toMatch(/^The PDF password does not open this PDF\./);
  });

  it('still sends a merged PDF that needs a password to the Unlock PDF action', async () => {
    source().get('/one.pdf').reply(200, 'PDF-ONE', { 'Content-Type': 'application/pdf' });
    source().get('/two.pdf').reply(200, 'PDF-TWO', { 'Content-Type': 'application/pdf' });
    api().post('/v1/convert/merge-pdf').reply(422, { error: 'password_protected' });

    const error = await appTester(perform('merge_pdfs'), bundleFor({ files: [`${SOURCE}/one.pdf`, `${SOURCE}/two.pdf`] })).catch(
      (e) => e,
    );

    expect(error.message).toMatch(/Unlock PDF action/);
  });
});

describe('Definition', () => {
  it.each(Object.keys(App.creates))('keeps the sample of %s aligned with its output fields', (key) => {
    const { sample, outputFields } = App.creates[key].operation;
    expect(outputFields.map((f) => f.key).sort()).toEqual(Object.keys(sample).sort());
  });
});

describe('Authentication', () => {
  it('passes the connection test with a key that reads the quota', async () => {
    api().get('/v1/quota').reply(200, { plan: 'dev', quota: 300, used: 7 });

    const response = await appTester(App.authentication.test, bundleFor({}, { isTestingAuth: true }));

    expect(response.data || response).toMatchObject({ plan: 'dev' });
  });

  it('explains a refused key during the connection test', async () => {
    nock(API).get('/v1/quota').reply(401, { error: 'invalid_api_key' });

    const error = await appTester(App.authentication.test, bundleFor({}, { isTestingAuth: true })).catch((e) => e);

    expect(error.name).toBe('AppError');
    expect(error.message).toMatch(/Developer tab/);
  });
});
