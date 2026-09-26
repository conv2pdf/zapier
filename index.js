const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { includeApiKey, handleErrors } = require('./middleware');
const convertOfficeToPdf = require('./creates/convert_office_to_pdf');
const mergePdfs = require('./creates/merge_pdfs');
const compressPdf = require('./creates/compress_pdf');
const convertPdfToWord = require('./creates/convert_pdf_to_word');

module.exports = {
  version,
  platformVersion,

  // Empty values reach perform() as they are: each action reports a missing file itself.
  flags: { cleanInputData: false },

  authentication,
  beforeRequest: [includeApiKey],
  afterResponse: [handleErrors],

  triggers: {},
  searches: {},
  creates: {
    [convertOfficeToPdf.key]: convertOfficeToPdf,
    [mergePdfs.key]: mergePdfs,
    [compressPdf.key]: compressPdf,
    [convertPdfToWord.key]: convertPdfToWord,
  },
  resources: {},
};
