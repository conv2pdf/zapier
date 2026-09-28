const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The E-book field is empty: map a file.');
  return convert(z, bundle, { tool: 'epub-to-pdf', fileUrls: fileUrls.slice(0, 1) });
}

module.exports = {
  key: 'convert_epub_to_pdf',
  noun: 'PDF',
  display: {
    label: 'Convert EPUB to PDF',
    description: 'Converts an EPUB e-book to a PDF on A4 pages, with its table of contents and links.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'E-book',
        required: true,
        type: 'file',
        helpText:
          "An EPUB e-book without DRM, up to 1,500 pages: map a file from an earlier step or paste a public URL. The PDF uses standard fonts instead of the book's own. Books made of full-page images, such as comics and picture books, are refused when their pages would come out blank.",
      },
    ],
    perform,
    sample: sampleFor('book.pdf'),
    outputFields,
  },
};
