import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createOrder, fetchCustomers, toSessionContext } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import CustomerCombobox from "@/components/shared/CustomerCombobox";

export default function CreateOrder({ session: sessionProp, onCreated, onCancel }) {
  const auth = useAuth();
  // Use passed session if available, fallback to own useAuth
  const ownSession = useMemo(() => toSessionContext(auth), [auth]);
  const session    = sessionProp || ownSession;

  const [customers, setCustomers]               = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerId, setCustomerId]             = useState("");
  const [customerName, setCustomerName]         = useState("");
  const [notes, setNotes]                       = useState("");
  const [shipBy, setShipBy]                     = useState("");
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState("");

  useEffect(() => {
    // Wait for tenant_id before fetching
    if (!session?.tenant_id) return;

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
  }, [session?.tenant_id]);

  const handleCustomerChange = (id, name) => {
    setCustomerId(id);
    setCustomerName(name);
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
        customer_id:   customerId || null,
        notes:         notes?.trim() || "",
        ship_by:       shipBy ? new Date(shipBy).toISOString() : null,
        lines:         [],
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

  const minDate = new Date().toISOString().split("T")[0];

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>

      {/* Customer */}
      <div className="space-y-1.5">
        <Label>Customer <span className="text-destructive">*</span></Label>
        <CustomerCombobox
          customers={customers}
          loading={customersLoading}
          value={customerId}
          onChange={handleCustomerChange}
          disabled={loading}
          error={error === "Customer is required" ? error : undefined}
        />
      </div>

      {/* Required Ship By Date */}
      <div className="space-y-1.5">
        <Label>
          Required Ship By Date
          <span className="text-muted-foreground text-xs ml-1">(optional)</span>
        </Label>
        <input
          type="date"
          className="w-full border rounded px-2 py-1 h-10 text-[13px]"
          min={minDate}
          value={shipBy}
          onChange={(e) => setShipBy(e.target.value)}
          disabled={loading}
        />
        {shipBy && (
          <p className="text-xs text-muted-foreground">
            Shipment will be marked as overdue if not dispatched by this date.
          </p>
        )}
      </div>

      {/* Notes */}
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

      {error && error !== "Customer is required" && (
        <p className="text-xs text-destructive">{error}</p>
      )}

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
