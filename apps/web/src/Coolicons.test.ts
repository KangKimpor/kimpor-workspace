import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import * as icons from "./Coolicons";

test("Coolicons retain geometry, caller sizing and accessible button labels", () => {
  for (const Icon of Object.values(icons)) {
    const svg = renderToStaticMarkup(createElement(Icon, { size: 20, className: "test-icon" }));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('width="20" height="20"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('class="test-icon"');
    expect(svg).toContain('<path');
    expect(svg).toContain('currentColor');
    expect(svg).not.toContain('stroke="black"');
  }
});
