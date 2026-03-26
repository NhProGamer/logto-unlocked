/**
 * [EXTENDED] Unified storage client for custom UI experience assets.
 *
 * Dispatches between Azure Blob Storage and S3-compatible storage,
 * returning a common interface that both the upload route and
 * the serving middleware can consume interchangeably.
 *
 * The original Azure-only flow is preserved; this module adds S3 support
 * alongside it without removing any existing functionality.
 */

import type { StorageProviderData } from '@logto/schemas';

import { buildAzureStorage } from './azure-storage.js';
import { buildS3Storage } from './s3-storage.js';
import type { UploadFile } from './types.js';

export type ExperienceStorageClient = {
  uploadFile: UploadFile;
  downloadFile: (
    objectKey: string,
    offset?: number,
    count?: number
  ) => Promise<{
    readableStreamBody?: NodeJS.ReadableStream;
    contentLength?: number;
    contentType?: string;
  }>;
  isFileExisted: (objectKey: string) => Promise<boolean>;
  getFileProperties: (objectKey: string) => Promise<{ contentLength?: number }>;
};

/**
 * Build an experience storage client from a StorageProviderData config.
 * Supports AzureStorage and S3Storage providers.
 *
 * @throws {Error} if the provider is not AzureStorage or S3Storage
 */
export const buildExperienceStorage = (config: StorageProviderData): ExperienceStorageClient => {
  if (config.provider === 'AzureStorage') {
    const { connectionString, container } = config;
    return buildAzureStorage(connectionString, container);
  }

  if (config.provider === 'S3Storage') {
    const { endpoint, bucket, accessKeyId, accessSecretKey, region, forcePathStyle } = config;
    return buildS3Storage({
      endpoint,
      bucket,
      accessKeyId,
      secretAccessKey: accessSecretKey,
      region,
      forcePathStyle,
    });
  }

  throw new Error(
    `Unsupported storage provider for experience assets: ${config.provider}. ` +
      'Only AzureStorage and S3Storage are supported.'
  );
};

/**
 * Simple content-type lookup based on file extension.
 * Used when uploading decompressed custom UI assets to S3,
 * where we need to set the Content-Type header ourselves
 * (unlike Azure blob triggers which handle this automatically).
 */
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export const getContentType = (filename: string): string => {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return mimeTypes[ext] ?? 'application/octet-stream';
};
