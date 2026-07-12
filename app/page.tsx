'use client'

import { bookRequest } from "@/lib/fetchers";
import { useState, useRef } from "react";
import DocReceiver from "@/components/DocReceiver";
import BookInfoInput from "@/components/BookInfoInput";
import FormatGuideModal from "@/components/FormatGuideModal";

export type Frontmatter = Record<string, string>;

export default function Home() {
  const mdRef = useRef<any>(null);
  const [showFormatGuide, setShowFormatGuide] = useState<boolean>(false);
  const [submissionStatus, setSubmissionStatus] = useState<string>("");
  function handleReceiveText(m: string) {
    mdRef.current.value = m;
  }
  function clearText() {
    mdRef.current.value = "";
  }
  function handleSubmit(info: { frontmatter: Frontmatter, cover: File | undefined }) {
    const content = mdRef.current.value as string;
    if (!content) {
      alert("Please enter some content for the book");
      return;
    }
    if (!info.frontmatter.title) {
      alert("Please enter a title for the book");
      return;
    }
    setSubmissionStatus("");
    bookRequest({
      ...info,
      content,
    }, {
      complete: () => setSubmissionStatus("Done"),
      progress: (p) => setSubmissionStatus(p < 100 ? `Uploading ${p}%...` : "Processing..."),
      error: () => setSubmissionStatus("Error"),
    });
  }
  return <div className="container" dir="rtl" style={{ marginBottom: "50px", maxWidth: "950px" }}>
    <h1 className="mt-3">Hebrew EPUB</h1>
    <p className="lead mb-4">יצירת ספרי EPUB ידידותיים לעברית עם תמיכת RTL</p>
    <h4 className="mb-3">תוכן הספר</h4>
    <DocReceiver handleReceiveText={handleReceiveText} />
    <div className="mt-3">
      <label htmlFor="mdTextarea" className="form-label d-flex flex-row justify-content-between align-items-center">
        <div>טקסט ב-Markdown</div>
        <div>
          <button type="button" className="btn btn-sm btn-light" onClick={() => setShowFormatGuide(true)}>
            מדריך עיצוב
          </button>
        </div>
      </label>
      <textarea
        placeholder="או הדבק כאן את תוכן הספר..."
        spellCheck="false"
        dir="rtl"
        ref={mdRef}
        className="form-control"
        id="mdTextarea"
        rows={15}
      />
    </div>
    <div style={{ textAlign: "right" }}>
      <button type="button" className="btn btn-sm btn-light mt-2" onClick={clearText}>ניקוי</button>
    </div>
    <h4>פרטי הספר</h4>
    <BookInfoInput handleSubmit={handleSubmit} />
    <div>
      <samp>{submissionStatus}</samp>
    </div>
    <div className="text-center mt-4 text-muted">
      <p className="lead">מבוסס על <a className="em-link" href="https://github.com/lingdocs/rtl-epub-maker">RTL EPUB Maker</a></p>
      <p>הקבצים מעובדים זמנית בצד השרת. אין להעלות מסמכים רגישים לפני הפעלה מאובטחת.</p>
    </div>
    <FormatGuideModal show={showFormatGuide} onHide={() => setShowFormatGuide(false)} />
  </div>
}
