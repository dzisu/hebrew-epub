import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import dns from "dns/promises";
import net from "net";

export type ArticleExtractionResult = {
  markdown: string;
  source: {
    kind: "url";
    originalName: string;
    title?: string;
    byline?: string;
    excerpt?: string;
    imageCount: number;
  };
};

export class ArticleExtractionError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ArticleExtractionError";
    this.code = code;
    this.status = status;
  }
}

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_TRANSLATION_CHARS = 4200;
const IMAGE_MARKDOWN_RE = /^!\[[^\]]*]\([^)]+\)$/;

export async function extractUrlToHebrewMarkdown(
  rawUrl: string,
): Promise<ArticleExtractionResult> {
  const url = parsePublicUrl(rawUrl);
  await assertPublicUrl(url);

  try {
    return await extractUrlDirect(url);
  } catch (error) {
    if (error instanceof ArticleExtractionError && canFallbackToReader(error)) {
      return extractUrlViaJinaReader(url);
    }
    throw error;
  }
}

async function extractUrlDirect(url: URL): Promise<ArticleExtractionResult> {
  const response = await fetch(url.toString(), {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; HebrewEpubBot/0.1; +https://opencode.zisu.uk/hebrew-epub)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new ArticleExtractionError(
      "URL_FETCH_FAILED",
      `Could not fetch this URL. HTTP ${response.status}.`,
      422,
    );
  }

  const finalUrl = parsePublicUrl(response.url || url.toString());
  await assertPublicUrl(finalUrl);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new ArticleExtractionError(
      "URL_NOT_HTML",
      "This URL does not look like an HTML article.",
      415,
    );
  }

  const html = await readLimitedResponse(response);
  const dom = new JSDOM(html, { url: finalUrl.toString() });
  prepareImages(dom.window.document, finalUrl);

  const article = new Readability(dom.window.document.cloneNode(true) as Document, {
    keepClasses: false,
  }).parse();

  if (!article?.content || !article.textContent?.trim()) {
    throw new ArticleExtractionError(
      "ARTICLE_EXTRACTION_FAILED",
      "Could not identify a readable article body on this page.",
      422,
    );
  }

  const translatedHtml = await translateHtmlToHebrew(article.content);
  const markdownBody = htmlToMarkdown(translatedHtml);
  const imageCount = countMarkdownImages(markdownBody);
  const title = article.title?.trim() || finalUrl.hostname;
  const header = [
    `# ${await translatePlainTextToHebrew(title)}`,
    "",
    article.byline ? `> מקור/מחבר: ${article.byline}` : "",
    `> מקור: ${finalUrl.toString()}`,
    "",
  ].filter(Boolean);

  return {
    markdown: `${header.join("\n")}${markdownBody}`.trim(),
    source: {
      kind: "url",
      originalName: finalUrl.toString(),
      title,
      byline: article.byline || undefined,
      excerpt: article.excerpt || undefined,
      imageCount,
    },
  };
}

async function extractUrlViaJinaReader(
  url: URL,
): Promise<ArticleExtractionResult> {
  const readerUrl = new URL(
    `https://r.jina.ai/http://${url.toString().replace(/^https?:\/\//, "http://")}`,
  );
  const response = await fetch(readerUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; HebrewEpubBot/0.1; +https://opencode.zisu.uk/hebrew-epub)",
      accept: "text/plain,text/markdown",
    },
  });

  if (!response.ok) {
    throw new ArticleExtractionError(
      "READER_FALLBACK_FAILED",
      `Could not import this URL through the article reader. HTTP ${response.status}.`,
      422,
    );
  }

  const readerMarkdown = await response.text();
  const title = extractJinaTitle(readerMarkdown) || url.hostname;
  const markdownContent = extractJinaMarkdownContent(readerMarkdown);
  if (!markdownContent) {
    throw new ArticleExtractionError(
      "ARTICLE_EXTRACTION_FAILED",
      "Could not identify a readable article body on this page.",
      422,
    );
  }

  const translatedMarkdown = await translateMarkdownToHebrew(markdownContent);
  const translatedTitle = await translatePlainTextToHebrew(title);
  const imageCount = countMarkdownImages(translatedMarkdown);

  return {
    markdown: [
      `# ${translatedTitle}`,
      "",
      `> מקור: ${url.toString()}`,
      "",
      translatedMarkdown,
    ].join("\n").trim(),
    source: {
      kind: "url",
      originalName: url.toString(),
      title,
      imageCount,
    },
  };
}

function canFallbackToReader(error: ArticleExtractionError) {
  return [
    "URL_FETCH_FAILED",
    "URL_NOT_HTML",
    "ARTICLE_EXTRACTION_FAILED",
  ].includes(error.code);
}

function parsePublicUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ArticleExtractionError(
      "INVALID_URL",
      "Please enter a valid URL.",
      400,
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ArticleExtractionError(
      "UNSUPPORTED_URL_PROTOCOL",
      "Only HTTP and HTTPS URLs are supported.",
      415,
    );
  }

  return url;
}

async function assertPublicUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new ArticleExtractionError(
      "PRIVATE_URL_BLOCKED",
      "Local URLs are not supported.",
      400,
    );
  }

  if (net.isIP(hostname)) {
    assertPublicAddress(hostname);
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  for (const record of records) {
    assertPublicAddress(record.address);
  }
}

function assertPublicAddress(address: string) {
  if (isPrivateAddress(address)) {
    throw new ArticleExtractionError(
      "PRIVATE_URL_BLOCKED",
      "Private network URLs are not supported.",
      400,
    );
  }
}

function isPrivateAddress(address: string) {
  if (net.isIPv6(address)) {
    return (
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("fe80:")
    );
  }

  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function readLimitedResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      throw new ArticleExtractionError(
        "URL_TOO_LARGE",
        "This page is too large to import as an article.",
        413,
      );
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

function prepareImages(document: Document, baseUrl: URL) {
  document.querySelectorAll("img").forEach((img) => {
    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-lazy-src");
    if (!src) return;
    try {
      img.setAttribute("src", new URL(src, baseUrl).toString());
    } catch {
      img.removeAttribute("src");
    }
  });
}

async function translateHtmlToHebrew(html: string) {
  const chunks = splitHtmlForTranslation(html);
  const translated = await translateTextChunks(chunks, "html");
  return translated.join("\n");
}

async function translatePlainTextToHebrew(text: string) {
  const translated = await translateTextChunks([text], "plain");
  return translated[0] || text;
}

export async function translateMarkdownToHebrew(markdown: string) {
  const blocks = markdown.split(/\n{2,}/);
  const output: string[] = [];
  let translatable: string[] = [];
  let indexes: number[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) {
      output.push("");
      continue;
    }

    if (IMAGE_MARKDOWN_RE.test(trimmed)) {
      output.push(block);
      continue;
    }

    indexes.push(output.length);
    translatable.push(block);
    output.push("");
  }

  const translated = translatable.length
    ? await translateTextChunks(translatable, "plain")
    : [];

  indexes.forEach((index, offset) => {
    output[index] = translated[offset] || translatable[offset];
  });

  return output.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function translateTextChunks(
  chunks: string[],
  textType: "html" | "plain",
) {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key || !endpoint) {
    throw new ArticleExtractionError(
      "TRANSLATOR_NOT_CONFIGURED",
      "Azure Translator is not configured on the server.",
      503,
    );
  }

  const url = new URL("translate", endpoint);
  url.searchParams.set("api-version", "3.0");
  url.searchParams.set("to", "he");
  url.searchParams.set("textType", textType);

  const results: string[] = [];
  for (const batch of batchChunks(chunks)) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "ocp-apim-subscription-key": key,
    };
    if (region && region !== "global") {
      headers["ocp-apim-subscription-region"] = region;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(batch.map((Text) => ({ Text }))),
    });

    if (!response.ok) {
      throw new ArticleExtractionError(
        "TRANSLATION_FAILED",
        `Azure Translator failed with HTTP ${response.status}.`,
        502,
      );
    }

    const json = (await response.json()) as Array<{
      translations?: Array<{ text?: string }>;
    }>;
    results.push(
      ...json.map((item, index) => item.translations?.[0]?.text || batch[index]),
    );
  }

  return results;
}

function splitHtmlForTranslation(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const chunks: string[] = [];
  let current = "";

  dom.window.document.body.childNodes.forEach((node) => {
    const value =
      "outerHTML" in node
        ? (node as Element).outerHTML
        : node.textContent || "";
    if (!value.trim()) return;
    if (current.length + value.length > MAX_TRANSLATION_CHARS && current) {
      chunks.push(current);
      current = "";
    }
    current += `${value}\n`;
  });

  if (current.trim()) chunks.push(current);
  return chunks.length ? chunks : [html];
}

function batchChunks(chunks: string[]) {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;

  for (const chunk of chunks) {
    if (current.length >= 25 || size + chunk.length > 45000) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(chunk);
    size += chunk.length;
  }

  if (current.length) batches.push(current);
  return batches;
}

function htmlToMarkdown(html: string) {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return turndown.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}

function countMarkdownImages(markdown: string) {
  return (markdown.match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
}

function extractJinaTitle(markdown: string) {
  const match = markdown.match(/^Title:\s*(.+)$/m);
  return match?.[1]?.trim();
}

function extractJinaMarkdownContent(markdown: string) {
  const marker = "Markdown Content:";
  const index = markdown.indexOf(marker);
  const content = index >= 0 ? markdown.slice(index + marker.length) : markdown;
  const cleaned = content
    .replace(/^Warning:.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (/^A 1x1 image, likely be a tacker probe$/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}
