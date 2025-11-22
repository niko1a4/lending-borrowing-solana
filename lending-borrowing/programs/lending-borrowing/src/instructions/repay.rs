use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
#[cfg(not(feature="test-mode"))]
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
#[cfg(feature="test-mode")]
use crate::state::config::MockOracle;

use crate::{error::Errors, event::RepayEvent, helpers::interest::*, math::*, state::*};

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address=pool.mint)]
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds= [b"pool", config.key().as_ref(), underlying_mint.key().as_ref()],
        bump= pool.pool_bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        seeds=[b"config", config.admin.key().as_ref()],
        bump= config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut, 
        associated_token::mint = underlying_mint,
        associated_token::authority= user,
    )]
    pub user_mint_ata: Account<'info, TokenAccount>,
    #[account(
        mut, 
        associated_token::mint= underlying_mint,
        associated_token::authority= pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut, 
        seeds=[b"user-position", user.key().as_ref()],
        bump, 
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut,
        seeds= [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    #[cfg(not(feature="test-mode"))]
    pub oracle: Account<'info, PriceUpdateV2>,
    // Test mode:  mock oracle
    #[cfg(feature = "test-mode")]
    #[account(
        seeds= [b"mock-oracle", config.key().as_ref()],
        bump= oracle.bump,
    )]
    pub oracle: Account<'info, MockOracle>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Repay<'info> {
    pub fn repay(&mut self, amount: u64) -> Result<()> {
        accrue_interest(&mut self.pool)?;
        update_interest_rate(&mut self.pool)?;
        update_user_borrow_state(&mut self.user_pool_position, &mut self.pool)?;

        let old_debt = self.user_pool_position.borrowed_amount;
        if old_debt == 0 || amount == 0 {
            return Ok(());
        }
        let repay_amount = amount.min(old_debt);
        let new_debt = old_debt
            .checked_sub(repay_amount)
            .ok_or(Errors::MathOverflow)?;
        self.user_pool_position.borrowed_amount = new_debt;

        //transfer repayment tokens from user to the pool vault
        let program = self.token_program.to_account_info();
        let accounts = Transfer {
            from: self.user_mint_ata.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(program, accounts);
        transfer(cpi_ctx, repay_amount)?;
        self.pool.total_borrowed = self
            .pool
            .total_borrowed
            .checked_sub(repay_amount)
            .ok_or(Errors::MathOverflow)?;
        self.pool.total_liquidity = self
            .pool
            .total_liquidity
            .checked_add(repay_amount)
            .ok_or(Errors::MathOverflow)?;

        //oracle + decimals
          #[cfg(not(feature="test-mode"))]
        let price_usd_1e6 = {
            let price_update = &self.oracle;
            let maximum_age: u64 = 30;
            let feed_id: [u8; 32] = self.pool.feed_id;
            let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
            normalize_pyth_price_to_usd_1e6(price.price, price.exponent)?
        };
        
        #[cfg(feature="test-mode")]
        let price_usd_1e6 = {
            let mock_oracle = &self.oracle;
            normalize_pyth_price_to_usd_1e6(mock_oracle.price, mock_oracle.expo)?
        };
         let decimals = self.underlying_mint.decimals;
        //compute new total debt USD
        let old_usd = calculate_borrowed_value_usd(old_debt, price_usd_1e6, decimals)?;
        let new_usd = calculate_borrowed_value_usd(new_debt, price_usd_1e6, decimals)?;
        let delta_usd = old_usd.checked_sub(new_usd).ok_or(Errors::MathOverflow)?;

        self.user_position.debt_value_usd =
            self.user_position.debt_value_usd.saturating_sub(delta_usd);

        emit!(RepayEvent {
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.underlying_mint.key(),
            amount: repay_amount,
            remaining_debt: new_debt,
            new_total_borrowed: self.pool.total_borrowed,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
