import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY, Transaction, VersionedTransaction } from "@solana/web3.js";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

const L1_RPC = "https://api.devnet.solana.com";
const ER_RPC = "https://devnet-us.magicblock.app";
const PROGRAM_ID = new PublicKey("J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3");
const DEVNET_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
const VALIDATOR = process.env.GHOSTSET_VALIDATOR ? new PublicKey(process.env.GHOSTSET_VALIDATOR) : null;
const ORACLE_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
const TRACKS = ["ghostset://neon-arithmetic", "ghostset://midnight-signal", "ghostset://glass-cathedral"];
const TRACK_NAMES = ["Neon Arithmetic", "Midnight Signal", "Glass Cathedral"];
const TOTAL_ROUNDS = 3;
const PLEDGE_CAP = 100_000_000;
const JOIN_AMOUNT = 500_000_000;
const COMMIT_SLOTS = new BN(2000);
const REVEAL_SLOTS = new BN(2000);
const SHOW_ID = new BN(randomBytes(8));
const SHOW = pda("show", SHOW_ID);
const VAULT = pda("vault", SHOW_ID);
const idl = JSON.parse(readFileSync(new URL("../target/idl/ghostset_live.json", import.meta.url), "utf8"));
const l1 = new Connection(L1_RPC, "confirmed");
const er = new Connection(ER_RPC, "confirmed");
const programs = new Map();
let crew;

class LocalWallet {
  constructor(payer) {
    this.payer = payer;
    this.publicKey = payer.publicKey;
  }

  async signTransaction(transaction) {
    if (transaction instanceof VersionedTransaction) transaction.sign([this.payer]);
    else if (transaction instanceof Transaction) transaction.sign(this.payer);
    else throw new Error("Unsupported transaction format");
    return transaction;
  }

  async signAllTransactions(transactions) {
    for (const transaction of transactions) await this.signTransaction(transaction);
    return transactions;
  }
}

function pda(seed, showId) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), showId.toArrayLike(Buffer, "le", 8)], PROGRAM_ID)[0];
}

function fixedPda(seed, show, programId) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), show.toBuffer()], programId)[0];
}

function loadKeypair(value, label) {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value.secretKey : value;
  let bytes;
  if (Array.isArray(candidate)) bytes = Uint8Array.from(candidate);
  else if (typeof candidate === "string") bytes = Uint8Array.from(Buffer.from(candidate, "base64"));
  else throw new Error(`${label} must be a 64-byte secret-key array or base64 string`);
  if (bytes.length !== 64 || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error(`${label} is not a valid keypair`);
  return Keypair.fromSecretKey(bytes);
}

function loadCrew() {
  const houseFile = new URL("../../.secrets/ghostset_house.json", import.meta.url);
  const seatFiles = [
    new URL("../../.secrets/ghostset_seat1.json", import.meta.url),
    new URL("../../.secrets/ghostset_seat2.json", import.meta.url),
    new URL("../../.secrets/ghostset_seat3.json", import.meta.url),
    new URL("../../.secrets/ghostset_seat4.json", import.meta.url),
  ];
  const load = (file, label) => {
    try {
      return loadKeypair(JSON.parse(readFileSync(file, "utf8")), label);
    } catch (error) {
      throw new Error(`Unable to load ${file.pathname}: ${error.message}`);
    }
  };
  const loaded = { house: load(houseFile, "house"), seats: seatFiles.map((file, index) => load(file, `seat ${index + 1}`)) };
  if (loaded.seats.length !== 4) throw new Error("Exactly four seat keypairs are required");
  const unique = new Set([loaded.house, ...loaded.seats].map((keypair) => keypair.publicKey.toBase58()));
  if (unique.size !== 5) throw new Error("House and seat public keys must be distinct");
  console.log(`Loaded devnet crew from .secrets · house ${loaded.house.publicKey.toBase58()}`);
  loaded.seats.forEach((seat, index) => console.log(`  seat ${index + 1}: ${seat.publicKey.toBase58()}`));
  return loaded;
}

function program(layer, signer) {
  const key = `${layer}:${signer.publicKey.toBase58()}`;
  if (!programs.has(key)) {
    const provider = new AnchorProvider(layer === "L1" ? l1 : er, new LocalWallet(signer), { commitment: "confirmed", preflightCommitment: "confirmed" });
    programs.set(key, new Program(idl, provider));
  }
  return programs.get(key);
}

function enumKey(value) {
  return value && typeof value === "object" ? Object.keys(value)[0] : String(value);
}

function stateRank(show) {
  return ["uninitialized", "funded", "delegated", "vrfReady", "running", "finalizing", "onL1", "closed"].indexOf(enumKey(show.state));
}

function formatSol(value) {
  const lamports = BigInt(value.toString());
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeShow(info) {
  if (!info) return null;
  try {
    return program("L1", crew.house).coder.accounts.decode("Show", info.data);
  } catch {
    return null;
  }
}

async function readL1Show() {
  return decodeShow(await l1.getAccountInfo(SHOW).catch(() => null));
}

async function readErShow() {
  return decodeShow(await er.getAccountInfo(SHOW).catch(() => null));
}

async function readActiveShow() {
  const [base, ephemeral] = await Promise.all([readL1Show(), readErShow()]);
  if (base && (!ephemeral || stateRank(base) >= stateRank(ephemeral))) return { show: base, layer: "L1" };
  return { show: ephemeral ?? base, layer: ephemeral ? "ER" : "L1" };
}

async function printStatus() {
  const { show, layer } = await readActiveShow();
  if (!show) {
    console.log("  status: Show account is not available yet");
    return;
  }
  let line = `  status[${layer}]: state=${enumKey(show.state)} vrf=${enumKey(show.vrfStatus)} phase=${enumKey(show.roundPhase)} round=${show.currentRound + 1}/${show.totalRounds} closed=${show.closedRounds} liabilities=${formatSol(show.liabilityTotal)} SOL`;
  if (enumKey(show.roundPhase) === "closed" && show.closedRounds > show.currentRound) {
    const result = show.winners[show.currentRound];
    line += ` winner=${TRACK_NAMES[result.winnerTrack]} mystery=${TRACK_NAMES[result.mysteryTrack]} scores=[${result.scores.map((score) => score.toString()).join(",")}]`;
  }
  console.log(line);
}

async function send(layer, label, operation) {
  const signature = await operation();
  console.log(`[${layer}] ${label}\n  signature: ${signature}`);
  await printStatus();
  return signature;
}

async function ensureFunds(keypair, minimum, label) {
  let balance = await l1.getBalance(keypair.publicKey, "confirmed");
  if (balance >= minimum) {
    console.log(`[L1] ${label} balance sufficient · ${formatSol(balance)} SOL`);
    return;
  }
  let lastError;
  for (let attempt = 1; attempt <= 3 && balance < minimum; attempt += 1) {
    try {
      const amount = label === "house" ? 2 : 1;
      const signature = await l1.requestAirdrop(keypair.publicKey, amount * 1_000_000_000);
      await l1.confirmTransaction(signature, "confirmed");
      balance = await l1.getBalance(keypair.publicKey, "confirmed");
      console.log(`[L1] ${label} airdrop ${attempt} confirmed · ${formatSol(balance)} SOL\n  signature: ${signature}`);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  if (balance < minimum) throw new Error(`${label} needs at least ${formatSol(minimum)} SOL${lastError ? ` · ${lastError.message}` : ""}`);
}

function trackInput(uri) {
  const bytes = Buffer.from(uri, "utf8");
  const padded = Buffer.alloc(64);
  bytes.copy(padded);
  return { uri: Array.from(padded), uriLen: bytes.length };
}

function commitment(round, seatIndex, seatAuthority, track, amount, secret) {
  return createHash("sha256").update(Buffer.concat([
    Buffer.from("GHOSTSET:PLEDGE:V1"),
    SHOW.toBuffer(),
    Buffer.from([round]),
    Buffer.from([seatIndex]),
    seatAuthority.toBuffer(),
    Buffer.from([track]),
    amount.toArrayLike(Buffer, "le", 8),
    secret,
  ])).digest();
}

async function waitFor(label, timeoutMs, read) {
  const deadline = Date.now() + timeoutMs;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    if (Date.now() - lastLog > 5000) {
      console.log(`  waiting: ${label}`);
      lastLog = Date.now();
    }
    await sleep(1200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForErSlot(target, label) {
  const targetNumber = Number(target.toString());
  const deadline = Date.now() + 240_000;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const slot = await er.getSlot("confirmed");
    if (slot > targetNumber) {
      console.log(`[ER] ${label} · slot ${slot} > ${targetNumber}`);
      return slot;
    }
    if (Date.now() - lastLog > 5000) {
      console.log(`  waiting: ${label} · ${targetNumber - slot} ER slots remaining`);
      lastLog = Date.now();
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ER slot ${targetNumber}`);
}

async function initialize() {
  const beneficiaries = [crew.house.publicKey, crew.seats[0].publicKey, crew.seats[1].publicKey];
  await send("L1", "initialize_show", () => program("L1", crew.house).methods
    .initializeShow(SHOW_ID, TOTAL_ROUNDS, new BN(PLEDGE_CAP), COMMIT_SLOTS, REVEAL_SLOTS, TRACKS.map(trackInput), beneficiaries)
    .accounts({ authority: crew.house.publicKey, show: SHOW, vault: VAULT, systemProgram: SystemProgram.programId })
    .rpc());
}

async function join(index) {
  await send("L1", `join_show · seat ${index + 1}`, () => program("L1", crew.seats[index]).methods
    .joinShow(SHOW_ID, index, new BN(JOIN_AMOUNT))
    .accounts({ payer: crew.seats[index].publicKey, show: SHOW, vault: VAULT, systemProgram: SystemProgram.programId })
    .rpc());
}

async function delegate() {
  console.log(`Delegate validator: ${VALIDATOR ? VALIDATOR.toBase58() : "default (null)"}`);
  await send("L1", "delegate_show", () => program("L1", crew.house).methods
    .delegateShow(SHOW_ID)
    .accounts({
      authority: crew.house.publicKey,
      bufferShow: fixedPda("buffer", SHOW, PROGRAM_ID),
      delegationRecordShow: fixedPda("delegation", SHOW, DELEGATION_PROGRAM),
      delegationMetadataShow: fixedPda("delegation-metadata", SHOW, DELEGATION_PROGRAM),
      show: SHOW,
      validator: VALIDATOR,
      ownerProgram: PROGRAM_ID,
      delegationProgram: DELEGATION_PROGRAM,
      systemProgram: SystemProgram.programId,
    })
    .rpc());
  await waitFor("ER Show replica in Delegated state", 90_000, async () => {
    const show = await readErShow();
    return show && enumKey(show.state) === "delegated" ? show : null;
  });
  await printStatus();
}

async function requestVrf() {
  const programIdentity = PublicKey.findProgramAddressSync([Buffer.from("identity")], PROGRAM_ID)[0];
  await send("ER", "request_show_randomness", () => program("ER", crew.house).methods
    .requestShowRandomness(SHOW_ID, Array.from(randomBytes(32)))
    .accounts({ payer: crew.house.publicKey, show: SHOW, oracleQueue: ORACLE_QUEUE, programIdentity, vrfProgram: VRF_PROGRAM, slotHashes: SYSVAR_SLOT_HASHES_PUBKEY, systemProgram: SystemProgram.programId })
    .rpc());
  await waitFor("real VRF callback", 190_000, async () => {
    const show = await readErShow();
    return show && enumKey(show.vrfStatus) === "ready" ? show : null;
  });
  await printStatus();
}

async function openRound(round) {
  await send("ER", `open_round · round ${round + 1}`, () => program("ER", crew.house).methods
    .openRound(SHOW_ID)
    .accounts({ payer: crew.house.publicKey, show: SHOW })
    .rpc());
  return waitFor(`round ${round + 1} commit deadline`, 30_000, async () => {
    const show = await readErShow();
    return show && show.roundOpen && show.currentRound === round ? show : null;
  });
}

async function commit(index, round, pledge) {
  const hash = commitment(round, index, crew.seats[index].publicKey, pledge.track, pledge.amount, pledge.secret);
  await send("ER", `commit_pledge · round ${round + 1} seat ${index + 1}`, () => program("ER", crew.seats[index]).methods
    .commitPledge(SHOW_ID, index, Array.from(hash))
    .accounts({ payer: crew.seats[index].publicKey, show: SHOW })
    .rpc());
}

async function reveal(index, round, pledge) {
  await send("ER", `reveal_pledge · round ${round + 1} seat ${index + 1} · ${TRACK_NAMES[pledge.track]} ${formatSol(pledge.amount)} SOL`, () => program("ER", crew.seats[index]).methods
    .revealPledge(SHOW_ID, index, pledge.track, pledge.amount, Array.from(pledge.secret))
    .accounts({ payer: crew.seats[index].publicKey, show: SHOW })
    .rpc());
}

async function closeRound(round) {
  await send("ER", `close_round · round ${round + 1}`, () => program("ER", crew.house).methods
    .closeRound(SHOW_ID)
    .accounts({ payer: crew.house.publicKey, show: SHOW })
    .rpc());
}

async function finalize() {
  await send("ER", "finalize_show · commit + undelegate", () => program("ER", crew.house).methods
    .finalizeShow(SHOW_ID)
    .accounts({ payer: crew.house.publicKey, show: SHOW, magicProgram: MAGIC_PROGRAM, magicContext: MAGIC_CONTEXT })
    .rpc());
  await waitFor("finalized Show account on L1", 180_000, async () => {
    const show = await readL1Show();
    return show && enumKey(show.state) === "onL1" && show.finalizeScheduled ? show : null;
  });
  await printStatus();
}

async function withdrawSeat(index) {
  await send("L1", `withdraw · seat ${index + 1} credit`, () => program("L1", crew.seats[index]).methods
    .withdraw(SHOW_ID, { seat: {} }, index)
    .accounts({ recipient: crew.seats[index].publicKey, show: SHOW, vault: VAULT })
    .rpc());
}

async function withdrawBeneficiary(index, signer, role) {
  await send("L1", `withdraw · ${role} royalty`, () => program("L1", signer).methods
    .withdraw(SHOW_ID, { beneficiary: {} }, index)
    .accounts({ recipient: signer.publicKey, show: SHOW, vault: VAULT })
    .rpc());
}

async function main() {
  console.log("GhostSet Live · automated devnet performance");
  console.log(`Show ID: ${SHOW_ID.toString()}\nShow PDA: ${SHOW.toBase58()}\nVault PDA: ${VAULT.toBase58()}`);
  console.log(`Timing: ${COMMIT_SLOTS.toString()} commit slots + ${REVEAL_SLOTS.toString()} reveal slots per round`);
  crew = loadCrew();
  await ensureFunds(crew.house, 250_000_000, "house");
  for (let index = 0; index < 4; index += 1) await ensureFunds(crew.seats[index], 550_000_000, `seat ${index + 1}`);
  await initialize();
  for (let index = 0; index < 4; index += 1) await join(index);
  await delegate();
  await requestVrf();

  for (let round = 0; round < TOTAL_ROUNDS; round += 1) {
    const opened = await openRound(round);
    const pledges = Array.from({ length: 4 }, () => ({
      track: randomInt(3),
      amount: new BN(randomInt(1, PLEDGE_CAP + 1)),
      secret: randomBytes(32),
    }));
    for (let index = 0; index < 4; index += 1) await commit(index, round, pledges[index]);
    await waitForErSlot(opened.commitDeadlineSlot, `round ${round + 1} reveal window`);
    for (let index = 0; index < 4; index += 1) await reveal(index, round, pledges[index]);
    await waitForErSlot(opened.revealDeadlineSlot, `round ${round + 1} close window`);
    await closeRound(round);
  }

  await finalize();
  for (let index = 0; index < 4; index += 1) await withdrawSeat(index);
  await withdrawBeneficiary(0, crew.house, "DJ");
  await withdrawBeneficiary(1, crew.seats[0], "composer");
  await withdrawBeneficiary(2, crew.seats[1], "visual artist");
  const vaultInfo = await l1.getAccountInfo(VAULT);
  const vault = program("L1", crew.house).coder.accounts.decode("Vault", vaultInfo.data);
  console.log(`Performance complete · Show ${SHOW.toBase58()} · Vault liability ${formatSol(vault.totalLiability)} SOL`);
  await printStatus();
}

main().catch((error) => {
  console.error(`Demo failed: ${error.message}`);
  if (Array.isArray(error.logs)) error.logs.forEach((line) => console.error(`  ${line}`));
  process.exitCode = 1;
});
