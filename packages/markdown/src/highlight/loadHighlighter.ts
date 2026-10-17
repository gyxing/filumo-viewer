import type { HLJSApi } from 'highlight.js';
import { languages, normalizeLanguage } from './languages';
export interface Highlighter {
  highlight(code: string, language: string): { html: string };
}
let core: Promise<HLJSApi> | undefined;
const loaded = new Map<string, Promise<Highlighter>>();
/** 可见代码块才调用；失败 Promise 清除后允许显式重试。 */
export async function loadHighlighter(
  language: string,
): Promise<Highlighter | undefined> {
  const name = normalizeLanguage(language);
  if (!name) return undefined;
  let promise = loaded.get(name);
  if (!promise) {
    if (!core)
      core = import('highlight.js/lib/core').then((module) =>
        module.default.newInstance(),
      );
    const runtimePromise = core;
    promise = Promise.all([
      runtimePromise,
      languages[name](),
      import('./highlight.less'),
    ]).then(([runtime, grammar]) => {
      runtime.registerLanguage(name, grammar.default);
      return {
        highlight: (code: string) => ({
          html: runtime.highlight(code, {
            language: name,
            ignoreIllegals: true,
          }).value,
        }),
      };
    });
    loaded.set(name, promise);
    void promise.catch(() => {
      loaded.delete(name);
      if (core === runtimePromise) core = undefined;
    });
  }
  return promise;
}
