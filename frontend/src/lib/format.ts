import { BN } from "@coral-xyz/anchor";

export function parseSol(value: string): BN {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,9})?$/.test(normalized)) {
    throw new Error("Enter a non-negative SOL amount with at most 9 decimals");
  }
  const [whole, fraction = ""] = normalized.split(".");
  return new BN(whole).mul(new BN(1_000_000_000)).add(new BN(fraction.padEnd(9, "0") || "0"));
}

export function formatSol(value: BN | string | number | bigint, precision = 4): string {
  const lamports = BigInt(value.toString());
  const negative = lamports < 0n;
  const absolute = negative ? -lamports : lamports;
  const whole = absolute / 1_000_000_000n;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, "0").slice(0, precision).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function shortKey(value: { toBase58(): string } | string, left = 4, right = 4): string {
  const key = typeof value === "string" ? value : value.toBase58();
  return `${key.slice(0, left)}…${key.slice(-right)}`;
}

export function enumKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return Object.keys(value)[0] ?? "unknown";
  return "unknown";
}

export function stateLabel(value: unknown): string {
  const key = enumKey(value);
  const labels: Record<string, string> = {
    uninitialized: "Uninitialized",
    funded: "Funded",
    delegated: "Delegated",
    vrfReady: "VRF Ready",
    running: "Running",
    finalizing: "Finalizing",
    onL1: "On L1",
    closed: "Closed",
    idle: "Idle",
    requested: "Requested",
    ready: "Ready",
    aborted: "Aborted",
    commit: "Commit",
    reveal: "Reveal",
  };
  return labels[key] ?? key;
}

export function integerSqrt(value: BN | string | bigint): bigint {
  const input = BigInt(value.toString());
  if (input < 2n) return input;
  let x = input;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + input / x) / 2n;
  }
  return x;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const anchorError = error as Error & { error?: { errorMessage?: string }; logs?: string[] };
    const anchorLog = anchorError.logs?.find((line) => line.includes("Error Message:"));
    return anchorError.error?.errorMessage ?? anchorLog?.split("Error Message:")[1]?.trim() ?? error.message;
  }
  return String(error);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
