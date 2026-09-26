const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The Document field is empty: map a file.');
  return convert(z, bundle, { tool: 'office-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_office_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert Office Document to PDF',
    description: 'Converts a Word, Excel, PowerPoint or OpenDocument file to PDF.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'Document',
        required: true,
        type: 'file',
        helpText:
          'A Word, Excel, PowerPoint or OpenDocument file: map a file from an earlier step or paste a public URL. Up to 10 MB on the Dev plan, 200 MB on paid plans.',
      },
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
