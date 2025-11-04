use crate::error::Errors;
use crate::state::{Config, Pool};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"config",config.admin.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer= admin,
        mint::decimals =6,
        mint::authority= pool,
        mint::freeze_authority = pool,
        
    )]
    pub dtoken_mint: Account<'info, Mint>,
    #[account(
        init,
        payer= admin,
        seeds= [b"pool", config.key().as_ref(),mint.key().as_ref()],
        bump,
        space = 8 + Pool::INIT_SPACE,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer=admin,
        associated_token::mint = mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

impl<'info> CreatePool<'info> {
    pub fn create_pool(
        &mut self,
        oracle: Pubkey,
        feed_id: [u8; 32],
        liquidation_treshold_bps: u16,
        ltv_bps: u16,
        liquidation_bonus_bps: u16,
        base_rate: u128,
        slope1: u128,
        slope2: u128,
        optimal_utilization: u128,
        bumps: &CreatePoolBumps,
    ) -> Result<()> {
        const ONE_E_18: u128 = 1_000_000_000_000_000_000;
        require_keys_eq!(self.admin.key(), self.config.admin.key(), Errors::NotAdmin);
        self.pool.set_inner(Pool {
            pool_id: self.config.pool_count,
            oracle,
            feed_id,
            mint: self.mint.key(),
            mint_dtoken: self.dtoken_mint.key(),
            vault: self.vault.key(),
            config: self.config.key(),
            total_liquidity: 0,
            total_borrowed: 0,
            total_dtoken_supplied: 0,
            liquidation_treshold_bps,
            ltv_bps,
            liquidation_bonus_bps,
            pool_bump: bumps.pool,
            last_accrual_ts: 0,
            borrow_index: ONE_E_18,
            borrow_rate_per_sec: ONE_E_18,
            base_rate,
            slope1,
            slope2,
            optimal_utilization,
        });
        self.config.pool_count += 1;
        Ok(())
    }
}
