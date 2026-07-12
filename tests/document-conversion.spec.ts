import { expect, test } from "@playwright/test";
import {
  detectDocumentKind,
  DocumentConversionError,
} from "@/lib/document-conversion";

test("detects supported source document types", () => {
  expect(detectDocumentKind("book.md", "text/markdown")).toBe("markdown");
  expect(detectDocumentKind("book.txt", "text/plain")).toBe("text");
  expect(
    detectDocumentKind(
      "book.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  ).toBe("word");
  expect(detectDocumentKind("book.pdf", "application/pdf")).toBe("pdf");
  expect(detectDocumentKind("book.epub", "application/epub+zip")).toBe("epub");
});

test("rejects unsupported source document types", () => {
  expect(() => detectDocumentKind("cover.png", "image/png")).toThrow(
    DocumentConversionError,
  );
});
