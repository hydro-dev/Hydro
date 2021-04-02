import 'streamsaver/examples/zip-stream';

export const createZipStream = window.ZIP;

export async function createZipBlob(underlyingSource) {
  return new Response(createZipStream(underlyingSource)).blob();
}

window.Hydro.utils.zip = { createZipStream, createZipBlob };
