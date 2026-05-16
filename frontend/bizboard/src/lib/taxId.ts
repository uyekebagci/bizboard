// VKN (10 digits) and TCKN (11 digits) checksum validation. Mirror of backend
// TaxIdValidator (src/main/java/com/bizboard/common/util/TaxIdValidator.java).
// Backend has the final say; frontend validation is for UX only.

export function isValidTaxId(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  return isValidVkn(t) || isValidTckn(t);
}

export function isValidVkn(s: string): boolean {
  if (!/^\d{10}$/.test(s)) return false;
  const d = s.split("").map((c) => parseInt(c, 10));
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i] + (9 - i)) % 10;
    if (tmp === 0) continue;
    const product = tmp * Math.pow(2, 9 - i);
    const mod = product % 9;
    sum += mod === 0 ? 9 : mod;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === d[9];
}

export function isValidTckn(s: string): boolean {
  if (!/^\d{11}$/.test(s)) return false;
  const d = s.split("").map((c) => parseInt(c, 10));
  if (d[0] === 0) return false;
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  let digit10 = (odd * 7 - even) % 10;
  if (digit10 < 0) digit10 += 10;
  if (digit10 !== d[9]) return false;
  let sum10 = 0;
  for (let i = 0; i < 10; i++) sum10 += d[i];
  return sum10 % 10 === d[10];
}
