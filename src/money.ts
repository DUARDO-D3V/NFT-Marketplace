const ETH_SCALE = 18n;
const ETH_UNIT = 10n ** ETH_SCALE;

export function toEthUnits(value: string): bigint {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error(`Invalid ETH decimal: ${value}`);
  const fraction = match[2] ?? "";
  if (fraction.length > Number(ETH_SCALE)) throw new Error("ETH values may have at most 18 decimal places.");
  return BigInt(match[1]) * ETH_UNIT + BigInt(fraction.padEnd(Number(ETH_SCALE), "0") || "0");
}

export function fromEthUnits(units: bigint): string {
  const whole = units / ETH_UNIT;
  const fraction = (units % ETH_UNIT).toString().padStart(Number(ETH_SCALE), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function addEth(left: string, right: string): string {
  return fromEthUnits(toEthUnits(left) + toEthUnits(right));
}

export function subtractEth(left: string, right: string): string {
  return fromEthUnits(toEthUnits(left) - toEthUnits(right));
}

export function multiplyEth(value: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("ETH quantities must be non-negative integers.");
  return fromEthUnits(toEthUnits(value) * BigInt(quantity));
}

export function percentEth(value: string, percent: bigint): string {
  return fromEthUnits((toEthUnits(value) * percent) / 100n);
}
