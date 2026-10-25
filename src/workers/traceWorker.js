// Image Trace worker: runs preprocessing + imagetracerjs off the main
// thread so the modal (and the whole studio) stays responsive during a
// trace. imagetracerjs's imagedataToTracedata/getsvgstring are DOM-free,
// so they are safe here; the DOM parts (image decode, canvas downscale,
// data-URL preview) stay on the main thread in TraceModal.
//
// Protocol:
//   main -> worker: { imgd: { width, height, data }, options }
//     options are traceImageData options; `testDelayMs` (E2E hook only,
//     default 0) is awaited before tracing so the modal's Cancel path can
//     be tested deterministically.
//   worker -> main: { type: 'done', result } | { type: 'error', message }
// The pixel buffer is transferred (not copied) when the caller passes it
// as a transferable; the result layers are plain strings, cheap to clone.
import { traceImageData } from '../lib/trace.js';

self.onmessage = async (e) => {
  const { imgd, options = {} } = e.data;
  try {
    const delay = e.data.testDelayMs || 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const result = traceImageData(imgd, options);
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || 'Tracing failed.' });
  }
};
