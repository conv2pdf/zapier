const { convert, fileList, outputFields, pdfPasswordField, PDF_PASSWORD_MESSAGES, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'pdf-to-word',
    fileUrls: fileUrls.slice(0, 1),
    fields: { password: bundle.inputData.pdf_passphrase },
    messages: PDF_PASSWORD_MESSAGES,
  });
}

module.exports = {
  key: 'convert_pdf_to_word',
  noun: 'Document',
  display: {
    label: 'Convert PDF to Word',
    description: 'Converts a PDF into an editable Word (DOCX) document.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText:
          'Map a PDF from an earlier step or paste a public URL. The PDF must contain real text: a scan without text cannot be converted. Long PDFs can take longer than the 30 seconds Zapier gives a step.',
      },
      pdfPasswordField,
    ],
    perform,
    sample: sampleFor('report.docx'),
    outputFields,
  },
};
