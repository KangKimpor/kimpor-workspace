import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
const highlighter = createLowlight({ javascript, json, css, xml, python, sql });
export function highlightCode(text: string, language: string) {
  return highlighter.highlight(
    highlighter.registered(language) ? language : "javascript",
    text,
  );
}
