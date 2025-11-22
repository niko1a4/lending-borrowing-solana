#![allow(deprecated)]
use anchor_lang::prelude::*;

declare_id!("4A2DJsPrMxb1EChuCqyUAvWYUt9xHHFHSHsjW9pdvSHV");
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

    #[cfg(feature = "test-mode")]
    pub fn create_pool(
        ctx: Context<CreatePool>,
        liquidation_treshold_bps: u16,
        ltv_bps: u16,
        liquidation_bonus_bps: u16,
        close_factor_bps: u16,
        base_rate: u128,
        slope1: u128,
        slope2: u128,
        optimal_utilization: u128,
    ) -> Result<()> {
        ctx.accounts.create_pool(
            liquidation_treshold_bps,
            ltv_bps,
            liquidation_bonus_bps,
            close_factor_bps,
            base_rate,
            slope1,
            slope2,
            optimal_utilization,
            &ctx.bumps,
        )?;
        Ok(())
    }

    #[cfg(not(feature = "test-mode"))]
    pub fn create_pool(
        ctx: Context<CreatePool>,
        oracle: Pubkey,
        feed_id: [u8; 32],
        liquidation_treshold_bps: u16,
        ltv_bps: u16,
        liquidation_bonus_bps: u16,
        close_factor_bps: u16,
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
            close_factor_bps,
            base_rate,
            slope1,
            slope2,
            optimal_utilization,
            &ctx.bumps,
        )?;
        Ok(())
    }

    pub fn deposit(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        ctx.accounts.deposit_tokens(amount)?;
        Ok(())
    }
    pub fn update_position(ctx: Context<UpdateDepositPosition>, amount: u64) -> Result<()> {
        ctx.accounts.update_position(amount)?;
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
    pub fn liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
        ctx.accounts.liquidate(repay_amount)?;
        Ok(())
    }
    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        ctx.accounts.deposit_tokens(amount)?;
        Ok(())
    }

    pub fn update_deposit_position(ctx: Context<UpdateDepositPosition>, amount: u64) -> Result<()> {
        ctx.accounts.update_position(amount)?;
        Ok(())
    }
}
