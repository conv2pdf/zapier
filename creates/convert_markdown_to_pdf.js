const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The Markdown file field is empty: map a file.');
  return convert(z, bundle, { tool: 'markdown-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_markdown_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert Markdown to PDF',
    description: 'Converts a Markdown file to PDF, laid out as GitHub shows it, with its tables, highlighted code and math.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'Markdown file',
        required: true,
        type: 'file',
        helpText:
          'A Markdown (.md) file saved as UTF-8, such as a README or the answer of an AI step saved as a file: map a file from an earlier step or paste a public URL. Any text file given here is read as Markdown.',
      },
    ],
    perform,
    sample: sampleFor('document.pdf'),
    outputFields,
  },
};
