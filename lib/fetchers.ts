import { Frontmatter } from "@/app/page";

function apiPath(path: string) {
  if (typeof window === "undefined") return path;
  return window.location.pathname.startsWith("/hebrew-epub")
    ? `/hebrew-epub${path}`
    : path;
}

export function makeProgressPercent(e: {
  total: number;
  loaded: number;
}): number {
  const { total, loaded } = e;
  const progress = total !== 0 ? Math.floor((loaded / total) * 100) : 0;
  return progress > 0 ? progress : 0;
}

export function bookRequest(
  req: {
    frontmatter: Frontmatter;
    content: string;
    cover?: File;
  },
  callback: {
    progress: (percentage: number) => void;
    error: () => void;
    complete: () => void;
  },
): { cancel: () => void } {
  const formData = new FormData();
  const xhr = new XMLHttpRequest();
  xhr.responseType = "blob";
  formData.append("content", req.content);
  formData.append("frontmatter", JSON.stringify(req.frontmatter));
  if ("cover" in req && req.cover) {
    formData.append("file", req.cover);
  }
  xhr.onload = () => {
    const contentType = xhr.getResponseHeader("content-type") || "";
    if (!xhr.status.toString().startsWith("2") || !contentType.includes("application/epub+zip")) {
      console.error("EPUB generation failed", xhr.status, contentType);
      callback.error();
      return;
    }
    const url = window.URL.createObjectURL(xhr.response);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${req.frontmatter.title}.epub`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    callback.complete();
  };
  xhr.upload.addEventListener(
    "progress",
    (e) => {
      const progress = makeProgressPercent(e);
      callback.progress(progress);
    },
    false,
  );
  xhr.addEventListener(
    "error",
    (e) => {
      console.error(e);
      callback.error();
    },
    false,
  );
  xhr.open("POST", apiPath("/api/book"));
  xhr.send(formData);
  function cancel() {
    xhr.abort();
  }
  return { cancel };
}

export function uploadDoc(
  file: File,
  callback: {
    progress: (percentage: number) => void;
    error: (problem?: string) => void;
    complete: (markdown: string) => void;
  },
): { cancel: () => void } {
  const formData = new FormData();
  const xhr = new XMLHttpRequest();
  formData.append("file", file);
  xhr.onload = () => {
    try {
      const response = JSON.parse(xhr.responseText);
      if (!xhr.status.toString().startsWith("2") || response.ok === false) {
        callback.error(response.problem);
        return;
      }
      const { markdown } = response;
      callback.complete(markdown);
    } catch (e) {
      console.error(e);
      callback.error();
    }
  };
  xhr.upload.addEventListener(
    "progress",
    (e) => {
      const progress = makeProgressPercent(e);
      callback.progress(progress);
    },
    false,
  );
  xhr.addEventListener(
    "error",
    (e) => {
      console.error(e);
      callback.error("העלאת הקובץ נכשלה.");
    },
    false,
  );
  xhr.open("POST", apiPath("/api/file"));
  xhr.send(formData);
  function cancel() {
    xhr.abort();
  }
  return { cancel };
}

export function importUrl(
  url: string,
  callback: {
    progress: (message: string) => void;
    error: (problem?: string) => void;
    complete: (result: { markdown: string; title?: string }) => void;
  },
): { cancel: () => void } {
  const controller = new AbortController();
  callback.progress("מייבא את הכתבה...");
  fetch(apiPath("/api/url"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal: controller.signal,
  })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        callback.error(result.problem);
        return;
      }
      callback.complete({
        markdown: result.markdown,
        title: result.source?.title,
      });
    })
    .catch((error) => {
      if (error?.name === "AbortError") return;
      console.error(error);
      callback.error("ייבוא הקישור נכשל.");
    });

  return {
    cancel() {
      controller.abort();
    },
  };
}
