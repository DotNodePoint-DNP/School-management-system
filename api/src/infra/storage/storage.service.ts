import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A storage backend. Another provider is one more class here; nothing else changes. */
interface Driver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const TIMEOUT_MS = 15_000;

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}

class R2Driver implements Driver {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      region: 'auto', // required by the SDK, not used by R2
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      // Only add checksums when an operation requires them; keeps requests simple for an S3-compatible service.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        {
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      return res.Body
        ? Buffer.from(await res.Body.transformToByteArray())
        : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  }
}

/** Development only: files vanish when the server restarts. */
class MemoryDriver implements Driver {
  private readonly files = new Map<string, Buffer>();
  put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
    return Promise.resolve();
  }
  get(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

class DisabledDriver implements Driver {
  put(): Promise<void> {
    return Promise.reject(new Error('File storage is not configured'));
  }
  get(): Promise<Buffer | null> {
    return Promise.reject(new Error('File storage is not configured'));
  }
  delete(): Promise<void> {
    return Promise.reject(new Error('File storage is not configured'));
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: Driver;

  constructor(config: ConfigService) {
    const name = config.getOrThrow<string>('STORAGE_DRIVER');
    if (name === 'r2') {
      this.driver = new R2Driver(
        config.getOrThrow<string>('R2_BUCKET'),
        config.getOrThrow<string>('R2_ACCOUNT_ID'),
        config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      );
    } else if (name === 'memory') {
      this.driver = new MemoryDriver();
    } else {
      this.driver = new DisabledDriver();
    }
  }

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.run('put', () => this.driver.put(key, body, contentType));
  }

  get(key: string): Promise<Buffer | null> {
    return this.run('get', () => this.driver.get(key));
  }

  delete(key: string): Promise<void> {
    return this.run('delete', () => this.driver.delete(key));
  }

  private async run<T>(
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      this.logger.error(
        `Storage ${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'File storage is unavailable. Try again shortly.',
      );
    }
  }
}
