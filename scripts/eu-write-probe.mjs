// Zero-cost EU ER write probe (throwaway account, devnet only).
// 1. Fund a fresh throwaway account on L1 from house (0.005 SOL, devnet).
// 2. Delegate it to the EU ER validator (MEUGGrYP...) via the DLP delegate
//    instruction (discriminator 0; falls back to 19 DelegateWithAnyValidator
//    if the plain delegate is rejected for whitelist reasons).
// 3. Wait for the EU ER replica, then send a real 1-lamport transfer on the
//    EU ER. Success = EU ER writes work; "Immutable" = same failure as US.
// Never touches the GhostSet shows or any real funds. Devnet only.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const L1_RPC = "https://api.devnet.solana.com";
const EU_RPC = "https://devnet-eu.magicblock.app";
const DLP = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const EU_VALIDATOR = new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e");
const US_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");

function loadHouse() {
  const j = JSON.parse(readFileSync(new URL("../../../.secrets/ghostset_house.json", import.meta.url), "utf8"));
  const cand = j && typeof j === "object" && !Array.isArray(j) ? j.secretKey : j;
  const bytes = Array.isArray(cand) ? Uint8Array.from(cand) : Uint8Array.from(Buffer.from(cand, "base64"));
  return Keypair.fromSecretKey(bytes);
}
function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}
function delegateIx(payer, account, validator, discriminator) {
  const disc = Buffer.alloc(8);
  disc.writeBigUInt64LE(BigInt(discriminator));
  const args = Buffer.alloc(4 + 4 + 1 + 32);
  args.writeUInt32LE(1000, 0); // commit_frequency_ms
  args.writeUInt32LE(0, 4); // seeds: empty vec
  args.writeUInt8(1, 8); // validator: Some
  validator.toBuffer().copy(args, 9);
  const data = Buffer.concat([disc, args]);
  const bufferPda = pda([Buffer.from("buffer"), account.toBuffer()], SystemProgram.programId);
  const recordPda = pda([Buffer.from("delegation"), account.toBuffer()], DLP);
  const metaPda = pda([Buffer.from("delegation-metadata"), account.toBuffer()], DLP);
  return new TransactionInstruction({
    programId: DLP,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: bufferPda, isSigner: false, isWritable: true },
      { pubkey: recordPda, isSigner: false, isWritable: true },
      { pubkey: metaPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const l1 = new Connection(L1_RPC, "confirmed");
  const eu = new Connection(EU_RPC, "confirmed");
  const house = loadHouse();
  console.log("house:", house.publicKey.toBase58());
  console.log("house L1 balance:", await l1.getBalance(house.publicKey, "confirmed"), "lamports");

  const probe = Keypair.generate();
  console.log("probe account:", probe.publicKey.toBase58());

  // Fund probe on L1.
  const fundSig = await l1.sendTransaction(new Transaction().add(
    SystemProgram.transfer({ fromPubkey: house.publicKey, toPubkey: probe.publicKey, lamports: 5_000_000 })
  ), [house], { skipPreflight: false });
  await l1.confirmTransaction(fundSig, "confirmed");
  console.log("funded 0.005 SOL on L1, sig:", fundSig);

  // Try plain Delegate (0) first; fall back to DelegateWithAnyValidator (19).
  let disc = 0;
  let ix = delegateIx(house.publicKey, probe.publicKey, EU_VALIDATOR, disc);
  let tx = new Transaction().add(ix);
  tx.feePayer = house.publicKey;
  tx.recentBlockhash = (await l1.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(house, probe);
  let sim = await l1.simulateTransaction(tx, [house, probe]);
  console.log(`simulate delegate disc=${disc}: err=${JSON.stringify(sim.value.err)} logs=${JSON.stringify(sim.value.logs ?? [])}`);
  if (sim.value.err) {
    disc = 19;
    ix = delegateIx(house.publicKey, probe.publicKey, EU_VALIDATOR, disc);
    tx = new Transaction().add(ix);
    tx.feePayer = house.publicKey;
    tx.recentBlockhash = (await l1.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(house, probe);
    sim = await l1.simulateTransaction(tx, [house, probe]);
    console.log(`simulate delegate disc=${disc}: err=${JSON.stringify(sim.value.err)} logs=${JSON.stringify(sim.value.logs ?? [])}`);
    if (sim.value.err) {
      console.log("VERDICT: cannot delegate throwaway account on L1 (both discriminators failed simulation); EU probe inconclusive");
      process.exitCode = 2;
      return;
    }
  }
  const delSig = await l1.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await l1.confirmTransaction(delSig, "confirmed");
  console.log(`delegated to EU validator ${EU_VALIDATOR.toBase58()} (disc=${disc}), sig:`, delSig);

  // Wait for EU ER replica.
  let seen = false;
  for (let i = 0; i < 24; i++) {
    const info = await eu.getAccountInfo(probe.publicKey).catch(() => null);
    if (info) { seen = true; console.log(`EU ER replica visible after ~${i * 5}s, owner=${info.owner.toBase58()} lamports=${info.lamports}`); break; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!seen) {
    console.log("VERDICT: EU ER replica never appeared within 120s; EU probe inconclusive");
    process.exitCode = 2;
    return;
  }

  // Real write on EU ER: 1-lamport transfer probe -> house.
  const wtx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: probe.publicKey, toPubkey: house.publicKey, lamports: 1 })
  );
  wtx.feePayer = probe.publicKey;
  wtx.recentBlockhash = (await eu.getLatestBlockhash("confirmed")).blockhash;
  wtx.sign(probe);
  const wsim = await eu.simulateTransaction(wtx, [probe]);
  console.log("EU simulate 1-lamport transfer: err=", JSON.stringify(wsim.value.err), "logs=", JSON.stringify(wsim.value.logs ?? []));
  if (wsim.value.err) {
    const s = JSON.stringify(wsim.value.err);
    console.log(/immutable/i.test(s) ? "VERDICT: EU ER ALSO DOWN (Account is immutable)" : `VERDICT: EU write simulation failed: ${s}`);
    process.exitCode = 3;
    return;
  }
  const wsig = await eu.sendRawTransaction(wtx.serialize(), { skipPreflight: false });
  await eu.confirmTransaction(wsig, "confirmed");
  console.log("EU real 1-lamport transfer confirmed, sig:", wsig);
  console.log("VERDICT: EU ER WRITES WORK");
  console.log("probe account (for cleanup/undelegate):", probe.publicKey.toBase58());
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); console.error(e.stack); if (e.logs) e.logs.forEach((l) => console.error("  ", l)); process.exitCode = 1; });
