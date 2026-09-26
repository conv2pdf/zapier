const { version } = require('./package.json');

const API_BASE = 'https://api.conv2pdf.com/v1';
const USER_AGENT = `zapier-conv2pdf/${version}`;

const PRICING_URL = 'https://conv2pdf.com/en/api/pricing/';
const KEYS_URL = 'https://conv2pdf.com/en/dashboard/#developer';

// Zapier retries a throttled run after this delay when conv2pdf sends no Retry-After.
const DEFAULT_RETRY_AFTER_SECONDS = 30;

const isApiUrl = (url) => typeof url === 'string' && url.startsWith(`${API_BASE}/`);

function includeApiKey(request, z, bundle) {
  // The same client downloads the user's files from other hosts: the key never goes there.
  if (!isApiUrl(request.url)) return request;
  if (bundle.authData && bundle.authData.apiKey) {
    request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
  }
  request.headers['User-Agent'] = USER_AGENT;
  // conv2pdf answers 429 both for a used-up quota and for the rate limit. Zapier's core
  // would retry both; apiError() below tells them apart.
  request.throwForThrottlingEarly = false;
  return request;
}

// Messages for the codes conv2pdf returns in the `error` field. Halted: the problem is
// this file or this run, the Zap stays on. Failed: the account needs the user's attention.
const HALTED = {
  file_too_large: `The file is larger than your conv2pdf plan allows: 10 MB per file on the Dev plan, 200 MB on paid plans. Plans: ${PRICING_URL}`,
  plan_limit_files: `Your conv2pdf plan does not merge that many files at once: 2 on the Dev plan, up to 20 on paid plans. Plans: ${PRICING_URL}`,
  not_enough_files: 'Merging needs at least 2 PDFs.',
  too_many_files: 'conv2pdf merges up to 20 PDFs at a time.',
  unsupported_content:
    'The file does not match this action. conv2pdf checks the content of the file, not only its name: map the right file.',
  empty_file: 'The file is empty.',
  password_protected: 'The PDF is protected with a password. Remove the password before converting it.',
  needs_password: 'The PDF is protected with a password. Remove the password before converting it.',
  pdf_scanned_needs_ocr: 'This PDF is a scan without text, so it cannot be converted to Word.',
  pdf_too_many_pages: 'The PDF has too many pages for this action.',
  too_many_pages: 'The document has too many pages for this action.',
  output_too_large: 'The result is too large to be delivered.',
  conversion_failed: 'conv2pdf could not process this file. Failed conversions do not count against your quota.',
  conversion_timeout:
    'The conversion took too long and was stopped. Failed conversions do not count against your quota.',
};

const FAILED = {
  account_not_provisioned: `This API key has no conv2pdf API plan. Choose one at ${PRICING_URL}`,
  quota_exceeded: `The conv2pdf quota of this API key is used up. Paid plans renew it every month, the Dev trial does not. Plans: ${PRICING_URL}`,
  credits_expired: `The conv2pdf trial credits have expired. Choose a plan to keep converting: ${PRICING_URL}`,
  file_expired: 'The converted file is no longer available on conv2pdf.',
  job_deleted: 'The conversion was deleted on conv2pdf before it could be downloaded.',
};

function retryAfterSeconds(headers, body) {
  const seconds = Number((headers && headers.get && headers.get('retry-after')) ?? (body && body.retry_after));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS;
}

/** The Zapier error for a failed conv2pdf response (status, JSON body, headers). */
function apiError(z, bundle, status, body, headers) {
  const code = body && typeof body.error === 'string' ? body.error : undefined;

  if (status === 401 || code === 'invalid_api_key' || code === 'missing_bearer_token') {
    const message = `Your conv2pdf API key is invalid or has been revoked. Create a key in the Developer tab of your conv2pdf dashboard (${KEYS_URL}) and reconnect.`;
    return bundle.meta && bundle.meta.isTestingAuth
      ? new z.errors.Error(message, 'Unauthorized', 401)
      : new z.errors.ExpiredAuthError(message);
  }
  if (code === 'rate_limited' || code === 'server_busy') {
    const message =
      code === 'rate_limited'
        ? 'conv2pdf accepts 20 conversions per minute per API key. Zapier retries this run automatically.'
        : 'The conv2pdf conversion queue is full. Zapier retries this run automatically.';
    return new z.errors.ThrottledError(message, retryAfterSeconds(headers, body));
  }
  if (code && HALTED[code]) return new z.errors.HaltedError(HALTED[code]);
  if (code && FAILED[code]) return new z.errors.Error(FAILED[code], code, status);
  if (status >= 500) {
    return new z.errors.Error(
      'conv2pdf is temporarily unavailable. Failed conversions do not count against your quota; replay this run in a few minutes.',
      code || 'ServerError',
      status,
    );
  }
  return new z.errors.Error(
    code ? `conv2pdf refused the request (${code}).` : `conv2pdf returned HTTP ${status}.`,
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
