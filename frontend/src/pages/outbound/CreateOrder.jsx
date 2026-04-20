import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createOrder, fetchCustomers, toSessionContext } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export default function CreateOrder({ onCreated, onCancel }) {
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setCustomersLoading(true);
        const result = await fetchCustomers(session, {});
        setCustomers(Array.isArray(result?.data) ? result.data : []);
      } catch (err) {
        console.error("Failed to load customers:", err);
      } finally {
        setCustomersLoading(false);
      }
    };
    loadCustomers();
  }, [session]);

  const handleCustomerChange = (e) => {
    const selectedId = e.target.value;
    setCustomerId(selectedId);
    const found = customers.find((c) => c.customer_id === selectedId);
    setCustomerName(found?.customer_name || "");
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!customerId && !customerName.trim()) {
      setError("Customer is required");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await createOrder(session, {
        customer_name: customerName.trim(),
        customer_id: customerId || null,
        notes: notes?.trim() || "",
        lines: [],
      });

      const order = response?.data;
      if (!order) throw new Error("Invalid response from server");

      onCreated(order);
    } catch (err) {
      console.error("Create order failed:", err);
      setError(err.message || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>

      <div className="space-y-1.5">
        <Label>Customer <span className="text-destructive">*</span></Label>
        {customersLoading ? (
          <select className="w-full border rounded px-2 py-1 h-9 bg-muted/40" disabled>
            <option>Loading customers...</option>
          </select>
        ) : customers.length > 0 ? (
          <select
            className="w-full border rounded px-2 py-1 h-9 bg-white"
            value={customerId}
            onChange={handleCustomerChange}
            disabled={loading}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.customer_name}{c.contact ? ` — ${c.contact}` : ""}
              </option>
            ))}
          </select>
        ) : (
          // Fallback — kalau tiada customers dalam Master Data
          <input
            className="w-full border rounded px-2 py-1 h-9"
            placeholder="Enter customer name"
            value={customerName}
            onChange={(e) => { setCustomerName(e.target.value); setError(""); }}
            disabled={loading}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          placeholder="Optional notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Order"}
        </Button>
      </div>

    </form>
  );
}