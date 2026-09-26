// Hands the converted file to Zapier's file storage, so that later steps get a URL.
// Kept apart so the tests can replace it: stashing needs Zapier's runtime.
const stash = (z, buffer, fileName, contentType) =>
  z.stashFile(buffer, buffer.length, fileName, contentType || undefined);

module.exports = { stash };
