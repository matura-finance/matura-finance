/**
 * Deterministic blockie-style identicon derived from the address — no dependency, matches the
 * pixelated avatar wallets render. A 5-column, left-right-symmetric grid seeded by the address.
 */
export function WalletBlockie({ address, size = 22 }: { address: string; size?: number }) {
  const rand = seededRandom(address.toLowerCase());
  const hue = Math.floor(rand() * 360);
  const background = `hsl(${String(hue)} 65% 55%)`;
  const foreground = `hsl(${String((hue + 150) % 360)} 70% 40%)`;
  const spot = `hsl(${String((hue + 60) % 360)} 75% 72%)`;

  const columns = 5;
  const half = Math.ceil(columns / 2);
  const cell = size / columns;
  const rects: { x: number; y: number; fill: string }[] = [];
  for (let y = 0; y < columns; y++) {
    for (let x = 0; x < half; x++) {
      const r = rand();
      if (r <= 0.43) continue; // transparent → shows the background
      const fill = r > 0.72 ? spot : foreground;
      rects.push({ x, y, fill });
      if (x !== columns - 1 - x) rects.push({ x: columns - 1 - x, y, fill });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      aria-hidden
      className="shrink-0 rounded-full"
    >
      <rect width={size} height={size} fill={background} />
      {rects.map((r) => (
        <rect
          key={`${String(r.x)}-${String(r.y)}`}
          x={r.x * cell}
          y={r.y * cell}
          width={cell}
          height={cell}
          fill={r.fill}
        />
      ))}
    </svg>
  );
}

/** xmur3-seeded mulberry32 PRNG — deterministic per address, no crypto needed for an avatar. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
