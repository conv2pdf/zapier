const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { includeApiKey, handleErrors } = require('./middleware');
const convertOfficeToPdf = require('./creates/convert_office_to_pdf');
const convertImageToPdf = require('./creates/convert_image_to_pdf');
const convertHeicToPdf = require('./creates/convert_heic_to_pdf');
const convertHeicToJpg = require('./creates/convert_heic_to_jpg');
const convertEpubToPdf = require('./creates/convert_epub_to_pdf');
const convertPostscriptToPdf = require('./creates/convert_postscript_to_pdf');
const convertHtmlToPdf = require('./creates/convert_html_to_pdf');
const convertUrlToPdf = require('./creates/convert_url_to_pdf');
const mergePdfs = require('./creates/merge_pdfs');
const extractPdfPages = require('./creates/extract_pdf_pages');
const splitPdf = require('./creates/split_pdf');
const rotatePdf = require('./creates/rotate_pdf');
const addPageNumbers = require('./creates/add_page_numbers');
const addWatermark = require('./creates/add_watermark');
const compressPdf = require('./creates/compress_pdf');
const protectPdf = require('./creates/protect_pdf');
const unlockPdf = require('./creates/unlock_pdf');
const convertPdfToWord = require('./creates/convert_pdf_to_word');
const convertPdfToImages = require('./creates/convert_pdf_to_images');

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
    [convertImageToPdf.key]: convertImageToPdf,
    [convertHeicToPdf.key]: convertHeicToPdf,
    [convertHeicToJpg.key]: convertHeicToJpg,
    [convertEpubToPdf.key]: convertEpubToPdf,
    [convertPostscriptToPdf.key]: convertPostscriptToPdf,
    [convertHtmlToPdf.key]: convertHtmlToPdf,
    [convertUrlToPdf.key]: convertUrlToPdf,
    [mergePdfs.key]: mergePdfs,
    [extractPdfPages.key]: extractPdfPages,
    [splitPdf.key]: splitPdf,
    [rotatePdf.key]: rotatePdf,
    [addPageNumbers.key]: addPageNumbers,
    [addWatermark.key]: addWatermark,
    [compressPdf.key]: compressPdf,
    [protectPdf.key]: protectPdf,
    [unlockPdf.key]: unlockPdf,
    [convertPdfToWord.key]: convertPdfToWord,
    [convertPdfToImages.key]: convertPdfToImages,
  },
  resources: {},
};
