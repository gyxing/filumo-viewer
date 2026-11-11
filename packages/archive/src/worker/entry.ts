import { openArchiveReader } from '../reader/openArchiveReader';
import { startArchiveWorker } from './startArchiveWorker';

startArchiveWorker(openArchiveReader);
