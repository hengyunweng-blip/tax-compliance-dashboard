"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  formatAustralianDateInput,
  parseAustralianDateInput,
  type DateOnly,
} from "@/lib/time/melbourne";

type Props = {
  ariaLabel: string;
  value: DateOnly | null;
  onChange: (value: DateOnly | null) => void;
};

export function DateTextInput({ ariaLabel, value, onChange }: Props) {
  const [draft, setDraft] = useState(() => formatAustralianDateInput(value));

  useEffect(() => {
    setDraft(formatAustralianDateInput(value));
  }, [value]);

  function handleChange(next: string) {
    setDraft(next);
    const parsed = parseAustralianDateInput(next);
    if (parsed || next.trim() === "") {
      onChange(parsed);
    }
  }

  function handleBlur() {
    const parsed = parseAustralianDateInput(draft);
    if (parsed) {
      setDraft(formatAustralianDateInput(parsed));
      onChange(parsed);
      return;
    }

    if (draft.trim() === "") {
      onChange(null);
      return;
    }

    setDraft(formatAustralianDateInput(value));
  }

  return (
    <label className="date-input-text">
      <input
        type="text"
        aria-label={ariaLabel}
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
      <span className="date-input-format">格式：DD/MM/YYYY</span>
      <CalendarDays size={16} aria-hidden="true" />
    </label>
  );
}
