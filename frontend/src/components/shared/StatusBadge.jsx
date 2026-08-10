import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles = {
  aactive: "bg-emerald-100 text-emerald-700 border-emerald-200",
  available: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-200",
  posted: "bg-violet-100 text-violet-700 border-violet-200",
  receiving: "bg-amber-100 text-amber-700 border-amber-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  in_transit: "bg-amber-100 text-amber-700 border-amber-200",
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  received: "bg-emerald-100 text-emerald-700 border-emerald-200",
  created:    "bg-blue-100 text-blue-700 border-blue-200",
  confirmed:  "bg-amber-100 text-amber-700 border-amber-200",
  processing: "bg-amber-100 text-amber-700 border-amber-200",
  closed:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  open:       "bg-blue-100 text-blue-700 border-blue-200",
};

export const StatusBadge = ({ status, className }) => {

  const safeStatus = (status || "draft").toLowerCase();
  const label = safeStatus.replace(/_/g, " ");
  const style = statusStyles[safeStatus] ?? "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium leading-4 border capitalize px-2.5 py-[3px]", style, className)}
    >
      {label}
    </Badge>
  );
};
