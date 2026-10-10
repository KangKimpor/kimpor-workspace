import { expect, it } from "vitest";
import fc from "fast-check";
import { compareOrder, orderBetween } from "./order";
it("keeps exact positions between neighbors through repeated insertions", () => {
  fc.assert(
    fc.property(
      fc.array(fc.nat(), { minLength: 1, maxLength: 250 }),
      (moves) => {
        const ranks: string[] = [];
        for (const move of moves) {
          const i = move % (ranks.length + 1);
          const rank = orderBetween(ranks[i - 1] ?? null, ranks[i] ?? null);
          ranks.splice(i, 0, rank);
        }
        for (let i = 1; i < ranks.length; i++)
          expect(compareOrder(ranks[i - 1], ranks[i])).toBe(-1);
      },
    ),
  );
});
it("supports legacy integer ranks and rejects reversed boundaries", () => {
  expect(compareOrder(10, "10/1")).toBe(0);
  expect(compareOrder(null, "1/1")).toBe(-1);
  expect(compareOrder("3/2", "1/1")).toBe(1);
  expect(orderBetween(null, null)).toBe("0/1");
  expect(orderBetween(null, "0/1")).toBe("-1/1");
  expect(orderBetween("0/1", null)).toBe("1/1");
  expect(() => orderBetween("1/1", "0/1")).toThrow();
});
