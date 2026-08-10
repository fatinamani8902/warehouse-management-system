import { useEffect, useMemo, useState } from "react";
import { fetchSuppliers } from "@/services/api";
import { cn } from "@/lib/utils";

export default function SupplierSelect({
  value,
  onChange,
  session,
  disabled = false,
  className,
  id,
  required = false,
  hasError = false,
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const tenantId = session?.tenant_id;
  const userId = session?.user_id;
  const roleId = session?.role_id;
  const warehouseId = session?.warehouse_id;

  useEffect(() => {
    if (!tenantId) {
      setSuppliers([]);
      setLoading(false);
      setLoadError("Select a tenant first");
      return;
    }

    let mounted = true;
    setLoading(true);
    setLoadError("");
    const requestSession = {
      tenant_id: tenantId,
      user_id: userId,
      role_id: roleId,
      warehouse_id: warehouseId,
    };

    fetchSuppliers(requestSession)
      .then((data) => {
        if (!mounted) {
          return;
        }
        setSuppliers(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setSuppliers([]);
        setLoadError(error.message || "Failed to load suppliers");
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [tenantId, userId, roleId, warehouseId]);

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.is_active ?? supplier.status === "active"),
    [suppliers],
  );

  const statusOption = loading
    ? "Loading suppliers..."
    : loadError || "No suppliers found. Create in Master Data.";

  if (loading || loadError || activeSuppliers.length === 0) {
    return (
      <select
        id={id}
        className={cn(
          "w-full border rounded px-2 py-1 h-10 bg-muted/40",
          hasError && "border-destructive",
          className,
        )}
        disabled
      >
        <option>{statusOption}</option>
      </select>
    );
  }

  return (
    <select
      id={id}
      className={cn("w-full border rounded px-2 py-1 h-10 bg-white", hasError && "border-destructive", className)}
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      required={required}
    >
      <option value="">Select supplier</option>
      {activeSuppliers.map((supplier) => (
        <option key={supplier.supplier_id} value={supplier.supplier_id}>
          {supplier.supplier_name}
        </option>
      ))}
    </select>
  );
}
