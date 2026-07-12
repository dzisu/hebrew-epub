'use client'

import { ChangeEvent, useEffect, useState, useRef } from "react";
import Select from "react-select";
import { Frontmatter } from "@/app/page";

const requiredFields = [
  "title",
];

const suggestedFields = [
  "author",
]

const otherFields = [
  "date",
  "description",
  "rights",
  "belongs-to-collection",
  "editor",
  "translator",
];

const possibleFields = [...suggestedFields, ...otherFields];

const fieldLabels: Record<string, string> = {
  title: "כותרת הספר",
  author: "מחבר",
  date: "תאריך",
  description: "תיאור",
  rights: "זכויות",
  "belongs-to-collection": "סדרה",
  editor: "עורך",
  translator: "מתרגם",
};

type Option = {
  value: string,
  label: string,
};

const baseSettings = {
  dir: "rtl",
  lang: "he",
  language: "he",
  "page-progression-direction": "rtl",
};

function BookInfoInput({
  handleSubmit,
  isBusy = false,
  suggestedTitle = "",
}: {
  handleSubmit: (info: { frontmatter: Frontmatter, cover: File | undefined }) => void,
  isBusy?: boolean,
  suggestedTitle?: string,
}) {
  const coverRef = useRef<any>(null);
  const [fieldsChosen, setFieldsChosen] = useState<string[]>(suggestedFields);
  const [state, setState] = useState<Frontmatter>({});
  const fields = [...requiredFields, ...fieldsChosen];
  const availableFields = possibleFields.filter(f => !fieldsChosen.includes(f));
  const availableFieldsOptions = availableFields.map((f): Option => ({
    value: f,
    label: f,
  }));
  function handleAddField(o: Option) {
    setFieldsChosen(s => [...s, o.value]);
  }
  function handleRemoveField(f: string) {
    setFieldsChosen(s => s.filter(x => x !== f));
    setState(s => {
      const newS = { ...s };
      delete newS[f];
      return newS;
    });
  }
  function handleFieldChange(e: ChangeEvent<HTMLInputElement>) {
    const name = e.target.name;
    const value = e.target.value;
    setState(s => ({
      ...s,
      [name]: value,
    }));
  }
  useEffect(() => {
    if (!suggestedTitle) return;
    setState((current) => current.title ? current : {
      ...current,
      title: suggestedTitle,
    });
  }, [suggestedTitle]);
  function submit() {
    const cover = coverRef.current.files[0] as (File | undefined);
    const frontmatter = {
      ...state,
      ...baseSettings,
    };
    handleSubmit({
      frontmatter,
      cover,
    });
  }
  return <div style={{ maxWidth: "600px" }}>
    <div className="field-block">
      <label htmlFor="cover-file" className="form-label">תמונת כריכה <span className="text-muted">(.jpg או .png עד 5MB)</span></label>
      <input multiple={false} ref={coverRef} className="form-control" type="file" id="cover-file" accept="image/jpeg,image/png" />
    </div>
    {fields.map((field) => (
      <div className="field-block compact" key={field}>
        <label htmlFor={field} className="form-label d-flex flex-row align-items-center">
          {!requiredFields.includes(field) && <span className="me-2">
            <button type="button" className="field-remove" onClick={() => handleRemoveField(field)} aria-label={`הסר ${fieldLabels[field] || field}`}>
              X
            </button>
          </span>}
          <span>{fieldLabels[field] || field}</span>
        </label>
        <input onChange={handleFieldChange} type="text" className="form-control" id={field} name={field} value={state[field] || ""} />
      </div>
    ))}
    <div className="field-help">הוספת שדות metadata</div>
    <Select
      className="basic-single"
      classNamePrefix="select"
      isClearable={true}
      value={[]}
      isSearchable
      // @ts-ignore
      onChange={handleAddField}
      // @ts-ignore
      options={availableFieldsOptions}
    />
    <button disabled={isBusy} onClick={submit} type="button" className="primary-action">
      {isBusy ? "יוצר EPUB..." : "צור EPUB"}
    </button>
  </div>
}

export default BookInfoInput;
