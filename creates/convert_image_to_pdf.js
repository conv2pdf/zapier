const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The Image field is empty: map a file.');
  return convert(z, bundle, { tool: 'image-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_image_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert Image to PDF',
    description: 'Converts a PNG, JPG, WebP, GIF or TIFF image to a one-page PDF.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'Image',
        required: true,
        type: 'file',
        helpText:
          'A PNG, JPG, WebP, GIF or TIFF image: map a file from an earlier step or paste a public URL. For an iPhone HEIC photo, use the Convert HEIC to PDF action.',
      },
    ],
    perform,
    sample: sampleFor('photo.pdf'),
    outputFields,
  },
};
