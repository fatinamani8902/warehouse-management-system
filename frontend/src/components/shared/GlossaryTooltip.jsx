import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const GLOSSARY = {
  ASN:               { full: "Advance Shipment Notice",          desc: "Pre-arrival notification from a supplier listing incoming goods." },
  GRN:               { full: "Goods Receipt Note",               desc: "Records physical arrival and acceptance of goods into the warehouse." },
  RMA:               { full: "Return Merchandise Authorisation", desc: "Pre-approved instruction allowing a customer to send back goods." },
  Quarantine:        { full: "Quarantined Stock",                desc: "Stock held aside — pending quality check, damage review, or disposal." },
  "Qty Delta":       { full: "Quantity Delta",                   desc: "The difference applied to stock — positive to add, negative to deduct." },
  "Location Taxonomy":{ full: "Location Taxonomy",              desc: "Naming hierarchy for storage locations (e.g. Zone → Aisle → Bin)." },
};

const RegistryContext = createContext(null);

export function GlossaryRegistry({ children }) {
  const mapRef    = useRef({});
  const activeRef = useRef({});

  const recompute = useCallback((term) => {
    const map = mapRef.current[term];
    if (!map || map.size === 0) return;
    let bestId = null, bestTop = Infinity;
    map.forEach(({ getEl }, id) => {
      const el = getEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top >= -10 && rect.top < bestTop) { bestTop = rect.top; bestId = id; }
    });
    if (bestId === null) bestId = map.keys().next().value;
    const prev = activeRef.current[term];
    if (prev !== bestId) {
      activeRef.current[term] = bestId;
      if (prev   && map.has(prev))    map.get(prev).setActive(false);
      if (bestId && map.has(bestId)) map.get(bestId).setActive(true);
    }
  }, []);

  const register = useCallback((term, id, getEl, setActive) => {
    if (!mapRef.current[term]) mapRef.current[term] = new Map();
    mapRef.current[term].set(id, { getEl, setActive });
    setTimeout(() => recompute(term), 50);
    return () => { mapRef.current[term]?.delete(id); setTimeout(() => recompute(term), 50); };
  }, [recompute]);

  useEffect(() => {
    const onScroll = () => Object.keys(mapRef.current).forEach(recompute);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [recompute]);

  return <RegistryContext.Provider value={{ register }}>{children}</RegistryContext.Provider>;
}

const TIP_W = 210;

function Tooltip({ term, entry, anchorRect }) {
  if (!anchorRect) return null;
  let left = anchorRect.left + anchorRect.width / 2 - TIP_W / 2;
  if (left < 8) left = 8;
  if (left + TIP_W > window.innerWidth - 8) left = window.innerWidth - TIP_W - 8;
  const arrowLeft = Math.max(10, Math.min(TIP_W - 16, (anchorRect.left + anchorRect.width / 2) - left));
  return createPortal(
    <div style={{
      position: "fixed",
      top: anchorRect.top - 10,
      left,
      transform: "translateY(-100%)",
      width: TIP_W,
      zIndex: 99999,
      background: "#1e293b",
      borderRadius: 10,
      padding: "10px 13px 11px",
      boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
      pointerEvents: "none",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      animation: "gt-fade 0.12s ease",
    }}>
      <div style={{ position:"absolute", bottom:-6, left:arrowLeft, transform:"translateX(-50%)", borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:"6px solid #1e293b" }} />
      <p style={{ margin:"0 0 3px", fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.08em" }}>{term}</p>
      <p style={{ margin:"0 0 5px", fontSize:13, fontWeight:700, color:"#f1f5f9", lineHeight:1.3 }}>{entry.full}</p>
      <p style={{ margin:0, fontSize:12, color:"#94a3b8", lineHeight:1.5 }}>{entry.desc}</p>
      <style>{`@keyframes gt-fade{from{opacity:0;transform:translateY(calc(-100% + 6px))}to{opacity:1;transform:translateY(-100%)}}`}</style>
    </div>,
    document.body
  );
}

let _uid = 0;

export function GlossaryTerm({ term }) {
  const registry              = useContext(RegistryContext);
  const [active, setActive]   = useState(false);
  const [tipRect, setTipRect] = useState(null);
  const iconRef = useRef(null);
  const idRef   = useRef(null);
  if (!idRef.current) idRef.current = `gt_${++_uid}`;

  const entry = GLOSSARY[term];

  useEffect(() => {
    if (!registry || !entry) return;
    return registry.register(term, idRef.current, () => iconRef.current, setActive);
  }, [registry, term, !!entry]);

  if (!entry) return <span>{term}</span>;

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      gap: 0,
    }}>
      <span style={{ lineHeight: 1 }}>{term}</span>

      <span
        ref={iconRef}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#1d4ed8";
          e.currentTarget.style.color = "#fff";
          if (iconRef.current) setTipRect(iconRef.current.getBoundingClientRect());
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#1d4ed8";
          setTipRect(null);
        }}
        style={{
          /* sizing */
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: active ? 14 : 0,
          height: 14,
          minWidth: active ? 14 : 0,
          overflow: "hidden",
          /* circle */
          borderRadius: "50%",
          border: active ? "1.5px solid #1d4ed8" : "none",
          background: "transparent",
          /* "i" text */
          color: "#1d4ed8",
          fontSize: 10,
          fontWeight: 700,
          fontStyle: "normal",
          fontFamily: "Arial, Helvetica, sans-serif",
          lineHeight: 1,
          letterSpacing: 0,
          textTransform: "none",
          textDecoration: "none",
          /* behaviour */
          cursor: "pointer",
          userSelect: "none",
          flexShrink: 0,
          visibility: active ? "visible" : "hidden",
          pointerEvents: active ? "auto" : "none",
          transition: "background 0.15s, color 0.15s, width 0.1s, min-width 0.1s",
          marginLeft: active ? 4 : 0,
          /* nudge i down half a pixel for optical center */
          paddingTop: 1,
        }}
      >
        i
      </span>

      {tipRect && <Tooltip term={term} entry={entry} anchorRect={tipRect} />}
    </span>
  );
}

export default GlossaryTerm;