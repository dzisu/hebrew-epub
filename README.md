# Hebrew EPUB

Hebrew EPUB is a web application for converting documents into Hebrew-friendly EPUB books with RTL reading behavior.

This project is a fork of [`lingdocs/rtl-epub-maker`](https://github.com/lingdocs/rtl-epub-maker). The fork starts from the original Pandoc-based RTL EPUB workflow and evolves it into a Hebrew-first document, article, and existing-EPUB conversion tool.

## Goals

- Generate EPUB files that are comfortable to read in Hebrew ebook reader apps.
- Use RTL metadata and page progression.
- Use Frank Ruhl Libre as the target Hebrew reading typeface.
- Follow EPUB 3.3 requirements.
- Validate final EPUB output with EpubCheck.
- Always generate Hebrew output.
- Skip translation automatically when the source is already Hebrew.
- Translate non-Hebrew sources to Hebrew automatically when translation credentials are configured.
- Support Markdown, TXT, DOC/DOCX/ODT/RTF, text-based PDF, existing EPUB, and article URL sources.

## Current Status

Active public preview.

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
- Existing EPUB round-trip cleanup: extracted media, safe image inlining, internal XHTML anchor cleanup, and broken image/SVG reference removal.
- Download guard that only saves responses with `application/epub+zip`.
- Clear scanned-PDF error path when a PDF has no extractable text layer.

Not implemented yet:

- Production authentication.
- Full messy-book restructuring with chapter detection and structural cleanup.
- OCR for scanned PDFs.
- UI display of validation details before download.

## Running Locally

Requirements:

- Node.js
- Pandoc
- `pdftotext` from Poppler for text-layer PDF import
- Optional: EpubCheck jar for full standards validation

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

## Existing EPUB Import

Existing EPUB files are converted through a regeneration pipeline:

1. Pandoc converts the source EPUB to Markdown and extracts packaged media.
2. Safe local images are embedded as data URIs before temporary files are deleted.
3. Raw SVG wrappers, Pandoc placeholders, and internal XHTML anchors are removed from the intermediate Markdown.
4. The final EPUB packaging pass removes image/SVG references to missing package resources.

This prevents common blank-page failures caused by orphaned `cover.jpg` references or internal XHTML anchors that become empty chapter files.

## URL Import And Translation

Article URLs are extracted server-side. Hebrew content is left as Hebrew, while non-Hebrew content is translated to Hebrew when the Azure Translator environment variables are available. Secrets must remain in environment files and must never be committed.

## Privacy

Uploaded documents are processed server-side and should be treated as sensitive runtime data. Do not deploy this app publicly without access control.

## License

The upstream project is licensed under the MIT License.
