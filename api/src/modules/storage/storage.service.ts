import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageDriver } from '../../common/db';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AppConfig } from '../../common/config/configuration';

export interface StoredObject {
  driver: StorageDriver;
  key: string;
  size: number;
  /** sha256 hex of the bytes as written. */
  checksum: string;
}

/**
 * Content-addressed blob storage.
 *
 * Keys are date-partitioned (yyyy/mm/uuid.ext) rather than derived from the
 * user-supplied filename: filenames are attacker-controlled and would let a
 * crafted name escape the storage root or collide with another tenant's file.
 * The original name lives in the database, where it belongs.
 *
 * Objects are never overwritten. A new document version writes a new key,
 * which is what makes version restore and recycle-bin recovery (feature 24)
 * possible at all.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly rootDir: string;

  constructor(private readonly config: ConfigService<{ app: AppConfig }, true>) {
    const app = this.config.get('app', { infer: true });
    this.driver = app.storage.driver === 's3' ? StorageDriver.S3 : StorageDriver.LOCAL;
    this.rootDir = path.resolve(process.cwd(), app.storage.localDir);
  }

  /** Writes a buffer and returns its storage descriptor. */
  async putBuffer(buffer: Buffer, originalName: string): Promise<StoredObject> {
    return this.putStream(Readable.from(buffer), originalName);
  }

  async putStream(stream: Readable, originalName: string): Promise<StoredObject> {
    if (this.driver === StorageDriver.S3) {
      throw new InternalServerErrorException(
        'S3 storage driver is not implemented yet. Set STORAGE_DRIVER=local, or implement putStream in storage.service.ts using @aws-sdk/lib-storage Upload.',
      );
    }

    const key = this.generateKey(originalName);
    const absolute = this.resolveKey(key);
    await mkdir(path.dirname(absolute), { recursive: true });

    const hash = createHash('sha256');
    let size = 0;

    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });

    try {
      await pipeline(stream, createWriteStream(absolute));
    } catch (err) {
      // Do not leave a half-written object behind for the indexer to find.
      await rm(absolute, { force: true }).catch(() => undefined);
      throw err;
    }

    return { driver: this.driver, key, size, checksum: hash.digest('hex') };
  }

  /** Opens a read stream. Callers are responsible for destroying it. */
  async getStream(key: string): Promise<Readable> {
    const absolute = this.resolveKey(key);
    try {
      await stat(absolute);
    } catch {
      throw new NotFoundException('Stored object is missing');
    }
    return createReadStream(absolute);
  }

  async getSize(key: string): Promise<number> {
    const info = await stat(this.resolveKey(key));
    return info.size;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Physically removes an object. Only the purge job should call this - normal
   * deletes are soft, so that feature 24 has something to recover.
   */
  async destroy(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
    this.logger.warn(`Purged storage object ${key}`);
  }

  private generateKey(originalName: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = path.extname(originalName).slice(0, 12).replace(/[^A-Za-z0-9.]/g, '');
    return `${yyyy}/${mm}/${randomUUID()}${ext}`;
  }

  /**
   * Resolves a key to an absolute path and refuses anything that escapes the
   * storage root. Keys are generated internally, but this stays as a hard stop
   * in case a key ever reaches here from a request or a restored backup.
   */
  private resolveKey(key: string): string {
    const absolute = path.resolve(this.rootDir, key);
    const root = this.rootDir.endsWith(path.sep) ? this.rootDir : this.rootDir + path.sep;
    if (!absolute.startsWith(root)) {
      throw new InternalServerErrorException('Refusing to access a path outside the storage root');
    }
    return absolute;
  }
}
