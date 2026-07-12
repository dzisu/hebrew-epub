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
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const HEBREW_RATIO_THRESHOLD = 0.35;
const IMAGE_MARKDOWN_RE = /^!\[[^\]]*]\([^)]+\)$/;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)]\(([^)]+)\)/g;
const EPUB_SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
]);

export async function extractUrlToHebrewMarkdown(
  rawUrl: string,
): Promise<ArticleExtractionResult> {
  const url = parsePublicUrl(rawUrl);
  await assertPublicUrl(url);

  try {
    return finalizeArticleMarkdown(await extractUrlDirect(url), url.toString());
  } catch (error) {
    if (error instanceof ArticleExtractionError && canFallbackToReader(error)) {
      return finalizeArticleMarkdown(
        await extractUrlViaJinaReader(url),
        url.toString(),
      );
    }
    throw error;
  }
}

async function finalizeArticleMarkdown(
  result: ArticleExtractionResult,
  referer: string,
): Promise<ArticleExtractionResult> {
  const markdown = await prepareMarkdownImages(
    sanitizeMarkdownLinks(normalizeNestedImageLinks(result.markdown)),
    referer,
  );
  return {
    ...result,
    markdown,
    source: {
      ...result.source,
      imageCount: countMarkdownImages(markdown),
    },
  };
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

  const shouldTranslate = !isProbablyHebrewText(article.textContent);
  const translatedHtml = shouldTranslate
    ? await translateHtmlToHebrew(article.content)
    : article.content;
  const markdownBody = await prepareMarkdownImages(
    htmlToMarkdown(translatedHtml),
    finalUrl.toString(),
  );
  const imageCount = countMarkdownImages(markdownBody);
  const title = article.title?.trim() || finalUrl.hostname;
  const header = [
    `# ${await maybeTranslatePlainTextToHebrew(title)}`,
    "",
    article.byline ? `> מקור/מחבר: ${article.byline}` : "",
    `> מקור: ${finalUrl.toString()}`,
    "",
  ].filter(Boolean);

  return {
    markdown: `${header.join("\n")}\n${markdownBody}`.trim(),
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
  let title = url.hostname;
  let markdownContent = "";
  let lastStatus = 0;

  for (let attempt = 0; attempt < 12 && !markdownContent; attempt += 1) {
    const response = await fetch(readerUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; HebrewEpubBot/0.1; +https://opencode.zisu.uk/hebrew-epub)",
        accept: "text/plain,text/markdown",
        "x-no-cache": attempt === 0 ? "false" : "true",
      },
    });
    lastStatus = response.status;

    if (!response.ok) {
      await waitBeforeRetry(attempt);
      continue;
    }

    const readerMarkdown = await response.text();
    title = extractJinaTitle(readerMarkdown) || title;
    markdownContent = extractJinaMarkdownContent(readerMarkdown);
    if (!markdownContent) {
      await waitBeforeRetry(attempt);
    }
  }

  if (!markdownContent) {
    const code = lastStatus && lastStatus >= 400
      ? "READER_FALLBACK_FAILED"
      : "ARTICLE_EXTRACTION_FAILED";
    throw new ArticleExtractionError(
      code,
      "Could not identify a readable article body on this page.",
      422,
    );
  }

  const translatedMarkdown = await translateMarkdownToHebrew(markdownContent);
  const translatedTitle = await maybeTranslatePlainTextToHebrew(title);
  const preparedMarkdown = await prepareMarkdownImages(
    translatedMarkdown,
    url.toString(),
  );
  const imageCount = countMarkdownImages(preparedMarkdown);

  return {
    markdown: [
      `# ${translatedTitle}`,
      "",
      `> מקור: ${url.toString()}`,
      "",
      preparedMarkdown,
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
      img.getAttribute("data-lazy-src") ||
      imageFromSrcset(img.getAttribute("srcset")) ||
      imageFromSrcset(img.getAttribute("data-srcset"));
    if (!src) return;
    if (isLikelyTrackingImage(img)) {
      img.remove();
      return;
    }
    try {
      img.setAttribute("src", new URL(src, baseUrl).toString());
    } catch {
      img.removeAttribute("src");
    }
  });
}

function imageFromSrcset(srcset: string | null) {
  if (!srcset) return undefined;
  const candidates = srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates.at(-1);
}

function isLikelyTrackingImage(img: HTMLImageElement) {
  const width = Number(img.getAttribute("width") || img.width || "0");
  const height = Number(img.getAttribute("height") || img.height || "0");
  return width > 0 && height > 0 && width <= 2 && height <= 2;
}

async function translateHtmlToHebrew(html: string) {
  const chunks = splitHtmlForTranslation(html);
  const translated = await translateTextChunks(chunks, "html");
  return translated.join("\n");
}

async function maybeTranslatePlainTextToHebrew(text: string) {
  if (isProbablyHebrewText(text)) return text;
  const translated = await translateTextChunks([text], "plain");
  return translated[0] || text;
}

export async function translateMarkdownToHebrew(markdown: string) {
  if (isProbablyHebrewText(markdown)) return markdown;

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

export function isProbablyHebrewText(text: string) {
  const letters = text.match(/[\p{L}]/gu) || [];
  if (letters.length < 12) return /[\u0590-\u05FF]/.test(text);

  const hebrewLetters = text.match(/[\u0590-\u05FF]/g) || [];
  return hebrewLetters.length / letters.length >= HEBREW_RATIO_THRESHOLD;
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
  return sanitizeMarkdownLinks(normalizeNestedImageLinks(turndown.turndown(html)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeMarkdownLinks(markdown: string) {
  return markdown.replace(
    /(^|[^!])\[([^\]\n]*(?:\\.[^\]\n]*)*)]\(([^)\n]+)\)/g,
    (match, prefix: string, label: string, destination: string) => {
      const trimmedDestination = destination.trim();
      if (trimmedDestination.startsWith("#")) {
        return `${prefix}${label.replace(/\\([[\]])/g, "$1")}`;
      }

      const [href, ...rest] = trimmedDestination.split(/\s+/);
      if (!/^https?:\/\//i.test(href) || !href.includes("#")) {
        return match;
      }

      try {
        const url = new URL(href.replace(/\\([()])/g, "$1"));
        url.hash = "";
        return `${prefix}[${label}](${url.toString()}${rest.length ? ` ${rest.join(" ")}` : ""})`;
      } catch {
        return match;
      }
    },
  );
}

function normalizeNestedImageLinks(markdown: string) {
  let normalized = "";
  let offset = 0;

  while (offset < markdown.length) {
    const start = markdown.indexOf("[[", offset);
    if (start < 0) {
      normalized += markdown.slice(offset);
      break;
    }

    const innerDivider = markdown.indexOf("](", start + 2);
    const outerDivider = markdown.indexOf(")](", innerDivider + 2);
    const outerEnd = markdown.indexOf(")", outerDivider + 3);

    if (innerDivider < 0 || outerDivider < 0 || outerEnd < 0) {
      normalized += markdown.slice(offset);
      break;
    }

    const alt = markdown.slice(start + 2, innerDivider);
    const imageUrl = markdown.slice(innerDivider + 2, outerDivider);
    if (!/^https?:\/\//.test(imageUrl)) {
      normalized += markdown.slice(offset, start + 2);
      offset = start + 2;
      continue;
    }

    normalized += markdown.slice(offset, start);
    normalized += `![${alt}](${imageUrl})`;
    offset = outerEnd + 1;
  }

  return normalized;
}

function countMarkdownImages(markdown: string) {
  return (markdown.match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
}

async function prepareMarkdownImages(markdown: string, referer: string) {
  let prepared = normalizeNestedImageLinks(markdown);
  const matches = [...prepared.matchAll(MARKDOWN_IMAGE_RE)];

  for (const match of matches) {
    const [original, alt, src] = match;
    const safeAlt = sanitizeImageAlt(alt);
    const image = await tryInlineImage(src, referer);
    const replacement = image
      ? `![${safeAlt}](${image})`
      : `[תמונה${safeAlt ? `: ${safeAlt}` : ""}](${src})`;
    prepared = prepared.replace(original, replacement);
  }

  return prepared;
}

function sanitizeImageAlt(alt: string) {
  return alt
    .replace(/!?\[([^\]]*)]\([^)]+\)/g, "$1")
    .replace(/[[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function tryInlineImage(src: string, referer: string) {
  if (src.startsWith("data:")) return src;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return undefined;
  }

  if (!["http:", "https:"].includes(url.protocol)) return undefined;

  try {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; HebrewEpubBot/0.1; +https://opencode.zisu.uk/hebrew-epub)",
        referer,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const mediaType = contentType.split(";")[0].toLowerCase();
    const contentLength = Number(response.headers.get("content-length") || "0");
    if (
      !response.ok ||
      !contentType.startsWith("image/") ||
      !EPUB_SAFE_IMAGE_TYPES.has(mediaType) ||
      contentLength > MAX_IMAGE_BYTES
    ) {
      return undefined;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return undefined;
    return `data:${mediaType};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
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

function waitBeforeRetry(attempt: number) {
  if (attempt >= 11) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, 250));
}
