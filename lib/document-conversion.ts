import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export type SourceDocumentKind =
  | "markdown"
  | "text"
  | "word"
  | "pdf"
  | "epub";

export type ConversionResult = {
  markdown: string;
  source: {
    kind: SourceDocumentKind;
    originalName: string;
    mimeType?: string;
  };
};

export class DocumentConversionError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DocumentConversionError";
    this.code = code;
    this.status = status;
  }
}

type UploadedDocument = {
  name: string;
  type?: string;
  bytes: Buffer;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

const PANDOC_INPUT_EXTENSIONS = new Set([".doc", ".docx", ".odt", ".rtf"]);

export async function convertUploadedDocumentToMarkdown(
  upload: UploadedDocument,
): Promise<ConversionResult> {
  const kind = detectDocumentKind(upload.name, upload.type);
  const workDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "hebrew-epub-upload-"),
  );
  const inputPath = path.join(
    workDir,
    `source${path.extname(upload.name) || extensionForKind(kind)}`,
  );

  try {
    await fs.promises.writeFile(inputPath, upload.bytes);
    const markdown = await convertFileToMarkdown(inputPath, kind);

    return {
      markdown,
      source: {
        kind,
        originalName: upload.name,
        mimeType: upload.type || undefined,
      },
    };
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

export function detectDocumentKind(
  fileName: string,
  mimeType?: string,
): SourceDocumentKind {
  const ext = path.extname(fileName).toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (ext === ".md" || ext === ".markdown" || mime === "text/markdown") {
    return "markdown";
  }

  if (ext === ".txt" || mime.startsWith("text/plain")) {
    return "text";
  }

  if (
    PANDOC_INPUT_EXTENSIONS.has(ext) ||
    mime === "application/msword" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }

  if (ext === ".pdf" || mime === "application/pdf") {
    return "pdf";
  }

  if (ext === ".epub" || mime === "application/epub+zip") {
    return "epub";
  }

  throw new DocumentConversionError(
    "UNSUPPORTED_FILE_TYPE",
    "Unsupported file type. Please upload Markdown, TXT, DOC, DOCX, textual PDF, or EPUB.",
    415,
  );
}

async function convertFileToMarkdown(
  inputPath: string,
  kind: SourceDocumentKind,
): Promise<string> {
  switch (kind) {
    case "markdown":
    case "text":
      return fs.promises.readFile(inputPath, "utf8");
    case "word":
      return convertWithPandoc(inputPath);
    case "epub":
      return convertWithPandoc(inputPath, "epub");
    case "pdf":
      return extractTextFromPdf(inputPath);
  }
}

async function convertWithPandoc(inputPath: string, from?: string) {
  const outputPath = path.join(path.dirname(inputPath), `${randomUUID()}.md`);
  const args = ["-s", inputPath, "-t", "markdown", "-o", outputPath];

  if (from) {
    args.splice(2, 0, "-f", from);
  }

  try {
    await runCommand("pandoc", args);
    return fs.promises.readFile(outputPath, "utf8");
  } catch (error) {
    if (isCommandMissing(error)) {
      throw new DocumentConversionError(
        "PANDOC_UNAVAILABLE",
        "Document conversion requires Pandoc on the server.",
        503,
      );
    }

    throw new DocumentConversionError(
      "DOCUMENT_CONVERSION_FAILED",
      "Could not convert this document to Markdown.",
      422,
    );
  }
}

async function extractTextFromPdf(inputPath: string) {
  try {
    const { stdout } = await runCommand("pdftotext", [
      "-enc",
      "UTF-8",
      "-layout",
      inputPath,
      "-",
    ]);
    const text = stdout.replace(/\f/g, "\n").trim();

    if (!text) {
      throw new DocumentConversionError(
        "PDF_OCR_REQUIRED",
        "This PDF does not contain an extractable text layer. OCR for scanned PDFs is not supported yet.",
        422,
      );
    }

    return text;
  } catch (error) {
    if (error instanceof DocumentConversionError) {
      throw error;
    }

    if (isCommandMissing(error)) {
      throw new DocumentConversionError(
        "PDF_TEXT_EXTRACTOR_UNAVAILABLE",
        "PDF text extraction requires pdftotext on the server.",
        503,
      );
    }

    throw new DocumentConversionError(
      "PDF_TEXT_EXTRACTION_FAILED",
      "Could not extract text from this PDF.",
      422,
    );
  }
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };

      if (code === 0) {
        resolve(result);
        return;
      }

      reject(
        new DocumentConversionError(
          "COMMAND_FAILED",
          `${command} exited with code ${code}`,
          422,
        ),
      );
    });
  });
}

function extensionForKind(kind: SourceDocumentKind) {
  switch (kind) {
    case "markdown":
      return ".md";
    case "text":
      return ".txt";
    case "word":
      return ".docx";
    case "pdf":
      return ".pdf";
    case "epub":
      return ".epub";
  }
}

function isCommandMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
