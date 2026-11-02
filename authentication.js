module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'API key',
      required: true,
      type: 'password',
      helpText:
        'Create a key in the Developer tab of your [Conv2pdf dashboard](https://conv2pdf.com/en/dashboard/#developer). It starts with `cpdf_live_`.',
    },
  ],
  // Reading the quota uses no conversion: a key that reads it can convert.
  test: {
    url: 'https://api.conv2pdf.com/v1/quota',
    method: 'GET',
  },
};
