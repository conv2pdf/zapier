const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  const ranges = String(bundle.inputData.ranges ?? '').trim();
  if (!ranges) throw new z.errors.HaltedError('The Pages field is empty: give the pages to keep, such as 1-5,7.');
  return convert(z, bundle, { tool: 'split-pdf', fileUrls: fileUrls.slice(0, 1), fields: { ranges } });
}

module.exports = {
  key: 'extract_pdf_pages',
  noun: 'PDF',
  display: {
    label: 'Extract Pages From PDF',
    description: 'Splits a PDF by copying the pages you choose into a new PDF.',
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
        key: 'ranges',
        label: 'Pages',
        required: true,
        type: 'string',
        helpText:
          'The pages to keep, as page numbers and ranges separated by commas. For example, `1-5,7,10-12`. They keep their order in the PDF.',
      },
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
