import { useEffect, useId, useRef, useState } from "react";

export default function WeekSelect({ value, options, currentWeek, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    function close(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function closeWithEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithEscape);

    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  function choose(week) {
    setOpen(false);
    if (week !== value) onChange(week);
  }

  return <div className={`week-select${open ? " is-open" : ""}`} ref={rootRef}>
    <button className="week-select-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)} disabled={disabled}>
      <span>{value || "Seleccionar semana"}{value === currentWeek && <small>actual</small>}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
    </button>
    {open && <div className="week-select-menu" id={listId} role="listbox" aria-label="Keys de estadísticas">
      {options.map((week) => <button type="button" role="option" aria-selected={week === value} className={week === value ? "is-selected" : ""} onClick={() => choose(week)} key={week}>
        <span><strong>{week}</strong>{week === currentWeek && <small>Semana actual</small>}</span>
        {week === value && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10 3.4 3.4 7.6-7.6" /></svg>}
      </button>)}
    </div>}
  </div>;
}
