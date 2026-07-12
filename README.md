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
- Basic Hebrew RTL page direction is enabled.
- Frank Ruhl Libre is set as the baseline UI and EPUB CSS font target.

Not implemented yet:

- PDF import.
- Existing EPUB import.
- Translation workflow.
- EpubCheck integration.
- Production authentication.
- Font embedding inside the EPUB package.

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

EpubCheck integration is planned but not yet implemented in this bootstrap commit.

## Privacy

Uploaded documents are processed server-side and should be treated as sensitive runtime data. Do not deploy this app publicly without access control.

## License

The upstream project is licensed under the MIT License.
