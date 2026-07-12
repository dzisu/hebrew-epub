import {
  convertUploadedDocumentToMarkdown,
  DocumentConversionError,
} from "@/lib/document-conversion";

export const dynamic = "force-static";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || typeof file !== "object") {
      return Response.json(
        { ok: false, problem: "file(s) needed" },
        { status: 400 },
      );
    }

    const markdown = await convertUploadedDocumentToMarkdown({
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });

    return Response.json({ ok: true, ...markdown });
  } catch (error) {
    if (error instanceof DocumentConversionError) {
      return Response.json(
        { ok: false, code: error.code, problem: error.message },
        { status: error.status },
      );
    }

    console.error("unexpected file conversion error", error);
    return Response.json(
      {
        ok: false,
        code: "FILE_CONVERSION_FAILED",
        problem: "Could not process this file.",
      },
      { status: 500 },
    );
  }
}
