const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The XPS document field is empty: map a file.');
  return convert(z, bundle, { tool: 'xps-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_xps_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert XPS to PDF',
    description: 'Converts an XPS or OpenXPS document to PDF, each page at its own size, with its text, links and outline.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'XPS document',
        required: true,
        type: 'file',
        helpText:
          'An XPS (.xps) or OpenXPS (.oxps) document, such as a file printed with Microsoft XPS Document Writer, up to 1,500 pages: map a file from an earlier step or paste a public URL.',
      },
    ],
    perform,
    sample: sampleFor('document.pdf'),
    outputFields,
  },
};
