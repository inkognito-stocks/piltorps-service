import { NavLink, useLocation } from "react-router-dom";
import { ClipboardList, Users, CalendarClock, LogOut, Wrench, Gauge } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useUpcomingService } from "@/hooks/useUpcomingService";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Protokoll", icon: ClipboardList },
  { to: "/customers", label: "Kunder", icon: Users },
  { to: "/calibration", label: "Kalibrering", icon: Gauge },
  { to: "/upcoming", label: "Service", icon: CalendarClock },
  { to: "/models", label: "Modeller", icon: Wrench },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { signOut } = useAuth();
  const { dueCount } = useUpcomingService();


  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-40 bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between border-b border-sidebar-border">
          <h1 className="text-base font-bold tracking-tight text-sidebar-primary-foreground">
            Piltorps Service
          </h1>
          <button
            onClick={signOut}
            className="flex items-center gap-1 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Logga ut
          </button>
        </header>
        <main className="flex-1 overflow-auto pb-20">
          <div className="p-4">
            {children}
          </div>
        </main>
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around items-center h-16 safe-bottom">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  isActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/60"
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {to === "/upcoming" && dueCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {dueCount}
                    </span>
                  )}
                </div>
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="p-6 border-b border-sidebar-border">
          <h1 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
            Piltorps Service
          </h1>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">Kalibrerings&shy;protokoll</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {to === "/upcoming" && dueCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {dueCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Logga ut
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

