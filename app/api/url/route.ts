import {
  ArticleExtractionError,
  extractUrlToHebrewMarkdown,
} from "@/lib/article-extraction";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url) {
      return Response.json(
        { ok: false, code: "URL_REQUIRED", problem: "URL is required." },
        { status: 400 },
      );
    }

    const result = await extractUrlToHebrewMarkdown(url);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ArticleExtractionError) {
      return Response.json(
        { ok: false, code: error.code, problem: error.message },
        { status: error.status },
      );
    }

    console.error("unexpected URL extraction error", error);
    return Response.json(
      {
        ok: false,
        code: "URL_EXTRACTION_FAILED",
        problem: "Could not process this URL.",
      },
      { status: 500 },
    );
  }
}
