import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
const AccessDenied = () => {
    const navigate = useNavigate();
    return (<div className="min-h-screen flex items-center justify-center bg-muted/50">
      <div className="text-center space-y-4">
        <ShieldAlert className="mx-auto h-16 w-16 text-destructive"/>
        <h1 className="text-[22px] font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-sm">You do not have permission to access this resource. This may be a cross-tenant access attempt.</p>
        <Button onClick={() => navigate("/dashboard")}>Return to Dashboard</Button>
      </div>
    </div>);
};
export default AccessDenied;
