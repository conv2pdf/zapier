const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.files);
  if (fileUrls.length < 2) {
    throw new z.errors.HaltedError('Merging needs at least 2 PDFs: map one file per line of the PDF files field.');
  }
  return convert(z, bundle, { tool: 'merge-pdf', fileUrls });
}

module.exports = {
  key: 'merge_pdfs',
  noun: 'PDF',
  display: {
    label: 'Merge PDFs',
    description: 'Combines several PDFs into one, in the order given.',
  },
  operation: {
    inputFields: [
      {
        key: 'files',
        label: 'PDF files',
        required: true,
        list: true,
        type: 'file',
        helpText:
          'The PDFs to merge, one per line, in the order they should appear. The Dev plan merges 2 files at a time, paid plans up to 20.',
      },
    ],
    perform,
    sample: sampleFor('merged.pdf'),
    outputFields,
  },
};
