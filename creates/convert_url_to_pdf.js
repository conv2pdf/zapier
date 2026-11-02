const { convert, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const url = String(bundle.inputData.url ?? '').trim();
  if (!url) throw new z.errors.HaltedError('The Web page address field is empty: give the address of a page.');
  // The only Conv2pdf tool without an input file: the page is fetched by Conv2pdf.
  return convert(z, bundle, { tool: 'url-to-pdf', fileUrls: [], fields: { url } });
}

module.exports = {
  key: 'convert_url_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert Web Page to PDF',
    description: 'Converts the public web page at an address to PDF, printed as a browser would.',
  },
  operation: {
    inputFields: [
      {
        key: 'url',
        label: 'Web page address',
        required: true,
        type: 'string',
        helpText:
          'The full address of a public page, such as `https://example.com/pricing`. Conv2pdf opens it without signing in, so a page behind a login is out of reach.',
      },
    ],
    perform,
    sample: sampleFor('example-com.pdf'),
    outputFields,
  },
};
