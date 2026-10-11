import { FivoError, throwIfAborted } from '@fivo/core';
import type { PreviewKind } from '../engine/preview';

/** 无名称输入只检查容器目录，不解析页面内容；目录读取结束立即释放。 */
export async function inferOfficeKind(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<PreviewKind> {
  throwIfAborted(signal);
  let names: string[];
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { ZipReader, Uint8ArrayReader } = await import('@zip.js/zip.js');
    const reader = new ZipReader(new Uint8ArrayReader(bytes), {
      useWebWorkers: false,
    });
    try {
      names = [];
      for await (const entry of reader.getEntriesGenerator()) {
        throwIfAborted(signal);
        names.push(entry.filename.toLowerCase());
      }
    } finally {
      await reader.close();
    }
    throwIfAborted(signal);
    if (names.includes('word/document.xml')) return 'docx';
    if (names.includes('xl/workbook.xml')) return 'xlsx';
    if (names.includes('ppt/presentation.xml')) return 'pptx';
  } else {
    const { openCfbRandomAccess } = await import('../engine/cfb');
    const { createBlobRandomAccessSource } = await import('../engine/io');
    const reader = await openCfbRandomAccess(
      createBlobRandomAccessSource(new Blob([bytes])),
      signal,
    );
    try {
      if (reader.hasEntry('EncryptedPackage'))
        throw new FivoError('ENCRYPTED_FILE', '暂不支持加密 Office 文件');
      if (reader.hasEntry('WordDocument')) return 'doc';
      if (reader.hasEntry('Workbook') || reader.hasEntry('Book')) return 'xls';
      if (reader.hasEntry('PowerPoint Document')) return 'ppt';
    } finally {
      await reader.close();
    }
  }
  throw new FivoError('UNSUPPORTED_FORMAT', '容器不包含支持的 Office 文档');
}
