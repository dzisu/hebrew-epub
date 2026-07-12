'use client'

import { bookRequest } from "@/lib/fetchers";
import { useState, useRef } from "react";
import DocReceiver from "@/components/DocReceiver";
import BookInfoInput from "@/components/BookInfoInput";
import FormatGuideModal from "@/components/FormatGuideModal";

export type Frontmatter = Record<string, string>;

type ConversionStatus = "idle" | "uploading" | "processing" | "ready" | "error";

const statusSteps = [
  { key: "uploading", label: "קליטת מקור" },
  { key: "processing", label: "בניית EPUB" },
  { key: "ready", label: "קובץ מוכן" },
];

export default function Home() {
  const mdRef = useRef<any>(null);
  const [showFormatGuide, setShowFormatGuide] = useState<boolean>(false);
  const [suggestedTitle, setSuggestedTitle] = useState<string>("");
  const [submissionStatus, setSubmissionStatus] = useState<ConversionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("בחר קובץ או הדבק טקסט כדי להתחיל.");
  function handleReceiveText(m: string, title?: string) {
    mdRef.current.value = m;
    if (title) setSuggestedTitle(title);
    setSubmissionStatus("idle");
    setStatusMessage("התוכן נטען. אפשר להשלים פרטי ספר וליצור EPUB.");
  }
  function clearText() {
    mdRef.current.value = "";
    setSuggestedTitle("");
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
    <div className="app-frame">
      <aside className="rail" aria-label="ניווט פרויקט">
        <div className="rail-mark" aria-hidden="true">HE</div>
        <div className="rail-line" />
      </aside>
      <div className="workspace">
        <header className="app-header">
          <div>
            <p className="eyebrow">Hebrew EPUB Studio</p>
            <h1>יצירת EPUB עברי</h1>
            <p>המרת מסמכים לספר EPUB 3.3 בעברית, בכיוון RTL ובטיפוגרפיה מותאמת לקריאה ארוכה.</p>
          </div>
          <button type="button" className="icon-button guide-button" onClick={() => setShowFormatGuide(true)} aria-label="פתח מדריך עיצוב">
            <span aria-hidden="true">?</span>
          </button>
        </header>
        <div className="app-grid">
          <section className="workspace-panel" aria-label="תוכן ופרטי הספר">
            <div className="section-heading">
              <span>01</span>
              <h2>מקור המסמך</h2>
            </div>
            <DocReceiver handleReceiveText={handleReceiveText} />
            <div className="field-block">
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
              <button type="button" className="secondary-action" onClick={clearText}>נקה תוכן</button>
            </div>
            <div className="section-heading book-heading">
              <span>02</span>
              <h2>פרטי הספר</h2>
            </div>
            <BookInfoInput
              handleSubmit={handleSubmit}
              isBusy={submissionStatus === "uploading" || submissionStatus === "processing"}
              suggestedTitle={suggestedTitle}
            />
          </section>
          <aside className="status-panel" aria-label="סטטוס המרה">
            <div className="section-heading">
              <span>03</span>
              <h2>בקרה</h2>
            </div>
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
              <strong>יעד הפקה</strong>
              <span>EPUB 3.3, עברית RTL, פונט Frank Ruhl Libre, metadata תקין ו־spine מימין לשמאל.</span>
            </div>
            <div className="epub-note">
              <strong>קלט נתמך</strong>
              <span>URL של כתבה, Markdown, TXT, DOC/DOCX, ODT, RTF, EPUB קיים ו־PDF עם שכבת טקסט.</span>
            </div>
            <div className="epub-note muted">
              PDF סרוק ללא שכבת טקסט יזוהה כלא נתמך בשלב הנוכחי. OCR לא כלול בגרסה זו.
            </div>
          </aside>
        </div>
        <footer className="app-footer text-muted">
          <p>מבוסס על <a className="em-link" href="https://github.com/lingdocs/rtl-epub-maker">RTL EPUB Maker</a>. הקבצים מעובדים זמנית בצד השרת; לפני שימוש במסמכים רגישים נדרשת הפעלה מאובטחת.</p>
        </footer>
      </div>
    </div>
    <FormatGuideModal show={showFormatGuide} onHide={() => setShowFormatGuide(false)} />
  </main>
}
