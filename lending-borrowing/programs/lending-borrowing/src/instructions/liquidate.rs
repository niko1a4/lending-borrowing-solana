use crate::{error::Errors, event::LiquidateEvent, helpers::interest::*, math::*, state::*};
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
    pub borrower_pool_position: Account<'info, UserPoolPosition>,
    #[account(
        mut, 
        seeds= [b"user-position", borrower.key().as_ref()],
        bump,
    )]
    pub borrower_position: Account<'info, UserPosition>,
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
    pub collateral_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds=[b"pool", config.key().as_ref(), collateral_mint.key().as_ref()],
        bump = collateral_pool.pool_bump,
    )]
    pub collateral_pool: Account<'info, Pool>,
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
    pub debt_price_update: Account<'info, PriceUpdateV2>,
    pub collateral_price_update: Account<'info, PriceUpdateV2>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Liquidate<'info> {
    fn transfer_from_liquidator_to_debt_vault(&mut self, amount: u64) -> Result<()> {
        let program = self.token_program.to_account_info();
        let accounts = Transfer {
            from: self.liquidator_debt_ata.to_account_info(),
            to: self.debt_pool_vault.to_account_info(),
            authority: self.liquidator.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(program, accounts);
        transfer(cpi_ctx, amount)?;
        Ok(())
    }

    fn transfer_collateral_to_liquidator(&mut self, amount: u64) -> Result<()> {
        let program = self.token_program.to_account_info();
        let accounts = Transfer {
            from: self.collateral_pool_vault.to_account_info(),
            to: self.liquidator_collateral_ata.to_account_info(),
            authority: self.collateral_pool.to_account_info(),
        };
        let config_key = self.config.key();
        let collateral_mint_key = self.collateral_mint.key();
        let seeds = [
            b"pool".as_ref(),
            config_key.as_ref(),
            collateral_mint_key.as_ref(),
            &[self.collateral_pool.pool_bump][..],
        ];
        let signer_seeds: &[&[&[u8]]] = &[&seeds];
        let cpi_ctx = CpiContext::new_with_signer(program, accounts, signer_seeds);
        transfer(cpi_ctx, amount)?;
        Ok(())
    }
    pub fn liquidate(&mut self, repay_amount: u64) -> Result<()> {
        let close_factor = self.debt_pool.close_factor_bps;

        accrue_interest(&mut self.debt_pool)?;
        update_interest_rate(&mut self.debt_pool)?;
        update_user_borrow_state(&mut self.borrower_pool_position, &mut self.debt_pool)?;

        //read prices from both oracles
        let price_update = &self.debt_price_update;
        let maximum_age: u64 = 30;
        let feed_id: [u8; 32] = self.debt_pool.feed_id;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
        let debt_price_usd_1e6 = normalize_pyth_price_to_usd_1e6(price.price, price.exponent)?;
        //second oracle
        let price_update = &self.collateral_price_update;
        let maximum_age: u64 = 30;
        let feed_id: [u8; 32] = self.collateral_pool.feed_id;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
        let collateral_price_usd_1e6 =
            normalize_pyth_price_to_usd_1e6(price.price, price.exponent)?;

        //calculate health factor
        let hf = calculate_health_factor(
            self.borrower_position.collateral_value_usd,
            self.borrower_position.debt_value_usd,
            self.debt_pool.liquidation_treshold_bps as u64,
        )?;
        require!(hf < 10_000, Errors::NotLiquidatable);

        //calculate repay limits
        let borrowed_amount = self.borrower_pool_position.borrowed_amount;
        require!(borrowed_amount > 0, Errors::NothingToLiquidate);

        let max_repay_by_close_factor: u64 = ((borrowed_amount as u128)
            .checked_mul(close_factor as u128)
            .ok_or(Errors::MathOverflow)?
            .checked_div(10_000)
            .ok_or(Errors::MathOverflow)?) as u64;

        let repay_amount = repay_amount
            .min(max_repay_by_close_factor)
            .min(borrowed_amount);
        require!(repay_amount > 0, Errors::InvalidAmount);

        //calculate usd value of the reapy amount
        let debt_decimals = self.debt_mint.decimals;
        let repay_value_usd_1e6 =
            calculate_borrowed_value_usd(repay_amount, debt_price_usd_1e6, debt_decimals)?;

        //calculate seirze amount with liquidation bonus
        let bonus_bps = self.collateral_pool.liquidation_bonus_bps as u64;
        let seize_value_usd_1e6 = (repay_value_usd_1e6 as u128)
            .checked_mul((10_000 + bonus_bps) as u128)
            .ok_or(Errors::MathOverflow)?
            .checked_div(10_000)
            .ok_or(Errors::MathOverflow)? as u64;

        let collateral_decimals = self.collateral_mint.decimals;
        
        //seize_amount = USD * 10^dec/ price
        let seize_amount_u128 = (seize_value_usd_1e6 as u128)
            .checked_mul(10u128.pow(collateral_decimals as u32))
            .ok_or(Errors::MathOverflow)?
            .checked_div(collateral_price_usd_1e6 as u128)
            .ok_or(Errors::MathOverflow)?;
        let mut seize_amount = seize_amount_u128 as u64;

        seize_amount = seize_amount.min(self.borrower_pool_position.deposited_amount);
        require!(seize_amount > 0, Errors::InsufficientCollateralToSeize);

        self.transfer_from_liquidator_to_debt_vault(repay_amount)?;
        self.transfer_collateral_to_liquidator(seize_amount)?;
        //update states
        let seize_value_actual = calculate_borrowed_value_usd(
        seize_amount, 
        collateral_price_usd_1e6, 
        collateral_decimals
    )?;

    self.borrower_position.collateral_value_usd = self
        .borrower_position
        .collateral_value_usd
        .saturating_sub(seize_value_actual);
        //borrower debt reduced
        self.borrower_pool_position.borrowed_amount = self
            .borrower_pool_position
            .borrowed_amount
            .checked_sub(repay_amount)
            .ok_or(Errors::MathOverflow)?;
        self.debt_pool.total_borrowed = self
            .debt_pool
            .total_borrowed
            .checked_sub(repay_amount)
            .ok_or(Errors::MathOverflow)?;
        self.borrower_pool_position.deposited_amount = self
            .borrower_pool_position
            .deposited_amount
            .checked_sub(seize_amount)
            .ok_or(Errors::MathOverflow)?;
        self.collateral_pool.total_liquidity = self
            .collateral_pool
            .total_liquidity
            .checked_sub(seize_amount)
            .ok_or(Errors::MathOverflow)?;
        self.borrower_position.debt_value_usd = self
            .borrower_position
            .debt_value_usd
            .saturating_sub(repay_value_usd_1e6);

        emit!(LiquidateEvent{
            liquidator: self.liquidator.key(),
            borrower: self.borrower.key(),
            debt_repaid: repay_amount,
            collater_seized: seize_amount,
            debt_pool: self.debt_pool.key(),
            collateral_pool: self.collateral_pool.key(),
        });
        Ok(())
    }
}
