use crate::{
    error::Errors,
    event::WithdrawEvent,
    helpers::interest::*,
    math::{calculate_health_factor, normalize_pyth_price_to_usd_1e6},
    state::*,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{burn, transfer, Burn, Mint, Token, TokenAccount, Transfer},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address=pool.mint)]
    pub mint: Account<'info, Mint>,
    #[account(address=pool.mint_dtoken)]
    pub mint_dtoken: Account<'info, Mint>,
    #[account(
        seeds= [b"pool", config.key().as_ref(), mint.key().as_ref()],
        bump = pool.pool_bump,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        seeds=[b"config", config.admin.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut, 
        associated_token::mint= pool.mint,
        associated_token::authority=pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut, 
        associated_token::mint=pool.mint_dtoken,
        associated_token::authority=user,
    )]
    pub user_dtoken_ata: Account<'info, TokenAccount>,
    #[account(
        mut, 
        associated_token::mint= pool.mint,
        associated_token::authority=user,
    )]
    pub user_token_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump, 
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    #[account(
        mut,
        seeds= [b"user-position", user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(address = pool.oracle)]
    pub oracle: Account<'info, PriceUpdateV2>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self, dtoken_amount: u64) -> Result<()> {
        accrue_interest(&mut self.pool)?;
        update_user_borrow_state(&mut self.user_pool_position, &self.pool)?;
        update_interest_rate(&mut self.pool)?;
        require!(self.pool.total_dtoken_supplied > 0, Errors::InvalidAmount);
        let underlying_amount = dtoken_amount
            .checked_mul(self.pool.total_liquidity)
            .ok_or(Errors::MathOverflow)?
            .checked_div(self.pool.total_dtoken_supplied)
            .ok_or(Errors::MathOverflow)?;
        //checks
        require!(underlying_amount > 0, Errors::InvalidAmount);
        require!(
            self.vault.amount >= underlying_amount,
            Errors::InsufficientLiquidity
        );
        require!(
            self.user_dtoken_ata.amount >= dtoken_amount,
            Errors::InvalidAmount
        );
        //burn dtokens from the user
        let program = self.token_program.to_account_info();
        let accounts = Burn {
            mint: self.mint_dtoken.to_account_info(),
            from: self.user_dtoken_ata.to_account_info(),
            authority: self.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(program, accounts);
        burn(cpi_ctx, dtoken_amount)?;

        //transfer underlyting tokens back to user
        let program = self.token_program.to_account_info();
        let accounts = Transfer {
            from: self.vault.to_account_info(),
            to: self.user_token_ata.to_account_info(),
            authority: self.pool.to_account_info(),
        };
        let config_key = self.config.key();
        let underlying_mint_key = self.mint.key();
        let seeds = &[
            b"pool",
            config_key.as_ref(),
            underlying_mint_key.as_ref(),
            &[self.pool.pool_bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(program, accounts, signer_seeds);
        transfer(cpi_ctx, underlying_amount)?;

        //update state
        self.pool.total_liquidity = self
            .pool
            .total_liquidity
            .checked_sub(underlying_amount)
            .ok_or(Errors::MathOverflow)?;
        self.pool.total_dtoken_supplied = self
            .pool
            .total_dtoken_supplied
            .checked_sub(dtoken_amount)
            .ok_or(Errors::MathOverflow)?;
        self.user_pool_position.deposited_amount = self
            .user_pool_position
            .deposited_amount
            .checked_sub(underlying_amount)
            .ok_or(Errors::MathOverflow)?;

        //check health factor
        let price_update = &self.oracle;
        let maximum_age: u64 = 30;
        let feed_id: [u8; 32] = self.pool.feed_id;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
        let price_usd_1e6 = normalize_pyth_price_to_usd_1e6(price.price, price.exponent)?;

        //compute collateral value
        let mint_decimals = self.mint.decimals;
        let scale = 10u128.pow(mint_decimals as u32);

        let delta_collateral_usd_1e6 = (underlying_amount as u128)
            .checked_mul(price_usd_1e6 as u128)
            .ok_or(Errors::MathOverflow)?
            .checked_div(scale)
            .ok_or(Errors::MathOverflow)? as u64;
        //simulate post-withdraw aggregates for HF
        let new_total_collateral_usd = self
            .user_position
            .collateral_value_usd
            .checked_sub(delta_collateral_usd_1e6)
            .ok_or(Errors::MathOverflow)?;
        let borrow_usd_1e6 = self.user_position.debt_value_usd;
        let hf = calculate_health_factor(
            new_total_collateral_usd,
            borrow_usd_1e6,
            self.pool.liquidation_treshold_bps as u64,
        )?;
        require!(hf >= 10_000, Errors::BadHealthFactor);
        //user position update
        self.user_position.collateral_value_usd = new_total_collateral_usd;
        emit!(WithdrawEvent {
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.mint.key(),
            amount: underlying_amount,
            price_usd_1e6,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
