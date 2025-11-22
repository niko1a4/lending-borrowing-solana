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
pub struct UpdateUserDepositPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        seeds= [b"config", config.admin.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        seeds= [b"pool", config.key().as_ref(), underlying_mint.key().as_ref()],
        bump,
        has_one = oracle,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init_if_needed,
        payer=user,
        seeds= [b"user-position", user.key().as_ref()],
        bump,
        space= 8 + UserPosition::INIT_SPACE,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        seeds= [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    #[account(address = pool.oracle)]
    pub oracle: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

impl<'info> UpdateUserDepositPosition<'info> {
    pub fn update_position(&mut self, amount: u64) -> Result<()> {
        // Get oracle price
        let p = self
            .oracle
            .get_price_no_older_than(&Clock::get()?, 30, &self.pool.feed_id)?;
        let price_usd_1e6 = normalize_pyth_price_to_usd_1e6(p.price, p.exponent)?;

        // Calculate collateral value
        let collateral_usd =
            calculate_borrowed_value_usd(amount, price_usd_1e6, self.underlying_mint.decimals)?;

        // Update user position
        let is_new = self.user_position.user == Pubkey::default();

        if is_new {
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

        emit!(DepositEvent {
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.pool.mint,
            deposit_amount: amount,
            dtoken_minted: 0,
            price_usd_1e6,
            collateral_value_usd: collateral_usd,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
