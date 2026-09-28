const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'pdf-to-image',
    fileUrls: fileUrls.slice(0, 1),
    fields: { format: bundle.inputData.format || 'png' },
  });
}

module.exports = {
  key: 'convert_pdf_to_images',
  noun: 'Archive',
  display: {
    label: 'Convert PDF to Images',
    description: 'Converts each page of a PDF to a PNG or JPG image, delivered together in a ZIP file.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText: 'Map a PDF from an earlier step or paste a public URL. Up to 100 pages, rendered at 150 DPI.',
      },
      {
        key: 'format',
        label: 'Image format',
        required: false,
        default: 'png',
        choices: [
          { value: 'png', label: 'PNG: sharp text and lines', sample: 'png' },
          { value: 'jpg', label: 'JPG: smaller files for photos', sample: 'jpg' },
        ],
      },
    ],
    perform,
    sample: sampleFor('report.zip'),
    outputFields,
  },
};
