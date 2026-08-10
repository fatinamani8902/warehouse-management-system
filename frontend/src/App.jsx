import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import ForgotPassword from "./pages/auth/ForgotPassword";
import SelectTenant from "./pages/auth/SelectTenant";
import SelectWarehouse from "./pages/auth/SelectWarehouse";
import Dashboard from "./pages/Dashboard";
import TracePage from "./pages/trace/TracePage";
import InboundPage from "./pages/inbound/InboundPage";
import OutboundPage from "./pages/outbound/OutboundPage";
import PutawayPage from "./pages/putaway/PutawayPage";
import InventoryPage from "./pages/inventory/InventoryPage";
import PickingPage from "./pages/picking/PickingPage";
import PackingPage from "./pages/packing/PackingPage";
import ShippingPage from "./pages/shipping/ShippingPage";
import ReturnsPage from "./pages/returns/ReturnsPage";
import MasterDataPage from "./pages/master-data/MasterDataPage";
import LocationTaxonomyPage from "./pages/master-data/LocationTaxonomyPage";
import UsersRolesPage from "./pages/users/UsersRolesPage";
import LOVMaintenancePage from "./pages/lov/LOVMaintenancePage";
import AuditLogPage from "./pages/audit/AuditLogPage";
import SettingsPage from "./pages/settings/SettingsPage";
import AccessDenied from "./pages/AccessDenied";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, currentWarehouseId } = useAuth();
    if (!isAuthenticated)
        return <Navigate to="/" replace/>;
    if (!currentWarehouseId)
        return <Navigate to="/select-warehouse" replace/>;
    return <>{children}</>;
};
const AppRoutes = () => {
    const { isAuthenticated } = useAuth();
    return (<Routes>
      {/* Auth */}
      <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace/> : <SignIn />}/>
      <Route path="/sign-up" element={<SignUp />}/>
      <Route path="/forgot-password" element={<ForgotPassword />}/>
      <Route path="/select-tenant" element={<SelectTenant />}/>
      <Route path="/select-warehouse" element={<SelectWarehouse />}/>
      <Route path="/access-denied" element={<AccessDenied />}/>

      {/* Protected Modules */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}/>
      <Route path="/trace" element={<ProtectedRoute><TracePage /></ProtectedRoute>}/>
      <Route path="/inbound" element={<ProtectedRoute><InboundPage /></ProtectedRoute>}/>
      <Route
        path="/outbound"
        element={
        <ProtectedRoute>
        <OutboundPage />
        </ProtectedRoute>
      }
      />
      <Route path="/putaway" element={<ProtectedRoute><PutawayPage /></ProtectedRoute>}/>
      <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>}/>
      <Route path="/picking" element={<ProtectedRoute><PickingPage /></ProtectedRoute>}/>
      <Route path="/packing" element={<ProtectedRoute><PackingPage /></ProtectedRoute>}/>
      <Route path="/shipping" element={<ProtectedRoute><ShippingPage /></ProtectedRoute>}/>
      <Route path="/returns" element={<ProtectedRoute><ReturnsPage /></ProtectedRoute>}/>
      <Route path="/master-data" element={<ProtectedRoute><MasterDataPage /></ProtectedRoute>}/>
      <Route path="/location-taxonomy" element={<ProtectedRoute><LocationTaxonomyPage /></ProtectedRoute>}/>
      <Route path="/users" element={<ProtectedRoute><UsersRolesPage /></ProtectedRoute>}/>
      <Route path="/lov" element={<ProtectedRoute><LOVMaintenancePage /></ProtectedRoute>}/>
      <Route path="/audit" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>}/>
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}/>

      <Route path="*" element={<NotFound />}/>
    </Routes>);
};
const App = () => (<QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>);
export default App;
