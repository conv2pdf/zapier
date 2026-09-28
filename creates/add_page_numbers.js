const { convert, fileList, outputFields, pdfPasswordField, PDF_PASSWORD_MESSAGES, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'page-numbers-pdf',
    fileUrls: fileUrls.slice(0, 1),
    fields: {
      position: bundle.inputData.position || 'bottom-center',
      format: bundle.inputData.format || 'full',
      password: bundle.inputData.pdf_passphrase,
    },
    messages: PDF_PASSWORD_MESSAGES,
  });
}

module.exports = {
  key: 'add_page_numbers',
  noun: 'PDF',
  display: {
    label: 'Add Page Numbers to PDF',
    description: 'Numbers every page of a PDF at the bottom, with or without the page count.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText: 'Map a PDF from an earlier step or paste a public URL. Up to 2,000 pages.',
      },
      {
        key: 'position',
        label: 'Position',
        required: false,
        default: 'bottom-center',
        choices: [
          { value: 'bottom-center', label: 'Bottom center', sample: 'bottom-center' },
          { value: 'bottom-left', label: 'Bottom left', sample: 'bottom-left' },
          { value: 'bottom-right', label: 'Bottom right', sample: 'bottom-right' },
        ],
      },
      {
        key: 'format',
        label: 'Format',
        required: false,
        default: 'full',
        choices: [
          { value: 'full', label: 'Page number and page count, such as 3 / 12', sample: 'full' },
          { value: 'simple', label: 'Page number only, such as 3', sample: 'simple' },
        ],
      },
      pdfPasswordField,
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
