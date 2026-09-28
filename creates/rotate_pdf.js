const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'rotate-pdf',
    fileUrls: fileUrls.slice(0, 1),
    fields: { rotation: bundle.inputData.rotation || '90' },
  });
}

module.exports = {
  key: 'rotate_pdf',
  noun: 'PDF',
  display: {
    label: 'Rotate PDF',
    description: 'Rotates every page of a PDF clockwise by 90, 180 or 270 degrees.',
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
        key: 'rotation',
        label: 'Rotation',
        required: true,
        default: '90',
        helpText: "Clockwise. The rotation adds to each page's current one.",
        choices: [
          { value: '90', label: '90 degrees', sample: '90' },
          { value: '180', label: '180 degrees (upside down)', sample: '180' },
          { value: '270', label: '270 degrees (90 degrees counterclockwise)', sample: '270' },
        ],
      },
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
