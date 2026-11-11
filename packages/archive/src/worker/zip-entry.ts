import { ZipReader } from '../reader/zip/ZipReader';
import { startArchiveWorker } from './startArchiveWorker';

// 专用 Worker 只连接 ZIP 读取器，其他压缩后端不会进入此依赖图。
startArchiveWorker(async (context) => {
  if (context.format !== 'zip') throw new Error('当前入口仅支持 ZIP 文件');
  return new ZipReader(context);
});
