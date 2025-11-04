use crate::{error::Errors, helpers::interest::*, math::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    pub borrower: SystemAccount<'info>,
    #[account(
        mut,
        
    )]
    pub borrower_positon: Account<'info, UserPosition>,
    #[account(address= debt_pool.mint)]
    pub debt_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds =[b"pool", config.key().as_ref(), debt_mint.key().as_ref()],
        bump = debt_pool.pool_bump,
    )]
    pub debt_pool: Account<'info, Pool>,
    #[account(
        seeds= [b"config", config.admin.key().as_ref()],
        bump= config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds= [b"user-pool-position", debt_pool.key().as_ref(), borrower.key().as_ref()],
        bump,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    #[account(
        mut, 
        seeds= [b"user-position", borrower.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut,
        associated_token::mint= debt_mint,
        associated_token::authority=debt_pool,
    )]
    pub debt_pool_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint= debt_mint,
        associated_token::authority= liquidator,
    )]
    pub liquidator_debt_ata: Account<'info, TokenAccount>,
    //collateral pool 
    #[account(
        address= collateral_pool.mint, 
    )]
    pub collateral_mint : Account<'info,Mint>,
    #[account(
        mut,
        seeds=[b"pool", config.key().as_ref(), collateral_mint.key().as_ref()],
        bump = collateral_pool.pool_bump,
    )]
    pub collateral_pool: Account<'info,Pool>,
    //vault that holds collateral asset
    #[account(
        mut, 
        associated_token::mint= collateral_mint,
        associated_token::authority= collateral_pool,
    )]
    pub collateral_pool_vault: Account<'info, TokenAccount>,
    #[account(
        mut, 
        associated_token::mint = collateral_mint,
        associated_token::authority=liquidator,
    )]
    pub liquidator_collateral_ata: Account<'info, TokenAccount>,

}
