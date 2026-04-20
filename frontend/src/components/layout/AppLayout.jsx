import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";

export const AppLayout = ({ children }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6 transition-all duration-150">
          {children}
        </main>
      </div>
    </div>
  );
};