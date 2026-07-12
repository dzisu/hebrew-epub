'use client'

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { uploadDoc } from "../lib/fetchers";

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
  handleReceiveText: (content: string) => void,
}) {
  const [state, setState] = useState<string>("");
  function onDrop(files: File[]) {
    uploadDoc(files[0], {
      error: (problem) => setState(problem || "לא הצלחנו לקרוא את הקובץ"),
      progress: (p) => setState(p < 100 ? `מעלה את הקובץ... ${p}%` : "מעבד את הקובץ..."),
      complete: (m: string) => {
        setState("");
        handleReceiveText(m);
      }
    })
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: textFormats,
  });
  return <div {...getRootProps()} className={`dropzone ${isDragActive ? "active" : ""}`}>
    <input {...getInputProps()} />
    <div>
      <strong>{state ? state : "גרור קובץ לכאן או בחר קובץ"}</strong>
      <div className="text-muted">Markdown, TXT, DOCX, PDF טקסטואלי או EPUB</div>
    </div>
  </div>;
}

export default DocReceiver;
