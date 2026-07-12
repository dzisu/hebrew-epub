'use client'

import { bookRequest } from "@/lib/fetchers";
import { useState, useRef } from "react";
import DocReceiver from "@/components/DocReceiver";
import BookInfoInput from "@/components/BookInfoInput";
import FormatGuideModal from "@/components/FormatGuideModal";

export type Frontmatter = Record<string, string>;

type ConversionStatus = "idle" | "uploading" | "processing" | "ready" | "error";

const statusSteps = [
  { key: "uploading", label: "העלאה" },
  { key: "processing", label: "המרה" },
  { key: "ready", label: "מוכן" },
];

export default function Home() {
  const mdRef = useRef<any>(null);
  const [showFormatGuide, setShowFormatGuide] = useState<boolean>(false);
  const [submissionStatus, setSubmissionStatus] = useState<ConversionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("בחר קובץ או הדבק טקסט כדי להתחיל.");
  function handleReceiveText(m: string) {
    mdRef.current.value = m;
    setSubmissionStatus("idle");
    setStatusMessage("התוכן נטען. אפשר להשלים פרטי ספר וליצור EPUB.");
  }
  function clearText() {
    mdRef.current.value = "";
    setSubmissionStatus("idle");
    setStatusMessage("בחר קובץ או הדבק טקסט כדי להתחיל.");
  }
  function handleSubmit(info: { frontmatter: Frontmatter, cover: File | undefined }) {
    const content = mdRef.current.value as string;
    if (!content) {
      setSubmissionStatus("error");
      setStatusMessage("יש לבחור קובץ או להזין טקסט.");
      return;
    }
    if (!info.frontmatter.title) {
      setSubmissionStatus("error");
      setStatusMessage("יש להזין כותרת לספר.");
      return;
    }
    setSubmissionStatus("uploading");
    setStatusMessage("מעלה את התוכן...");
    bookRequest({
      ...info,
      content,
    }, {
      complete: () => {
        setSubmissionStatus("ready");
        setStatusMessage("הקובץ מוכן וההורדה החלה.");
      },
      progress: (p) => {
        setSubmissionStatus(p < 100 ? "uploading" : "processing");
        setStatusMessage(p < 100 ? `מעלה את התוכן... ${p}%` : "ממיר ל-EPUB עברי...");
      },
      error: () => {
        setSubmissionStatus("error");
        setStatusMessage("ההמרה נכשלה. נסה שוב או החלף קובץ מקור.");
      },
    });
  }
  return <main className="app-shell" dir="rtl">
    <div className="app-header">
      <div>
        <h1>יצירת EPUB עברי</h1>
        <p>המרת מסמכים לספר EPUB תקין וידידותי לעברית.</p>
      </div>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowFormatGuide(true)}>
        מדריך עיצוב
      </button>
    </div>
    <div className="app-grid">
      <section className="workspace-panel" aria-label="תוכן ופרטי הספר">
        <h2>מקור</h2>
        <DocReceiver handleReceiveText={handleReceiveText} />
        <div className="mt-3">
          <label htmlFor="mdTextarea" className="form-label">
            או הדבק טקסט להמרה
          </label>
          <textarea
            placeholder="הדבק כאן Markdown או טקסט חופשי..."
            spellCheck="false"
            dir="rtl"
            ref={mdRef}
            className="form-control text-source"
            id="mdTextarea"
            rows={12}
          />
        </div>
        <div className="toolbar-row">
          <button type="button" className="btn btn-sm btn-light" onClick={clearText}>נקה</button>
        </div>
        <h2>פרטי הספר</h2>
        <BookInfoInput handleSubmit={handleSubmit} isBusy={submissionStatus === "uploading" || submissionStatus === "processing"} />
      </section>
      <aside className="status-panel" aria-label="סטטוס המרה">
        <h2>סטטוס</h2>
        <ol className="status-steps">
          {statusSteps.map((step) => (
            <li className={submissionStatus === step.key || submissionStatus === "ready" ? "active" : ""} key={step.key}>
              {step.label}
            </li>
          ))}
        </ol>
        <div className={`status-message ${submissionStatus}`} aria-live="polite">
          {statusMessage}
        </div>
        <div className="epub-note">
          <strong>יעד EPUB</strong>
          <span>עברית RTL, פונט Frank Ruhl Libre, ותקינות EPUB 3.3.</span>
        </div>
        <div className="epub-note muted">
          PDF סרוק ללא שכבת טקסט יזוהה כלא נתמך בשלב הנוכחי. OCR לא כלול בגרסה זו.
        </div>
      </aside>
    </div>
    <footer className="app-footer text-muted">
      <p className="lead">מבוסס על <a className="em-link" href="https://github.com/lingdocs/rtl-epub-maker">RTL EPUB Maker</a></p>
      <p>הקבצים מעובדים זמנית בצד השרת. אין להעלות מסמכים רגישים לפני הפעלה מאובטחת.</p>
    </footer>
    <FormatGuideModal show={showFormatGuide} onHide={() => setShowFormatGuide(false)} />
  </main>
}
