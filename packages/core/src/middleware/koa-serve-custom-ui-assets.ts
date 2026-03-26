import { isFileAssetPath, parseRange } from '@logto/core-kit';
import { tryThat } from '@silverhand/essentials';
import type { MiddlewareType } from 'koa';

import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
// [EXTENDED] Import kept for Azure flow; experience-storage handles dispatching.
import { buildAzureStorage } from '#src/utils/storage/azure-storage.js';
import { buildExperienceStorage } from '#src/utils/storage/experience-storage.js';
import { getTenantId } from '#src/utils/tenant.js';

import RequestError from '../errors/RequestError/index.js';

const noCache = 'no-cache, no-store, must-revalidate';
const maxAgeSevenDays = 'max-age=604_800_000';

/**
 * Middleware that serves custom UI assets user uploaded previously through sign-in experience settings.
 * If the request path contains a dot, consider it as a file and will try to serve the file directly.
 * Otherwise, redirect the request to the `index.html` page.
 *
 * [EXTENDED] Now supports both Azure Blob Storage and S3-compatible storage.
 * Azure uses the original path format: {tenantId}/{customUiAssetId}/{path}
 * S3 uses a prefixed format: experience/{tenantId}/{customUiAssetId}/{path}
 */
export default function koaServeCustomUiAssets(customUiAssetId: string) {
  // [EXTENDED] Support both Azure and S3 storage providers.
  // Fallback: use storageProviderConfig if experienceBlobsProviderConfig is not set.
  const { experienceBlobsProviderConfig, storageProviderConfig } = SystemContext.shared;
  const storageConfig = experienceBlobsProviderConfig ?? storageProviderConfig;

  // Original assertion (kept for reference):
  // assertThat(experienceBlobsProviderConfig?.provider === 'AzureStorage', 'storage.not_configured');
  assertThat(storageConfig, 'storage.not_configured');

  // Determine if we are using the Azure-dedicated blobs container (original path format)
  // or a generic S3/shared bucket (prefixed path format).
  const isAzureDedicatedBlobs =
    experienceBlobsProviderConfig?.provider === 'AzureStorage';

  const serve: MiddlewareType = async (ctx, next) => {
    const [tenantId] = await getTenantId(ctx.URL);
    assertThat(tenantId, 'session.not_found', 404);

    let downloadFile: (
      objectKey: string,
      offset?: number,
      count?: number
    ) => Promise<{
      readableStreamBody?: NodeJS.ReadableStream;
      contentLength?: number;
      contentType?: string;
    }>;
    let isFileExisted: (objectKey: string) => Promise<boolean>;
    let getFileProperties: (objectKey: string) => Promise<{ contentLength?: number }>;

    if (isAzureDedicatedBlobs) {
      // --- Azure flow: use dedicated blobs container ---
      const { container, connectionString } = experienceBlobsProviderConfig;
      const azure = buildAzureStorage(connectionString, container);
      downloadFile = azure.downloadFile;
      isFileExisted = azure.isFileExisted;
      getFileProperties = azure.getFileProperties;
    } else {
      // --- S3 / generic flow: use experience-storage dispatcher ---
      const storage = buildExperienceStorage(storageConfig);
      downloadFile = storage.downloadFile;
      isFileExisted = storage.isFileExisted;
      getFileProperties = storage.getFileProperties;
    }

    // Azure dedicated blobs: {tenantId}/{customUiAssetId}/...
    // S3 shared bucket:      experience/{tenantId}/{customUiAssetId}/...
    const contextPath = isAzureDedicatedBlobs
      ? `${tenantId}/${customUiAssetId}`
      : `experience/${tenantId}/${customUiAssetId}`;

    const requestPath = ctx.request.path;
    const isFileAssetRequest = isFileAssetPath(requestPath);

    const fileObjectKey = `${contextPath}${isFileAssetRequest ? requestPath : '/index.html'}`;
    const isExisted = await isFileExisted(fileObjectKey);
    assertThat(isExisted, 'entity.not_found', 404);

    const range = ctx.get('range');
    const { start, end, count } = tryThat(
      () => parseRange(range),
      new RequestError({ code: 'request.range_not_satisfiable', status: 416 })
    );

    const [
      { contentLength = 0, readableStreamBody, contentType },
      { contentLength: totalFileSize = 0 },
    ] = await Promise.all([
      downloadFile(fileObjectKey, start, count),
      getFileProperties(fileObjectKey),
    ]);

    ctx.body = readableStreamBody;
    ctx.type = contentType ?? 'application/octet-stream';
    ctx.status = range ? 206 : 200;

    ctx.set('Cache-Control', isFileAssetRequest ? maxAgeSevenDays : noCache);
    ctx.set('Content-Length', contentLength.toString());
    if (range) {
      ctx.set('Accept-Ranges', 'bytes');
      ctx.set(
        'Content-Range',
        `bytes ${start ?? 0}-${end ?? Math.max(totalFileSize - 1, 0)}/${totalFileSize}`
      );
    }

    return next();
  };

  return serve;
}
