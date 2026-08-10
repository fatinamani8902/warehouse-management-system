import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
export const Breadcrumbs = ({ items }) => {
    const location = useLocation();
    const segments = items ?? location.pathname.split("/").filter(Boolean).map(s => ({
        label: s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " "),
        path: undefined,
    }));
    return (<nav className="flex items-center gap-1 text-[13px] text-muted-foreground mb-4">
      <Link to="/dashboard" className="hover:text-foreground"><Home className="h-3.5 w-3.5"/></Link>
      {segments.map((item, i) => (<span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3"/>
          {item.path ? (<Link to={item.path} className="hover:text-foreground">{item.label}</Link>) : (<span className={i === segments.length - 1 ? "text-foreground font-medium" : ""}>{item.label}</span>)}
        </span>))}
    </nav>);
};
