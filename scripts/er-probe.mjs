// Read-only ER probe: read demo show state + simulate abort_show for the
// stuck old show via Anchor's .simulate(). Never sends a transaction.
// Devnet only. Uses the real Anchor Wallet class around the house keypair
// (same as recover-show.mjs); a hand-rolled wallet object breaks signing.
//
// NOTE (2026-11-24): Anchor 0.32.1's SimulateError is constructed with
// super(undefined), so e.message is ALWAYS an empty string. The real
// verdict lives in e.simulationResponse ({err, logs, unitsConsumed}).
// Never judge by e.message alone.
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const L1_RPC = "https://api.devnet.solana.com";
const ER_RPC = "https://devnet-us.magicblock.app";
const PROGRAM_ID = new PublicKey("J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3");
const DEMO_SHOW_ID = new BN("16727413064812048144");
const OLD_SHOW_ID = new BN("14440634207599454842");
const idl = JSON.parse(readFileSync(new URL("../target/idl/ghostset_live.json", import.meta.url), "utf8"));
const l1 = new Connection(L1_RPC, "confirmed");
const er = new Connection(ER_RPC, "confirmed");

function pda(seed, showId) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), showId.toArrayLike(Buffer, "le", 8)], PROGRAM_ID)[0];
}
function loadKeypair(file) {
  const j = JSON.parse(readFileSync(new URL(`../../../.secrets/${file}`, import.meta.url), "utf8"));
  const cand = j && typeof j === "object" && !Array.isArray(j) ? j.secretKey : j;
  const bytes = Array.isArray(cand) ? Uint8Array.from(cand) : Uint8Array.from(Buffer.from(cand, "base64"));
  return Keypair.fromSecretKey(bytes);
}
function enumKey(v) { return v && typeof v === "object" ? Object.keys(v)[0] : String(v); }

const house = loadKeypair("ghostset_house.json");
const provider = new AnchorProvider(er, new Wallet(house), { commitment: "confirmed", preflightCommitment: "confirmed" });
const program = new Program(idl, provider);

function dumpError(e) {
  console.log(`  message: ${JSON.stringify(e?.message)}`);
  console.log(`  name: ${e?.name}`);
  if (e?.simulationResponse !== undefined) {
    console.log(`  simulationResponse: ${JSON.stringify(e.simulationResponse)}`);
  }
  if (Array.isArray(e?.logs)) e.logs.forEach((l) => console.log(`  log: ${l}`));
  try {
    console.log(`  full: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
  } catch { /* ignore stringify errors */ }
  if (e?.stack) console.log(`  stack: ${String(e.stack).split("\n").slice(0, 5).join("\n  ")}`);
}

async function main() {
  const slot1 = await er.getSlot("confirmed");
  await new Promise((r) => setTimeout(r, 5000));
  const slot2 = await er.getSlot("confirmed");
  console.log(`ER slot: ${slot1} -> ${slot2} (delta ${slot2 - slot1} in 5s)`);

  for (const [label, showId] of [["demo", DEMO_SHOW_ID], ["old", OLD_SHOW_ID]]) {
    const show = pda("show", showId);
    const info = await er.getAccountInfo(show).catch(() => null);
    if (!info) { console.log(`${label} show ${showId.toString()}: missing on ER`); continue; }
    const s = program.coder.accounts.decode("show", info.data);
    console.log(`${label} show ${showId.toString()}: state=${enumKey(s.state)} vrf=${enumKey(s.vrfStatus)} cancelled=${s.cancelled} liabilities=${s.liabilityTotal.toString()}`);
  }

  console.log("Simulating abort_show for old show 14440634207599454842 on ER (Anchor .simulate()) ...");
  try {
    const res = await program.methods.abortShow(OLD_SHOW_ID)
      .accounts({ payer: house.publicKey, show: pda("show", OLD_SHOW_ID) })
      .simulate();
    console.log("SIM RESULT: success, no err");
    console.log(`  logs: ${JSON.stringify(res.raw)}`);
    console.log("ER WRITE RECOVERED: abort_show simulates clean");
  } catch (e) {
    console.log("SIM RESULT: failed");
    dumpError(e);
    const errJson = JSON.stringify(e?.simulationResponse?.err ?? e?.simulationResponse ?? "");
    if (/immutable/i.test(errJson)) console.log("VERDICT: ER STILL DOWN (Account is immutable)");
    else console.log(`VERDICT: simulation failed, err=${errJson}`);
  }
}

main().catch((e) => { console.error("PROBE FAILED:"); dumpError(e); process.exitCode = 1; });
