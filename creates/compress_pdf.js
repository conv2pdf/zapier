const { convert, fileList, outputFields, pdfPasswordField, PDF_PASSWORD_MESSAGES, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'compress-pdf',
    fileUrls: fileUrls.slice(0, 1),
    fields: { quality: bundle.inputData.quality || 'medium', password: bundle.inputData.pdf_passphrase },
    messages: PDF_PASSWORD_MESSAGES,
  });
}

module.exports = {
  key: 'compress_pdf',
  noun: 'PDF',
  display: {
    label: 'Compress PDF',
    description: 'Reduces the size of a PDF by resampling its images.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText: 'Map a PDF from an earlier step or paste a public URL.',
      },
      {
        key: 'quality',
        label: 'Image quality',
        required: false,
        default: 'medium',
        choices: [
          { value: 'low', label: 'Low: smallest file (72 DPI)', sample: 'low' },
          { value: 'medium', label: 'Medium: balanced (150 DPI)', sample: 'medium' },
          { value: 'high', label: 'High: best quality (300 DPI)', sample: 'high' },
        ],
      },
      pdfPasswordField,
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
