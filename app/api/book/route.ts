import { Frontmatter } from "@/app/page";
import { deleteFile } from "@/lib/backend-file-utils";
import writeYamlFile from "write-yaml-file";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export const dynamic = "force-static";

export async function POST(request: Request) {
  const formData = await request.formData();
  const coverFile = formData.get("file") as File;
  const cover =
    coverFile && typeof coverFile === "object"
      ? path.join("tmp", coverFile.name)
      : undefined;
  await fs.promises.mkdir("tmp", { recursive: true });
  // save tmp file
  if (coverFile && typeof coverFile === "object") {
    const arrBuffer = await coverFile.arrayBuffer();
    const buffer = Buffer.from(arrBuffer);
    await fs.promises.writeFile(path.join("tmp", coverFile.name), buffer);
  }
  const frontMatter = formData.get("frontmatter") as string;
  const content = formData.get("content") as string;
  const toDownload = await makeEpub(
    content,
    JSON.parse(frontMatter) as Frontmatter,
    cover,
  );
  const stat = fs.statSync(toDownload);
  const stream = fs.createReadStream(toDownload);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => {
        controller.close();
        deleteFile(toDownload);
      });
      stream.on("error", (err) => {
        controller.error(err);
        deleteFile(toDownload);
      });
    },
  });
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `attachment; filename=${path.basename(toDownload)}`,
    },
  });
}

function makeEpub(
  content: string,
  frontmatter: Frontmatter,
  cover: string | undefined,
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const ts = new Date().getTime().toString();
    const mdFile = path.join("tmp", `${ts}.md`);
    const yamlFile = path.join("tmp", `${ts}.yaml`);
    const epubFile = path.join("tmp", `${ts}.epub`);
    if (cover) {
      frontmatter["epub-cover-image"] = cover;
      frontmatter["cover-image"] = cover;
    }
    fs.writeFileSync(mdFile, content, "utf-8");
    await writeYamlFile(yamlFile, frontmatter);
    fs.writeFileSync(
      yamlFile,
      `
---
${fs.readFileSync(yamlFile, "utf-8")}
---
`,
      "utf8",
    );
    const pandoc = spawn("pandoc", [
      "--table-of-contents",
      "--css",
      path.join("templates", "book.css"),
      "-o",
      epubFile,
      yamlFile,
      mdFile,
    ]);
    pandoc.on("error", (err) => {
      console.error("error converting word document");
      console.error(err);
    });
    pandoc.stderr.on("data", (data) => {
      console.error(data.toString());
    });
    pandoc.on("close", (code) => {
      deleteFile(mdFile, yamlFile, cover);
      if (code === 0) {
        try {
          normalizeEpubNavigation(epubFile, ts);
          resolve(epubFile);
        } catch (err) {
          reject(err);
        }
      } else {
        reject("error making epub with pandoc");
      }
    });
  });
}

function normalizeEpubNavigation(epubFile: string, ts: string) {
  const workDir = path.join("tmp", `${ts}-epub`);
  const outputEpub = path.resolve(epubFile);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const unzip = spawnSync("unzip", ["-q", epubFile, "-d", workDir], {
    encoding: "utf-8",
  });
  if (unzip.status !== 0) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw new Error(unzip.stderr || "error unpacking epub");
  }

  stripXhtmlFragments(path.join(workDir, "EPUB", "nav.xhtml"), "href");
  stripXhtmlFragments(path.join(workDir, "EPUB", "toc.ncx"), "src");
  normalizePackageDocument(path.join(workDir, "EPUB"));
  normalizeXhtmlFiles(path.join(workDir, "EPUB"));
  sanitizeEpubCss(path.join(workDir, "EPUB"));
  embedLocalFonts(path.join(workDir, "EPUB"));

  fs.rmSync(outputEpub, { force: true });
  const zipMime = spawnSync("zip", ["-q", "-X", "-0", outputEpub, "mimetype"], {
    cwd: workDir,
    encoding: "utf-8",
  });
  const zipRest = spawnSync("zip", ["-q", "-X", "-r", outputEpub, "META-INF", "EPUB"], {
    cwd: workDir,
    encoding: "utf-8",
  });
  fs.rmSync(workDir, { recursive: true, force: true });
  if (zipMime.status !== 0 || zipRest.status !== 0) {
    throw new Error(zipMime.stderr || zipRest.stderr || "error repacking epub");
  }
}

function stripXhtmlFragments(filePath: string, attrName: "href" | "src") {
  if (!fs.existsSync(filePath)) return;
  const xml = fs.readFileSync(filePath, "utf-8");
  const pattern = new RegExp(`${attrName}="([^"]+\\.xhtml)#[^"]*"`, "g");
  fs.writeFileSync(filePath, xml.replace(pattern, `${attrName}="$1"`), "utf-8");
}

function normalizePackageDocument(epubDir: string) {
  const opfFile = findPackageDocument(epubDir);
  let opf = fs.readFileSync(opfFile, "utf-8");

  opf = opf
    .replace(/<dc:language>[^<]*<\/dc:language>/, "<dc:language>he</dc:language>")
    .replace(
      /<spine\b(?![^>]*\spage-progression-direction=)([^>]*)>/,
      '<spine page-progression-direction="rtl"$1>',
    )
    .replace(
      /<spine\b([^>]*?)\spage-progression-direction="ltr"([^>]*)>/,
      '<spine$1 page-progression-direction="rtl"$2>',
    )
    .replace(
      /<itemref\s+idref="nav"\s*\/>/,
      '<itemref idref="nav" linear="no" />',
    )
    .replace(
      /<itemref\s+idref="nav"\s+linear="yes"\s*\/>/,
      '<itemref idref="nav" linear="no" />',
    )
    .replace(
      /\s*<meta\s+property="rendition:layout">pre-paginated<\/meta>/g,
      "",
    )
    .replace(
      /\s*<meta\s+property="rendition:[^"]+">[^<]*<\/meta>/g,
      "",
    );

  if (!/<dc:language>/.test(opf)) {
    opf = opf.replace(/(<metadata\b[^>]*>)/, "$1\n    <dc:language>he</dc:language>");
  }

  fs.writeFileSync(opfFile, opf, "utf-8");
}

function normalizeXhtmlFiles(epubDir: string) {
  for (const filePath of listFiles(epubDir, ".xhtml")) {
    let xhtml = fs
      .readFileSync(filePath, "utf-8")
      .replace(/<!DOCTYPE html>\s*/i, "")
      .replace(
        /<html\b[^>]*>/,
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" dir="rtl" xml:lang="he" lang="he">',
      )
      .replace(/<body\b([^>]*)>/i, (_match, attrs = "") =>
        `<body${forceAttributes(attrs, {
          dir: "rtl",
          "xml:lang": "he",
          lang: "he",
        })}>`,
      );

    if (filePath.includes(`${path.sep}text${path.sep}`)) {
      xhtml = xhtml.replace(/\s+id="[^"]*"/g, "");
    }

    xhtml = normalizeReadingDirection(xhtml);
    assertNonEmptyXhtmlBody(filePath, xhtml);
    fs.writeFileSync(filePath, xhtml, "utf-8");
  }
}

function normalizeReadingDirection(xhtml: string) {
  let normalized = xhtml
    .replace(/<(p|li|blockquote|figcaption|td|th)(\s[^>]*)?>/g, (match, tag, attrs = "") => {
      const blockAttrs = addAttributes(attrs, {
        dir: "rtl",
        "xml:lang": "he",
        lang: "he",
      });
      return `<${tag}${blockAttrs}>`;
    })
    .replace(/<(ul|ol)(\s[^>]*)?>/g, (match, tag, attrs = "") =>
      `<${tag}${ensureAttribute(attrs, "dir", "rtl")}>`,
    );

  normalized = normalized.replace(
    /(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i,
    (_match, open, body, close) => `${open}${isolateLatinTextRuns(body)}${close}`,
  );
  return normalized;
}

function addAttributes(attrs: string, additions: Record<string, string>) {
  return Object.entries(additions).reduce(
    (current, [name, value]) => ensureAttribute(current, name, value),
    attrs,
  );
}

function forceAttributes(attrs: string, additions: Record<string, string>) {
  return Object.entries(additions).reduce(
    (current, [name, value]) => setAttribute(current, name, value),
    attrs,
  );
}

function ensureAttribute(attrs: string, name: string, value: string) {
  if (new RegExp(`\\s${escapeRegExp(name)}=`).test(attrs)) return attrs;
  return `${attrs} ${name}="${value}"`;
}

function setAttribute(attrs: string, name: string, value: string) {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`);
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, ` ${name}="${value}"`);
  }
  return `${attrs} ${name}="${value}"`;
}

function isolateLatinTextRuns(xhtml: string) {
  return xhtml
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part || part.startsWith("<")) return part;
      return part.replace(
        /([A-Za-z][A-Za-z0-9.,:/+'’ -]*[A-Za-z0-9]|[0-9]+(?:[,.][0-9]+)+)/g,
        (run) => {
          const trimmed = run.trim();
          if (!trimmed || trimmed.length < 2) return run;
          const leading = run.match(/^\s*/)?.[0] || "";
          const trailing = run.match(/\s*$/)?.[0] || "";
          const body = escapeXmlText(trimmed);
          return `${leading}<span dir="ltr" xml:lang="en" lang="en" class="ltr">${body}</span>${trailing}`;
        },
      );
    })
    .join("");
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeEpubCss(epubDir: string) {
  for (const filePath of listFiles(epubDir, ".css")) {
    const css = fs
      .readFileSync(filePath, "utf-8")
      .replace(/^\s*@import[^;]+;\s*/gm, "")
      .replace(/^\s*direction\s*:[^;]+;\s*/gm, "")
      .replace(/^\s*(height|min-height|max-height)\s*:\s*100(?:%|vh)\s*;\s*/gm, "")
      .replace(/^\s*width\s*:\s*100vw\s*;\s*/gm, "")
      .replace(/^\s*position\s*:\s*(?:absolute|fixed)\s*;\s*/gm, "")
      .replace(/^\s*overflow\s*:\s*hidden\s*;\s*/gm, "")
      .replace(/^\s*margin-[^:]+:\s*-[^;]+;\s*/gm, "");
    fs.writeFileSync(filePath, css, "utf-8");
  }
}

function assertNonEmptyXhtmlBody(filePath: string, xhtml: string) {
  const body = xhtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!text) {
    throw new Error(`EPUB content file has an empty body: ${filePath}`);
  }
}

function embedLocalFonts(epubDir: string) {
  const sourceDir = path.join(process.cwd(), "templates", "fonts");
  const targetDir = path.join(epubDir, "fonts");
  const fonts = [
    "FrankRuhlLibre-Regular.ttf",
    "FrankRuhlLibre-Medium.ttf",
    "FrankRuhlLibre-Bold.ttf",
  ];
  fs.mkdirSync(targetDir, { recursive: true });
  for (const font of fonts) {
    fs.copyFileSync(path.join(sourceDir, font), path.join(targetDir, font));
  }

  const opfFile = findPackageDocument(epubDir);
  let opf = fs.readFileSync(opfFile, "utf-8");
  const manifestItems = fonts
    .filter((font) => !opf.includes(`href="fonts/${font}"`))
    .map(
      (font, index) =>
        `    <item id="frank-ruhl-libre-${index + 1}" href="fonts/${font}" media-type="font/ttf"/>`,
    )
    .join("\n");
  if (manifestItems) {
    opf = opf.replace(/(\s*)<\/manifest>/, `\n${manifestItems}$1</manifest>`);
    fs.writeFileSync(opfFile, opf, "utf-8");
  }
}

function findPackageDocument(epubDir: string) {
  const opfFile = listFiles(epubDir, ".opf")[0];
  if (!opfFile) {
    throw new Error("EPUB package document was not found");
  }
  return opfFile;
}

function listFiles(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const matches: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...listFiles(entryPath, extension));
    } else if (entry.name.endsWith(extension)) {
      matches.push(entryPath);
    }
  }
  return matches;
}
