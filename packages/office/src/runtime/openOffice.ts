import type {
  DocumentSession,
  DocumentSource,
  MutableDocumentSession,
  OpenContext,
} from '@filumo/core';
import { abortError, createSession, throwIfAborted } from '@filumo/core';
import { createOfficeFileViewerParseSession } from '../engine/parsing/createParseSession';
import type {
  OfficeFileViewerPreviewHandle,
  OfficeFileViewerPreviewState,
} from '../engine/parsing/internalTypes';
import { createOfficeDocumentSession } from '../engine/session/OfficeDocumentSession';
import type { OfficeOptions } from '../options';
import { createOfficeInteractions } from './createOfficeInteractions';
import { readOfficeFile } from './readOfficeFile';
import type { OfficeInteractionPort } from './interactionTypes';
import { getOfficeDocumentInfo } from './previewMetadata';
import type { OfficeRuntimeData } from './types';

/** 只打开一次旧解析会话，将渐进结果交给新视图，避免桥接再次解析原文件。 */
export async function openOffice(
  source: DocumentSource,
  context: OpenContext,
  options: OfficeOptions,
): Promise<DocumentSession> {
  const file = await readOfficeFile(source, context.signal);
  const legacySession = createOfficeDocumentSession();
  const parser = createOfficeFileViewerParseSession(
    file,
    {
      worker: options.worker ?? 'auto',
      workerFactory: options.workerFactory,
      resourcePolicy: { ...context.resourcePolicy, ...options.resourcePolicy },
    },
    legacySession,
  );
  let current: OfficeFileViewerPreviewState | undefined;
  let finalHandle: OfficeFileViewerPreviewHandle | undefined;
  let closed = false;
  let interactions: OfficeInteractionPort | undefined;
  let session: MutableDocumentSession<OfficeRuntimeData> | undefined;
  let resolveFirst!: (preview: OfficeFileViewerPreviewState) => void;
  let rejectFirst!: (error: unknown) => void;
  const first = new Promise<OfficeFileViewerPreviewState>((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  const accept = (preview: OfficeFileViewerPreviewState) => {
    if (closed) return;
    current = preview;
    interactions?.updateDocument(getOfficeDocumentInfo(preview));
    if (session) {
      session.data.preview = preview;
      session.update({ partialReady: true });
    }
    resolveFirst(preview);
  };
  const stopPartial = parser.subscribePartial(accept);
  const stopProgress = parser.subscribe((progress) =>
    context.reportProgress({
      phase: progress.stage,
      loaded:
        progress.completed ??
        (progress.percent !== undefined ? progress.percent * 100 : undefined),
      total:
        progress.total ?? (progress.percent !== undefined ? 100 : undefined),
    }),
  );
  const cancel = () => {
    parser.cancel();
    rejectFirst(context.signal.reason ?? abortError());
  };
  context.signal.addEventListener('abort', cancel, { once: true });
  const completion = parser.result
    .then(async (handle) => {
      finalHandle = handle;
      if (!closed) context.reportProgress(undefined);
      if (closed) await handle.dispose();
      else accept(handle);
    })
    .catch((cause: unknown) => {
      rejectFirst(cause);
      if (!closed) context.reportProgress(undefined);
      if (session && !closed)
        session.update({
          status: 'error',
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
    });
  if (parser.partialResult) accept(parser.partialResult);
  if (context.signal.aborted) cancel();
  const dispose = async () => {
    if (closed) return;
    closed = true;
    interactions?.dispose();
    context.signal.removeEventListener('abort', cancel);
    stopPartial();
    stopProgress();
    parser.cancel();
    parser.dispose();
    try {
      await finalHandle?.dispose();
    } finally {
      await legacySession.dispose();
    }
    // 非可取消解析可能稍后交付句柄，completion 分支会立即释放它。
    void completion;
  };
  try {
    await first;
    throwIfAborted(context.signal);
    interactions = createOfficeInteractions(current!.previewKind);
    interactions.updateDocument(getOfficeDocumentInfo(current!));
    session = createSession({
      sessionId: context.sessionId,
      signal: context.signal,
      source,
      format: current!.previewKind,
      partialReady: true,
      data: { file, preview: current!, interactions, options },
      dispose,
    });
    return session;
  } catch (error) {
    await dispose();
    throw error;
  }
}
