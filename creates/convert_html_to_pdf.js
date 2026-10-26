const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The HTML file field is empty: map a file.');
  return convert(z, bundle, { tool: 'html-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_html_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert HTML File to PDF',
    description: 'Converts an HTML file to PDF, printed as a browser would: the text stays selectable and the links work.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'HTML file',
        required: true,
        type: 'file',
        helpText:
          'An HTML file: map a file from an earlier step or paste a public URL. Its print styles apply, and pages default to A4. To convert a page of a website, use Convert Web Page to PDF.',
      },
    ],
    perform,
    sample: sampleFor('page.pdf'),
    outputFields,
  },
};
