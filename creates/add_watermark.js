const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  const text = String(bundle.inputData.text ?? '').trim();
  if (!text) throw new z.errors.HaltedError('The Watermark text field is empty.');
  return convert(z, bundle, { tool: 'watermark-pdf', fileUrls: fileUrls.slice(0, 1), fields: { text } });
}

module.exports = {
  key: 'add_watermark',
  noun: 'PDF',
  display: {
    label: 'Add Watermark to PDF',
    description: 'Stamps a diagonal text watermark, such as CONFIDENTIAL, on every page of a PDF.',
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
        key: 'text',
        label: 'Watermark text',
        required: true,
        type: 'string',
        helpText:
          'Up to 50 characters, such as `CONFIDENTIAL`. Only Latin letters, digits and punctuation are printed: other characters, such as emoji, are left out.',
      },
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
