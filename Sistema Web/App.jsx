import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Versión JS con rastro (trail) que se desvanece.
 * Cambiá WS_HOST por la IP o mDNS del ESP.
 */
const WS_HOST = "192.168.1.60"; // o "esp8266.local"
const WS_URL = `ws://${WS_HOST}/ws`;

// Tamaño del lienzo (diámetro del círculo en px)
const DIAMETER = 870;

// Rangos esperados para X/Y
const X_MIN = -120, X_MAX = 120;
const Y_MIN = -120, Y_MAX = 120;

// Origen centrado en el medio del círculo


// Rastro (trail)
const TRAIL_MS = 2500;   // duración visible del rastro
const TRAIL_MAX = 100;   // tope de puntos guardados

// Peso
const WEIGHT_UNIT = "kg";
const WEIGHT_DECIMALS = 2;

// Estilos
const styles = {
  page: {
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
    color: "#111827",
    background: "#fafafa",
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 12,
    padding: 12,
  },
  panel: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    height: "fit-content",
    position: "relative",
  },
  statusBox: (connected) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: connected ? "#ECFDF5" : "#FEF2F2",
    border: connected ? "1px solid #A7F3D0" : "1px solid #FECACA",
  }),
  statusDot: (connected) => ({
    width: 12,
    height: 12,
    borderRadius: 4,
    background: connected ? "#10B981" : "#EF4444",
  }),
  label: { color: "#6b7280", fontSize: 13 },
  value: { fontVariantNumeric: "tabular-nums", fontSize: 20, fontWeight: 600 },
  circleWrap: { display: "flex", alignItems: "center", justifyContent: "center" },
  legend: { color: "#6b7280", fontSize: 13 },
  titleAbs: { position: "absolute", top: 10, left: 16, margin: 0, fontSize: 22, fontWeight: 700 },
  pointLabel: {
    fontSize: 12,
    fill: "#111827",
    paintOrder: "stroke",
    stroke: "#ffffff",
    strokeWidth: 3,
  },
};

// Helpers
function normalize(value, min, max, centered) {
  if (max === min) return 0;
  if (centered) {
    const mid = (min + max) / 2;
    const half = (max - min) / 2;
    return (value - mid) / half; // -1..1
  }
  return (value - min) / (max - min); // 0..1
}

function clampToCircle(x, y, r) {
  const d = Math.hypot(x, y);
  if (d <= r || d === 0) return { x, y };
  const k = r / d;
  return { x: x * k, y: y * k };
}

// Convierte {x,y} (sistema) -> {x,y} en pixeles dentro del círculo
function toPixel(pos, geom) {
  const { r, cx, cy } = geom;
  const nx = normalize(pos.x, X_MIN, X_MAX, true);
  const ny = normalize(pos.y, Y_MIN, Y_MAX, true);
  let x = nx * r;
  let y = -ny * r; // SVG Y hacia abajo
  const clamped = clampToCircle(x, y, r - 8);
  return { x: clamped.x + cx, y: clamped.y + cy };
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [pos, setPos] = useState(null);       // { x, y, w? }
  const [trail, setTrail] = useState([]);     // [{ x, y, ts }]
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === "pos" && typeof msg.x === "number" && typeof msg.y === "number" && typeof msg.w === "number") {

            const next = { x: msg.x, y: msg.y, w: msg.w };
            setPos(next);

            // Actualizar rastro (por tiempo y cantidad)
            const now = Date.now();
            setTrail((prev) => {
              const pruned = prev.filter(p => now - p.ts <= TRAIL_MS);
              pruned.push({ x: next.x, y: next.y, ts: now });
              if (pruned.length > TRAIL_MAX) pruned.splice(0, pruned.length - TRAIL_MAX);
              return pruned;
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        retryRef.current = window.setTimeout(connect, 1000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryRef.current) window.clearTimeout(retryRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Geometría del círculo
  const geom = useMemo(() => {
    const r = DIAMETER / 2;
    return { r, cx: r, cy: r };
  }, []);

  // Pixeles actuales y del rastro
  const pixel = useMemo(() => (pos ? toPixel(pos, geom) : null), [pos, geom]);
  const trailPixels = useMemo(
    () => trail.map(p => ({ ...toPixel(p, geom), ts: p.ts })),
    [trail, geom]
  );
  
  return (
    <div style={styles.page}>
      {/* PANEL IZQUIERDO */}
      <aside style={styles.panel}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={styles.statusBox(connected)}>
            <span style={styles.statusDot(connected)} />
            <strong>{connected ? "Conectado" : "Desconectado"}</strong>
          </div>

          <div>
            <div style={styles.label}>Posición X (recibida)</div>
            <div style={styles.value}>{pos ? pos.x.toFixed(2) : "—"}</div>
          </div>
          <div>
            <div style={styles.label}>Posición Y (recibida)</div>
            <div style={styles.value}>{pos ? pos.y.toFixed(2) : "—"}</div>
          </div>
          <div>
            <div style={styles.label}>Peso (recibido)</div>
            <div style={styles.value}>
              {pos && typeof pos.w === "number"
                ? `${pos.w.toFixed(WEIGHT_DECIMALS)} ${WEIGHT_UNIT}`
                : "—"}
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={styles.legend}>
              Rango X: [{X_MIN} … {X_MAX}] · Rango Y: [{Y_MIN} … {Y_MAX}]
            </div>
            <div style={styles.legend}>Origen centrado: {CENTERED ? "sí" : "no"}</div>
          </div>
        </div>
      </aside>

      {/* CÍRCULO */}
      <main style={{ ...styles.panel, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={styles.titleAbs}>Base circular (posición X,Y)</h2>
        <div style={styles.circleWrap}>
          <svg width={DIAMETER} height={DIAMETER}>
            {/* Base */}
            <circle cx={geom.cx} cy={geom.cy} r={geom.r} fill="#ffffff" stroke="#a1a1a1ff" strokeWidth={2} />
            {/* Ejes */}
            <line x1={geom.cx - geom.r} y1={geom.cy} x2={geom.cx + geom.r} y2={geom.cy} stroke="#818181ff" strokeDasharray="6 6" />
            <line x1={geom.cx} y1={geom.cy - geom.r} x2={geom.cx} y2={geom.cy + geom.r} stroke="#818181ff" strokeDasharray="6 6" />

            {/* Rastro (segmentos + puntos con opacidad según antigüedad) */}
            {trailPixels.length > 1 && trailPixels.map((p, i) => {
              if (i === 0) return null;
              const prev = trailPixels[i - 1];
              const age = Math.max(0, Math.min(1, (Date.now() - p.ts) / TRAIL_MS)); // 0..1
              const alpha = 1 - age; // reciente = más opaco
              return (
                <g key={`seg-${i}`}>
                  <line x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke="#111827" strokeOpacity={alpha * 0.25} />
                  <circle cx={p.x} cy={p.y} r={3} fill="#111827" fillOpacity={alpha * 0.35} />
                </g>
              );
            })}

            {/* Punto actual + guías */}
            {pixel && (
              <>
                <circle cx={pixel.x} cy={pixel.y} r={7} fill="#111827" />
                <line x1={pixel.x} y1={geom.cy - geom.r} x2={pixel.x} y2={geom.cy + geom.r} stroke="#9ca3af" strokeOpacity={0.35} />
                <line x1={geom.cx - geom.r} y1={pixel.y} x2={geom.cx + geom.r} y2={pixel.y} stroke="#9ca3af" strokeOpacity={0.35} />
              </>
            )}
          </svg>
        </div>
      </main>
    </div>
  );
}
