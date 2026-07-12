'use client'

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { uploadDoc } from "../lib/fetchers";

const textFormats = {
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
      error: () => setState("Error"),
      progress: (p) => setState(p < 100 ? `Uploading ${p}%...` : "Processing..."),
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
  return <div {...getRootProps()} className="clickable d-flex flex-row align-items-center justify-content-center" style={{ padding: "2rem 1rem", border: "2px dashed grey", textAlign: "center", backgroundColor: isDragActive ? "#34a8eb" : "inherit" }}>
    <input {...getInputProps()} />
    <div className="text-muted">
      {state ? state : "גרור קובץ או לחץ להוספת מסמך"}
    </div>
  </div>;
}

export default DocReceiver;
