use crate::error::Errors;
use crate::event::DepositEvent;
use crate::math::{calculate_borrowed_value_usd, calculate_health_factor};
use crate::{
    math::{calculate_dtoken_mint_amount, normalize_pyth_price_to_usd_1e6},
    state::*,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, transfer, Mint, MintTo, Token, TokenAccount, Transfer},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address=pool.mint)]
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        mut,
        address= pool.mint_dtoken,
    )]
    pub dtoken_mint: Account<'info, Mint>,
    #[account(
        seeds= [b"config", config.admin.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds= [b"pool", config.key().as_ref()],
        bump,
        has_one = oracle,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        associated_token::mint = pool.mint,
        associated_token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = user,
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer= user,
        associated_token::mint= dtoken_mint,
        associated_token::authority=user,
    )]
    pub user_dtoken_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer= user,
        seeds= [b"user-position", user.key().as_ref()],
        bump,
        space = 8 + UserPosition::INIT_SPACE,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        init_if_needed,
        payer= user,
        seeds= [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
        space = 8 + UserPoolPosition::INIT_SPACE,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    pub oracle: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        //assert amount is greater than zero
        require!(amount > 0, Errors::AmountZero);
        //trasnfer tokens to the vault
        let program = self.token_program.to_account_info();
        let accounts = Transfer {
            from: self.user_ata.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(program, accounts);
        transfer(cpi_ctx, amount)?;

        //mint dtokens to represent the share of pool user gets
        let deposit_amount = amount;
        let total_liquidity = self.pool.total_liquidity;
        let total_dtoken_supply = self.pool.total_dtoken_supplied;
        //calculate mint_amount
        let mint_amount =
            calculate_dtoken_mint_amount(deposit_amount, total_liquidity, total_dtoken_supply)?;
        //mint tokens
        let accounts = MintTo {
            mint: self.dtoken_mint.to_account_info(),
            to: self.user_dtoken_ata.to_account_info(),
            authority: self.pool.to_account_info(),
        };
        let program = self.token_program.to_account_info();
        let config_key = self.config.key();
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", config_key.as_ref(), &[self.pool.pool_bump]]];
        let cpi_ctx = CpiContext::new_with_signer(program, accounts, signer_seeds);
        mint_to(cpi_ctx, mint_amount)?;

        //oracle stuff
        let price_update = &self.oracle;
        let maximum_age: u64 = 30;
        let feed_id: [u8; 32] = self.pool.feed_id;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
        let price_usd_1e6 = normalize_pyth_price_to_usd_1e6(price.price, price.exponent)?;
        //compute collateral value
        let mint_decimals = self.underlying_mint.decimals;
        let scale = 10u128.pow(mint_decimals as u32);
        let collateral_usd_u128 = (amount as u128)
            .checked_mul(price_usd_1e6 as u128)
            .ok_or(Errors::MathOverflow)?
            .checked_div(scale)
            .ok_or(Errors::MathOverflow)?; // convert token units -> whole token, compute collateral value to usd

        // result in USD * 1e6 precision
        let collateral_usd = collateral_usd_u128 as u64;

        //update state
        self.pool.total_liquidity = self
            .pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(Errors::MathOverflow)?;
        self.pool.total_dtoken_supplied = self
            .pool
            .total_dtoken_supplied
            .checked_add(mint_amount)
            .ok_or(Errors::MathOverflow)?;
        //calculate borrow amont
        let borrowed_amount_usd =
            calculate_borrowed_value_usd(amount, price_usd_1e6, mint_decimals)?;
        //calculate health factor
        let hf = calculate_health_factor(
            collateral_usd,
            borrowed_amount_usd,
            self.pool.liquidation_treshold_bps.into(),
        )?;
        //update user_position
        if self.user_position.user == Pubkey::default() {
            self.user_position.user = self.user.key();
            self.user_position.collateral_value_usd = collateral_usd;
            self.user_position.debt_value_usd = 0;
            self.user_position.health_factor = hf;
        } else {
            self.user_position.collateral_value_usd = self
                .user_position
                .collateral_value_usd
                .checked_add(collateral_usd)
                .ok_or(Errors::MathOverflow)?;
            self.user_position.user = self.user.key();
            self.user_position.health_factor = hf;
        }
        //todo health factor update
        //update user_pool_position
        if self.user_pool_position.user == Pubkey::default() {
            self.user_pool_position.user = self.user.key();
            self.user_pool_position.pool = self.pool.key();
            self.user_pool_position.deposited_amount = amount;
            self.user_pool_position.borrowed_amount = 0;
        } else {
            self.user_pool_position.deposited_amount = self
                .user_pool_position
                .deposited_amount
                .checked_add(amount)
                .ok_or(Errors::MathOverflow)?;
            self.user_pool_position.user = self.user.key();
            self.user_pool_position.pool = self.pool.key();
        }
        emit!(DepositEvent {
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.pool.mint,
            deposit_amount: amount,
            dtoken_minted: mint_amount,
            price_usd_1e6,
            collateral_value_usd: collateral_usd,
        });
        Ok(())
    }
}
