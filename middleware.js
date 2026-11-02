const { version } = require('./package.json');

const API_BASE = 'https://api.conv2pdf.com/v1';
const USER_AGENT = `zapier-conv2pdf/${version}`;

const PRICING_URL = 'https://conv2pdf.com/en/api/pricing/';
const KEYS_URL = 'https://conv2pdf.com/en/dashboard/#developer';

// Zapier retries a throttled run after this delay when Conv2pdf sends no Retry-After.
const DEFAULT_RETRY_AFTER_SECONDS = 30;

const isApiUrl = (url) => typeof url === 'string' && url.startsWith(`${API_BASE}/`);

function includeApiKey(request, z, bundle) {
  // The same client downloads the user's files from other hosts: the key never goes there.
  if (!isApiUrl(request.url)) return request;
  if (bundle.authData && bundle.authData.apiKey) {
    request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
  }
  request.headers['User-Agent'] = USER_AGENT;
  // Conv2pdf answers 429 both for a used-up quota and for the rate limit. Zapier's core
  // would retry both; apiError() below tells them apart.
  request.throwForThrottlingEarly = false;
  return request;
}

// A table entry for a value from the API, never a property every object inherits.
const own = (table, key) => (key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined);

const OFFICE_ELSEWHERE = 'This file is an office document: use the Convert Office Document to PDF action.';
const IMAGE_ELSEWHERE = 'This file is an image: use the Convert Image to PDF action.';
const WEB_PAGE =
  'This file contains a web page, not the expected document. Map the file itself: a share or preview link returns the page that displays the file.';

// What Conv2pdf found in a file that does not match the action (`detected_type`).
const CONTENT_HINTS = {
  pdf: 'This file is already a PDF.',
  epub: 'This file is an EPUB e-book: use the Convert EPUB to PDF action.',
  postscript: 'This file is PostScript or EPS: use the Convert PostScript to PDF action.',
  pages: OFFICE_ELSEWHERE,
  docx: OFFICE_ELSEWHERE,
  xlsx: OFFICE_ELSEWHERE,
  pptx: OFFICE_ELSEWHERE,
  odt: OFFICE_ELSEWHERE,
  ods: OFFICE_ELSEWHERE,
  odp: OFFICE_ELSEWHERE,
  odg: OFFICE_ELSEWHERE,
  png: IMAGE_ELSEWHERE,
  jpeg: IMAGE_ELSEWHERE,
  gif: IMAGE_ELSEWHERE,
  webp: IMAGE_ELSEWHERE,
  tiff: IMAGE_ELSEWHERE,
  heic: 'This file is a HEIC photo: use the Convert HEIC to PDF or Convert HEIC to JPG action.',
  html: `${WEB_PAGE} To convert an HTML file, use the Convert HTML File to PDF action.`,
  xml: WEB_PAGE,
  svg: WEB_PAGE,
  text: 'This file contains plain text, not the expected document.',
  image_corrupt: 'This image is damaged or incomplete.',
  zip_corrupt: 'This file is damaged or incomplete.',
  msg: 'This file is an Outlook message (.msg), not a document: map its attachment instead.',
  iwork_numbers:
    'This file is a Numbers spreadsheet, which Conv2pdf does not convert: it would come out sliced column by column, without its charts. Open it in Numbers and choose File > Export To > PDF.',
  iwork_keynote:
    'This file is a Keynote presentation, which Conv2pdf does not convert: its titles and templates would come out overlapping. Open it in Keynote and choose File > Export To > PDF.',
  iwork:
    'This file is an Apple iWork document. Conv2pdf converts Pages documents only, named with their .pages extension. For Numbers and Keynote, choose File > Export To > PDF in the app.',
};

// The fields the API names in `field` when a required one is empty.
const FIELD_LABELS = { ranges: 'Pages', text: 'Watermark text', password: 'Password', url: 'Web page address' };

// Why an address was refused (`cause` of `invalid_url`).
const URL_CAUSES = {
  malformed: 'Write the full address, starting with https:// or http://.',
  scheme: 'Only http and https addresses can be converted.',
  credentials: 'Remove the user name and password from the address: Conv2pdf opens the page without signing in.',
  private_address: 'Conv2pdf only opens public web pages, not addresses of a private or local network.',
  local_name: 'Conv2pdf only opens public web pages, not names of a local network.',
  too_long: 'The address is too long.',
};

// Why a page range was refused (`cause` of `invalid_page_range`), once the range reads.
function rangeCause(body) {
  if (body.cause === 'page_zero') return 'Page numbers start at 1.';
  if (body.cause === 'beyond_last_page') {
    return Number.isInteger(body.total_pages)
      ? `The PDF has ${body.total_pages} page${body.total_pages === 1 ? '' : 's'}.`
      : 'A page is beyond the last page of the PDF.';
  }
  if (body.cause === 'whole_document') {
    return 'These pages are the whole document, in its order: the result would be the same PDF.';
  }
  return 'Use page numbers and ranges separated by commas, such as 1-5,7,10-12.';
}

// Messages for the codes Conv2pdf returns in the `error` field, as text or built from
// the response body. Halted: the problem is this file or this run, the Zap stays on.
// Failed: the account needs the user's attention.
const HALTED = {
  file_too_large: `The file is larger than your Conv2pdf plan allows: 10 MB per file on the Dev plan, 200 MB on paid plans. Plans: ${PRICING_URL}`,
  payload_too_large: 'The request is larger than Conv2pdf accepts: 220 MB for the files and fields together.',
  plan_limit_files: `Your Conv2pdf plan does not merge that many files at once: 2 on the Dev plan, up to 20 on paid plans. Plans: ${PRICING_URL}`,
  not_enough_files: 'Merging needs at least 2 PDFs.',
  too_many_files: 'Conv2pdf merges up to 20 PDFs at a time.',
  unsupported_content: (body) =>
    own(CONTENT_HINTS, body.detected_type) ||
    'The file does not match this action. Conv2pdf checks the content of the file, not only its name: map the right file.',
  unsupported_format: 'Conv2pdf cannot read this image format. Use a PNG, JPG, WebP, GIF or TIFF image.',
  empty_file: 'The file is empty.',
  source_unreadable: 'Conv2pdf could not read this file: it may be damaged or incomplete.',
  field_required: (body) =>
    own(FIELD_LABELS, body.field) ? `The ${FIELD_LABELS[body.field]} field is empty.` : 'A required field is empty.',
  invalid_page_range: (body) => `The pages${body.range ? ` "${body.range}"` : ''} are not valid. ${rangeCause(body)}`,
  invalid_rotation: 'The rotation must be 90, 180 or 270 degrees.',
  invalid_format: 'The image format must be PNG or JPG.',
  invalid_quality: 'The image quality must be low, medium or high.',
  password_protected: 'The PDF is protected with a password. Unlock it first with the Unlock PDF action.',
  needs_password: 'The PDF is protected with a password. Unlock it first with the Unlock PDF action.',
  wrong_password: 'The password does not open this PDF.',
  password_too_short: (body) => `The password must have at least ${body.min || 6} characters.`,
  password_too_long: (body) => `The password must have at most ${body.max || 64} characters.`,
  pdf_already_protected: 'The PDF is already protected with a password. Unlock it first with the Unlock PDF action.',
  pdf_not_protected: 'The PDF has no password or restriction to remove.',
  pdf_scanned_needs_ocr: 'This PDF is a scan without text, so it cannot be converted to Word.',
  pdf_too_many_pages: 'The PDF has too many pages for this action.',
  too_many_pages: (body) =>
    Number.isInteger(body.max_pages)
      ? `The document has more than the ${body.max_pages.toLocaleString('en-US')} pages this action accepts.`
      : 'The document has too many pages for this action.',
  unsupported_characters:
    'The watermark text has no character Conv2pdf can print: use Latin letters, digits and punctuation.',
  epub_blank_output:
    'This e-book could not be converted: its pages are full-screen images (comics, picture books, manga), and their layout does not survive the conversion to PDF.',
  epub_too_long: 'The e-book is longer than the 1,500 pages Conv2pdf converts at once.',
  pdf_single_page: 'This PDF has a single page: there is nothing to split.',
  ps_blank_output:
    'This PostScript file draws no page: a file that only holds a font or a library of procedures, or whose program fails, produces none.',
  html_blank_output:
    'This HTML file prints as a blank page: nothing in it is drawn when printed. It may be empty, or hide its content for printing.',
  invalid_url: (body) => `This web page address cannot be converted. ${own(URL_CAUSES, body.cause) ?? ''}`.trim(),
  url_unreachable: 'The web page could not be reached. Check the address, and that the site is online and public.',
  url_http_error: (body) =>
    `The web page answered with an error${Number.isInteger(body.http_status) ? ` (HTTP ${body.http_status})` : ''}. Check that the address opens in a browser without signing in: Conv2pdf opens the page without a session.`,
  url_blocked:
    'The web page leads to a private network address: Conv2pdf only opens public web pages, and the page or one of its redirects points to a private or local network.',
  url_blank_page: 'The web page prints as a blank page: its content may need a login, or be hidden for printing.',
  no_file_expected: 'Convert Web Page to PDF takes the address of a page, not a file.',
  output_too_large: 'The result is too large to be delivered.',
  conversion_failed: 'Conv2pdf could not process this file. Failed conversions do not count against your quota.',
  conversion_timeout:
    'The conversion took too long and was stopped. Failed conversions do not count against your quota.',
};

const FAILED = {
  account_not_provisioned: `This API key has no Conv2pdf API plan. Choose one at ${PRICING_URL}`,
  quota_exceeded: `The Conv2pdf quota of this API key is used up. Paid plans renew it every month, the Dev trial does not. Plans: ${PRICING_URL}`,
  credits_expired: `The Conv2pdf trial credits have expired. Choose a plan to keep converting: ${PRICING_URL}`,
  file_expired: 'The converted file is no longer available on Conv2pdf.',
  job_deleted: 'The conversion was deleted on Conv2pdf before it could be downloaded.',
};

function retryAfterSeconds(headers, body) {
  const seconds = Number((headers && headers.get && headers.get('retry-after')) ?? (body && body.retry_after));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * The Zapier error for a failed Conv2pdf response (status, JSON body, headers). An
 * action can word the message of a halting code itself (`messages`).
 */
function apiError(z, bundle, status, body, headers, messages = {}) {
  const code = body && typeof body.error === 'string' ? body.error : undefined;

  if (status === 401 || code === 'invalid_api_key' || code === 'missing_bearer_token') {
    const message = `Your Conv2pdf API key is invalid or has been revoked. Create a key in the Developer tab of your Conv2pdf dashboard (${KEYS_URL}) and reconnect.`;
    return bundle.meta && bundle.meta.isTestingAuth
      ? new z.errors.Error(message, 'Unauthorized', 401)
      : new z.errors.ExpiredAuthError(message);
  }
  if (code === 'rate_limited' || code === 'server_busy') {
    const message =
      code === 'rate_limited'
        ? 'Conv2pdf accepts 20 conversions per minute per API key. Zapier retries this run automatically.'
        : 'The Conv2pdf conversion queue is full. Zapier retries this run automatically.';
    return new z.errors.ThrottledError(message, retryAfterSeconds(headers, body));
  }
  const halted = own(messages, code) || own(HALTED, code);
  if (halted) return new z.errors.HaltedError(typeof halted === 'function' ? halted(body) : halted);
  if (own(FAILED, code)) return new z.errors.Error(FAILED[code], code, status);
  if (status >= 500) {
    return new z.errors.Error(
      'Conv2pdf is temporarily unavailable. Failed conversions do not count against your quota; replay this run in a few minutes.',
      code || 'ServerError',
      status,
    );
  }
  return new z.errors.Error(
    code ? `Conv2pdf refused the request (${code}).` : `Conv2pdf returned HTTP ${status}.`,
    code || 'ApiError',
    status,
  );
}

// Requests made with skipThrowForStatus handle their own errors (the conversion flow);
// this covers the others, such as the connection test.
function handleErrors(response, z, bundle) {
  if (response.status < 400 || !isApiUrl(response.request && response.request.url)) return response;
  if (response.request && response.request.skipThrowForStatus) return response;
  let body;
  try {
    body = response.data !== undefined ? response.data : JSON.parse(response.content);
  } catch {
    body = undefined;
  }
  throw apiError(z, bundle, response.status, body, response.headers);
}

module.exports = { API_BASE, USER_AGENT, includeApiKey, handleErrors, apiError, isApiUrl };
