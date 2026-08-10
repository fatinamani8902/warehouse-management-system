import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lookupSkus } from "@/services/api";

const ACCENT = "#3b5bdb";
const T_PRIMARY = "#111827";
const T_SECONDARY = "#374151";
const T_MUTED = "#9ca3af";
const BORDER = "#d1d5db";

export default function SkuCombobox({
  session,
  value,
  onChange,
  disabled = false,
  placeholder = "Search SKU code or description...",
  error,
  excludeIds = [],
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [menuStyle, setMenuStyle] = useState({});
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const listboxId = useId();
  const lookupSession = useMemo(() => ({
    tenant_id: session?.tenant_id,
    user_id: session?.user_id,
    role_id: session?.role_id,
    warehouse_id: session?.warehouse_id,
    token: session?.token,
  }), [
    session?.tenant_id,
    session?.user_id,
    session?.role_id,
    session?.warehouse_id,
    session?.token,
  ]);

  useEffect(() => {
    if (!value) setSelected(null);
  }, [value]);

  useEffect(() => {
    const selectedOption = options.find((sku) => sku.sku_id === value);
    if (selectedOption) setSelected(selectedOption);
  }, [options, value]);

  useEffect(() => {
    const handler = (event) => {
      if (
        wrapRef.current
        && !wrapRef.current.contains(event.target)
        && !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const positionMenu = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;

      const dialogHost = wrapRef.current.closest('[role="dialog"]');
      const hostRect = dialogHost?.getBoundingClientRect();
      const maxMenuHeight = 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < maxMenuHeight && rect.top > spaceBelow;
      const viewportTop = openAbove ? Math.max(8, rect.top - maxMenuHeight - 4) : rect.bottom + 4;
      setMenuStyle({
        position: dialogHost ? "absolute" : "fixed",
        left: dialogHost ? rect.left - hostRect.left : rect.left,
        top: dialogHost ? viewportTop - hostRect.top : viewportTop,
        width: rect.width,
        maxHeight: maxMenuHeight,
      });
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !lookupSession.tenant_id) return undefined;

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setLoadError("");
        const rows = await lookupSkus(lookupSession, query);
        if (active) {
          setOptions(rows);
          setActiveIndex(rows.length > 0 ? 0 : -1);
        }
      } catch (requestError) {
        if (active) {
          setOptions([]);
          setLoadError(requestError.message || "Unable to load SKUs");
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    open,
    query,
    lookupSession,
  ]);

  const excluded = new Set(excludeIds.filter((id) => id && id !== value));
  const availableOptions = options.filter((sku) => !excluded.has(sku.sku_id));

  const handleSelect = (sku) => {
    setSelected(sku);
    onChange(sku.sku_id, sku);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const handleClear = (event) => {
    event.stopPropagation();
    setSelected(null);
    onChange("", null);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, availableOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0 && activeIndex < availableOptions.length) {
      event.preventDefault();
      handleSelect(availableOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      wrapRef.current?.querySelector("button")?.focus();
    }
  };

  const handleTriggerKeyDown = (event) => {
    if (!["ArrowDown", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const displayLabel = selected?.sku_id === value
    ? `${selected.sku_code} - ${selected.description}`
    : value || placeholder;

  const portalHost = typeof document !== "undefined"
    ? wrapRef.current?.closest('[role="dialog"]') || document.body
    : null;
  const dropdown = open && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={{
          ...menuStyle,
          zIndex: 10000,
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
          overflow: "hidden",
          pointerEvents: "auto",
        }}
      >
        <div style={{ padding: 10, borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search SKU code or description..."
            aria-label="Search SKUs"
            aria-controls={listboxId}
            aria-activedescendant={
              activeIndex >= 0 && availableOptions[activeIndex]
                ? `${listboxId}-${availableOptions[activeIndex].sku_id}`
                : undefined
            }
            onKeyDown={handleSearchKeyDown}
            style={{
              width: "100%",
              height: 40,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              outline: "none",
              padding: "0 10px",
              fontSize: 13,
              fontWeight: 400,
              lineHeight: "20px",
              color: T_PRIMARY,
              fontFamily: "inherit",
            }}
          />
        </div>

        <div id={listboxId} style={{ maxHeight: 244, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 18, textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_MUTED }}>
              Loading SKUs...
            </div>
          )}
          {!loading && loadError && (
            <div style={{ padding: 18, textAlign: "center", fontSize: 12, fontWeight: 500, lineHeight: "16px", color: "#991b1b" }}>
              {loadError}
            </div>
          )}
          {!loading && !loadError && availableOptions.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_MUTED }}>
              No active SKUs found.
            </div>
          )}
          {!loading && !loadError && availableOptions.map((sku) => (
            <button
              type="button"
              role="option"
              aria-selected={sku.sku_id === value}
              id={`${listboxId}-${sku.sku_id}`}
              key={sku.sku_id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(sku)}
              onMouseEnter={() => setActiveIndex(availableOptions.indexOf(sku))}
              style={{
                width: "100%",
                padding: "11px 12px",
                border: "none",
                borderBottom: "1px solid #f1f5f9",
                background: sku.sku_id === value || availableOptions[activeIndex]?.sku_id === sku.sku_id
                  ? "#eef2ff"
                  : "#fff",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>
                {sku.sku_code} - {sku.description || "No description"}
              </div>
              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_SECONDARY }}>
                {sku.sku_id}{sku.uom ? ` | ${sku.uom}` : ""}
              </div>
            </button>
          ))}
        </div>
      </div>,
      portalHost,
    )
    : null;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <button
        type="button"
        onClick={() => {
          if (disabled || !session?.tenant_id) return;
          setOpen((current) => !current);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        disabled={disabled || !session?.tenant_id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={handleTriggerKeyDown}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 36,
          padding: "0 10px",
          borderRadius: 7,
          border: `1px solid ${error ? "#fca5a5" : open ? ACCENT : BORDER}`,
          background: disabled ? "#f9fafb" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 13,
          color: value ? T_PRIMARY : T_MUTED,
          boxShadow: open ? "0 0 0 3px rgba(59,91,219,0.12)" : "none",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayLabel}
        </span>
        {value && !disabled && (
          <span onClick={handleClear} title="Clear" style={{ color: T_MUTED, padding: "0 3px" }}>
            x
          </span>
        )}
      </button>

      {dropdown}

      {error && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
