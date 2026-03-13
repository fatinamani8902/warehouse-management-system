import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createOrder, toSessionContext } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export default function CreateOrder({ onCreated, onCancel }) {

  const auth = useAuth();
  const session = toSessionContext(auth);

  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {

    e.preventDefault();

    if (!customerName.trim()) {
      alert("Customer name is required");
      return;
    }

    try {

      setLoading(true);

      const response = await createOrder(session, {
        customer_name: customerName.trim(),
        notes: notes?.trim() || "",
        lines: []
      });

      const order = response?.data;

      if (!order) {
        throw new Error("Invalid response from server");
      }

      onCreated(order);

    } catch (error) {

      console.error("Create order failed:", error);
      alert("Failed to create order");

    } finally {

      setLoading(false);

    }

  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>

      <div>
        <Label>Customer Name</Label>

        <Input
          placeholder="Enter customer name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </div>

      <div>
        <Label>Notes</Label>

        <Textarea
          placeholder="Optional notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">

        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>

        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Order"}
        </Button>

      </div>

    </form>
  );
}