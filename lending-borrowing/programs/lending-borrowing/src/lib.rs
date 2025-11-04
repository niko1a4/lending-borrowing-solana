#![allow(deprecated)]
use anchor_lang::prelude::*;

declare_id!("CgvDktaY3NhavZJwrYMGd1ESaAXW7GAEj9WbutuNHpL9");
mod instructions;
use instructions::*;
mod error;
mod event;
mod helpers;
mod math;
mod state;
#[program]
pub mod lending_borrowing {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        ctx.accounts.init_config(&ctx.bumps)?;
        Ok(())
    }

    pub fn create_pool(
        ctx: Context<CreatePool>,
        oracle: Pubkey,
        feed_id: [u8; 32],
        liquidation_treshold_bps: u16,
        ltv_bps: u16,
        liquidation_bonus_bps: u16,
        base_rate: u128,
        slope1: u128,
        slope2: u128,
        optimal_utilization: u128,
    ) -> Result<()> {
        ctx.accounts.create_pool(
            oracle,
            feed_id,
            liquidation_treshold_bps,
            ltv_bps,
            liquidation_bonus_bps,
            base_rate,
            slope1,
            slope2,
            optimal_utilization,
            &ctx.bumps,
        )?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ctx.accounts.deposit(amount)?;
        Ok(())
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        ctx.accounts.borrow(amount)?;
        Ok(())
    }
    pub fn withdraw(ctx: Context<Withdraw>, dtoken_amount: u64) -> Result<()> {
        ctx.accounts.withdraw(dtoken_amount)?;
        Ok(())
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        ctx.accounts.repay(amount)?;
        Ok(())
    }
}
