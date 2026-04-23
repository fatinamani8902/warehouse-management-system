import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Warehouse } from "lucide-react";
import { useEffect } from "react";
const SelectWarehouse = () => {
    const { getUserWarehouses, selectWarehouse, currentTenantId, getTenantName } = useAuth();
    const navigate = useNavigate();
    const whs = getUserWarehouses();
    useEffect(() => {
        if (!currentTenantId)
            navigate("/select-tenant");
    }, [currentTenantId, navigate]);
    const handleSelect = (whId) => {
        selectWarehouse(whId);
        navigate("/dashboard");
    };
    return (<div className="min-h-screen flex items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <Warehouse className="mx-auto h-8 w-8 text-primary mb-2"/>
          <CardTitle>Select Warehouse</CardTitle>
          <CardDescription>Tenant: {getTenantName()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {whs.map(w => (<Button key={w.id} variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => handleSelect(w.id)}>
              <Warehouse className="h-4 w-4 text-muted-foreground"/>
              <div className="text-left">
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-muted-foreground">{w.city}, {w.country} · {w.id}</div>
              </div>
            </Button>))}
        </CardContent>
      </Card>
    </div>);
};
export default SelectWarehouse;
