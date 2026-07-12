'use client'

import Select from "react-select";
import { useState } from "react";

const languageOptions = [
  { value: "he", label: "Hebrew" },
  { value: "ar", label: "Arabic" },
  { value: "fa", label: "Farsi" },
  { value: "prs", label: "Dari" },
  { value: "ps", label: "Pashto" },
  { value: "ps-AF", label: "Pashto (Afghanistan) " },
  { value: "ps-PK", label: "Pashto (Pakistan) " },
  { value: "ur", label: "Urdu" },
  { value: "other", label: "Other..." },
];

function LanguageSelect({ value, onChange }: {
  value: string | undefined,
  onChange: (language: string | null) => void,
}) {
  const [showingOther, setShowingOther] = useState<boolean>(false);
  function handleChange(o: { value: string, label: string }) {
    if (!o) {
      onChange(null);
      if (showingOther) setShowingOther(false);
    } else if (o.value === "other") {
      setShowingOther(true);
      onChange(null);
    } else {
      if (showingOther) setShowingOther(false);
      onChange(o.value);
    }
  }
  return <div>
    <div className="mt-4 mb-2">שפה:</div>
    <Select
      className="basic-single"
      classNamePrefix="select"
      isClearable={true}
      value={languageOptions.find(o => value === o.value)}
      isSearchable
      // @ts-ignore
      onChange={handleChange}
      // @ts-ignore
      options={languageOptions}
    />
    {showingOther && <div className="my-2">
      <label htmlFor="otherLang" className="form-label d-flex flex-row align-items-center">
        <span>קוד שפה מותאם לפי <a href="https://www.w3.org/International/articles/language-tags/" target="_blank" rel="noreferrer">IETF BCP 47</a></span>
      </label>
      <input onChange={(e) => onChange(e.target.value)} type="text" className="form-control" id="otherLang" />
    </div>}
  </div>;
}

export default LanguageSelect;
