// Decorative colours only. Do not turn variegation into a photosynthesis model.
export function leafColor(pattern, x, y, index) {
  const wave = Math.sin(y * 32 + index * 2);
  if (pattern === "albo")
    return x > 0.08 * Math.sin(y * 21 + index) + ((index % 3) - 1) * 0.2
      ? 0xe5e8cd
      : 0x49734c;
  if (pattern === "purple") return index % 2 ? 0x733b79 : 0x914f8d;
  if (pattern === "glaucous") return 0x89ad99;
  if (pattern === "satin")
    return Math.sin(x * 39 + index) * wave > 0.25 ? 0xafbca3 : 0x41634a;
  if (pattern === "prayer")
    return Math.abs(x) < 0.055 ||
      Math.abs(Math.sin(y * 27 + Math.abs(x) * 6)) < 0.25
      ? 0xa87572
      : Math.abs(x) < 0.3
        ? 0x3e6149
        : 0x82965e;
  if (pattern === "croton")
    return [0x826d35, 0xb28137, 0xa05243, 0x597246][
      (index + (Math.abs(x) < 0.1 ? 1 : 0)) % 4
    ];
  if (pattern === "cream")
    return Math.abs(x) < 0.22 + 0.07 * wave ? 0xcad39a : 0x4b754e;
  return null;
}
