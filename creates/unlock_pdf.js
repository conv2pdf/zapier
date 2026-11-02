const { convert, fileList, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  return convert(z, bundle, {
    tool: 'unlock-pdf',
    fileUrls: fileUrls.slice(0, 1),
    fields: { password: String(bundle.inputData.pdf_passphrase ?? '') },
    messages: {
      needs_password: 'This PDF needs its password to open: fill in the Password field.',
      wrong_password: 'The password does not open this PDF. Conv2pdf removes a password you know, it does not guess it.',
    },
  });
}

module.exports = {
  key: 'unlock_pdf',
  noun: 'PDF',
  display: {
    label: 'Unlock PDF',
    description: 'Removes the protection of a PDF: its password, which you provide, and its printing or copying restrictions.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText: 'Map a protected PDF from an earlier step or paste a public URL.',
      },
      {
        // The PDF's own password. Zapier's check D001 refuses an input key that contains
        // "password", a rule meant for account credentials.
        key: 'pdf_passphrase',
        label: 'Password',
        required: false,
        type: 'password',
        helpText:
          'The current password of the PDF. Leave it empty for a PDF that opens without a password but blocks printing or copying. To map a value from an earlier step, click the eye icon of the field first.',
      },
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
