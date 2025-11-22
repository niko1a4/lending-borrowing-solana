use crate::error::Errors;
use crate::event::DepositEvent;
use crate::helpers::interest::*;
use crate::math::{calculate_borrowed_value_usd, calculate_health_factor};
use crate::{
    math::{calculate_dtoken_mint_amount, normalize_pyth_price_to_usd_1e6},
    state::*,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, transfer, Mint, MintTo, Token, TokenAccount, Transfer},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address=pool.mint)]
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        mut,
        address= pool.mint_dtoken,
    )]
    pub dtoken_mint: Account<'info, Mint>,
    #[account(
        seeds= [b"config", config.admin.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds= [b"pool", config.key().as_ref(), underlying_mint.key().as_ref()],
        bump,
        has_one = oracle,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = user,
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer= user,
        associated_token::mint= dtoken_mint,
        associated_token::authority=user,
    )]
    pub user_dtoken_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer= user,
        seeds= [b"user-position", user.key().as_ref()],
        bump,
        space = 8 + UserPosition::INIT_SPACE,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        init_if_needed,
        payer= user,
        seeds= [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
        space = 8 + UserPoolPosition::INIT_SPACE,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    #[account(address = pool.oracle)]
    pub oracle: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        accrue_interest(&mut self.pool)?;
        update_user_borrow_state(&mut self.user_pool_position, &self.pool)?;
        update_interest_rate(&mut self.pool)?;

        require!(amount > 0, Errors::AmountZero);

        // Do transfer inline
        transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.user_ata.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Calculate and mint inline
        let mint_amount = {
            let total_liquidity = self.pool.total_liquidity;
            let total_dtoken_supply = self.pool.total_dtoken_supplied;
            if total_dtoken_supply == 0 || total_liquidity == 0 {
                amount
            } else {
                ((amount as u128) * (total_dtoken_supply as u128) / (total_liquidity as u128))
                    as u64
            }
        };

        // Mint inline
        {
            let config_key = self.config.key();
            let mint_key = self.underlying_mint.key();
            let bump = self.pool.pool_bump;

            mint_to(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    MintTo {
                        mint: self.dtoken_mint.to_account_info(),
                        to: self.user_dtoken_ata.to_account_info(),
                        authority: self.pool.to_account_info(),
                    },
                    &[&[b"pool", config_key.as_ref(), mint_key.as_ref(), &[bump]]],
                ),
                mint_amount,
            )?;
        }

        // Get price inline
        let (price_usd_1e6, collateral_usd) = {
            let p = self
                .oracle
                .get_price_no_older_than(&Clock::get()?, 30, &self.pool.feed_id)?;
            let price_normalized = normalize_pyth_price_to_usd_1e6(p.price, p.exponent)?;
            let collateral = calculate_borrowed_value_usd(
                amount,
                price_normalized,
                self.underlying_mint.decimals,
            )?;
            (price_normalized, collateral)
        };

        // Update pool
        self.pool.total_liquidity = self
            .pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(Errors::MathOverflow)?;
        self.pool.total_dtoken_supplied = self
            .pool
            .total_dtoken_supplied
            .checked_add(mint_amount)
            .ok_or(Errors::MathOverflow)?;

        // Update positions
        let is_new_position = self.user_position.user == Pubkey::default();

        if is_new_position {
            self.user_position.user = self.user.key();
            self.user_position.collateral_value_usd = collateral_usd;
            self.user_position.debt_value_usd = 0;
            self.user_position.health_factor = u64::MAX;
        } else {
            let new_collateral = self
                .user_position
                .collateral_value_usd
                .checked_add(collateral_usd)
                .ok_or(Errors::MathOverflow)?;
            let hf = calculate_health_factor(
                new_collateral,
                self.user_position.debt_value_usd,
                self.pool.liquidation_treshold_bps.into(),
            )?;
            self.user_position.collateral_value_usd = new_collateral;
            self.user_position.health_factor = hf;
        }

        // Update pool position
        if self.user_pool_position.user == Pubkey::default() {
            self.user_pool_position.user = self.user.key();
            self.user_pool_position.pool = self.pool.key();
            self.user_pool_position.deposited_amount = amount;
            self.user_pool_position.borrowed_amount = 0;
        } else {
            self.user_pool_position.deposited_amount = self
                .user_pool_position
                .deposited_amount
                .checked_add(amount)
                .ok_or(Errors::MathOverflow)?;
        }

        emit!(DepositEvent {
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.pool.mint,
            deposit_amount: amount,
            dtoken_minted: mint_amount,
            price_usd_1e6,
            collateral_value_usd: collateral_usd,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
