import { useState } from "react";
import SupplierSelect from "@/components/selects/SupplierSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAsn } from "@/services/api";

export default function CreateASN({ session, onCreated, onCancel }) {
  const [supplierId, setSupplierId] = useState("");
  const [eta, setEta] = useState(() => new Date().toISOString().slice(0, 10));
  const [linesCount, setLinesCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const nextErrors = {};
    if (!supplierId) {
      nextErrors.supplier_id = "Supplier is required";
    }
    if (!eta) {
      nextErrors.eta = "Expected arrival date is required";
    }
    if (!Number.isFinite(Number(linesCount)) || Number(linesCount) < 0) {
      nextErrors.lines_count = "Lines must be 0 or greater";
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
      const created = await createAsn(session, {
        supplier_id: supplierId,
        eta,
        lines_count: Number(linesCount),
        notes,
      });
      onCreated(created.data);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        form: error.message || "Failed to create ASN",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="create-asn-supplier">Supplier</Label>
        <SupplierSelect
          id="create-asn-supplier"
          session={session}
          value={supplierId}
          onChange={setSupplierId}
          required
          hasError={Boolean(errors.supplier_id)}
        />
        {errors.supplier_id && <p className="text-xs text-destructive">{errors.supplier_id}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-asn-eta">Expected Arrival</Label>
        <Input id="create-asn-eta" type="date" value={eta} onChange={(event) => setEta(event.target.value)} />
        {errors.eta && <p className="text-xs text-destructive">{errors.eta}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-asn-lines">Line Count</Label>
        <Input
          id="create-asn-lines"
          type="number"
          min="0"
          value={linesCount}
          onChange={(event) => setLinesCount(event.target.value)}
        />
        {errors.lines_count && <p className="text-xs text-destructive">{errors.lines_count}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-asn-notes">Notes</Label>
        <Textarea id="create-asn-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </div>

      {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create ASN"}
        </Button>
      </div>
    </form>
  );
}
