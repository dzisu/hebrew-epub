import { expect, test } from "@playwright/test";
import {
  isProbablyHebrewText,
  sanitizeMarkdownLinks,
} from "@/lib/article-extraction";

test("detects Hebrew content before translation", () => {
  expect(
    isProbablyHebrewText("זהו טקסט עברי ברור עם כמה מילים באנגלית כמו BIM ו-Autodesk."),
  ).toBe(true);
  expect(
    isProbablyHebrewText("This is an English article about construction and project delivery."),
  ).toBe(false);
});

test("removes fragment-only Markdown links that break EPUBCheck", () => {
  expect(
    sanitizeMarkdownLinks(
      "ראו [מפת מיקום](#tabs-1-1), הערה [\\[1\\]](#cite_note-1), וקישור [עיר](https://example.com/page#section \"כותרת\").",
    ),
  ).toBe(
    "ראו מפת מיקום, הערה [1], וקישור [עיר](https://example.com/page \"כותרת\").",
  );
});
