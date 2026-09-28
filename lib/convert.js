const FormData = require('form-data');

const files = require('./files');
const { API_BASE, apiError } = require('../middleware');

// Zapier gives a step 30 seconds in all: downloading the input, converting it and
// storing the result share 27 of them, so the step stops before Zapier cuts it.
// The variable only exists so the tests do not wait 27 seconds.
const budgetMs = () => Number(process.env.CONV2PDF_BUDGET_MS) || 27_000;

// conv2pdf identifies a file by its content, but the extension settles what the content
// cannot: .doc, .xls and .ppt share one container, and so do Pages and Numbers. A name
// without an extension gets it from its type.
const EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.apple.pages': 'pages',
  'application/x-iwork-pages-sffpages': 'pages',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

class OutOfTime extends Error {}

function isTimeout(error) {
  return Boolean(
    error &&
      (error instanceof OutOfTime ||
        error.type === 'request-timeout' ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        /timeout/i.test(String(error.message))),
  );
}

function remaining(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new OutOfTime();
  return ms;
}

/** The file name from a Content-Disposition header, preferring its UTF-8 form. */
function fileNameFromDisposition(disposition) {
  if (!disposition) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Badly encoded: fall back to the plain name below.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : undefined;
}

function fileNameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    return undefined;
  }
}

function withExtension(name, contentType) {
  const base = name || 'file';
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const extension = EXTENSIONS[contentType];
  return extension ? `${base}.${extension}` : base;
}

const typeOf = (headers) => (headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

async function fetchInput(z, url, deadline, position) {
  const response = await z.request({
    url,
    method: 'GET',
    raw: true,
    skipThrowForStatus: true,
    timeout: remaining(deadline),
  });
  if (response.status >= 400) {
    throw new z.errors.HaltedError(
      `File ${position} could not be downloaded from ${new URL(url).host} (HTTP ${response.status}).`,
    );
  }
  const contentType = typeOf(response.headers);
  const name = fileNameFromDisposition(response.headers.get('content-disposition')) || fileNameFromUrl(url);
  return {
    buffer: await response.buffer(),
    fileName: withExtension(name, contentType),
    contentType: contentType || 'application/octet-stream',
  };
}

async function failure(z, bundle, response, messages) {
  let body;
  try {
    body = typeof response.json === 'function' ? await response.json() : response.data;
  } catch {
    body = undefined;
  }
  return apiError(z, bundle, response.status, body, response.headers, messages);
}

/**
 * Runs one conv2pdf tool on the given file URLs: downloads them, uploads them to
 * conv2pdf, stores the result in Zapier and deletes the job from conv2pdf. `messages`
 * words the errors that call for this action's own fields.
 */
async function convert(z, bundle, { tool, fileUrls, fields = {}, messages = {} }) {
  const deadline = Date.now() + budgetMs();
  try {
    const inputs = [];
    for (let i = 0; i < fileUrls.length; i++) {
      inputs.push(await fetchInput(z, fileUrls[i], deadline, i + 1));
    }

    const form = new FormData();
    for (const input of inputs) {
      form.append('file', input.buffer, { filename: input.fileName, contentType: input.contentType });
    }
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') form.append(name, String(value));
    }

    const converted = await z.request({
      url: `${API_BASE}/convert/${tool}`,
      method: 'POST',
      body: form,
      skipThrowForStatus: true,
      timeout: remaining(deadline),
    });
    if (converted.status !== 200) throw await failure(z, bundle, converted, messages);
    const job = converted.data;
    if (!job || typeof job.job_id !== 'string') {
      throw new z.errors.Error('conv2pdf returned an unexpected response.', 'UnexpectedResponse', converted.status);
    }

    const download = await z.request({
      url: `${API_BASE}/download/${encodeURIComponent(job.job_id)}`,
      method: 'GET',
      raw: true,
      skipThrowForStatus: true,
      timeout: remaining(deadline),
    });
    if (download.status !== 200) throw await failure(z, bundle, download, messages);
    const fileName =
      fileNameFromDisposition(download.headers.get('content-disposition')) || `conv2pdf-${job.job_id}`;
    const contentType = typeOf(download.headers);
    const buffer = await download.buffer();
    const fileUrl = await files.stash(z, buffer, fileName, contentType);

    // conv2pdf deletes the file after one hour anyway: a failed delete does not fail the run.
    await z
      .request({
        url: `${API_BASE}/job/${encodeURIComponent(job.job_id)}`,
        method: 'DELETE',
        skipThrowForStatus: true,
        timeout: Math.max(1000, deadline - Date.now()),
      })
      .catch(() => {});

    const quota = job.quota || {};
    return {
      file: fileUrl,
      file_name: fileName,
      size_bytes: buffer.length,
      quota_used: Number.isInteger(quota.used) ? quota.used : null,
      quota: Number.isInteger(quota.quota) ? quota.quota : null,
    };
  } catch (error) {
    if (isTimeout(error)) {
      throw new z.errors.HaltedError(
        "The conversion did not finish within Zapier's 30-second limit. Large files and long PDFs can take longer: replay the run with a smaller file. If conv2pdf finished the conversion after Zapier stopped waiting, it still counts against your quota.",
      );
    }
    throw error;
  }
}

/** The file URLs of a field that holds one file or a list of them. */
function fileList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((v) => String(v ?? '').trim()).filter(Boolean);
}

/** A yes/no field: true as Zapier sends it, or a mapped value such as "true" or "yes". */
function isTrue(value) {
  return value === true || /^(true|yes|on|1)$/i.test(String(value ?? '').trim());
}

// The password of a protected PDF, for the tools that open one with it: the API reads
// it in `password`. The key avoids "password", which Zapier's check D001 refuses on an
// input field, a rule meant for account credentials.
const pdfPasswordField = {
  key: 'pdf_passphrase',
  label: 'PDF password',
  required: false,
  type: 'password',
  helpText:
    'Only for a PDF that asks for a password to open. The result has no password. To map a value from an earlier step, click the eye icon of the field first.',
};

const PDF_PASSWORD_MESSAGES = {
  needs_password: 'This PDF asks for a password to open: fill in the PDF password field.',
  wrong_password: 'The PDF password does not open this PDF.',
};

// What every action returns, and the sample Zapier shows before a real run.
const outputFields = [
  { key: 'file', label: 'File', type: 'file' },
  { key: 'file_name', label: 'File name', type: 'string' },
  { key: 'size_bytes', label: 'Size (bytes)', type: 'integer' },
  { key: 'quota_used', label: 'Conversions used on this API key', type: 'integer' },
  { key: 'quota', label: 'Conversion quota of this API key', type: 'integer' },
];

const sampleFor = (fileName) => ({
  file: `https://zapier-dev-files.s3.amazonaws.com/cli-platform/example/${fileName}`,
  file_name: fileName,
  size_bytes: 124533,
  quota_used: 42,
  quota: 1000,
});

module.exports = {
  convert,
  fileList,
  isTrue,
  pdfPasswordField,
  PDF_PASSWORD_MESSAGES,
  outputFields,
  sampleFor,
  fileNameFromDisposition,
  withExtension,
};
