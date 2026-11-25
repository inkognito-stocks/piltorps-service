import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import ServiceProtocol from "./pages/ServiceProtocol";
import Customers from "./pages/Customers";
import UpcomingService from "./pages/UpcomingService";
import Models from "./pages/Models";
import Calibration from "./pages/Calibration";
import Migrate from "./pages/Migrate";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AuthedApp = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Laddar...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<ServiceProtocol />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/upcoming" element={<UpcomingService />} />
          <Route path="/calibration" element={<Calibration />} />
          <Route path="/models" element={<Models />} />
          <Route path="/migrate" element={<Migrate />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <AuthedApp />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

