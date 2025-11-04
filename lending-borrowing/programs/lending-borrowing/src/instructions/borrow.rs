use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{event::BorrowEvent, helpers::interest::*};
use crate::state::*;
use crate::{
    error::Errors,
    math::{calculate_health_factor, normalize_pyth_price_to_usd_1e6},
};
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, Price, PriceUpdateV2};
#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address= pool.mint)]
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds= [b"pool", config.key().as_ref(), underlying_mint.key().as_ref()],
        bump= pool.pool_bump,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds=[b"config", config.admin.key().as_ref()],
        bump= config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut, 
        associated_token::mint= underlying_mint,
        associated_token::authority=user,
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer= user,
        seeds=[b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
        space = 8 + UserPoolPosition::INIT_SPACE,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    #[account(
        mut,
        seeds=[b"user-position", user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut,
        associated_token::mint=pool.mint,
        associated_token::authority= pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = pool.oracle)]
    pub oracle: Account<'info, PriceUpdateV2>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Borrow<'info> {
    pub fn borrow(&mut self, amount: u64) -> Result<()> {
        accrue_interest(&mut self.pool)?;
        update_user_borrow_state(&mut self.user_pool_position, &self.pool)?;
        update_interest_rate(&mut self.pool)?;
        //fetch oracle price and normalize to usd * 1e6
        let price_update = &self.oracle;
        let maximum_age: u64 = 30;
        let feed_id: [u8; 32] = self.pool.feed_id;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
        let price_usd_1e6 = normalize_pyth_price_to_usd_1e6(price.price, price.exponent)?;

        //calculate amount user wants to borrow in usd
        let mint_decimals = self.underlying_mint.decimals;
        let scale = 10u128.pow(mint_decimals as u32);
        let borrow_value_usd = (amount as u128)
            .checked_mul(price_usd_1e6 as u128)
            .ok_or(Errors::MathOverflow)?
            .checked_div(scale)
            .ok_or(Errors::MathOverflow)? as u64;

        //compute new debt totals
        let new_total_debt = self
            .user_position
            .debt_value_usd
            .checked_add(borrow_value_usd)
            .ok_or(Errors::MathOverflow)?;

        //check LTV
        let max_borrowable = self
            .user_position
            .collateral_value_usd
            .checked_mul(self.pool.ltv_bps as u64)
            .ok_or(Errors::MathOverflow)?
            / 10_000; // convert bps to fraction

        require!(new_total_debt <= max_borrowable, Errors::ExceedsLTV);

        //update pool + user state
        self.pool.total_borrowed = self
            .pool
            .total_borrowed
            .checked_add(amount)
            .ok_or(Errors::MathOverflow)?;
        self.user_pool_position.borrowed_amount = self
            .user_pool_position
            .borrowed_amount
            .checked_add(amount)
            .ok_or(Errors::MathOverflow)?;
        self.user_position.debt_value_usd = new_total_debt;

        //check health factor
        let hf = calculate_health_factor(
            self.user_position.collateral_value_usd,
            new_total_debt,
            self.pool.liquidation_treshold_bps.into(),
        )?;
        require!(hf > 1, Errors::BadHealthFactor);

        //transfer tokens to the user
        let program = self.token_program.to_account_info();
        let accounts = Transfer {
            from: self.vault.to_account_info(),
            to: self.user_ata.to_account_info(),
            authority: self.pool.to_account_info(),
        };
        let config_key = self.config.key();
        let underlying_mint_key = self.underlying_mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"pool",
            config_key.as_ref(),
            underlying_mint_key.as_ref(),
            &[self.pool.pool_bump],
        ]];
        let cpi_ctx = CpiContext::new_with_signer(program, accounts, signer_seeds);
        transfer(cpi_ctx, amount)?;
        emit!(BorrowEvent{
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.underlying_mint.key(),
            amount: amount,
            price_usd_1e6,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
