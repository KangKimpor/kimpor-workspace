export {};

interface SearchItem {
  id: string;
  type: string;
  title: string;
  text: string;
  date?: string | null;
}
let items: (SearchItem & { content: string; searchTitle: string })[] = [];
const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
function tokens(text: string): string[] {
  return [...segmenter.segment(text.normalize("NFKC").toLocaleLowerCase())]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment);
}
self.onmessage = (
  event: MessageEvent<{
    kind: "index" | "search";
    items?: SearchItem[];
    requestId?: number;
    query?: string;
    type?: string;
    after?: string;
    before?: string;
  }>,
) => {
  const message = event.data;
  if (message.kind === "index") {
    items = (message.items ?? []).map((item) => ({
      ...item,
      content: `${item.title} ${item.text}`.normalize("NFKC").toLocaleLowerCase(),
      searchTitle: item.title.toLocaleLowerCase(),
    }));
    return;
  }
  const words = tokens(message.query ?? "");
  const results = items
    .filter(
      (item) =>
        (!message.type || item.type === message.type) &&
        (!message.after || (item.date ?? "") >= message.after) &&
        (!message.before || (item.date ?? "") <= message.before),
    )
    .map((item) => {
      return {
        id: item.id,
        score: words.every((word) => item.content.includes(word))
          ? words.reduce(
              (total, word) =>
                total + (item.searchTitle.includes(word) ? 3 : 1),
              0,
            ) + 1
          : 0,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 100)
    .map((result) => result.id);
  self.postMessage({ requestId: message.requestId, ids: results });
};
