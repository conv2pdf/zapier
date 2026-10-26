const { convert, fileList, outputFields, pdfPasswordField, PDF_PASSWORD_MESSAGES, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'split-pdf',
    fileUrls: fileUrls.slice(0, 1),
    fields: { password: bundle.inputData.pdf_passphrase },
    messages: PDF_PASSWORD_MESSAGES,
  });
}

module.exports = {
  key: 'split_pdf',
  noun: 'ZIP',
  display: {
    label: 'Split PDF',
    description: 'Puts every page of a PDF in its own PDF file, returned in a ZIP file.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText:
          'Map a PDF from an earlier step or paste a public URL. Up to 200 pages. The ZIP file holds page-001.pdf, page-002.pdf and so on.',
      },
      pdfPasswordField,
    ],
    perform,
    sample: sampleFor('report.zip'),
    outputFields,
  },
};
