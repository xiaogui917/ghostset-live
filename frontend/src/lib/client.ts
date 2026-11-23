import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import type { IdlAccounts, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { AccountInfo } from "@solana/web3.js";
import { Buffer } from "buffer";
import idl from "../idl.json";
import type { GhostsetLive } from "../ghostset_live";
import { delay, enumKey } from "./format";

export const L1_RPC = "https://api.devnet.solana.com";
export const ER_RPC = "https://devnet-us.magicblock.app";
export const PROGRAM_ID = new PublicKey("J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3");
export const DEVNET_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
export const ORACLE_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
export const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
export const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
export const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
export const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
export const TRACK_URIS = [
  "ghostset://neon-arithmetic",
  "ghostset://midnight-signal",
  "ghostset://glass-cathedral",
] as const;

export type Layer = "L1" | "ER";
export type ShowAccount = IdlAccounts<GhostsetLive>["show"];
export type VaultAccount = IdlAccounts<GhostsetLive>["vault"];

export interface ShowSnapshot {
  show: ShowAccount | null;
  activeLayer: Layer;
  l1Show: ShowAccount | null;
  erShow: ShowAccount | null;
  vault: VaultAccount | null;
  l1Slot: number | null;
  erSlot: number | null;
  balances: number[];
  fetchedAt: number;
}

class LocalWallet implements Wallet {
  readonly publicKey: PublicKey;

  constructor(readonly payer: Keypair) {
    this.publicKey = payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (transaction instanceof VersionedTransaction) transaction.sign([this.payer]);
    else transaction.sign(this.payer);
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    for (const transaction of transactions) await this.signTransaction(transaction);
    return transactions;
  }
}

function pda(seed: string, showId: BN): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), showId.toArrayLike(Buffer, "le", 8)], PROGRAM_ID)[0];
}

export function showPda(showId: BN): PublicKey {
  return pda("show", showId);
}

export function vaultPda(showId: BN): PublicKey {
  return pda("vault", showId);
}

function fixedPda(seed: string, show: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), show.toBuffer()], programId)[0];
}

function trackInput(uri: string): { uri: number[]; uriLen: number } {
  const bytes = new TextEncoder().encode(uri);
  if (bytes.length === 0 || bytes.length > 64) throw new Error("Track URI must contain 1–64 bytes");
  const padded = new Uint8Array(64);
  padded.set(bytes);
  return { uri: Array.from(padded), uriLen: bytes.length };
}

function stateRank(show: ShowAccount): number {
  return ["uninitialized", "funded", "delegated", "vrfReady", "running", "finalizing", "onL1", "closed"].indexOf(enumKey(show.state));
}

export async function pledgeCommitment(
  show: PublicKey,
  round: number,
  seatIndex: number,
  seatAuthority: PublicKey,
  track: number,
  amount: BN,
  secret: Uint8Array,
): Promise<Uint8Array> {
  if (secret.length !== 32) throw new Error("Pledge secret must contain 32 bytes");
  const parts = [
    new TextEncoder().encode("GHOSTSET:PLEDGE:V1"),
    show.toBytes(),
    Uint8Array.of(round),
    Uint8Array.of(seatIndex),
    seatAuthority.toBytes(),
    Uint8Array.of(track),
    Uint8Array.from(amount.toArray("le", 8)),
    secret,
  ];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export class GhostSetClient {
  readonly l1 = new Connection(L1_RPC, "confirmed");
  readonly er = new Connection(ER_RPC, "confirmed");
  private readonly programs = new Map<string, Program<GhostsetLive>>();

  constructor(private readonly reader: Keypair) {}

  private connection(layer: Layer): Connection {
    return layer === "L1" ? this.l1 : this.er;
  }

  private program(layer: Layer, signer: Keypair): Program<GhostsetLive> {
    const key = `${layer}:${signer.publicKey.toBase58()}`;
    const cached = this.programs.get(key);
    if (cached) return cached;
    const provider = new AnchorProvider(this.connection(layer), new LocalWallet(signer), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    const program = new Program<GhostsetLive>(idl as unknown as GhostsetLive, provider);
    this.programs.set(key, program);
    return program;
  }

  private decodeShow(info: AccountInfo<Buffer> | null): ShowAccount | null {
    if (!info) return null;
    try {
      return this.program("L1", this.reader).coder.accounts.decode("Show", info.data) as ShowAccount;
    } catch {
      return null;
    }
  }

  private decodeVault(info: AccountInfo<Buffer> | null): VaultAccount | null {
    if (!info) return null;
    try {
      return this.program("L1", this.reader).coder.accounts.decode("Vault", info.data) as VaultAccount;
    } catch {
      return null;
    }
  }

  async snapshot(showId: BN, balanceKeys: PublicKey[]): Promise<ShowSnapshot> {
    const show = showPda(showId);
    const vault = vaultPda(showId);
    const [l1Info, erInfo, vaultInfo, l1Slot, erSlot, balanceInfo] = await Promise.all([
      this.l1.getAccountInfo(show).catch(() => null),
      this.er.getAccountInfo(show).catch(() => null),
      this.l1.getAccountInfo(vault).catch(() => null),
      this.l1.getSlot().catch(() => null),
      this.er.getSlot().catch(() => null),
      this.l1.getMultipleAccountsInfo(balanceKeys).catch(() => []),
    ]);
    const l1Show = this.decodeShow(l1Info);
    const erShow = this.decodeShow(erInfo);
    const useL1 = Boolean(l1Show && (!erShow || stateRank(l1Show) >= stateRank(erShow)));
    return {
      show: useL1 ? l1Show : erShow ?? l1Show,
      activeLayer: useL1 ? "L1" : "ER",
      l1Show,
      erShow,
      vault: this.decodeVault(vaultInfo),
      l1Slot,
      erSlot,
      balances: balanceKeys.map((_, index) => balanceInfo[index]?.lamports ?? 0),
      fetchedAt: Date.now(),
    };
  }

  async airdrop(recipient: PublicKey, sol = 1, attempts = 3): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const signature = await this.l1.requestAirdrop(recipient, sol * 1_000_000_000);
        await this.l1.confirmTransaction(signature, "confirmed");
        return signature;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await delay(attempt * 1200);
      }
    }
    throw lastError;
  }

  async initializeShow(
    signer: Keypair,
    showId: BN,
    totalRounds: number,
    pledgeCap: BN,
    commitSlots: BN,
    revealSlots: BN,
    tracks: string[],
    beneficiaries: PublicKey[],
  ): Promise<string> {
    return this.program("L1", signer).methods
      .initializeShow(showId, totalRounds, pledgeCap, commitSlots, revealSlots, tracks.map(trackInput), beneficiaries)
      .accountsStrict({ authority: signer.publicKey, show: showPda(showId), vault: vaultPda(showId), systemProgram: SystemProgram.programId })
      .rpc();
  }

  async joinShow(signer: Keypair, showId: BN, seatIndex: number, amount: BN): Promise<string> {
    return this.program("L1", signer).methods
      .joinShow(showId, seatIndex, amount)
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId), vault: vaultPda(showId), systemProgram: SystemProgram.programId })
      .rpc();
  }

  async delegateShow(signer: Keypair, showId: BN, validator: PublicKey | null = null): Promise<string> {
    const show = showPda(showId);
    return this.program("L1", signer).methods
      .delegateShow(showId)
      .accountsStrict({
        authority: signer.publicKey,
        bufferShow: fixedPda("buffer", show, PROGRAM_ID),
        delegationRecordShow: fixedPda("delegation", show, DELEGATION_PROGRAM),
        delegationMetadataShow: fixedPda("delegation-metadata", show, DELEGATION_PROGRAM),
        show,
        validator: validator,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async requestShowRandomness(signer: Keypair, showId: BN, clientSeed: Uint8Array): Promise<string> {
    const programIdentity = PublicKey.findProgramAddressSync([Buffer.from("identity")], PROGRAM_ID)[0];
    return this.program("ER", signer).methods
      .requestShowRandomness(showId, Array.from(clientSeed))
      .accountsStrict({
        payer: signer.publicKey,
        show: showPda(showId),
        oracleQueue: ORACLE_QUEUE,
        programIdentity,
        vrfProgram: VRF_PROGRAM,
        slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async openRound(signer: Keypair, showId: BN): Promise<string> {
    return this.program("ER", signer).methods
      .openRound(showId)
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId) })
      .rpc();
  }

  async commitPledge(signer: Keypair, showId: BN, seatIndex: number, commitment: Uint8Array): Promise<string> {
    return this.program("ER", signer).methods
      .commitPledge(showId, seatIndex, Array.from(commitment))
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId) })
      .rpc();
  }

  async revealPledge(signer: Keypair, showId: BN, seatIndex: number, track: number, amount: BN, secret: Uint8Array): Promise<string> {
    return this.program("ER", signer).methods
      .revealPledge(showId, seatIndex, track, amount, Array.from(secret))
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId) })
      .rpc();
  }

  async closeRound(signer: Keypair, showId: BN): Promise<string> {
    return this.program("ER", signer).methods
      .closeRound(showId)
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId) })
      .rpc();
  }

  async abortShow(signer: Keypair, showId: BN, layer: Layer): Promise<string> {
    return this.program(layer, signer).methods
      .abortShow(showId)
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId) })
      .rpc();
  }

  async finalizeShow(signer: Keypair, showId: BN): Promise<string> {
    return this.program("ER", signer).methods
      .finalizeShow(showId)
      .accountsStrict({ payer: signer.publicKey, show: showPda(showId), magicProgram: MAGIC_PROGRAM, magicContext: MAGIC_CONTEXT })
      .rpc();
  }

  async withdraw(signer: Keypair, showId: BN, kind: "seat" | "beneficiary", index: number): Promise<string> {
    const withdrawKind = kind === "seat" ? { seat: {} } : { beneficiary: {} };
    return this.program("L1", signer).methods
      .withdraw(showId, withdrawKind, index)
      .accountsStrict({ recipient: signer.publicKey, show: showPda(showId), vault: vaultPda(showId) })
      .rpc();
  }

  async waitForErSlot(target: BN): Promise<number> {
    const targetNumber = Number(target.toString());
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const slot = await this.er.getSlot("confirmed");
      if (slot > targetNumber) return slot;
      await delay(500);
    }
    throw new Error(`Timed out waiting for ER slot ${targetNumber}`);
  }

  async waitForVrf(showId: BN): Promise<ShowAccount> {
    const deadline = Date.now() + 190_000;
    while (Date.now() < deadline) {
      const info = await this.er.getAccountInfo(showPda(showId));
      const show = this.decodeShow(info);
      if (show && enumKey(show.vrfStatus) === "ready") return show;
      await delay(1500);
    }
    throw new Error("VRF was not fulfilled within 180 seconds");
  }

  async waitForL1Settlement(showId: BN): Promise<ShowAccount> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const info = await this.l1.getAccountInfo(showPda(showId));
      const show = this.decodeShow(info);
      if (show && enumKey(show.state) === "onL1" && show.finalizeScheduled) return show;
      await delay(1500);
    }
    throw new Error("Timed out waiting for the Show account on L1");
  }
}
