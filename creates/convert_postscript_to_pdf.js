const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PostScript file field is empty: map a file.');
  return convert(z, bundle, { tool: 'ps-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_postscript_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert PostScript to PDF',
    description: 'Converts a PostScript (PS) or EPS file to PDF, keeping its text as text and its drawings as vectors.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PostScript file',
        required: true,
        type: 'file',
        helpText: 'A PostScript (.ps) or EPS (.eps) file: map a file from an earlier step or paste a public URL.',
      },
    ],
    perform,
    sample: sampleFor('drawing.pdf'),
    outputFields,
  },
};
