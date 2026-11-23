#[cfg(test)]
mod tests {
    use anchor_lang::{
        prelude::{AccountDeserialize, Pubkey},
        system_program,
        InstructionData, ToAccountMetas,
    };
    use ephemeral_rollups_sdk::{
        consts::MAGIC_PROGRAM_ID,
        vrf::consts::{DEFAULT_EPHEMERAL_TEST_QUEUE, VRF_PROGRAM_ID},
    };
    use ghostset_live::{
        accounts, instruction, Show, ShowState, TrackInput, VrfStatus, ID, PROGRAM_IDENTITY,
        SHOW_SEED, VAULT_SEED,
    };
    use magicsvm::{MagicSVM, TransactionTarget};
    use solana_sdk::{
        instruction::Instruction,
        message::Message,
        signature::{Keypair, Signer as _},
        transaction::Transaction,
    };
    use std::str::FromStr;

    const SHOW_ID: u64 = 42;
    const PLEDGE_CAP: u64 = 1_000_000;
    const JOIN_AMOUNT: u64 = 10_000_000;

    #[test]
    fn minimal_delegate_er_write_commit_undelegate_lifecycle() {
        let (mut svm, authority, show, _) = initialize_and_delegate();
        let abort = Instruction {
            program_id: ID,
            accounts: accounts::AbortShow {
                payer: authority.pubkey(),
                show,
            }
            .to_account_metas(None),
            data: instruction::AbortShow { show_id: SHOW_ID }.data(),
        };
        send(&mut svm, TransactionTarget::Ephemeral, &authority, abort);

        let finalize = Instruction {
            program_id: ID,
            accounts: accounts::FinalizeShow {
                payer: authority.pubkey(),
                show,
                magic_context: magic_context(),
                magic_program: MAGIC_PROGRAM_ID,
            }
            .to_account_metas(None),
            data: instruction::FinalizeShow { show_id: SHOW_ID }.data(),
        };
        send(&mut svm, TransactionTarget::Ephemeral, &authority, finalize);

        let account = svm
            .get_account_for(TransactionTarget::Base, &show)
            .expect("show must be back on base");
        assert_eq!(account.owner, ID);
        let decoded = decode_show(&account.data);
        assert!(decoded.cancelled);
        assert!(decoded.finalize_scheduled);
        assert_eq!(decoded.state, ShowState::OnL1);
        assert_eq!(decoded.credit_total, 4 * JOIN_AMOUNT);
        assert_eq!(decoded.liability_total, 4 * JOIN_AMOUNT);
    }

    #[test]
    fn vrf_callback_is_delivered_by_warp_to_slot() {
        let (mut svm, authority, show, _) = initialize_and_delegate();
        let request = Instruction {
            program_id: ID,
            accounts: accounts::RequestShowRandomness {
                payer: authority.pubkey(),
                show,
                oracle_queue: DEFAULT_EPHEMERAL_TEST_QUEUE,
                program_identity: PROGRAM_IDENTITY,
                vrf_program: VRF_PROGRAM_ID,
                slot_hashes: anchor_lang::solana_program::sysvar::slot_hashes::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::RequestShowRandomness {
                show_id: SHOW_ID,
                client_seed: [7; 32],
            }
            .data(),
        };
        send(&mut svm, TransactionTarget::Ephemeral, &authority, request);
        let _callback_results = svm.warp_to_slot(100);

        let account = svm
            .get_account_for(TransactionTarget::Ephemeral, &show)
            .expect("show must remain readable on ER");
        let decoded = decode_show(&account.data);
        assert_eq!(decoded.vrf_status, VrfStatus::Ready);
        assert_eq!(decoded.state, ShowState::VrfReady);
        assert_eq!(decoded.vrf_request_nonce, 1);
    }

    fn initialize_and_delegate() -> (MagicSVM, Keypair, Pubkey, Pubkey) {
        let mut svm = MagicSVM::new();
        svm.add_program_from_file(
            ID,
            concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy/ghostset_live.so"),
        )
        .unwrap();
        let authority = Keypair::generate();
        svm.airdrop(&authority.pubkey(), 5_000_000_000).unwrap();
        let show = Pubkey::find_program_address(&[SHOW_SEED, SHOW_ID.to_le_bytes().as_slice()], &ID).0;
        let vault = Pubkey::find_program_address(&[VAULT_SEED, SHOW_ID.to_le_bytes().as_slice()], &ID).0;
        let beneficiaries = [Pubkey::new_unique(), Pubkey::new_unique(), Pubkey::new_unique()];
        let initialize = Instruction {
            program_id: ID,
            accounts: accounts::InitializeShow {
                authority: authority.pubkey(),
                show,
                vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::InitializeShow {
                show_id: SHOW_ID,
                total_rounds: 1,
                pledge_cap: PLEDGE_CAP,
                commit_slots: 4,
                reveal_slots: 4,
                tracks: vec![track(1), track(2), track(3)],
                beneficiaries: beneficiaries.to_vec(),
            }
            .data(),
        };
        send(&mut svm, TransactionTarget::Base, &authority, initialize);

        let seats = [
            Keypair::generate(),
            Keypair::generate(),
            Keypair::generate(),
            Keypair::generate(),
        ];
        for (index, seat) in seats.iter().enumerate() {
            svm.airdrop(&seat.pubkey(), 2_000_000_000).unwrap();
            let join = Instruction {
                program_id: ID,
                accounts: accounts::JoinShow {
                    payer: seat.pubkey(),
                    show,
                    vault,
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
                data: instruction::JoinShow {
                    show_id: SHOW_ID,
                    seat_index: index as u8,
                    amount: JOIN_AMOUNT,
                }
                .data(),
            };
            send(&mut svm, TransactionTarget::Base, seat, join);
        }

        let validator = svm.validator_identity();
        let (buffer_pda, delegation_record_pda, delegation_metadata_pda) = delegation_pdas(show);
        let delegate = Instruction {
            program_id: ID,
            accounts: accounts::DelegateShow {
                authority: authority.pubkey(),
                show,
                validator: Some(validator),
                owner_program: ID,
                buffer_pda,
                delegation_record_pda,
                delegation_metadata_pda,
                delegation_program: ephemeral_rollups_sdk::id(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::DelegateShow { show_id: SHOW_ID }.data(),
        };
        send(&mut svm, TransactionTarget::Base, &authority, delegate);
        (svm, authority, show, vault)
    }

    fn send(svm: &mut MagicSVM, target: TransactionTarget, payer: &Keypair, instruction: Instruction) {
        let transaction = Transaction::new(
            &[payer],
            Message::new(&[instruction], Some(&payer.pubkey())),
            svm.latest_blockhash_for(target),
        );
        svm.send_transaction_to(target, transaction).unwrap();
    }

    fn delegation_pdas(show: Pubkey) -> (Pubkey, Pubkey, Pubkey) {
        let buffer = Pubkey::find_program_address(&[b"buffer", show.as_ref()], &ID).0;
        let delegation_program = ephemeral_rollups_sdk::id();
        let record = Pubkey::find_program_address(&[b"delegation", show.as_ref()], &delegation_program).0;
        let metadata = Pubkey::find_program_address(&[b"delegation-metadata", show.as_ref()], &delegation_program).0;
        (buffer, record, metadata)
    }

    fn decode_show(data: &[u8]) -> Show {
        let mut slice = data;
        Show::try_deserialize(&mut slice).unwrap()
    }

    fn track(value: u8) -> TrackInput {
        let mut uri = [0; 64];
        uri[0] = value;
        TrackInput { uri, uri_len: 1 }
    }

    fn magic_context() -> Pubkey {
        Pubkey::from_str("MagicContext1111111111111111111111111111111").unwrap()
    }
}
