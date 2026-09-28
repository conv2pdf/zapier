const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The Photo field is empty: map a file.');
  return convert(z, bundle, { tool: 'heic-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_heic_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert HEIC to PDF',
    description: 'Converts an iPhone HEIC or HEIF photo to a one-page PDF at its full resolution.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'Photo',
        required: true,
        type: 'file',
        helpText: 'A HEIC or HEIF photo, as an iPhone takes them: map a file from an earlier step or paste a public URL.',
      },
    ],
    perform,
    sample: sampleFor('photo.pdf'),
    outputFields,
  },
};
