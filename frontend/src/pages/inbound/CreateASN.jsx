import { useState } from "react";
import SkuCombobox from "@/components/shared/SkuCombobox";
import SupplierSelect from "@/components/selects/SupplierSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAsn } from "@/services/api";

// -- Design tokens -------------------------------------------------------------
const T_PRIMARY   = "#111827";
const T_LABEL     = "#6b7280";
const T_MUTED     = "#9ca3af";
const ACCENT      = "#3b5bdb";

const btnBase    = { cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnPrimary = { ...btnBase, height: 30, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 26, padding: "0 10px", borderRadius: 5, fontSize: 12, border: "0.5px solid #fca5a5", background: "#fee2e2", color: "#b91c1c" };

let lineSequence = 0;
const createEmptyLine = () => ({
  line_key: `asn-line-${lineSequence += 1}`,
  sku_id: "",
  expected_qty: "",
});

export default function CreateASN({ session, onCreated, onCancel }) {
  const [supplierId, setSupplierId]   = useState("");
  const [eta, setEta]                 = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes]             = useState("");
  const [lines, setLines]             = useState(() => [createEmptyLine()]);
  const [errors, setErrors]           = useState({});
  const [submitting, setSubmitting]   = useState(false);
  // -- Line helpers ---------------------------------------------------------
  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.lines;
      return next;
    });
  };

  const removeLine = (idx) => {
    if (lines.length === 1) return; // keep at least 1 row
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`line_${idx}_sku`];
      delete next[`line_${idx}_qty`];
      return next;
    });
  };

  const updateLine = (idx, field, value) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.lines;
      delete next[`line_${idx}_${field === "sku_id" ? "sku" : "qty"}`];
      return next;
    });
  };

  // -- Validation -----------------------------------------------------------
  const validate = () => {
    const nextErrors = {};
    if (!supplierId) nextErrors.supplier_id = "Supplier is required";
    if (!eta)        nextErrors.eta         = "Expected arrival date is required";

    const hasAnyLine = lines.some((l) => l.sku_id || l.expected_qty);
    if (!hasAnyLine) {
      nextErrors.lines = "Add at least one SKU line";
    } else {
      lines.forEach((l, idx) => {
        if (!l.sku_id)                                                      nextErrors[`line_${idx}_sku`] = "Select a SKU";
        if (!l.expected_qty || Number(l.expected_qty) <= 0)                 nextErrors[`line_${idx}_qty`] = "Enter qty > 0";
        if (l.sku_id) {
          const dupIdx = lines.findIndex((other, i) => i !== idx && other.sku_id === l.sku_id);
          if (dupIdx !== -1)                                                 nextErrors[`line_${idx}_sku`] = "Duplicate SKU";
        }
      });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // -- Submit ---------------------------------------------------------------
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    const validLines = lines.filter((l) => l.sku_id && Number(l.expected_qty) > 0);

    try {
      setSubmitting(true);
      const created = await createAsn(session, {
        supplier_id: supplierId,
        eta,
        lines:       validLines.map((l) => ({ sku_id: l.sku_id, expected_qty: Number(l.expected_qty) })),
        lines_count: validLines.length,
        notes,
      });
      onCreated(created.data ?? created);
    } catch (error) {
      setErrors((current) => ({ ...current, form: error.message || "Failed to create ASN" }));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSkuIds = lines.map((line) => line.sku_id).filter(Boolean);

  // -- Render ----------------------------------------------------------------
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={handleSubmit}>

      {/* Supplier */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Label htmlFor="create-asn-supplier">
          Supplier <span style={{ color: "#e03131" }}>*</span>
        </Label>
        <SupplierSelect
          id="create-asn-supplier"
          session={session}
          value={supplierId}
          onChange={(value) => {
            setSupplierId(value);
            setErrors((current) => {
              const next = { ...current };
              delete next.supplier_id;
              return next;
            });
          }}
          required
          hasError={Boolean(errors.supplier_id)}
        />
        {errors.supplier_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{errors.supplier_id}</p>}
      </div>

      {/* ETA */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Label htmlFor="create-asn-eta">
          Expected Arrival <span style={{ color: "#e03131" }}>*</span>
        </Label>
        <Input
          id="create-asn-eta"
          type="date"
          value={eta}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => { setErrors((c) => { const n = {...c}; delete n.eta; return n; }); setEta(e.target.value); }}
        />
        {errors.eta && <p style={{ fontSize: 12, color: "#991b1b" }}>{errors.eta}</p>}
      </div>

      {/* SKU Lines */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Label>
            SKU Lines
            <span style={{ fontSize: 11, color: T_MUTED, fontWeight: 400, marginLeft: 6 }}>
              ({lines.filter((l) => l.sku_id).length} item{lines.filter((l) => l.sku_id).length !== 1 ? "s" : ""})
            </span>
          </Label>
          <button type="button" style={btnPrimary} onClick={addLine} disabled={submitting}>
            + Add Line
          </button>
        </div>
        {errors.lines && <p style={{ fontSize: 12, color: "#991b1b" }}>{errors.lines}</p>}

        {/* Lines table */}
        <div style={{ border: "0.5px solid #e5e7eb", borderRadius: 8, overflow: "visible" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.05em" }}>SKU</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.05em", width: 110 }}>Expected Qty</th>
                <th style={{ padding: "8px 12px", width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                return (
                  <tr key={line.line_key} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                    {/* SKU select */}
                    <td style={{ padding: "8px 12px" }}>
                      <SkuCombobox
                        session={session}
                        value={line.sku_id}
                        onChange={(skuId) => updateLine(idx, "sku_id", skuId)}
                        excludeIds={selectedSkuIds}
                        disabled={submitting}
                        error={errors[`line_${idx}_sku`]}
                        placeholder="Search active SKU..."
                      />
                    </td>

                    {/* Qty */}
                    <td style={{ padding: "8px 12px" }}>
                      <input
                        type="number" min="1"
                        value={line.expected_qty}
                        onChange={(e) => updateLine(idx, "expected_qty", e.target.value)}
                        disabled={submitting}
                        style={{
                          width: "100%", height: 32, border: `0.5px solid ${errors[`line_${idx}_qty`] ? "#fca5a5" : "#d1d5db"}`,
                          borderRadius: 6, padding: "0 8px", fontSize: 13, textAlign: "right",
                          color: T_PRIMARY, outline: "none", fontFamily: "var(--font-mono)",
                        }}
                        placeholder="0"
                      />
                      {errors[`line_${idx}_qty`] && (
                        <p style={{ fontSize: 11, color: "#991b1b", marginTop: 2 }}>{errors[`line_${idx}_qty`]}</p>
                      )}
                    </td>

                    {/* Remove */}
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <button
                        type="button"
                        style={{ ...btnDanger, opacity: lines.length === 1 ? 0.4 : 1, cursor: lines.length === 1 ? "not-allowed" : "pointer" }}
                        disabled={lines.length === 1 || submitting}
                        onClick={() => removeLine(idx)}
                        title="Remove line"
                      >
                        ?
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Label htmlFor="create-asn-notes">Notes</Label>
        <Textarea
          id="create-asn-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional remarks"
          disabled={submitting}
        />
      </div>

      {errors.form && <p style={{ fontSize: 12, color: "#991b1b" }}>{errors.form}</p>}

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating�" : "Create ASN"}
        </Button>
      </div>
    </form>
  );
}
