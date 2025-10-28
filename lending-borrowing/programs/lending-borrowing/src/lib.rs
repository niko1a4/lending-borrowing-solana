#![allow(deprecated)]
use anchor_lang::prelude::*;

declare_id!("CgvDktaY3NhavZJwrYMGd1ESaAXW7GAEj9WbutuNHpL9");
mod instructions;
use instructions::*;
mod error;
mod event;
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
    ) -> Result<()> {
        ctx.accounts.create_pool(
            oracle,
            feed_id,
            liquidation_treshold_bps,
            ltv_bps,
            liquidation_bonus_bps,
            &ctx.bumps,
        )?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ctx.accounts.deposit(amount)?;
        Ok(())
    }
}
