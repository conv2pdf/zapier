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

// The source host must never see the conv2pdf key.
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

describe('conv2pdf errors', () => {
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
