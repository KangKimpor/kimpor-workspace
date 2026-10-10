import katex from "katex";
import "katex/dist/katex.min.css";
export function renderMath(expression: string, element: HTMLElement): void {
  katex.render(expression, element, {
    displayMode: true,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    output: "htmlAndMathml",
    maxExpand: 1000,
  });
}
