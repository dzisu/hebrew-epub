#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const epubPath = process.argv[2];

if (!epubPath) {
  fail("Usage: node scripts/validate-epub.mjs <book.epub>");
}

if (!fs.existsSync(epubPath)) {
  fail(`EPUB file not found: ${epubPath}`);
}

runEpubCheck(epubPath);

const entries = unzipList(epubPath);
const containerXml = unzipText(epubPath, "META-INF/container.xml");
const opfPath = matchRequired(
  containerXml,
  /<rootfile\b[^>]*\bfull-path="([^"]+)"/,
  "container.xml does not point to an OPF package document",
);
const opf = unzipText(epubPath, opfPath);
const opfDir = path.posix.dirname(opfPath);

assert(/<package\b[^>]*\bversion="3(?:\.[0-9]+)?"/.test(opf), "OPF package is not EPUB 3");
assert(/<dc:language>\s*he\s*<\/dc:language>/.test(opf), "OPF dc:language is not he");
assert(/<spine\b[^>]*\bpage-progression-direction="rtl"/.test(opf), "OPF spine is not RTL");
assert(!/rendition:layout">\s*pre-paginated\s*</.test(opf), "EPUB is marked as fixed layout");

const xhtmlEntries = entries.filter((entry) => entry.startsWith(`${opfDir}/`) && entry.endsWith(".xhtml"));
assert(xhtmlEntries.length > 0, "EPUB contains no XHTML content files");

for (const entry of xhtmlEntries) {
  const xhtml = unzipText(epubPath, entry);
  assert(/<html\b[^>]*\bdir="rtl"/.test(xhtml), `${entry}: html tag is not RTL`);
  assert(/<html\b[^>]*\bxml:lang="he"/.test(xhtml), `${entry}: html xml:lang is not he`);
  assert(/<body\b[^>]*\bdir="rtl"/.test(xhtml), `${entry}: body tag is not RTL`);

  if (entry.includes("/text/")) {
    const body = xhtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, "")
      .trim();
    assert(text.length > 0, `${entry}: body is empty`);
  }
}

const cssEntries = entries.filter((entry) => entry.startsWith(`${opfDir}/`) && entry.endsWith(".css"));
for (const entry of cssEntries) {
  const css = unzipText(epubPath, entry);
  assert(!/@import/i.test(css), `${entry}: CSS contains @import`);
  assert(!/^\s*direction\s*:/im.test(css), `${entry}: CSS contains forbidden direction property`);
  assert(!/100vw|overflow\s*:\s*hidden|position\s*:\s*(absolute|fixed)|margin-[^:]+:\s*-/i.test(css), `${entry}: CSS contains reader-hostile layout rules`);
}

console.log(`EPUB validation passed: ${epubPath}`);

function runEpubCheck(filePath) {
  const jar = process.env.EPUBCHECK_JAR || findDefaultEpubCheckJar();
  if (!jar) {
    console.warn("EPUBCheck jar not found; structure checks will still run.");
    return;
  }

  const result = spawnSync("java", ["-jar", jar, filePath], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    fail("EPUBCheck failed");
  }
}

function findDefaultEpubCheckJar() {
  const candidates = [
    "/tmp/epubcheck-5.3.0/epubcheck.jar",
    "/opt/epubcheck/epubcheck.jar",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function unzipList(filePath) {
  return execFileSync("unzip", ["-Z1", filePath], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unzipText(filePath, entry) {
  try {
    return execFileSync("unzip", ["-p", filePath, entry], { encoding: "utf8" });
  } catch {
    fail(`Could not read ${entry} from EPUB`);
  }
}

function matchRequired(value, pattern, message) {
  const match = value.match(pattern);
  if (!match?.[1]) fail(message);
  return match[1];
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  console.error(`EPUB validation failed: ${message}`);
  process.exit(1);
}
