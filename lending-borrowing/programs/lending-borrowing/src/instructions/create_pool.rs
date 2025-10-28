use crate::state::{Config, Pool};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use crate::error::Errors;

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
    pub dtoken_mint: Account<'info,Mint>,
    #[account(
        init,
        payer= admin,
        seeds= [b"pool", config.key().as_ref()],
        bump,
        space = 8 + Pool::INIT_SPACE,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer=admin,
        associated_token::mint = mint,
        associated_token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

impl <'info>CreatePool<'info>{
    pub fn create_pool(
        &mut self,
        oracle: Pubkey,
        feed_id:[u8;32],
        liquidation_treshold_bps: u16, 
        ltv_bps: u16, liquidation_bonus_bps: u16, 
        bumps: &CreatePoolBumps)-> Result<()>{
            require_keys_eq!(self.admin.key(), self.config.admin.key(), Errors::NotAdmin);
            self.pool.set_inner(Pool { 
                pool_id: self.config.pool_count, 
                oracle,
                feed_id,
                mint: self.mint.key(), 
                mint_dtoken:self.dtoken_mint.key(), 
                vault: self.vault.key(), 
                config: self.config.key(), 
                total_liquidity: 0, 
                total_borrowed: 0, 
                total_dtoken_supplied: 0,
                liquidation_treshold_bps, 
                ltv_bps,
                liquidation_bonus_bps,
                pool_bump: bumps.pool, 
             });
             self.config.pool_count+=1;
            Ok(())
    }
}
