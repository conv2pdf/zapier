const { convert, fileList, isTrue, outputFields, sampleFor } = require('../lib/convert');

async function perform(z, bundle) {
  const fileUrls = fileList(bundle.inputData.file);
  if (fileUrls.length === 0) throw new z.errors.HaltedError('The PDF field is empty: map a file.');
  const password = String(bundle.inputData.pdf_passphrase ?? '');
  if (!password) throw new z.errors.HaltedError('The Password field is empty.');
  return convert(z, bundle, {
    tool: 'protect-pdf',
    fileUrls: fileUrls.slice(0, 1),
    fields: {
      password,
      // The API reads any value as "on": a restriction that is off is not sent.
      prevent_print: isTrue(bundle.inputData.prevent_print) ? 'on' : undefined,
      prevent_copy: isTrue(bundle.inputData.prevent_copy) ? 'on' : undefined,
    },
  });
}

module.exports = {
  key: 'protect_pdf',
  noun: 'PDF',
  display: {
    label: 'Protect PDF With Password',
    description: 'Encrypts a PDF with a password (AES-256), and can also block printing or copying its text.',
  },
  operation: {
    inputFields: [
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText: 'Map a PDF from an earlier step or paste a public URL.',
      },
      {
        // The PDF's own password. Zapier's check D001 refuses an input key that contains
        // "password", a rule meant for account credentials.
        key: 'pdf_passphrase',
        label: 'Password',
        required: true,
        type: 'password',
        helpText:
          'The password needed to open the PDF, from 6 to 64 characters. To map a value from an earlier step, click the eye icon of the field first.',
      },
      {
        key: 'prevent_print',
        label: 'Prevent printing',
        required: false,
        type: 'boolean',
        default: 'false',
      },
      {
        key: 'prevent_copy',
        label: 'Prevent copying text',
        required: false,
        type: 'boolean',
        default: 'false',
      },
    ],
    perform,
    sample: sampleFor('report.pdf'),
    outputFields,
  },
};
