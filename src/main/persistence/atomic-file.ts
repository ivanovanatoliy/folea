import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const temporaryPathFor = (filePath: string): string =>
  path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  );

export const atomicWriteString = async (filePath: string, content: string): Promise<void> => {
  const temporaryPath = temporaryPathFor(filePath);

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporaryPath, content, 'utf8');
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

export const atomicWriteJson = (filePath: string, data: unknown): Promise<void> =>
  atomicWriteString(filePath, JSON.stringify(data, null, 2));

export const readJsonFile = async (filePath: string): Promise<unknown> =>
  JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
