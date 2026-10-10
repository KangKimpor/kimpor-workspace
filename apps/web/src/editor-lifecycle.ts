const flushers = new Set<() => Promise<void>>();
export function registerEditorFlush(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}
/** Navigation and export wait until every open document has reached durable local storage. */
export async function flushEditors(): Promise<void> {
  await Promise.all([...flushers].map((flush) => flush()));
}
