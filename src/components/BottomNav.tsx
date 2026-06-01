import { Home, Mic, User, Search, Crown } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const leftItems = [
    { icon: Home, label: "Feed", path: "/" },
    { icon: Crown, label: "Weekly", path: "/weekly" },
  ];

  const rightItems = [
    { icon: Search, label: "Search", path: "/search" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  const NavButton = ({ icon: Icon, label, path }: { icon: any; label: string; path: string }) => {
    const isActive = location.pathname === path;
    return (
      <button
        onClick={() => navigate(path)}
        className="flex flex-col items-center gap-0.5 py-2 px-4 min-w-[56px] transition-colors"
      >
        <Icon size={22} className={isActive ? "text-primary" : "text-muted-foreground"} strokeWidth={isActive ? 2.5 : 1.8} />
        <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/50">
      <div className="relative">
        {/* Center record button */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 z-10">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate("/record")}
            className="relative"
            aria-label="Record"
          >
            <div className="w-16 h-16 rounded-full gradient-red flex items-center justify-center shadow-red ring-4 ring-background">
              <Mic size={26} className="text-primary-foreground" />
            </div>
            {location.pathname === "/record" && (
              <motion.div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                layoutId="nav-dot"
              />
            )}
          </motion.button>
        </div>

        {/* Bar */}
        <div className="flex items-center justify-between px-2 pt-2 pb-1">
          <div className="flex items-center gap-1">
            {leftItems.map((item) => (
              <NavButton key={item.path} {...item} />
            ))}
          </div>

          {/* Spacer for center button */}
          <div className="w-20" />

          <div className="flex items-center gap-1">
            {rightItems.map((item) => (
              <NavButton key={item.path} {...item} />
            ))}
          </div>
        </div>
      </div>
      {/* Safe area bottom fill - fully opaque */}
      <div className="bg-background" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
};

export default BottomNav;
