// ZAYRO · ilustraciones vectoriales de la tienda (logo, banner, categorías e íconos).
// Son SVG livianos: se ven nítidos en celular y computadora y no dependen de fotos externas.
import type { ReactNode, SVGProps } from "react";

type ArtProps = { className?: string };

const Z_PATH = "M73 60H130V63L85 121H121L127 108H130L126 126H69V123L114 65H80L75 77H72Z";
const SWOOSH = "M60 100C86 84 120 78 150 83C124 86 98 94 75 107C69 107 63 104 60 100Z";

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return (cx + r * Math.cos(rad)).toFixed(2) + " " + (cy + r * Math.sin(rad)).toFixed(2);
  };
  return "M" + p(from) + "A" + r + " " + r + " 0 " + (to - from > 180 ? 1 : 0) + " 1 " + p(to);
}

/** Degradados compartidos por todas las ilustraciones. Se monta una sola vez. */
export function ZayroDefs() {
  return (
    <svg className="zayro-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="zy-gold" x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor="#8a6726" /><stop offset=".28" stopColor="#d9b661" />
          <stop offset=".5" stopColor="#fbe9ad" /><stop offset=".72" stopColor="#cfa64f" />
          <stop offset="1" stopColor="#8f6b28" />
        </linearGradient>
        <linearGradient id="zy-gold-v" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f6e2a2" /><stop offset=".35" stopColor="#c99d45" />
          <stop offset=".62" stopColor="#f3d98f" /><stop offset="1" stopColor="#8a6524" />
        </linearGradient>
        <radialGradient id="zy-logo-bg" cx=".42" cy=".38" r=".75">
          <stop offset="0" stopColor="#2e2a26" /><stop offset=".6" stopColor="#141210" /><stop offset="1" stopColor="#070605" />
        </radialGradient>
        <linearGradient id="zy-amber" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9c5f17" /><stop offset=".18" stopColor="#dc9c40" />
          <stop offset=".42" stopColor="#f7d48a" /><stop offset=".6" stopColor="#efbd64" />
          <stop offset=".84" stopColor="#c58331" /><stop offset="1" stopColor="#8c5214" />
        </linearGradient>
        <linearGradient id="zy-glass-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#3a1d00" stopOpacity=".28" />
        </linearGradient>
        <linearGradient id="zy-silver" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7c8085" /><stop offset=".26" stopColor="#e6e9ec" />
          <stop offset=".44" stopColor="#ffffff" /><stop offset=".64" stopColor="#aeb3b8" />
          <stop offset=".84" stopColor="#e4e6e9" /><stop offset="1" stopColor="#868a8f" />
        </linearGradient>
        <linearGradient id="zy-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#262321" /><stop offset=".55" stopColor="#0f0e0d" /><stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="zy-marble" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#ebe7e1" /><stop offset="1" stopColor="#d3cdc4" />
        </linearGradient>
        <linearGradient id="zy-marble-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a9a39b" /><stop offset=".3" stopColor="#e8e4de" />
          <stop offset=".55" stopColor="#f7f5f1" /><stop offset="1" stopColor="#9f9990" />
        </linearGradient>
        <radialGradient id="zy-glow" cx=".5" cy=".55" r=".5">
          <stop offset="0" stopColor="#f2c36f" stopOpacity=".42" /><stop offset=".45" stopColor="#b98431" stopOpacity=".16" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="zy-petal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#f4f1eb" /><stop offset="1" stopColor="#d9d3c8" />
        </linearGradient>
        <linearGradient id="zy-ribbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d5c20" /><stop offset=".18" stopColor="#e8c977" />
          <stop offset=".34" stopColor="#fff2c4" /><stop offset=".5" stopColor="#c89b45" />
          <stop offset=".7" stopColor="#f6dc95" /><stop offset=".86" stopColor="#a87c30" />
          <stop offset="1" stopColor="#e9cd84" />
        </linearGradient>
        <linearGradient id="zy-ribbon-back" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4c3611" /><stop offset=".5" stopColor="#9a7230" /><stop offset="1" stopColor="#5c4316" />
        </linearGradient>
        <linearGradient id="zy-cream" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9d3ca" /><stop offset=".3" stopColor="#fbfaf7" />
          <stop offset=".6" stopColor="#ffffff" /><stop offset="1" stopColor="#cfc8bd" />
        </linearGradient>
        <linearGradient id="zy-hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b2416" /><stop offset=".35" stopColor="#8a5f3d" />
          <stop offset=".6" stopColor="#d2ab80" /><stop offset="1" stopColor="#6e4527" />
        </linearGradient>
        <linearGradient id="zy-dome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset=".25" stopColor="#fff" stopOpacity=".02" />
          <stop offset=".8" stopColor="#fff" stopOpacity=".015" /><stop offset="1" stopColor="#fff" stopOpacity=".09" />
        </linearGradient>
        <linearGradient id="zy-pedestal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#050505" /><stop offset=".45" stopColor="#24211f" /><stop offset="1" stopColor="#050505" />
        </linearGradient>
        <radialGradient id="zy-pedestal-top" cx=".5" cy=".4" r=".6">
          <stop offset="0" stopColor="#2c2825" /><stop offset="1" stopColor="#0b0a09" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Emblema circular (Z con trazo) para etiquetas y envases. */
export function Emblem({ cx, cy, r, ring = true }: { cx: number; cy: number; r: number; ring?: boolean }) {
  const s = r / 100;
  return (
    <g transform={`translate(${cx - r} ${cy - r}) scale(${s})`}>
      {ring && <circle cx="100" cy="100" r="99" fill="url(#zy-gold-v)" />}
      <circle cx="100" cy="100" r={ring ? 93 : 100} fill="url(#zy-logo-bg)" />
      <g transform="translate(0 -6)" fill="url(#zy-gold)">
        <path d={Z_PATH} /><path d={SWOOSH} />
      </g>
      <text x="100" y="156" textAnchor="middle" fill="url(#zy-gold)" fontSize="22" letterSpacing="6"
        fontFamily="'Cormorant Garamond','Playfair Display',Georgia,serif" fontWeight="600">ZAYRO</text>
    </g>
  );
}

/** Logo completo de ZAYRO Parfum. */
export function ZayroLogo({ className, title = "ZAYRO Parfum" }: ArtProps & { title?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" role="img" aria-label={title}>
      <circle cx="100" cy="100" r="99.5" fill="url(#zy-gold-v)" />
      <circle cx="100" cy="100" r="94.5" fill="url(#zy-logo-bg)" />
      <g fill="none" stroke="url(#zy-gold)" strokeWidth="1.1" strokeLinecap="round">
        <path d={arc(100, 100, 84, -62, 28)} />
        <path d={arc(100, 100, 84, 118, 208)} />
      </g>
      <g transform="translate(0 -16)" fill="url(#zy-gold)">
        <path d={Z_PATH} /><path d={SWOOSH} />
      </g>
      <text x="100" y="146" textAnchor="middle" fill="url(#zy-gold)" fontSize="25" letterSpacing="7"
        fontFamily="'Cormorant Garamond','Playfair Display',Georgia,serif" fontWeight="600">ZAYRO</text>
      <g stroke="url(#zy-gold)" strokeWidth=".9"><path d="M56 160H79" /><path d="M121 160H144" /></g>
      <text x="100" y="163" textAnchor="middle" fill="#d9bb72" fontSize="7.2" letterSpacing="3.4"
        fontFamily="'Poppins',Arial,sans-serif">PARFUM</text>
    </svg>
  );
}

/** Frasco cuadrado con tapa facetada. Origen arriba a la izquierda, 180 × 261. */
function Bottle() {
  return (
    <g>
      <path d="M40 30L52 0H128L140 30L130 58H50Z" fill="url(#zy-silver)" />
      <path d="M40 30H140" stroke="#fff" strokeOpacity=".7" strokeWidth="1.2" />
      <path d="M74 0H104L102 58H78Z" fill="#fff" fillOpacity=".38" />
      <path d="M52 0L66 30L62 58" fill="none" stroke="#6f7378" strokeOpacity=".35" />
      <path d="M128 0L114 30L118 58" fill="none" stroke="#6f7378" strokeOpacity=".35" />
      <rect x="62" y="56" width="56" height="22" rx="3" fill="url(#zy-gold)" />
      <rect x="0" y="76" width="180" height="185" rx="16" fill="url(#zy-amber)" />
      <rect x="0" y="76" width="180" height="185" rx="16" fill="url(#zy-glass-shade)" />
      <rect x="8" y="84" width="164" height="169" rx="10" fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="1.5" />
      <rect x="16" y="94" width="9" height="146" rx="4.5" fill="#fff" fillOpacity=".3" />
      <rect x="150" y="98" width="5" height="120" rx="2.5" fill="#fff" fillOpacity=".16" />
      <rect x="46" y="144" width="88" height="66" fill="#0b0a09" stroke="url(#zy-gold)" strokeWidth="2.4" />
      <rect x="52" y="150" width="76" height="54" fill="none" stroke="url(#zy-gold)" strokeWidth=".8" />
      <Emblem cx={90} cy={177} r={20} ring={false} />
    </g>
  );
}

/** Estuche negro con marco dorado. Origen arriba a la izquierda, 150 × 240. */
function Box() {
  return (
    <g>
      <path d="M0 0L16-12H166L150 0Z" fill="#2b2826" />
      <path d="M150 0L166-12V228L150 240Z" fill="#050505" />
      <rect x="0" y="0" width="150" height="240" fill="url(#zy-box)" />
      <rect x="11" y="11" width="128" height="218" fill="none" stroke="url(#zy-gold)" strokeWidth="1.6" />
      <Emblem cx={75} cy={118} r={30} />
    </g>
  );
}

function Lily({ x, y, s = 1, r = 0 }: { x: number; y: number; s?: number; r?: number }) {
  const petals = [0, 62, 118, 180, 242, 298];
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      {petals.map(a => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 0C15-15 16-44 0-68C-16-44-15-15 0 0Z" fill="url(#zy-petal)" stroke="#000" strokeOpacity=".08" />
          <path d="M0-6V-56" stroke="#d8d1c4" strokeWidth="1.1" />
        </g>
      ))}
      {[20, 85, 150, 215, 280].map(a => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 0V-26" stroke="#b8a46b" strokeWidth="1.2" />
          <ellipse cx="0" cy="-28" rx="2.2" ry="4.2" fill="#7a4a22" />
        </g>
      ))}
      <circle r="4.5" fill="#d8cf8e" />
    </g>
  );
}

function Leaf({ x, y, r, s = 1 }: { x: number; y: number; r: number; s?: number }) {
  return (
    <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
      d="M0 0C10-12 30-16 48-10C32-2 14 4 0 0Z" fill="#355128" stroke="#1f3317" strokeWidth=".6" />
  );
}

/** Banner principal: frasco, estuche, pedestal de mármol y flores blancas. */
export function HeroArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 560 400" aria-hidden="true" focusable="false">
      <ellipse cx="280" cy="230" rx="270" ry="190" fill="url(#zy-glow)" />
      <g transform="translate(332 76)"><Box /></g>
      <g transform="translate(280 336)">
        <path d="M-196 0V38A196 27 0 0 0 196 38V0Z" fill="url(#zy-marble-side)" />
        <ellipse cx="0" cy="0" rx="196" ry="27" fill="url(#zy-marble)" />
        <g fill="none" stroke="#b9b2a7" strokeOpacity=".55" strokeWidth=".8">
          <path d="M-150 4C-110 -6-80 10-40 2S30-8 70 6" /><path d="M20-14C60-4 100-16 150-4" />
          <path d="M-120 20C-80 34-30 22 10 36S80 44 130 28" />
        </g>
      </g>
      <ellipse cx="242" cy="334" rx="104" ry="9" fill="#000" fillOpacity=".28" />
      <g transform="translate(152 70)"><Bottle /></g>
      <Leaf x={112} y={318} r={-160} s={.9} /><Leaf x={176} y={330} r={-20} s={.7} />
      <Leaf x={384} y={322} r={-30} s={.8} /><Leaf x={420} y={326} r={200} s={.7} />
      <Lily x={146} y={300} s={.95} r={-8} />
      <Lily x={222} y={330} s={.58} r={14} />
      <Lily x={404} y={312} s={.78} r={10} />
    </svg>
  );
}

/** Cinta dorada decorativa (se ubica y gira por CSS). */
export function Ribbon({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 420 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 36C120 54 238 60 420 138V150C236 74 118 66 0 46Z" fill="url(#zy-ribbon-back)" />
      <path d="M0 6C112 40 226 36 420 112V140C238 62 120 56 0 36Z" fill="url(#zy-ribbon)" />
      <path d="M0 8C112 41 226 37 420 113" fill="none" stroke="#fff6d8" strokeOpacity=".55" strokeWidth="1.2" />
    </svg>
  );
}

/** Tarjeta «Perfumes»: frasco y estuche sobre mármol claro. */
export function PerfumeCardArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 300 200" aria-hidden="true" focusable="false">
      <path d="M-10 168C70 150 150 168 240 210H-10Z" fill="url(#zy-ribbon)" opacity=".85" />
      <path d="M-10 182C80 166 150 182 220 214H-10Z" fill="url(#zy-ribbon-back)" opacity=".7" />
      <g transform="translate(140 40) scale(.62)"><Box /></g>
      <ellipse cx="102" cy="190" rx="62" ry="6" fill="#000" fillOpacity=".18" />
      <g transform="translate(46 50) scale(.54)"><Bottle /></g>
    </svg>
  );
}

/** Tarjeta «Cuidado capilar»: mechón de pelo, pote y botella con dosificador. */
export function HairCardArt({ className }: ArtProps) {
  const strands = Array.from({ length: 18 }, (_, i) => i);
  const tones = ["url(#zy-hair)", "#c9a074", "#5b3a24", "url(#zy-hair)", "#ead0aa", "#8a5d3b"];
  return (
    <svg className={className} viewBox="0 0 300 200" aria-hidden="true" focusable="false">
      <path d="M-14-10C34 34 70 92 96 150C106 172 116 194 124 214H186C170 186 150 156 128 120C96 66 58 20 30-10Z" fill="url(#zy-hair)" opacity=".9" />
      <g fill="none" strokeLinecap="round">
        {strands.map(i => {
          const x0 = -12 + i * 2.6, x1 = 122 + i * 3.6, bend = 44 + (i % 4) * 6;
          return <path key={i} d={`M${x0} -10C${x0 + bend} 50 ${x0 + 78} 118 ${x1} 214`}
            stroke={tones[i % tones.length]} strokeWidth={i % 3 === 0 ? 4.2 : 2.4} strokeOpacity={i % 6 === 4 ? .75 : .95} />;
        })}
      </g>
      <g transform="translate(206 26)">
        <rect x="18" y="0" width="22" height="8" rx="2" fill="url(#zy-gold)" />
        <rect x="24" y="6" width="10" height="16" fill="url(#zy-gold)" />
        <path d="M18 0H-4V6H18Z" fill="url(#zy-gold)" />
        <rect x="20" y="20" width="18" height="10" rx="2" fill="url(#zy-gold)" />
        <rect x="0" y="28" width="58" height="144" rx="12" fill="url(#zy-cream)" />
        <Emblem cx={29} cy={96} r={17} />
      </g>
      <g transform="translate(132 130)">
        <rect x="0" y="0" width="78" height="20" rx="4" fill="url(#zy-gold)" />
        <rect x="4" y="18" width="70" height="46" rx="6" fill="url(#zy-cream)" />
        <Emblem cx={39} cy={41} r={14} />
      </g>
      <ellipse cx="200" cy="198" rx="80" ry="5" fill="#000" fillOpacity=".14" />
    </svg>
  );
}

/** Banners inferiores: cúpula de vidrio sobre pedestal negro con perfume o regalo. */
export function DomeArt({ className, kind }: ArtProps & { kind: "perfume" | "gift" }) {
  return (
    <svg className={className} viewBox="0 0 220 250" aria-hidden="true" focusable="false">
      <ellipse cx="110" cy="200" rx="104" ry="70" fill="url(#zy-glow)" />
      <path d="M28 200V104A82 82 0 0 1 192 104V200" fill="url(#zy-dome)" stroke="url(#zy-gold)" strokeWidth="1.3" />
      <path d="M44 120A68 68 0 0 1 82 50" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="2" />
      <path d="M14 204V236A96 17 0 0 0 206 236V204Z" fill="url(#zy-pedestal)" />
      <ellipse cx="110" cy="204" rx="96" ry="17" fill="url(#zy-pedestal-top)" stroke="url(#zy-gold)" strokeWidth="1" />
      <path d="M14 236A96 17 0 0 0 206 236" fill="none" stroke="url(#zy-gold)" strokeWidth="1" />
      {kind === "perfume" ? (
        <g>
          <rect x="80" y="104" width="22" height="14" rx="2" fill="url(#zy-gold)" />
          <path d="M70 120H112L124 134V190L112 204H70L58 190V134Z" fill="url(#zy-amber)" />
          <path d="M70 120H112L124 134V190L112 204H70L58 190V134Z" fill="url(#zy-glass-shade)" />
          <Emblem cx={91} cy={160} r={12} />
          <rect x="64" y="132" width="5" height="54" rx="2.5" fill="#fff" fillOpacity=".3" />
          <rect x="140" y="156" width="10" height="10" rx="5" fill="url(#zy-gold)" />
          <circle cx="145" cy="184" r="20" fill="url(#zy-pedestal-top)" stroke="#3a342e" />
          <path d="M132 176A15 15 0 0 1 140 168" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="2" />
        </g>
      ) : (
        <g>
          <rect x="60" y="148" width="66" height="54" fill="url(#zy-box)" />
          <rect x="58" y="140" width="70" height="12" fill="#1b1917" />
          <rect x="88" y="140" width="10" height="62" fill="url(#zy-gold)" />
          <path d="M93 140C80 124 64 126 70 138C74 144 86 142 93 140Z" fill="none" stroke="url(#zy-gold)" strokeWidth="5" />
          <path d="M93 140C106 124 122 126 116 138C112 144 100 142 93 140Z" fill="none" stroke="url(#zy-gold)" strokeWidth="5" />
          <rect x="146" y="88" width="12" height="20" rx="2" fill="url(#zy-gold)" />
          <rect x="140" y="106" width="24" height="98" rx="5" fill="url(#zy-amber)" />
          <rect x="140" y="106" width="24" height="98" rx="5" fill="url(#zy-glass-shade)" />
          <rect x="144" y="112" width="4" height="84" rx="2" fill="#fff" fillOpacity=".3" />
        </g>
      )}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  diamond: <><path d="M6 9.5L10.5 4H21.5L26 9.5L16 28Z" /><path d="M6 9.5H26M10.5 4L13 9.5L16 28L19 9.5L21.5 4M13 9.5L16 4L19 9.5" /></>,
  bag: <><rect x="6" y="11" width="20" height="17" rx="2.5" /><path d="M11 14V9a5 5 0 0 1 10 0v5" /></>,
  truck: <><path d="M3 8H19V22H3Z" /><path d="M19 13H25L29 17.5V22H19" /><circle cx="9" cy="23.5" r="2.6" /><circle cx="23.5" cy="23.5" r="2.6" /><path d="M1 12H7M2 16H6" /></>,
  headset: <><path d="M6 19v-4a10 10 0 0 1 20 0v4" /><rect x="4" y="17" width="5" height="8" rx="2" /><rect x="23" y="17" width="5" height="8" rx="2" /><path d="M25.5 25v1.5a3 3 0 0 1-3 3H18" /></>,
  search: <><circle cx="14" cy="14" r="8.5" /><path d="M20.5 20.5L27 27" /></>,
  cart: <><path d="M7 11H25L23.5 27.5H8.5Z" /><path d="M11.5 14V9.5a4.5 4.5 0 0 1 9 0V14" /></>,
  menu: <path d="M5 9H27M5 16H27M5 23H27" />,
  close: <path d="M8 8L24 24M24 8L8 24" />,
  chevron: <path d="M12 7L21 16L12 25" />,
  lotus: <><path d="M16 26C10 22 9 15 16 8C23 15 22 22 16 26Z" /><path d="M16 26C10 25 5 21 4 15C10 15 14 19 16 26Z" /><path d="M16 26C22 25 27 21 28 15C22 15 18 19 16 26Z" /><path d="M7 27H25" /></>,
};

export function Icon({ name, className, ...rest }: { name: keyof typeof ICONS | string; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {ICONS[name]}
    </svg>
  );
}

export function WhatsAppGlyph({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 3.2C9 3.2 3.4 8.7 3.4 15.6c0 2.4.7 4.7 1.9 6.6L3.6 28.6l6.6-1.7c1.8 1 3.8 1.5 5.8 1.5 7 0 12.6-5.6 12.6-12.6S23 3.2 16 3.2Z"
        fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path fill="currentColor" d="M11.7 9.6c-.3-.6-.6-.6-.9-.6h-.8c-.3 0-.7.1-1.1.5-.4.4-1.4 1.4-1.4 3.3s1.4 3.8 1.6 4.1c.2.3 2.7 4.3 6.7 5.9 3.3 1.3 4 1 4.7.9.7-.1 2.3-.9 2.6-1.9.3-.9.3-1.7.2-1.9-.1-.2-.4-.3-.8-.5l-2.5-1.2c-.3-.1-.6-.2-.8.2-.2.4-.9 1.2-1.2 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.6.1-.2.1-.5 0-.7Z" />
    </svg>
  );
}
