import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
const SignUp = () => {
    const navigate = useNavigate();
    return (<div className="min-h-screen flex items-center justify-center bg-muted/50">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto h-10 w-10 rounded-lg bg-primary flex items-center justify-center mb-2">
            <UserPlus className="h-5 w-5 text-primary-foreground"/>
          </div>
          <CardTitle className="text-xl">Create Account</CardTitle>
          <CardDescription>Sign up for WMS access</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); navigate("/"); }}>
            <div className="space-y-2"><Label>Full Name</Label><Input placeholder="Jane Smith"/></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="you@company.com"/></div>
            <div className="space-y-2"><Label>Password</Label><Input type="password" placeholder="••••••••"/></div>
            <div className="space-y-2"><Label>Confirm Password</Label><Input type="password" placeholder="••••••••"/></div>
            <Button type="submit" className="w-full">Create Account</Button>
            <p className="text-xs text-center text-muted-foreground">Already have an account? <button type="button" onClick={() => navigate("/")} className="text-primary hover:underline">Sign In</button></p>
          </form>
        </CardContent>
      </Card>
    </div>);
};
export default SignUp;
