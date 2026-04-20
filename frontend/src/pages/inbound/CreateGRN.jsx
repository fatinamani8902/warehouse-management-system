import { useEffect, useMemo, useState } from "react";
import SupplierSelect from "@/components/selects/SupplierSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createGrn } from "@/services/api";

export default function CreateGRN({ session, asns, onCreated, onCancel }) {
  const [asnId, setAsnId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const asnLookup = useMemo(() => {
    const map = new Map();
    (asns || []).forEach((asn) => map.set(asn.asn_id, asn));
    return map;
  }, [asns]);

  useEffect(() => {
    if (!asnId) {
      return;
    }

    const linkedAsn = asnLookup.get(asnId);
    if (linkedAsn?.supplier_id) {
      setSupplierId(linkedAsn.supplier_id);
      setErrors((current) => {
        const { supplier_id, ...rest } = current;
        return rest;
      });
    }
  }, [asnId, asnLookup]);

  const supplierLocked = Boolean(asnId);

  const validate = () => {
    const nextErrors = {};
    if (!receivedDate) {
      nextErrors.received_date = "Receiving date is required";
    }

    if (!asnId && !supplierId) {
      nextErrors.supplier_id = "Supplier is required when ASN is not selected";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        asn_id: asnId || null,
        supplier_id: supplierId,
        received_date: receivedDate,
        notes,
      };
      const created = await createGrn(session, payload);
      onCreated(created);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        form: error.message || "Failed to create GRN",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="create-grn-asn">ASN Reference</Label>
        <select
          id="create-grn-asn"
          className="w-full border rounded px-2 py-1 h-9 bg-white"
          value={asnId}
          onChange={(event) => setAsnId(event.target.value)}
        >
          <option value="">No ASN (Direct Receipt)</option>
          {(asns || [])
  .filter((asn) => asn.asn_id)
  .map((asn) => (
            <option key={asn.asn_id} value={asn.asn_id}>
              {asn.asn_id} - {asn.status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-grn-supplier">Supplier</Label>
        <SupplierSelect
          id="create-grn-supplier"
          session={session}
          value={supplierId}
          onChange={setSupplierId}
          disabled={supplierLocked}
          required={!supplierLocked}
          hasError={Boolean(errors.supplier_id)}
        />
        {supplierLocked && (
          <p className="text-xs text-muted-foreground">Supplier is derived from the selected ASN.</p>
        )}
        {errors.supplier_id && <p className="text-xs text-destructive">{errors.supplier_id}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-grn-date">Receiving Date</Label>
        <Input
          id="create-grn-date"
          type="date"
          value={receivedDate}
          onChange={(event) => setReceivedDate(event.target.value)}
        />
        {errors.received_date && <p className="text-xs text-destructive">{errors.received_date}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-grn-notes">Notes</Label>
        <Textarea id="create-grn-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </div>

      {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create GRN"}
        </Button>
      </div>
    </form>
  );
}
