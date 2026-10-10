export interface SearchItem {
  id: string;
  type: string;
  title: string;
  text: string;
  date?: string | null;
}
export class LocalSearch {
  private worker = new Worker(new URL("./search.worker.ts", import.meta.url), {
    type: "module",
  });
  private next = 0;
  private pending = new Map<number, (ids: string[]) => void>();
  constructor() {
    this.worker.onmessage = (
      event: MessageEvent<{ requestId: number; ids: string[] }>,
    ) => {
      this.pending.get(event.data.requestId)?.(event.data.ids);
      this.pending.delete(event.data.requestId);
    };
  }
  index(items: SearchItem[]) {
    this.worker.postMessage({ kind: "index", items });
  }
  search(
    query: string,
    filters: { type?: string; after?: string; before?: string } = {},
  ): Promise<string[]> {
    const requestId = ++this.next;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      this.worker.postMessage({ kind: "search", query, requestId, ...filters });
    });
  }
  dispose() {
    this.worker.terminate();
    this.pending.forEach((resolve) => resolve([]));
    this.pending.clear();
  }
}
