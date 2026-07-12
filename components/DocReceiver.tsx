'use client'

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { importUrl, uploadDoc } from "../lib/fetchers";

const textFormats = {
  "application/epub+zip": [".epub"],
  "application/pdf": [".pdf"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/rtf": [".rtf"],
  "text/plain": [".txt", ".md"],
  "text/markdown": [".md"],
  "application/msword": [".doc", ".docx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
}

function DocReceiver({ handleReceiveText }: {
  handleReceiveText: (content: string, title?: string) => void,
}) {
  const [state, setState] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [urlState, setUrlState] = useState<string>("");
  function onDrop(files: File[]) {
    uploadDoc(files[0], {
      error: (problem) => setState(problem || "לא הצלחנו לקרוא את הקובץ"),
      progress: (p) => setState(p < 100 ? `מעלה את הקובץ... ${p}%` : "מעבד את הקובץ..."),
      complete: (m: string) => {
        setState("הקובץ נקלט ותורגם לעברית.");
        handleReceiveText(m);
      }
    })
  }
  function handleUrlImport() {
    if (!url.trim()) {
      setUrlState("יש להזין קישור.");
      return;
    }
    importUrl(url.trim(), {
      progress: (message) => setUrlState(message),
      error: (problem) => setUrlState(problem || "לא הצלחנו לייבא את הקישור"),
      complete: ({ markdown, title }) => {
        setUrlState("הכתבה יובאה ותורגמה לעברית.");
        handleReceiveText(markdown, title);
      },
    });
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: textFormats,
  });
  return <div className="source-receiver">
    <div {...getRootProps()} className={`dropzone ${isDragActive ? "active" : ""}`}>
      <input {...getInputProps()} />
      <div className="dropzone-icon" aria-hidden="true">↑</div>
      <div className="dropzone-copy">
        <strong>{state ? state : "גרור קובץ לכאן או בחר קובץ"}</strong>
        <span>Markdown, TXT, DOCX, ODT, RTF, PDF טקסטואלי או EPUB</span>
      </div>
    </div>
    <div className="url-import">
      <label htmlFor="article-url" className="form-label">או הדבק קישור לכתבה</label>
      <div className="url-import-row">
        <input
          type="url"
          id="article-url"
          className="form-control"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/article"
          dir="ltr"
        />
        <button type="button" className="secondary-action" onClick={handleUrlImport}>
          ייבא ותרגם
        </button>
      </div>
      <div className="field-help">{urlState || "השרת יחלץ את גוף הכתבה, ישמר תמונות ככל האפשר ויתרגם לעברית."}</div>
    </div>
  </div>;
}

export default DocReceiver;
