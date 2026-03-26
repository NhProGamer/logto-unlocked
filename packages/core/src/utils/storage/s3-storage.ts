import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { type Readable } from 'node:stream';

import type { UploadFile } from './types.js';

const getRegionFromEndpoint = (endpoint?: string) => {
  if (!endpoint) {
    return;
  }

  return /s3\.([^.]*)\.amazonaws/.exec(endpoint)?.[1];
};

type BuildS3StorageParameters = {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
};

export const buildS3Storage = ({
  bucket,
  accessKeyId,
  secretAccessKey,
  region,
  endpoint,
  forcePathStyle,
}: BuildS3StorageParameters) => {
  if (!region && !endpoint) {
    throw new Error('Either region or endpoint must be provided');
  }

  // Endpoint example: s3.us-west-2.amazonaws.com
  const finalRegion = region ?? getRegionFromEndpoint(endpoint) ?? 'us-east-1';

  const client = new S3Client({
    region: finalRegion,
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const uploadFile: UploadFile = async (data, objectKey, { contentType, publicUrl } = {}) => {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: data,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await client.send(command);

    if (publicUrl) {
      return { url: `${publicUrl}/${objectKey}` };
    }

    if (endpoint) {
      // Custom endpoint URL construction
      if (forcePathStyle) {
        // Path-style URL: https://endpoint/bucket/key
        return {
          url: `${endpoint}/${bucket}/${objectKey}`,
        };
      }
      // Virtual-hosted style URL: https://bucket.endpoint/key
      return {
        url: `${endpoint.replace(/^(https?:\/\/)/, `$1${bucket}.`)}/${objectKey}`,
      };
    }

    // AWS S3 standard URL construction
    if (forcePathStyle) {
      // Path-style URL: https://s3.region.amazonaws.com/bucket/key
      return {
        url: `https://s3.${finalRegion}.amazonaws.com/${bucket}/${objectKey}`,
      };
    }
    // Virtual-hosted style URL: https://bucket.s3.region.amazonaws.com/key
    return {
      url: `https://${bucket}.s3.${finalRegion}.amazonaws.com/${objectKey}`,
    };
  };

  // [EXTENDED] Download a file from S3 with optional byte range support.
  // Returns an interface compatible with Azure's BlobDownloadResponseParsed
  // so that callers (e.g. koa-serve-custom-ui-assets) can use the same code path.
  const downloadFile = async (
    objectKey: string,
    offset?: number,
    count?: number
  ): Promise<{
    readableStreamBody?: NodeJS.ReadableStream;
    contentLength?: number;
    contentType?: string;
  }> => {
    const rangeHeader =
      offset !== undefined || count !== undefined
        ? `bytes=${offset ?? 0}-${count !== undefined && offset !== undefined ? offset + count - 1 : ''}`
        : undefined;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Range: rangeHeader,
    });

    const response = await client.send(command);

    return {
      readableStreamBody: response.Body as Readable | undefined,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
    };
  };

  // [EXTENDED] Check if a file exists in S3.
  const isFileExisted = async (objectKey: string): Promise<boolean> => {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      });
      await client.send(command);
      return true;
    } catch (error: unknown) {
      // S3 returns a 404 NotFound error when the object does not exist.
      // The error name/code varies by SDK version, so we check broadly.
      if (
        error instanceof Error &&
        ('name' in error && (error.name === 'NotFound' || error.name === '404')) ||
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw error;
    }
  };

  // [EXTENDED] Get file properties (content length) from S3.
  // Returns an interface compatible with Azure's BlobGetPropertiesResponse.
  const getFileProperties = async (
    objectKey: string
  ): Promise<{ contentLength?: number }> => {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const response = await client.send(command);
    return {
      contentLength: response.ContentLength,
    };
  };

  // [EXTENDED] Delete a file from S3.
  const deleteFile = async (objectKey: string): Promise<void> => {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    await client.send(command);
  };

  return { uploadFile, downloadFile, isFileExisted, getFileProperties, deleteFile };
};
