import { abortError } from '@filumo/core';
import type { ViewerCapabilities } from '@filumo/dom';

/** 子文件能力保持原来的语义与排序，过期回调不能作用于后来打开的文件。 */
export function projectCapabilities(
  source: ViewerCapabilities,
  current: () => boolean,
): ViewerCapabilities {
  const check = () => {
    if (!current()) throw abortError();
  };
  const asyncCall =
    <T>(run: (value: T) => Promise<void>) =>
    async (value: T) => {
      check();
      await run(value);
    };
  return {
    actions: source.actions?.map((action) => ({
      ...action,
      id: 'archive.entry.' + action.id,
      run(value) {
        check();
        return action.run(value);
      },
    })),
    zoom: source.zoom
      ? {
          ...source.zoom,
          set: asyncCall<number>((value) => source.zoom!.set(value)),
          mode: source.zoom.mode
            ? {
                ...source.zoom.mode,
                set: asyncCall<string>((value) =>
                  source.zoom!.mode!.set(value),
                ),
              }
            : undefined,
        }
      : undefined,
    navigation: source.navigation
      ? {
          ...source.navigation,
          goTo: asyncCall<number>((value) => source.navigation!.goTo(value)),
        }
      : undefined,
    search: source.search
      ? {
          ...source.search,
          setQuery: asyncCall<string>((value) =>
            source.search!.setQuery(value),
          ),
          async next() {
            check();
            await source.search!.next();
          },
          async previous() {
            check();
            await source.search!.previous();
          },
        }
      : undefined,
    download: source.download
      ? {
          ...source.download,
          async run() {
            check();
            await source.download!.run();
          },
        }
      : undefined,
  };
}
