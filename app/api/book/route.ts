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
  applyRtlAttributes(path.join(workDir, "EPUB"));
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

function applyRtlAttributes(epubDir: string) {
  for (const filePath of listFiles(epubDir, ".xhtml")) {
    const xhtml = fs
      .readFileSync(filePath, "utf-8")
      .replace(/<html(?![^>]*\sdir=)/, '<html dir="rtl"')
      .replace(/<body(?![^>]*\sdir=)/, '<body dir="rtl"');
    fs.writeFileSync(filePath, xhtml, "utf-8");
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

  const opfFile = listFiles(epubDir, ".opf")[0];
  if (!opfFile) {
    throw new Error("EPUB package document was not found");
  }
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
