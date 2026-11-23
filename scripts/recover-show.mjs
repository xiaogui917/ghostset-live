// One-off recovery for dead show 8513420953816546564:
// abort (ER) -> finalize/commit+undelegate (ER) -> withdraw 4 seats (L1).
// Devnet only; uses ghostset_* test keypairs. Not part of the demo flow.
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const L1_RPC = "https://api.devnet.solana.com";
const ER_RPC = "https://devnet-us.magicblock.app";
const PROGRAM_ID = new PublicKey("J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
const SHOW_ID = new BN(process.argv[2] || "8513420953816546564");
const SHOW = pda("show", SHOW_ID);
const VAULT = pda("vault", SHOW_ID);
const idl = JSON.parse(readFileSync(new URL("../target/idl/ghostset_live.json", import.meta.url), "utf8"));
const l1 = new Connection(L1_RPC, "confirmed");
const er = new Connection(ER_RPC, "confirmed");
const programs = new Map();
let crew;

class LocalWallet {
  constructor(payer) { this.payer = payer; this.publicKey = payer.publicKey; }
  async signTransaction(transaction) {
    if (transaction instanceof VersionedTransaction) transaction.sign([this.payer]);
    else if (transaction instanceof Transaction) transaction.sign(this.payer);
    else throw new Error("Unsupported transaction format");
    return transaction;
  }
  async signAllTransactions(txs) { for (const t of txs) await this.signTransaction(t); return txs; }
}

function pda(seed, showId) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), showId.toArrayLike(Buffer, "le", 8)], PROGRAM_ID)[0];
}

function loadKeypair(value, label) {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value.secretKey : value;
  const bytes = Array.isArray(candidate) ? Uint8Array.from(candidate) : Uint8Array.from(Buffer.from(candidate, "base64"));
  if (bytes.length !== 64) throw new Error(`${label} is not a valid keypair`);
  return Keypair.fromSecretKey(bytes);
}

function loadCrew() {
  const load = (file, label) => loadKeypair(JSON.parse(readFileSync(new URL(`../../../.secrets/${file}`, import.meta.url), "utf8")), label);
  return {
    house: load("ghostset_house.json", "house"),
    seats: [1, 2, 3, 4].map((i) => load(`ghostset_seat${i}.json`, `seat ${i}`)),
  };
}

function program(layer, signer) {
  const key = `${layer}:${signer.publicKey.toBase58()}`;
  if (!programs.has(key)) {
    const provider = new AnchorProvider(layer === "L1" ? l1 : er, new LocalWallet(signer), { commitment: "confirmed", preflightCommitment: "confirmed" });
    programs.set(key, new Program(idl, provider));
  }
  return programs.get(key);
}

function enumKey(v) { return v && typeof v === "object" ? Object.keys(v)[0] : String(v); }

function formatSol(value) {
  const lamports = BigInt(value.toString());
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function decodeShow(info) {
  if (!info) return null;
  try { return program("L1", crew.house).coder.accounts.decode("show", info.data); }
  catch { return null; }
}

async function readShow(conn) { return decodeShow(await conn.getAccountInfo(SHOW).catch(() => null)); }

async function waitFor(label, timeoutMs, read) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function printBalances(tag) {
  console.log(`--- balances ${tag} ---`);
  console.log(`  house: ${formatSol(await l1.getBalance(crew.house.publicKey))} SOL`);
  for (let i = 0; i < 4; i += 1) console.log(`  seat ${i + 1}: ${formatSol(await l1.getBalance(crew.seats[i].publicKey))} SOL`);
  const vaultInfo = await l1.getAccountInfo(VAULT);
  console.log(`  vault: ${vaultInfo ? formatSol(vaultInfo.lamports) : "missing"} SOL`);
}

async function main() {
  console.log(`Recover dead show ${SHOW_ID.toString()} · ${SHOW.toBase58()} · vault ${VAULT.toBase58()}`);
  crew = loadCrew();
  const before = await readShow(er);
  console.log(`ER show before: ${before ? `state=${enumKey(before.state)} vrf=${enumKey(before.vrfStatus)} cancelled=${before.cancelled} liabilities=${formatSol(before.liabilityTotal)}` : "missing"}`);
  await printBalances("before");

  if (before && before.cancelled) {
    console.log("[ER] abort_show skipped: already cancelled");
  } else {
    console.log("[ER] abort_show");
    const abortSig = await program("ER", crew.house).methods.abortShow(SHOW_ID)
      .accounts({ payer: crew.house.publicKey, show: SHOW }).rpc();
    console.log(`  signature: ${abortSig}`);
    await waitFor("ER show cancelled", 120_000, async () => {
      const s = await readShow(er);
      return s && s.cancelled ? s : null;
    });
    console.log("  aborted: cancelled=true on ER");
  }

  console.log("[ER] finalize_show · commit + undelegate");
  const finSig = await program("ER", crew.house).methods.finalizeShow(SHOW_ID)
    .accounts({ payer: crew.house.publicKey, show: SHOW, magicProgram: MAGIC_PROGRAM, magicContext: MAGIC_CONTEXT }).rpc();
  console.log(`  signature: ${finSig}`);
  await waitFor("L1 show onL1 + finalizeScheduled", 600_000, async () => {
    const info = await l1.getAccountInfo(SHOW).catch(() => null);
    if (!info || !info.owner.equals(PROGRAM_ID)) return null;
    const s = decodeShow(info);
    return s && enumKey(s.state) === "onL1" && s.finalizeScheduled ? s : null;
  });
  console.log("  finalized: show back on L1, state=onL1");

  for (let i = 0; i < 4; i += 1) {
    console.log(`[L1] withdraw · seat ${i + 1} credit`);
    const sig = await program("L1", crew.seats[i]).methods.withdraw(SHOW_ID, { seat: {} }, i)
      .accounts({ recipient: crew.seats[i].publicKey, show: SHOW, vault: VAULT }).rpc();
    console.log(`  signature: ${sig}`);
  }

  const after = await readShow(l1);
  console.log(`L1 show after: ${after ? `state=${enumKey(after.state)} liabilities=${formatSol(after.liabilityTotal)}` : "missing"}`);
  await printBalances("after");
  console.log("RECOVERY COMPLETE");
}

main().catch((error) => {
  console.error(`Recovery failed: ${error.message}`);
  console.error(error.stack);
  if (Array.isArray(error.logs)) error.logs.forEach((line) => console.error(`  ${line}`));
  process.exitCode = 1;
});
