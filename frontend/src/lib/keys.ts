import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";

const CREW_KEY = "ghostset-live:devnet:crew:v1";
const SECRET_PREFIX = "ghostset-live:devnet:pledge:v1:";
const SHOW_KEY = "ghostset-live:devnet:show:v1";

export interface CrewKeys {
  house: Keypair;
  seats: Keypair[];
}

export interface StoredPledge {
  showId: string;
  round: number;
  seat: number;
  track: number;
  amount: string;
  secret: Uint8Array;
}

function decodeKeypair(value: unknown): Keypair {
  if (!Array.isArray(value) || value.length !== 64 || value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error("Invalid stored keypair");
  }
  return Keypair.fromSecretKey(Uint8Array.from(value));
}

export function loadOrCreateCrew(): CrewKeys {
  try {
    const raw = localStorage.getItem(CREW_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { house?: unknown; seats?: unknown[] };
      if (parsed.seats?.length === 4) {
        return { house: decodeKeypair(parsed.house), seats: parsed.seats.map(decodeKeypair) };
      }
    }
  } catch {
    localStorage.removeItem(CREW_KEY);
  }
  const crew = { house: Keypair.generate(), seats: Array.from({ length: 4 }, () => Keypair.generate()) };
  localStorage.setItem(CREW_KEY, JSON.stringify({
    house: Array.from(crew.house.secretKey),
    seats: crew.seats.map((seat) => Array.from(seat.secretKey)),
  }));
  return crew;
}

export function createShowId(): BN {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const id = new BN(Array.from(bytes));
  return id.isZero() ? new BN(Date.now()) : id;
}

export function loadOrCreateShowId(): BN {
  const stored = localStorage.getItem(SHOW_KEY);
  if (stored && /^\d+$/.test(stored)) return new BN(stored);
  const id = createShowId();
  localStorage.setItem(SHOW_KEY, id.toString());
  return id;
}

export function replaceShowId(): BN {
  const id = createShowId();
  localStorage.setItem(SHOW_KEY, id.toString());
  return id;
}

export function makeSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function pledgeKey(showId: string, round: number, seat: number): string {
  return `${SECRET_PREFIX}${showId}:${round}:${seat}`;
}

export function savePledge(pledge: StoredPledge): void {
  localStorage.setItem(pledgeKey(pledge.showId, pledge.round, pledge.seat), JSON.stringify({
    ...pledge,
    amount: pledge.amount.toString(),
    secret: Buffer.from(pledge.secret).toString("base64"),
  }));
}

export function loadPledge(showId: BN, round: number, seat: number): StoredPledge {
  const raw = localStorage.getItem(pledgeKey(showId.toString(), round, seat));
  if (!raw) throw new Error(`No local pledge found for seat ${seat + 1}; commit from this browser first`);
  const parsed = JSON.parse(raw) as Omit<StoredPledge, "secret"> & { secret: string };
  const secret = Uint8Array.from(Buffer.from(parsed.secret, "base64"));
  if (secret.length !== 32 || parsed.showId !== showId.toString() || parsed.round !== round || parsed.seat !== seat) {
    throw new Error("Stored pledge is invalid");
  }
  return { ...parsed, amount: parsed.amount.toString(), secret };
}

export function clearPledges(showId: BN): void {
  const prefix = `${SECRET_PREFIX}${showId.toString()}:`;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith(prefix)));
  keys.forEach((key) => localStorage.removeItem(key));
}
