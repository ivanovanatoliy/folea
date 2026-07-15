import typstWorkerAssetUrl from '../../workers/typst-compile/index.ts?worker&url';

export const createTypstWorker = (): Worker => {
  const assetUrl = new URL(typstWorkerAssetUrl, import.meta.url);
  const url =
    assetUrl.protocol === 'file:'
      ? new URL(`folea-worker://assets/${assetUrl.pathname.split('/').pop() ?? ''}`)
      : assetUrl;
  url.searchParams.set('folea-typst-worker', '1');
  return new Worker(url, { type: 'module' });
};
