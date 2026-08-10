/**
 * CustomerCombobox.jsx
 * --------------------
 * Searchable customer dropdown. Accepts live customer list from API.
 * Filters by customer name, ID, or contact as user types.
 *
 * Place at: src/components/shared/CustomerCombobox.jsx
 *
 * Usage:
 *   import CustomerCombobox from "@/components/shared/CustomerCombobox";
 *
 *   <CustomerCombobox
 *     customers={customers}        // array of { customer_id, customer_name, contact? }
 *     loading={customersLoading}
 *     value={customerId}
 *     onChange={(id, name) => { setCustomerId(id); setCustomerName(name); }}
 *     disabled={loading}
 *     error={error}
 *   />
 */

import { useEffect, useRef, useState } from "react";

const ACCENT      = "#3b5bdb";
const T_PRIMARY   = "#111827";
const T_SECONDARY = "#374151";
const T_LABEL     = "#6b7280";
const T_MUTED     = "#9ca3af";
const BORDER      = "#d1d5db";

export default function CustomerCombobox({
  customers = [],
  loading = false,
  value,
  onChange,
  disabled = false,
  placeholder = "Search customer name or ID…",
  error,
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const inputRef          = useRef(null);
  const wrapRef           = useRef(null);

  const selected = customers.find((c) => c.customer_id === value);

  const filtered = query.trim()
    ? customers.filter((c) => {
        const q = query.toLowerCase();
        return (
          (c.customer_name || "").toLowerCase().includes(q) ||
          (c.customer_id   || "").toLowerCase().includes(q) ||
          (c.contact       || "").toLowerCase().includes(q)
        );
      })
    : customers;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (customer) => {
    onChange(customer.customer_id, customer.customer_name);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("", "");
    setQuery("");
    setOpen(false);
  };

  const handleTriggerClick = () => {
    if (disabled || loading) return;
    setOpen((prev) => !prev);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Loading state
  if (loading) {
    return (
      <div style={{
        height: 36, padding: "0 10px", borderRadius: 7,
        border: `1px solid ${BORDER}`, background: "#f9fafb",
        display: "flex", alignItems: "center", fontSize: 13, color: T_MUTED,
      }}>
        Loading customers…
      </div>
    );
  }

  // Fallback — no customers in system yet, free text input
  if (!loading && customers.length === 0) {
    return (
      <input
        style={{
          width: "100%", height: 36, padding: "0 10px", borderRadius: 7,
          border: `1px solid ${error ? "#fca5a5" : BORDER}`,
          fontSize: 13, color: T_PRIMARY, fontFamily: "inherit",
          outline: "none", background: disabled ? "#f9fafb" : "#fff",
        }}
        placeholder="Enter customer name"
        value={value || ""}
        onChange={(e) => onChange("", e.target.value)}
        disabled={disabled}
      />
    );
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger */}
      <div
        onClick={handleTriggerClick}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 36, padding: "0 10px", borderRadius: 7,
          border: `1px solid ${error ? "#fca5a5" : open ? ACCENT : BORDER}`,
          background: disabled ? "#f9fafb" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 13, color: selected ? T_PRIMARY : T_MUTED,
          boxShadow: open ? "0 0 0 3px rgba(59,91,219,0.12)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          userSelect: "none", gap: 6, overflow: "hidden",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? (
            <>
              <span style={{ fontWeight: 600, color: T_PRIMARY }}>{selected.customer_name}</span>
              {selected.customer_id && (
                <span style={{ color: T_MUTED, fontSize: 12, marginLeft: 6 }}>
                  {selected.customer_id}
                </span>
              )}
            </>
          ) : placeholder}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {selected && !disabled && (
            <span
              onClick={handleClear}
              title="Clear"
              style={{ color: T_MUTED, fontSize: 14, lineHeight: 1, padding: "0 2px", cursor: "pointer" }}
            >
              ×
            </span>
          )}
          <span style={{ color: T_MUTED, fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          zIndex: 9000, background: "#fff",
          border: `1px solid ${BORDER}`, borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {/* Search */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: T_MUTED, fontSize: 14 }}>🔍</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, ID or contact…"
                style={{
                  flex: 1, border: "none", outline: "none",
                  fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY,
                  background: "transparent", fontFamily: "inherit",
                }}
              />
              {query && (
                <span onClick={() => setQuery("")} style={{ color: T_MUTED, cursor: "pointer", fontSize: 14 }}>×</span>
              )}
            </div>
          </div>

          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "16px 14px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_MUTED }}>
                No customer found matching "{query}"
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.customer_id === value;
                return (
                  <div
                    key={c.customer_id}
                    onClick={() => handleSelect(c)}
                    style={{
                      padding: "9px 12px", cursor: "pointer",
                      background: isSelected ? "#eef2ff" : "transparent",
                      borderBottom: "0.5px solid #f5f5f5",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f5f7ff"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ width: 14, flexShrink: 0, color: ACCENT, fontSize: 12 }}>
                      {isSelected ? "✓" : ""}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>
                          {c.customer_name}
                        </span>
                        {c.customer_id && (
                          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_MUTED }}>
                            {c.customer_id}
                          </span>
                        )}
                      </div>
                      {c.contact && (
                        <div style={{ fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_LABEL, marginTop: 1 }}>
                          {c.contact}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
