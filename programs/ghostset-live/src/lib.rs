use anchor_lang::prelude::*;
use solana_program::hash::hashv;
use anchor_lang::system_program::{create_account, transfer, CreateAccount, Transfer};
use ephemeral_rollups_sdk::{
    anchor::{commit, delegate, ephemeral, vrf, vrf_callback},
    cpi::DelegateConfig,
    ephem::MagicIntentBundleBuilder,
    vrf::{
        self,
        consts::program_identity_pubkey,
        instructions::{create_request_randomness_ix_const, RequestRandomnessParams},
        types::SerializableAccountMeta,
    },
};

declare_id!("J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3");

pub const SHOW_SEED: &[u8] = b"show";
pub const VAULT_SEED: &[u8] = b"vault";
pub const PLEDGE_DOMAIN: &[u8] = b"GHOSTSET:PLEDGE:V1";
pub const ROUND_DOMAIN: &[u8] = b"GHOSTSET:ROUND:V1";
pub const VRF_DOMAIN: &[u8] = b"GHOSTSET:VRF:V1";
pub const SEAT_COUNT: usize = 4;
pub const TRACK_COUNT: usize = 3;
pub const BENEFICIARY_COUNT: usize = 3;
pub const MAX_ROUNDS: usize = 8;
pub const TOTAL_BPS: u16 = 10_000;
pub const ROYALTY_BPS: [u16; BENEFICIARY_COUNT] = [5_000, 3_000, 2_000];
pub const VRF_TIMEOUT_SECONDS: i64 = 180;
pub const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

#[ephemeral]
#[program]
pub mod ghostset_live {
    use super::*;

    pub fn initialize_show(
        ctx: Context<InitializeShow>,
        show_id: u64,
        total_rounds: u8,
        pledge_cap: u64,
        commit_slots: u64,
        reveal_slots: u64,
        tracks: Vec<TrackInput>,
        beneficiaries: Vec<Pubkey>,
    ) -> Result<()> {
        require!(total_rounds > 0 && total_rounds as usize <= MAX_ROUNDS, GhostSetError::InvalidRoundCount);
        require!(pledge_cap > 0, GhostSetError::InvalidPledgeCap);
        require!(commit_slots > 0 && reveal_slots > 0, GhostSetError::InvalidRoundTiming);
        require!(tracks.len() == TRACK_COUNT, GhostSetError::InvalidTrackCount);
        require!(beneficiaries.len() == BENEFICIARY_COUNT, GhostSetError::InvalidBeneficiaryCount);
        require_eq!(ROYALTY_BPS.iter().copied().sum::<u16>(), TOTAL_BPS, GhostSetError::InvalidRoyaltyBps);

        let mut track_state = [Track::default(); TRACK_COUNT];
        for (index, input) in tracks.iter().enumerate() {
            require!(input.uri_len > 0 && input.uri_len as usize <= input.uri.len(), GhostSetError::InvalidTrackMetadata);
            track_state[index] = Track { uri: input.uri, uri_len: input.uri_len };
        }

        let mut beneficiary_state = [Pubkey::default(); BENEFICIARY_COUNT];
        for (index, beneficiary) in beneficiaries.iter().copied().enumerate() {
            require!(beneficiary != Pubkey::default(), GhostSetError::InvalidBeneficiary);
            require!(!beneficiary_state[..index].contains(&beneficiary), GhostSetError::DuplicateBeneficiary);
            beneficiary_state[index] = beneficiary;
        }

        let rent = Rent::get()?;
        let show_id_bytes = show_id.to_le_bytes();
        let show_bump = [ctx.bumps.show];
        create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.key(),
                CreateAccount {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.show.to_account_info(),
                },
                &[&[SHOW_SEED, show_id_bytes.as_slice(), show_bump.as_slice()]],
            ),
            rent.minimum_balance(Show::SPACE),
            Show::SPACE as u64,
            &ID,
        )?;
        let vault_bump = [ctx.bumps.vault];
        create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.key(),
                CreateAccount {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
                &[&[VAULT_SEED, show_id_bytes.as_slice(), vault_bump.as_slice()]],
            ),
            rent.minimum_balance(Vault::SPACE),
            Vault::SPACE as u64,
            &ID,
        )?;

        let show = Show {
            authority: ctx.accounts.authority.key(),
            show_id,
            bump: ctx.bumps.show,
            state: ShowState::Uninitialized,
            vrf_status: VrfStatus::Idle,
            round_phase: RoundPhase::Idle,
            total_rounds,
            current_round: 0,
            closed_rounds: 0,
            cancelled: false,
            finalize_scheduled: false,
            pledge_cap,
            commit_slots,
            reveal_slots,
            seats: [Seat::default(); SEAT_COUNT],
            tracks: track_state,
            beneficiaries: beneficiary_state,
            royalty_bps: ROYALTY_BPS,
            royalty_pending: [0; BENEFICIARY_COUNT],
            royalty_pending_total: 0,
            credit_total: 0,
            escrow_total: 0,
            round_pool: 0,
            liability_total: 0,
            pledges: [Pledge::default(); SEAT_COUNT],
            commit_deadline_slot: 0,
            reveal_deadline_slot: 0,
            round_open: false,
            mystery_track: 0,
            round_seed: [0; 32],
            winners: [RoundResult::default(); MAX_ROUNDS],
            random_seed: [0; 32],
            vrf_request_nonce: 0,
            vrf_caller_seed: [0; 32],
            vrf_requested_at: 0,
            validator: Pubkey::default(),
        };
        write_show(&ctx.accounts.show, &show)?;

        let vault = Vault {
            show_id,
            bump: ctx.bumps.vault,
            rent_minimum: rent.minimum_balance(Vault::SPACE),
            total_liability: 0,
        };
        let mut data = ctx.accounts.vault.try_borrow_mut_data()?;
        let mut writer: &mut [u8] = data.as_mut();
        vault.try_serialize(&mut writer)?;

        emit!(ShowInitialized {
            show: ctx.accounts.show.key(),
            vault: ctx.accounts.vault.key(),
            show_id,
            total_rounds,
            pledge_cap,
        });
        Ok(())
    }

    pub fn join_show(ctx: Context<JoinShow>, show_id: u64, seat_index: u8, amount: u64) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(matches!(show.state, ShowState::Uninitialized | ShowState::Funded), GhostSetError::InvalidState);
        require!(amount >= show.pledge_cap, GhostSetError::InsufficientDeposit);
        let index = seat_index as usize;
        require!(index < SEAT_COUNT, GhostSetError::InvalidSeat);
        require!(!show.seats[index].joined, GhostSetError::SeatAlreadyJoined);
        require!(show.seats.iter().filter(|seat| seat.joined).all(|seat| seat.authority != ctx.accounts.payer.key()), GhostSetError::DuplicateSeat);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        {
            let seat = &mut show.seats[index];
            seat.authority = ctx.accounts.payer.key();
            seat.credit = amount;
            seat.joined = true;
        }
        show.credit_total = show.credit_total.checked_add(amount).ok_or(GhostSetError::MathOverflow)?;
        show.liability_total = show.liability_total.checked_add(amount).ok_or(GhostSetError::MathOverflow)?;
        show.state = ShowState::Funded;

        let vault = &mut ctx.accounts.vault;
        vault.total_liability = vault.total_liability.checked_add(amount).ok_or(GhostSetError::MathOverflow)?;
        assert_show_invariant(show)?;
        assert_vault_covers(vault, vault.to_account_info().lamports())?;

        emit!(SeatJoined {
            show: show.key(),
            seat_index,
            authority: ctx.accounts.payer.key(),
            amount,
        });
        Ok(())
    }

    pub fn delegate_show(ctx: Context<DelegateShow>, show_id: u64) -> Result<()> {
        require_keys_eq!(*ctx.accounts.show.owner, ID, GhostSetError::InvalidShowOwner);
        let mut show = read_show(&ctx.accounts.show)?;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(show.state == ShowState::Funded, GhostSetError::InvalidState);
        require_keys_eq!(show.authority, ctx.accounts.authority.key(), GhostSetError::Unauthorized);
        require!(show.seats.iter().all(|seat| seat.joined), GhostSetError::SeatsNotFilled);
        assert_show_invariant(&show)?;

        let validator = ctx.accounts.validator.as_ref().map(|account| account.key());
        show.state = ShowState::Delegated;
        show.validator = validator.unwrap_or_default();
        write_show(&ctx.accounts.show, &show)?;

        let show_id_bytes = show_id.to_le_bytes();
        ctx.accounts.delegate_show(
            &ctx.accounts.authority,
            &[SHOW_SEED, show_id_bytes.as_slice()],
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;

        emit!(ShowDelegated {
            show: ctx.accounts.show.key(),
            validator: show.validator,
        });
        Ok(())
    }

    pub fn request_show_randomness(
        ctx: Context<RequestShowRandomness>,
        show_id: u64,
        client_seed: [u8; 32],
    ) -> Result<()> {
        let (nonce, caller_seed, ix) = {
            let show = &ctx.accounts.show;
            require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
            require!(show.state == ShowState::Delegated, GhostSetError::InvalidState);
            require!(!show.cancelled, GhostSetError::ShowCancelled);
            require!(show.vrf_status == VrfStatus::Idle, GhostSetError::VrfAlreadyRequested);
            require_keys_eq!(show.authority, ctx.accounts.payer.key(), GhostSetError::Unauthorized);

            let nonce = show.vrf_request_nonce.checked_add(1).ok_or(GhostSetError::MathOverflow)?;
            let nonce_bytes = nonce.to_le_bytes();
            let show_id_bytes = show_id.to_le_bytes();
            let caller_seed = hashv(&[
                VRF_DOMAIN,
                show.key().as_ref(),
                show_id_bytes.as_slice(),
                nonce_bytes.as_slice(),
                client_seed.as_slice(),
            ]).to_bytes();
            let params = RequestRandomnessParams {
                payer: ctx.accounts.payer.key(),
                oracle_queue: ctx.accounts.oracle_queue.key(),
                callback_program_id: ID,
                callback_discriminator: instruction::VrfCallback::DISCRIMINATOR.to_vec(),
                caller_seed,
                accounts_metas: Some(vec![SerializableAccountMeta {
                    pubkey: show.key(),
                    is_signer: false,
                    is_writable: true,
                }]),
                callback_args: Some(nonce_bytes.to_vec()),
                ..Default::default()
            };
            (nonce, caller_seed, create_request_randomness_ix_const(params, PROGRAM_IDENTITY))
        };
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

        let show = &mut ctx.accounts.show;
        show.vrf_status = VrfStatus::Requested;
        show.vrf_request_nonce = nonce;
        show.vrf_caller_seed = caller_seed;
        show.vrf_requested_at = Clock::get()?.unix_timestamp;
        emit!(RandomnessRequested {
            show: show.key(),
            nonce,
            caller_seed,
        });
        Ok(())
    }

    pub fn vrf_callback(
        ctx: Context<VrfCallback>,
        randomness: [u8; 32],
        request_nonce: u64,
    ) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.state == ShowState::Delegated, GhostSetError::InvalidState);
        require!(!show.cancelled, GhostSetError::ShowCancelled);
        require!(show.vrf_status == VrfStatus::Requested, GhostSetError::VrfNotRequested);
        require!(request_nonce != 0 && request_nonce == show.vrf_request_nonce, GhostSetError::VrfRequestMismatch);
        let deadline = show.vrf_requested_at.checked_add(VRF_TIMEOUT_SECONDS).ok_or(GhostSetError::MathOverflow)?;
        require!(Clock::get()?.unix_timestamp <= deadline, GhostSetError::VrfCallbackExpired);

        show.random_seed = randomness;
        show.vrf_status = VrfStatus::Ready;
        show.state = ShowState::VrfReady;
        emit!(RandomnessFulfilled {
            show: show.key(),
            nonce: request_nonce,
            random_seed: randomness,
        });
        Ok(())
    }

    pub fn open_round(ctx: Context<OpenRound>, show_id: u64) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(!show.cancelled, GhostSetError::ShowCancelled);
        require!(show.vrf_status == VrfStatus::Ready, GhostSetError::VrfNotReady);
        require!(!show.round_open, GhostSetError::RoundAlreadyOpen);
        require!(show.closed_rounds < show.total_rounds, GhostSetError::NoRoundsRemaining);
        require!(
            (show.closed_rounds == 0 && show.state == ShowState::VrfReady)
                || (show.closed_rounds > 0 && show.state == ShowState::Running),
            GhostSetError::InvalidState
        );
        require!(show.escrow_total == 0 && show.round_pool == 0, GhostSetError::LiabilityMismatch);

        let round_index = show.closed_rounds;
        let round_bytes = [round_index];
        let round_seed = hashv(&[ROUND_DOMAIN, show.random_seed.as_ref(), round_bytes.as_slice()]).to_bytes();
        let now = Clock::get()?.slot;
        let commit_deadline = now.checked_add(show.commit_slots).ok_or(GhostSetError::MathOverflow)?;
        let reveal_deadline = commit_deadline.checked_add(show.reveal_slots).ok_or(GhostSetError::MathOverflow)?;

        show.state = ShowState::Running;
        show.current_round = round_index;
        show.round_seed = round_seed;
        show.mystery_track = round_seed[0] % TRACK_COUNT as u8;
        show.pledges = [Pledge::default(); SEAT_COUNT];
        show.commit_deadline_slot = commit_deadline;
        show.reveal_deadline_slot = reveal_deadline;
        show.round_phase = RoundPhase::Commit;
        show.round_open = true;

        emit!(RoundOpened {
            show: show.key(),
            round_index,
            mystery_track: show.mystery_track,
            round_seed,
            commit_deadline_slot: commit_deadline,
            reveal_deadline_slot: reveal_deadline,
        });
        Ok(())
    }

    pub fn commit_pledge(
        ctx: Context<CommitPledge>,
        show_id: u64,
        seat_index: u8,
        commitment: [u8; 32],
    ) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(show.state == ShowState::Running && !show.cancelled, GhostSetError::InvalidState);
        require!(show.round_open && show.round_phase == RoundPhase::Commit, GhostSetError::InvalidRoundPhase);
        require!(Clock::get()?.slot <= show.commit_deadline_slot, GhostSetError::CommitPhaseClosed);
        require!(commitment != [0; 32], GhostSetError::InvalidCommitment);
        let index = seat_index as usize;
        require!(index < SEAT_COUNT, GhostSetError::InvalidSeat);
        require!(show.seats[index].joined, GhostSetError::SeatNotJoined);
        require_keys_eq!(show.seats[index].authority, ctx.accounts.payer.key(), GhostSetError::Unauthorized);
        require!(!show.pledges[index].committed, GhostSetError::AlreadyCommitted);
        require!(show.seats[index].credit >= show.pledge_cap, GhostSetError::InsufficientCredit);

        let cap = show.pledge_cap;
        show.seats[index].credit = show.seats[index].credit.checked_sub(cap).ok_or(GhostSetError::MathOverflow)?;
        show.credit_total = show.credit_total.checked_sub(cap).ok_or(GhostSetError::MathOverflow)?;
        show.escrow_total = show.escrow_total.checked_add(cap).ok_or(GhostSetError::MathOverflow)?;
        show.pledges[index] = Pledge {
            commitment,
            committed: true,
            revealed: false,
            forfeited: false,
            track: 0,
            amount: 0,
            escrow: cap,
        };
        assert_show_invariant(show)?;
        emit!(PledgeCommitted {
            show: show.key(),
            round_index: show.current_round,
            seat_index,
            escrow: cap,
            commitment,
        });
        Ok(())
    }

    pub fn reveal_pledge(
        ctx: Context<RevealPledge>,
        show_id: u64,
        seat_index: u8,
        track: u8,
        amount: u64,
        secret: [u8; 32],
    ) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(show.state == ShowState::Running && !show.cancelled, GhostSetError::InvalidState);
        require!(show.round_open && matches!(show.round_phase, RoundPhase::Commit | RoundPhase::Reveal), GhostSetError::InvalidRoundPhase);
        let now = Clock::get()?.slot;
        require!(now > show.commit_deadline_slot, GhostSetError::RevealPhaseNotOpen);
        require!(now <= show.reveal_deadline_slot, GhostSetError::RevealPhaseClosed);
        let index = seat_index as usize;
        require!(index < SEAT_COUNT, GhostSetError::InvalidSeat);
        require!(show.seats[index].joined, GhostSetError::SeatNotJoined);
        require_keys_eq!(show.seats[index].authority, ctx.accounts.payer.key(), GhostSetError::Unauthorized);
        require!((track as usize) < TRACK_COUNT, GhostSetError::InvalidTrack);
        require!(amount > 0 && amount <= show.pledge_cap, GhostSetError::InvalidPledgeAmount);
        require!(show.pledges[index].committed, GhostSetError::NotCommitted);
        require!(!show.pledges[index].revealed, GhostSetError::AlreadyRevealed);

        let round_bytes = [show.current_round];
        let seat_bytes = [seat_index];
        let track_bytes = [track];
        let amount_bytes = amount.to_le_bytes();
        let computed = hashv(&[
            PLEDGE_DOMAIN,
            show.key().as_ref(),
            round_bytes.as_slice(),
            seat_bytes.as_slice(),
            show.seats[index].authority.as_ref(),
            track_bytes.as_slice(),
            amount_bytes.as_slice(),
            secret.as_slice(),
        ]).to_bytes();
        require!(computed == show.pledges[index].commitment, GhostSetError::InvalidReveal);

        let cap = show.pledge_cap;
        let refund = cap.checked_sub(amount).ok_or(GhostSetError::MathOverflow)?;
        show.seats[index].credit = show.seats[index].credit.checked_add(refund).ok_or(GhostSetError::MathOverflow)?;
        show.credit_total = show.credit_total.checked_add(refund).ok_or(GhostSetError::MathOverflow)?;
        show.escrow_total = show.escrow_total.checked_sub(cap).ok_or(GhostSetError::MathOverflow)?;
        show.round_pool = show.round_pool.checked_add(amount).ok_or(GhostSetError::MathOverflow)?;
        {
            let pledge = &mut show.pledges[index];
            pledge.revealed = true;
            pledge.track = track;
            pledge.amount = amount;
            pledge.escrow = 0;
        }
        show.round_phase = RoundPhase::Reveal;
        assert_show_invariant(show)?;
        emit!(PledgeRevealed {
            show: show.key(),
            round_index: show.current_round,
            seat_index,
            track,
            amount,
        });
        Ok(())
    }

    pub fn close_round(ctx: Context<CloseRound>, show_id: u64) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(show.state == ShowState::Running && !show.cancelled, GhostSetError::InvalidState);
        require!(show.round_open && show.round_phase != RoundPhase::Closed, GhostSetError::RoundNotOpen);
        require!(Clock::get()?.slot > show.reveal_deadline_slot, GhostSetError::RoundNotClosable);

        let mut scores = [0u64; TRACK_COUNT];
        let mut forfeited_total = 0u64;
        for pledge in show.pledges.iter() {
            if pledge.committed && pledge.revealed {
                let score = integer_sqrt(pledge.amount)?;
                let track = pledge.track as usize;
                require!(track < TRACK_COUNT, GhostSetError::InvalidTrack);
                scores[track] = scores[track].checked_add(score).ok_or(GhostSetError::MathOverflow)?;
            } else if pledge.committed {
                forfeited_total = forfeited_total.checked_add(pledge.escrow).ok_or(GhostSetError::MathOverflow)?;
            }
        }
        require_eq!(show.escrow_total, forfeited_total, GhostSetError::LiabilityMismatch);
        for pledge in show.pledges.iter_mut().filter(|pledge| pledge.committed && !pledge.revealed) {
            pledge.escrow = 0;
            pledge.forfeited = true;
        }
        show.escrow_total = 0;
        let pool = show.round_pool.checked_add(forfeited_total).ok_or(GhostSetError::MathOverflow)?;
        show.round_pool = pool;

        let mut winner_track = 0usize;
        for track in 1..TRACK_COUNT {
            if scores[track] > scores[winner_track] {
                winner_track = track;
            }
        }

        let mut royalties = [0u64; BENEFICIARY_COUNT];
        let mut distributed = 0u64;
        for index in 0..BENEFICIARY_COUNT - 1 {
            let share = (pool as u128)
                .checked_mul(show.royalty_bps[index] as u128)
                .ok_or(GhostSetError::MathOverflow)?
                .checked_div(TOTAL_BPS as u128)
                .ok_or(GhostSetError::MathOverflow)? as u64;
            royalties[index] = share;
            distributed = distributed.checked_add(share).ok_or(GhostSetError::MathOverflow)?;
        }
        royalties[BENEFICIARY_COUNT - 1] = pool.checked_sub(distributed).ok_or(GhostSetError::MathOverflow)?;
        for index in 0..BENEFICIARY_COUNT {
            show.royalty_pending[index] = show.royalty_pending[index].checked_add(royalties[index]).ok_or(GhostSetError::MathOverflow)?;
        }
        show.royalty_pending_total = show.royalty_pending_total.checked_add(pool).ok_or(GhostSetError::MathOverflow)?;
        show.round_pool = 0;

        let round_index = show.current_round as usize;
        require!(round_index < MAX_ROUNDS, GhostSetError::InvalidRoundCount);
        show.winners[round_index] = RoundResult {
            winner_track: winner_track as u8,
            mystery_track: show.mystery_track,
            scores,
            pool,
            royalties,
        };
        show.closed_rounds = show.closed_rounds.checked_add(1).ok_or(GhostSetError::MathOverflow)?;
        show.round_open = false;
        show.round_phase = RoundPhase::Closed;
        assert_show_invariant(show)?;
        emit!(RoundClosed {
            show: show.key(),
            round_index: show.current_round,
            winner_track: winner_track as u8,
            scores,
            pool,
            royalties,
        });
        Ok(())
    }

    pub fn abort_show(ctx: Context<AbortShow>, show_id: u64) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(matches!(show.state, ShowState::Delegated | ShowState::VrfReady | ShowState::Running), GhostSetError::InvalidState);
        require!(!show.cancelled, GhostSetError::ShowCancelled);
        let deadline = show.vrf_requested_at.checked_add(VRF_TIMEOUT_SECONDS).ok_or(GhostSetError::MathOverflow)?;
        let timed_out = show.vrf_status == VrfStatus::Requested && Clock::get()?.unix_timestamp > deadline;
        require!(ctx.accounts.payer.key() == show.authority || timed_out, GhostSetError::Unauthorized);

        let mut refunded = 0u64;
        if show.round_open {
            for index in 0..SEAT_COUNT {
                let pledge = show.pledges[index];
                let mut seat_refund = pledge.escrow;
                if pledge.revealed {
                    seat_refund = seat_refund.checked_add(pledge.amount).ok_or(GhostSetError::MathOverflow)?;
                }
                if seat_refund > 0 {
                    show.seats[index].credit = show.seats[index].credit.checked_add(seat_refund).ok_or(GhostSetError::MathOverflow)?;
                    refunded = refunded.checked_add(seat_refund).ok_or(GhostSetError::MathOverflow)?;
                }
            }
        }
        let current_liabilities = show.escrow_total.checked_add(show.round_pool).ok_or(GhostSetError::MathOverflow)?;
        require_eq!(refunded, current_liabilities, GhostSetError::LiabilityMismatch);
        show.credit_total = show.credit_total.checked_add(refunded).ok_or(GhostSetError::MathOverflow)?;
        show.escrow_total = 0;
        show.round_pool = 0;
        show.pledges = [Pledge::default(); SEAT_COUNT];
        show.round_open = false;
        show.round_phase = RoundPhase::Closed;
        show.cancelled = true;
        show.vrf_status = VrfStatus::Aborted;
        assert_show_invariant(show)?;
        emit!(ShowAborted {
            show: show.key(),
            refunded,
        });
        Ok(())
    }

    pub fn finalize_show(ctx: Context<FinalizeShow>, show_id: u64) -> Result<()> {
        let show = &mut ctx.accounts.show;
        require!(show.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(!show.finalize_scheduled, GhostSetError::ShowAlreadyFinalized);
        require!(matches!(show.state, ShowState::Delegated | ShowState::VrfReady | ShowState::Running), GhostSetError::InvalidState);
        require!(!show.round_open, GhostSetError::RoundAlreadyOpen);
        require!(show.cancelled || show.closed_rounds == show.total_rounds, GhostSetError::ShowNotFinalizable);
        require!(show.escrow_total == 0 && show.round_pool == 0, GhostSetError::LiabilityMismatch);
        assert_show_invariant(show)?;

        let (show_key, liability_total) = {
            show.state = ShowState::Finalizing;
            emit!(ShowFinalizing {
                show: show.key(),
                cancelled: show.cancelled,
            });
            show.state = ShowState::OnL1;
            show.finalize_scheduled = true;
            (show.key(), show.liability_total)
        };

        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.show.to_account_info()])
        .build_and_invoke()?;

        emit!(ShowFinalized {
            show: show_key,
            liability_total,
        });
        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        show_id: u64,
        kind: WithdrawKind,
        index: u8,
    ) -> Result<()> {
        let vault_info = ctx.accounts.vault.to_account_info();
        let recipient_info = ctx.accounts.recipient.to_account_info();
        let show = &mut ctx.accounts.show;
        let vault = &mut ctx.accounts.vault;
        require!(show.show_id == show_id && vault.show_id == show_id, GhostSetError::ShowIdMismatch);
        require!(show.state == ShowState::OnL1 && show.finalize_scheduled, GhostSetError::InvalidState);
        require_eq!(show.liability_total, vault.total_liability, GhostSetError::LiabilityMismatch);
        assert_show_invariant(show)?;
        assert_vault_covers(vault, vault_info.lamports())?;

        let item_index = index as usize;
        let amount = match kind {
            WithdrawKind::Seat => {
                require!(item_index < SEAT_COUNT, GhostSetError::InvalidSeat);
                let seat = &mut show.seats[item_index];
                require!(seat.joined, GhostSetError::SeatNotJoined);
                require_keys_eq!(seat.authority, ctx.accounts.recipient.key(), GhostSetError::Unauthorized);
                let amount = seat.credit;
                require!(amount > 0, GhostSetError::NothingToWithdraw);
                seat.credit = 0;
                show.credit_total = show.credit_total.checked_sub(amount).ok_or(GhostSetError::MathOverflow)?;
                amount
            }
            WithdrawKind::Beneficiary => {
                require!(item_index < BENEFICIARY_COUNT, GhostSetError::InvalidBeneficiary);
                require_keys_eq!(show.beneficiaries[item_index], ctx.accounts.recipient.key(), GhostSetError::Unauthorized);
                let amount = show.royalty_pending[item_index];
                require!(amount > 0, GhostSetError::NothingToWithdraw);
                show.royalty_pending[item_index] = 0;
                show.royalty_pending_total = show.royalty_pending_total.checked_sub(amount).ok_or(GhostSetError::MathOverflow)?;
                amount
            }
        };
        show.liability_total = show.liability_total.checked_sub(amount).ok_or(GhostSetError::MathOverflow)?;
        vault.total_liability = vault.total_liability.checked_sub(amount).ok_or(GhostSetError::MathOverflow)?;

        let next_vault_lamports = vault_info.lamports().checked_sub(amount).ok_or(GhostSetError::MathOverflow)?;
        require!(next_vault_lamports >= vault.rent_minimum, GhostSetError::VaultRentViolation);
        let next_recipient_lamports = recipient_info.lamports().checked_add(amount).ok_or(GhostSetError::MathOverflow)?;
        **vault_info.try_borrow_mut_lamports()? = next_vault_lamports;
        **recipient_info.try_borrow_mut_lamports()? = next_recipient_lamports;

        assert_show_invariant(show)?;
        assert_vault_covers(vault, vault_info.lamports())?;
        let closed = show.liability_total == 0;
        if closed {
            show.state = ShowState::Closed;
        }
        emit!(Withdrawn {
            show: show.key(),
            recipient: ctx.accounts.recipient.key(),
            kind,
            index,
            amount,
        });
        if closed {
            emit!(ShowClosed { show: show.key() });
        }
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(show_id: u64, total_rounds: u8, pledge_cap: u64, commit_slots: u64, reveal_slots: u64, tracks: Vec<TrackInput>, beneficiaries: Vec<Pubkey>)]
pub struct InitializeShow<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump)]
    /// CHECK: The PDA is constrained by SHOW_SEED and show_id, created by the create_account CPI with this program as owner, and initialized by write_show.
    pub show: UncheckedAccount<'info>,
    #[account(mut, seeds = [VAULT_SEED, show_id.to_le_bytes().as_slice()], bump)]
    /// CHECK: The PDA is constrained by VAULT_SEED and show_id, created by the create_account CPI with this program as owner, and manually serialized as Vault.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(show_id: u64, seat_index: u8, amount: u64)]
pub struct JoinShow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
    #[account(mut, seeds = [VAULT_SEED, show_id.to_le_bytes().as_slice()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(show_id: u64)]
pub struct DelegateShow<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, del, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump)]
    /// CHECK: The PDA is constrained by SHOW_SEED and show_id; the handler verifies program ownership and uses read_show/write_show, while #[delegate] handles delegation.
    pub show: UncheckedAccount<'info>,
    /// CHECK: Optional local validator identity used only by #[delegate] for local delegation; None on devnet, and its data is never read.
    pub validator: Option<UncheckedAccount<'info>>,
}

#[vrf]
#[derive(Accounts)]
#[instruction(show_id: u64, client_seed: [u8; 32])]
pub struct RequestShowRandomness<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
    #[account(mut, constraint = oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_QUEUE || oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE @ GhostSetError::InvalidOracleQueue)]
    /// CHECK: The constraint restricts this ER VRF queue to DEFAULT_EPHEMERAL_QUEUE or DEFAULT_EPHEMERAL_TEST_QUEUE; its address is only passed to the VRF request CPI and its data is never read.
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct VrfCallback<'info> {
    #[account(mut)]
    pub show: Account<'info, Show>,
}

#[derive(Accounts)]
#[instruction(show_id: u64)]
pub struct OpenRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
}

#[derive(Accounts)]
#[instruction(show_id: u64, seat_index: u8, commitment: [u8; 32])]
pub struct CommitPledge<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
}

#[derive(Accounts)]
#[instruction(show_id: u64, seat_index: u8, track: u8, amount: u64, secret: [u8; 32])]
pub struct RevealPledge<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
}

#[derive(Accounts)]
#[instruction(show_id: u64)]
pub struct CloseRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
}

#[derive(Accounts)]
#[instruction(show_id: u64)]
pub struct AbortShow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
}

#[commit]
#[derive(Accounts)]
#[instruction(show_id: u64)]
pub struct FinalizeShow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
}

#[derive(Accounts)]
#[instruction(show_id: u64, kind: WithdrawKind, index: u8)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,
    #[account(mut, seeds = [SHOW_SEED, show_id.to_le_bytes().as_slice()], bump = show.bump)]
    pub show: Account<'info, Show>,
    #[account(mut, seeds = [VAULT_SEED, show_id.to_le_bytes().as_slice()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[account]
#[derive(InitSpace)]
pub struct Show {
    pub authority: Pubkey,
    pub show_id: u64,
    pub bump: u8,
    pub state: ShowState,
    pub vrf_status: VrfStatus,
    pub round_phase: RoundPhase,
    pub total_rounds: u8,
    pub current_round: u8,
    pub closed_rounds: u8,
    pub cancelled: bool,
    pub finalize_scheduled: bool,
    pub pledge_cap: u64,
    pub commit_slots: u64,
    pub reveal_slots: u64,
    pub seats: [Seat; SEAT_COUNT],
    pub tracks: [Track; TRACK_COUNT],
    pub beneficiaries: [Pubkey; BENEFICIARY_COUNT],
    pub royalty_bps: [u16; BENEFICIARY_COUNT],
    pub royalty_pending: [u64; BENEFICIARY_COUNT],
    pub royalty_pending_total: u64,
    pub credit_total: u64,
    pub escrow_total: u64,
    pub round_pool: u64,
    pub liability_total: u64,
    pub pledges: [Pledge; SEAT_COUNT],
    pub commit_deadline_slot: u64,
    pub reveal_deadline_slot: u64,
    pub round_open: bool,
    pub mystery_track: u8,
    pub round_seed: [u8; 32],
    pub winners: [RoundResult; MAX_ROUNDS],
    pub random_seed: [u8; 32],
    pub vrf_request_nonce: u64,
    pub vrf_caller_seed: [u8; 32],
    pub vrf_requested_at: i64,
    pub validator: Pubkey,
}

impl Show {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub show_id: u64,
    pub bump: u8,
    pub rent_minimum: u64,
    pub total_liability: u64,
}

impl Vault {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Seat {
    pub authority: Pubkey,
    pub credit: u64,
    pub joined: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct Track {
    pub uri: [u8; 64],
    pub uri_len: u8,
}

impl Default for Track {
    fn default() -> Self {
        Self { uri: [0; 64], uri_len: 0 }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct TrackInput {
    pub uri: [u8; 64],
    pub uri_len: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Pledge {
    pub commitment: [u8; 32],
    pub committed: bool,
    pub revealed: bool,
    pub forfeited: bool,
    pub track: u8,
    pub amount: u64,
    pub escrow: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct RoundResult {
    pub winner_track: u8,
    pub mystery_track: u8,
    pub scores: [u64; TRACK_COUNT],
    pub pool: u64,
    pub royalties: [u64; BENEFICIARY_COUNT],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum ShowState {
    Uninitialized,
    Funded,
    Delegated,
    VrfReady,
    Running,
    Finalizing,
    OnL1,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum VrfStatus {
    Idle,
    Requested,
    Ready,
    Aborted,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum RoundPhase {
    Idle,
    Commit,
    Reveal,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum WithdrawKind {
    Seat,
    Beneficiary,
}

#[event]
pub struct ShowInitialized {
    pub show: Pubkey,
    pub vault: Pubkey,
    pub show_id: u64,
    pub total_rounds: u8,
    pub pledge_cap: u64,
}

#[event]
pub struct SeatJoined {
    pub show: Pubkey,
    pub seat_index: u8,
    pub authority: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ShowDelegated {
    pub show: Pubkey,
    pub validator: Pubkey,
}

#[event]
pub struct RandomnessRequested {
    pub show: Pubkey,
    pub nonce: u64,
    pub caller_seed: [u8; 32],
}

#[event]
pub struct RandomnessFulfilled {
    pub show: Pubkey,
    pub nonce: u64,
    pub random_seed: [u8; 32],
}

#[event]
pub struct RoundOpened {
    pub show: Pubkey,
    pub round_index: u8,
    pub mystery_track: u8,
    pub round_seed: [u8; 32],
    pub commit_deadline_slot: u64,
    pub reveal_deadline_slot: u64,
}

#[event]
pub struct PledgeCommitted {
    pub show: Pubkey,
    pub round_index: u8,
    pub seat_index: u8,
    pub escrow: u64,
    pub commitment: [u8; 32],
}

#[event]
pub struct PledgeRevealed {
    pub show: Pubkey,
    pub round_index: u8,
    pub seat_index: u8,
    pub track: u8,
    pub amount: u64,
}

#[event]
pub struct RoundClosed {
    pub show: Pubkey,
    pub round_index: u8,
    pub winner_track: u8,
    pub scores: [u64; TRACK_COUNT],
    pub pool: u64,
    pub royalties: [u64; BENEFICIARY_COUNT],
}

#[event]
pub struct ShowAborted {
    pub show: Pubkey,
    pub refunded: u64,
}

#[event]
pub struct ShowFinalizing {
    pub show: Pubkey,
    pub cancelled: bool,
}

#[event]
pub struct ShowFinalized {
    pub show: Pubkey,
    pub liability_total: u64,
}

#[event]
pub struct Withdrawn {
    pub show: Pubkey,
    pub recipient: Pubkey,
    pub kind: WithdrawKind,
    pub index: u8,
    pub amount: u64,
}

#[event]
pub struct ShowClosed {
    pub show: Pubkey,
}

#[error_code]
pub enum GhostSetError {
    #[msg("The instruction is not valid in the current show state")]
    InvalidState,
    #[msg("The instruction is not valid in the current round phase")]
    InvalidRoundPhase,
    #[msg("The show id does not match the PDA")]
    ShowIdMismatch,
    #[msg("The show account owner is invalid")]
    InvalidShowOwner,
    #[msg("The signer is not authorized for this action")]
    Unauthorized,
    #[msg("The show has been cancelled")]
    ShowCancelled,
    #[msg("The round count must be between one and MAX_ROUNDS")]
    InvalidRoundCount,
    #[msg("The pledge cap must be positive")]
    InvalidPledgeCap,
    #[msg("Round durations must be positive")]
    InvalidRoundTiming,
    #[msg("Exactly three tracks are required")]
    InvalidTrackCount,
    #[msg("Track metadata is empty or exceeds its fixed buffer")]
    InvalidTrackMetadata,
    #[msg("Exactly three beneficiaries are required")]
    InvalidBeneficiaryCount,
    #[msg("The beneficiary or beneficiary index is invalid")]
    InvalidBeneficiary,
    #[msg("Beneficiaries must be distinct")]
    DuplicateBeneficiary,
    #[msg("Royalty basis points must sum to exactly 10000")]
    InvalidRoyaltyBps,
    #[msg("The seat index is invalid")]
    InvalidSeat,
    #[msg("The seat has already joined")]
    SeatAlreadyJoined,
    #[msg("The seat has not joined")]
    SeatNotJoined,
    #[msg("A seat authority may join only once")]
    DuplicateSeat,
    #[msg("All four seats must join before delegation")]
    SeatsNotFilled,
    #[msg("The initial deposit must cover at least one pledge cap")]
    InsufficientDeposit,
    #[msg("The seat does not have enough credit")]
    InsufficientCredit,
    #[msg("The seat has already committed in this round")]
    AlreadyCommitted,
    #[msg("The seat has not committed in this round")]
    NotCommitted,
    #[msg("The seat has already revealed in this round")]
    AlreadyRevealed,
    #[msg("The commitment must be nonzero")]
    InvalidCommitment,
    #[msg("The reveal does not match the domain-separated commitment")]
    InvalidReveal,
    #[msg("The track index is invalid")]
    InvalidTrack,
    #[msg("The pledge amount must be positive and no greater than the cap")]
    InvalidPledgeAmount,
    #[msg("The commit phase has closed")]
    CommitPhaseClosed,
    #[msg("The reveal phase has not opened")]
    RevealPhaseNotOpen,
    #[msg("The reveal phase has closed")]
    RevealPhaseClosed,
    #[msg("The reveal deadline has not passed")]
    RoundNotClosable,
    #[msg("A round is already open")]
    RoundAlreadyOpen,
    #[msg("No round is open")]
    RoundNotOpen,
    #[msg("No rounds remain")]
    NoRoundsRemaining,
    #[msg("The show is not ready to finalize")]
    ShowNotFinalizable,
    #[msg("Finalization has already been scheduled")]
    ShowAlreadyFinalized,
    #[msg("Randomness has already been requested")]
    VrfAlreadyRequested,
    #[msg("No randomness request is pending")]
    VrfNotRequested,
    #[msg("The callback nonce does not match the pending request")]
    VrfRequestMismatch,
    #[msg("The randomness callback arrived after its accepted deadline")]
    VrfCallbackExpired,
    #[msg("Randomness is not ready")]
    VrfNotReady,
    #[msg("The oracle queue does not match the ER runtime")]
    InvalidOracleQueue,
    #[msg("Checked arithmetic overflowed or underflowed")]
    MathOverflow,
    #[msg("The tracked liabilities do not match the account details")]
    LiabilityMismatch,
    #[msg("The vault does not cover all outstanding liabilities")]
    InsufficientVaultFunds,
    #[msg("The vault rent-exempt minimum cannot be spent")]
    VaultRentViolation,
    #[msg("There is no balance to withdraw")]
    NothingToWithdraw,
}

pub fn integer_sqrt(value: u64) -> Result<u64> {
    let target = value as u128;
    let mut low = 0u128;
    let mut high = (u64::MAX as u128) + 1;
    while low + 1 < high {
        let middle = low + (high - low) / 2;
        let square = middle.checked_mul(middle).ok_or(GhostSetError::MathOverflow)?;
        if square <= target {
            low = middle;
        } else {
            high = middle;
        }
    }
    u64::try_from(low).map_err(|_| error!(GhostSetError::MathOverflow))
}

fn read_show(account: &AccountInfo<'_>) -> Result<Show> {
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = data.as_ref();
    Show::try_deserialize(&mut slice).map_err(Into::into)
}

fn write_show(account: &AccountInfo<'_>, show: &Show) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = data.as_mut();
    show.try_serialize(&mut writer).map_err(Into::into)
}

fn assert_show_invariant(show: &Show) -> Result<()> {
    let credit_sum = show.seats.iter().try_fold(0u64, |sum, seat| {
        sum.checked_add(seat.credit).ok_or(GhostSetError::MathOverflow)
    })?;
    let escrow_sum = show.pledges.iter().try_fold(0u64, |sum, pledge| {
        sum.checked_add(pledge.escrow).ok_or(GhostSetError::MathOverflow)
    })?;
    let royalty_sum = show.royalty_pending.iter().try_fold(0u64, |sum, pending| {
        sum.checked_add(*pending).ok_or(GhostSetError::MathOverflow)
    })?;
    require_eq!(credit_sum, show.credit_total, GhostSetError::LiabilityMismatch);
    require_eq!(escrow_sum, show.escrow_total, GhostSetError::LiabilityMismatch);
    require_eq!(royalty_sum, show.royalty_pending_total, GhostSetError::LiabilityMismatch);
    let accounted = show.credit_total
        .checked_add(show.escrow_total)
        .and_then(|sum| sum.checked_add(show.round_pool))
        .and_then(|sum| sum.checked_add(show.royalty_pending_total))
        .ok_or(GhostSetError::MathOverflow)?;
    require_eq!(accounted, show.liability_total, GhostSetError::LiabilityMismatch);
    Ok(())
}

fn assert_vault_covers(vault: &Vault, lamports: u64) -> Result<()> {
    let available = lamports.checked_sub(vault.rent_minimum).ok_or(GhostSetError::InsufficientVaultFunds)?;
    require!(available >= vault.total_liability, GhostSetError::InsufficientVaultFunds);
    Ok(())
}

const _: () = assert!(Show::SPACE <= 10_240);

#[cfg(test)]
mod tests {
    use super::integer_sqrt;

    #[test]
    fn integer_sqrt_boundaries() {
        let cases = [
            (0, 0),
            (1, 1),
            (2, 1),
            (3, 1),
            (4, 2),
            (8, 2),
            (9, 3),
            (15, 3),
            (16, 4),
            (u64::MAX, u32::MAX as u64),
        ];
        for (value, expected) in cases {
            assert_eq!(integer_sqrt(value).unwrap(), expected);
        }
    }

    #[test]
    fn integer_sqrt_preserves_square_bounds() {
        for value in [5, 24, 25, 26, 99, 100, 101, 1_000_000, u64::MAX - 1] {
            let root = integer_sqrt(value).unwrap() as u128;
            assert!(root * root <= value as u128);
            assert!((root + 1) * (root + 1) > value as u128);
        }
    }
}
