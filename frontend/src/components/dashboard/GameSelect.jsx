import { useEffect, useId, useRef, useState } from "react";

export default function GameSelect({ id, value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();
  const selected = options.find((game) => game.key === value);

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

  function choose(gameKey) {
    setOpen(false);
    if (gameKey !== value) onChange(gameKey);
  }

  return <div className={`week-select game-select${open ? " is-open" : ""}`} ref={rootRef}>
    <button className="week-select-trigger" id={id} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)} disabled={disabled}>
      <span>{selected?.name || "Seleccionar juego"}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
    </button>
    {open && <div className="week-select-menu" id={listId} role="listbox" aria-label="Juegos disponibles">
      {options.map((game) => <button type="button" role="option" aria-selected={game.key === value} className={game.key === value ? "is-selected" : ""} onClick={() => choose(game.key)} key={game.key}>
        <span><strong>{game.name}</strong><small>{game.key}</small></span>
        {game.key === value && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10 3.4 3.4 7.6-7.6" /></svg>}
      </button>)}
    </div>}
  </div>;
}
