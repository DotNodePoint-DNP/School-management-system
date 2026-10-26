import { randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';

type Kind = 'LOGO' | 'SEAL' | 'SIGNATURE';

export const IMAGE_RULES = {
  LOGO: { maxBytes: 1_048_576, maxWidth: 1000, maxHeight: 1000, minSide: 64 },
  SEAL: { maxBytes: 1_048_576, maxWidth: 1000, maxHeight: 1000, minSide: 64 },
  SIGNATURE: { maxBytes: 524_288, maxWidth: 1000, maxHeight: 500, minSide: 40 },
} as const;

const MAX_INPUT_SIDE = 4000;
const MAX_INPUT_PIXELS = 16_000_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isPng = (b: Buffer): boolean =>
  b.length >= 8 && b.subarray(0, 8).equals(PNG_MAGIC);
const isJpeg = (b: Buffer): boolean =>
  b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export interface StoredImage {
  id: string;
  sha256: string;
  width: number;
  height: number;
}

@Injectable()
export class SchoolImagesService {
  private readonly logger = new Logger(SchoolImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Validates an upload by its real bytes, re-encodes it to a clean PNG (this strips hidden metadata such as
   * camera location and applies phone-photo rotation), stores it, and records it. SVG is refused: it can carry scripts.
   */
  async storeImage(
    kind: Kind,
    input: Buffer | undefined,
    uploadedById: string,
  ): Promise<StoredImage> {
    const rule = IMAGE_RULES[kind];
    if (!input || input.length === 0)
      throw new BadRequestException('Attach an image in the "file" field');
    if (input.length > rule.maxBytes)
      throw new PayloadTooLargeException(
        `The image is larger than ${rule.maxBytes / 1024} KB`,
      );
    if (!isPng(input) && !isJpeg(input))
      throw new BadRequestException('Only PNG or JPEG images are accepted');

    let normalised: { data: Buffer; width: number; height: number };
    try {
      const options = {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error' as const,
      };
      const meta = await sharp(input, options).metadata();
      if (meta.format !== 'png' && meta.format !== 'jpeg')
        throw new BadRequestException('Only PNG or JPEG images are accepted');
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (Math.min(width, height) < rule.minSide) {
        throw new BadRequestException(
          `The image is too small (at least ${rule.minSide} pixels on its shorter side)`,
        );
      }
      if (Math.max(width, height) > MAX_INPUT_SIDE) {
        throw new BadRequestException(
          `The image is too large (at most ${MAX_INPUT_SIDE} pixels on its longer side)`,
        );
      }
      const out = await sharp(input, options)
        .rotate() // apply the camera orientation, then drop the metadata
        .resize({
          width: rule.maxWidth,
          height: rule.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });
      normalised = {
        data: out.data,
        width: out.info.width,
        height: out.info.height,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('That file could not be read as an image');
    }

    const key = `school/${kind.toLowerCase()}/${randomUUID()}.png`;
    const sha256 = createHash('sha256').update(normalised.data).digest('hex');
    await this.storage.put(key, normalised.data, 'image/png'); // 503 if storage is down; nothing is recorded
    try {
      const row = await this.prisma.storedFile.create({
        data: {
          kind,
          objectKey: key,
          contentType: 'image/png',
          sizeBytes: normalised.data.length,
          width: normalised.width,
          height: normalised.height,
          sha256,
          uploadedById,
        },
        select: { id: true },
      });
      return {
        id: row.id,
        sha256,
        width: normalised.width,
        height: normalised.height,
      };
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  /** Removes a file that was stored but never linked to anything. Linked files are kept for history. */
  async discard(fileId: string): Promise<void> {
    try {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: fileId },
        select: { objectKey: true },
      });
      if (!file) return;
      await this.prisma.storedFile.delete({ where: { id: fileId } });
      await this.storage.delete(file.objectKey);
    } catch (error) {
      this.logger.warn(
        `Could not discard file ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** The bytes of a stored file, or null if the record or the object is missing. */
  async read(
    fileId: string,
  ): Promise<{ data: Buffer; contentType: string; sha256: string } | null> {
    const file = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { objectKey: true, contentType: true, sha256: true },
    });
    if (!file) return null;
    const data = await this.storage.get(file.objectKey);
    return data
      ? { data, contentType: file.contentType, sha256: file.sha256 }
      : null;
  }
}
