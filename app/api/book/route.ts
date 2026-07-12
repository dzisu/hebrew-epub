import { Frontmatter } from "@/app/page";
import { deleteFile } from "@/lib/backend-file-utils";
import writeYamlFile from "write-yaml-file";
import { spawn } from "child_process";
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
        resolve(epubFile);
      } else {
        reject("error making epub with pandoc");
      }
    });
  });
}
