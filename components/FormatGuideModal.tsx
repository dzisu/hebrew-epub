'use client'

import { Modal } from "react-bootstrap";

function FormatGuideModal(props: {
  show: boolean,
  onHide: () => void,
}) {
  return (
    <Modal
      {...props}
      size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">
          מדריך עיצוב קצר
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          אפשר לעצב את הספר באמצעות <a href="https://www.markdowntutorial.com/">Markdown</a>. להמרה בסיסית מספיק להקפיד על שני כללים:
        </p>
        <ol>
          <li>כדי ליצור <strong>כותרת פרק</strong>, כתוב <samp># </samp> לפני שם הפרק.</li>
          <li>השאר <strong>שורה ריקה בין פסקאות</strong>.</li>
        </ol>
        <p>לדוגמה:</p>
        <textarea
          spellCheck="false"
          className="form-control"
          rows={15}
          dir="rtl"
        >{`# פרק ראשון

זו פסקה ראשונה בספר. הטקסט יישמר בכיוון קריאה מימין לשמאל ויומר לקובץ EPUB.

זו פסקה שנייה. חשוב להשאיר שורה ריקה בין הפסקאות.

# פרק שני

אפשר להמשיך בפרקים נוספים לפי אותו מבנה.
`}</textarea>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="secondary-action" onClick={props.onHide}>
          סגור
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export default FormatGuideModal;
