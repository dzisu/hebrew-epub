# Hebrew EPUB

Hebrew EPUB is a web application for converting documents into Hebrew-friendly EPUB books with RTL reading behavior.

This project is a fork of [`lingdocs/rtl-epub-maker`](https://github.com/lingdocs/rtl-epub-maker). The fork starts from the original Pandoc-based RTL EPUB workflow and will evolve toward a Hebrew-first document-to-EPUB tool.

## Goals

- Generate EPUB files that are comfortable to read in Hebrew ebook reader apps.
- Use RTL metadata and page progression.
- Use Frank Ruhl Libre as the target Hebrew reading typeface.
- Follow EPUB 3.3 requirements.
- Validate final EPUB output with EpubCheck.
- Support more source formats over time, including Markdown, PDF, existing EPUB, Hebrew documents, and other-language documents translated to Hebrew.

## Current Status

Bootstrap fork.

Implemented so far:

- Forked from `lingdocs/rtl-epub-maker`.
- Renamed package to `hebrew-epub`.
- Hebrew is now the default language metadata.
- Reader-safe Hebrew RTL output is enforced through OPF spine metadata and XHTML `html`/`body` direction attributes.
- Frank Ruhl Libre is embedded inside generated EPUB packages.
- Hebrew RTL conversion workspace with upload, metadata, status, and download flow.
- Backend document normalization for Markdown, TXT, DOC/DOCX, text-based PDF, and EPUB.
- URL article import with readable-content extraction, image preparation, and automatic Hebrew translation.
- Automatic Hebrew detection skips translation when the source content is already Hebrew.
- EPUB validation script for EpubCheck plus Yomu-oriented RTL structure checks.
- Clear scanned-PDF error path when a PDF has no extractable text layer.

Not implemented yet:

- Production authentication.
- Full messy-book restructuring with chapter detection and structural cleanup.
- OCR for scanned PDFs.

## Running Locally

Requirements:

- Node.js
- Pandoc

Install and run:

```sh
npm install
npm run dev
```

Production build:

```sh
npm run build
npm run start
```

## Docker

The inherited Docker setup builds a Next.js app with Pandoc available in the runtime image.

```sh
docker build . -t hebrew-epub
docker run -p 127.0.0.1:3001:3001 hebrew-epub
```

## EPUB 3.3 Quality Gate

The project target is to release only EPUB files that pass W3C EpubCheck with zero errors.

Validate a generated EPUB file:

```sh
npm run check:epub -- path/to/book.epub
```

The validation script runs EpubCheck when `EPUBCHECK_JAR` is set or when `/tmp/epubcheck-5.3.0/epubcheck.jar` exists. It always checks the EPUB container for Hebrew reader requirements:

- `dc:language` is `he`.
- `<spine page-progression-direction="rtl">` is present.
- Every XHTML file has `html` and `body` RTL direction metadata.
- Text XHTML bodies are not empty.
- EPUB CSS does not include forbidden `direction`, remote `@import`, or reader-hostile fixed layout rules.

## Privacy

Uploaded documents are processed server-side and should be treated as sensitive runtime data. Do not deploy this app publicly without access control.

## License

The upstream project is licensed under the MIT License.
