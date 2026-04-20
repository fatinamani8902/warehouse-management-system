import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
const SelectTenant = () => {
    const { getUserTenants, selectTenant, currentUser } = useAuth();
    const navigate = useNavigate();
    const userTenants = getUserTenants();
    const handleSelect = (tenantId) => {
    selectTenant(tenantId);
    navigate("/select-warehouse");
    };

    useEffect(() => {
    if (userTenants.length === 1) {
        handleSelect(userTenants[0].id);
    }
    }, [userTenants.length]);

if (userTenants.length === 1) return null;
    return (<div className="min-h-screen flex items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <Building2 className="mx-auto h-8 w-8 text-primary mb-2"/>
          <CardTitle>Select Tenant</CardTitle>
          <CardDescription>Welcome{currentUser?.name || currentUser?.user_name ? `, ${currentUser?.name || currentUser?.user_name}` : ""}. Choose your organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {userTenants.map(t => (<Button key={t.id} variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => handleSelect(t.id)}>
              <Building2 className="h-4 w-4 text-muted-foreground"/>
              <div className="text-left">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.id}</div>
              </div>
            </Button>))}
        </CardContent>
      </Card>
    </div>);
};
export default SelectTenant;
