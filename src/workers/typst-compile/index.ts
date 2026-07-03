import { parseCompileRequest, type CompileResult } from '../../shared/worker/typst';

import { createTypstEngine } from './engine';
import { TypstCompileService } from './service';

let servicePromise: Promise<TypstCompileService> | undefined;

const getService = async (): Promise<TypstCompileService> => {
  if (!servicePromise) {
    servicePromise = createTypstEngine().then((engine) => new TypstCompileService(engine));
  }

  return servicePromise;
};

const postResult = (result: CompileResult): void => {
  self.postMessage(result);
};

const handleMessage = async (value: unknown): Promise<void> => {
  const request = parseCompileRequest(value);
  const service = await getService();
  const result = await service.handle(request);

  if (result) {
    postResult(result);
  }
};

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  void handleMessage(event.data).catch((error: unknown) => {
    const noteId =
      typeof event.data === 'object' &&
      event.data !== null &&
      !Array.isArray(event.data) &&
      typeof (event.data as Record<string, unknown>).noteId === 'string'
        ? ((event.data as Record<string, unknown>).noteId as string)
        : 'unknown';

    postResult({
      type: 'error',
      noteId,
      diagnostics: [
        {
          severity: 'error',
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    });
  });
});
