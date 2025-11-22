use crate::error::Errors;
use crate::event::DepositEvent;
use crate::helpers::interest::*;
use crate::math::{calculate_borrowed_value_usd, calculate_health_factor};
#[cfg(feature = "test-mode")]
use crate::state::MockOracle;
use crate::{
    math::{calculate_dtoken_mint_amount, normalize_pyth_price_to_usd_1e6},
    state::*,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, transfer, Mint, MintTo, Token, TokenAccount, Transfer},
};
#[cfg(not(feature = "test-mode"))]
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct DepositTokens<'info> {
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
        seeds= [b"pool", config.key().as_ref(), underlying_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = pool,
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
        seeds= [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
        space = 8 + UserPoolPosition::INIT_SPACE,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> DepositTokens<'info> {
    pub fn deposit_tokens(&mut self, amount: u64) -> Result<()> {
        // Interest accrual
        accrue_interest(&mut self.pool)?;
        update_user_borrow_state(&mut self.user_pool_position, &self.pool)?;
        update_interest_rate(&mut self.pool)?;

        require!(amount > 0, Errors::AmountZero);

        // Transfer tokens to vault
        transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.user_ata.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Calculate mint amount
        let mint_amount = if self.pool.total_dtoken_supplied == 0 || self.pool.total_liquidity == 0
        {
            amount
        } else {
            ((amount as u128) * (self.pool.total_dtoken_supplied as u128)
                / (self.pool.total_liquidity as u128)) as u64
        };

        // Mint dtokens
        let config_key = self.config.key();
        let mint_key = self.underlying_mint.key();
        let bump = self.pool.pool_bump;

        mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                MintTo {
                    mint: self.dtoken_mint.to_account_info(),
                    to: self.user_dtoken_ata.to_account_info(),
                    authority: self.pool.to_account_info(),
                },
                &[&[b"pool", config_key.as_ref(), mint_key.as_ref(), &[bump]]],
            ),
            mint_amount,
        )?;

        // Update pool state
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

        // Update user pool position
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
        }

        Ok(())
    }
}

//instruction 2: update position
#[derive(Accounts)]
pub struct UpdateDepositPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        seeds= [b"config", config.admin.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        seeds= [b"pool", config.key().as_ref(), underlying_mint.key().as_ref()],
        bump,
        has_one = oracle,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init_if_needed,
        payer = user,
        seeds= [b"user-position", user.key().as_ref()],
        bump,
        space = 8 + UserPosition::INIT_SPACE,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        seeds= [b"user-pool-position", user.key().as_ref(), pool.key().as_ref()],
        bump,
    )]
    pub user_pool_position: Account<'info, UserPoolPosition>,

    // Production mode:  real Pyth oracle
    #[cfg(not(feature = "test-mode"))]
    #[account(address = pool.oracle)]
    pub oracle: Account<'info, PriceUpdateV2>,

    // Test mode:  mock oracle
    #[cfg(feature = "test-mode")]
    #[account(
        seeds= [b"mock-oracle", config.key().as_ref()],
        bump= oracle.bump,
    )]
    pub oracle: Account<'info, MockOracle>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateDepositPosition<'info> {
    #[cfg(not(feature = "test-mode"))]
    pub fn update_position(&mut self, amount: u64) -> Result<()> {
        msg!(">>> NON-TEST MODE UPDATE_POSITION (PYTH VERSION) <<<");
        // Get oracle price from Pyth
        let p = self
            .oracle
            .get_price_no_older_than(&Clock::get()?, 30, &self.pool.feed_id)?;
        let price_usd_1e6 = normalize_pyth_price_to_usd_1e6(p.price, p.exponent)?;

        self.update_position_internal(amount, price_usd_1e6)
    }

    // Test mode implementation
    #[cfg(feature = "test-mode")]
    pub fn update_position(&mut self, amount: u64) -> Result<()> {
        msg!(">>> TEST MODE UPDATE_POSITION (MOCK ORACLE VERSION) <<<");
        // Get oracle price from MockOracle
        let current_time = Clock::get()?.unix_timestamp;
        let time_diff = current_time - self.oracle.publish_time;
        require!(time_diff <= 30, Errors::InvalidOraclePrice);

        let price_usd_1e6 = normalize_pyth_price_to_usd_1e6(self.oracle.price, self.oracle.expo)?;

        self.update_position_internal(amount, price_usd_1e6)
    }

    // Shared logic for both modes
    fn update_position_internal(&mut self, amount: u64, price_usd_1e6: u64) -> Result<()> {
        // Calculate collateral value
        let collateral_usd =
            calculate_borrowed_value_usd(amount, price_usd_1e6, self.underlying_mint.decimals)?;

        // Update user position
        let is_new = self.user_position.user == Pubkey::default();

        if is_new {
            self.user_position.user = self.user.key();
            self.user_position.collateral_value_usd = collateral_usd;
            self.user_position.debt_value_usd = 0;
            self.user_position.health_factor = u64::MAX;
        } else {
            let new_collateral = self
                .user_position
                .collateral_value_usd
                .checked_add(collateral_usd)
                .ok_or(Errors::MathOverflow)?;
            let hf = calculate_health_factor(
                new_collateral,
                self.user_position.debt_value_usd,
                self.pool.liquidation_treshold_bps.into(),
            )?;
            self.user_position.collateral_value_usd = new_collateral;
            self.user_position.health_factor = hf;
        }

        emit!(DepositEvent {
            user: self.user.key(),
            pool: self.pool.key(),
            mint: self.pool.mint,
            deposit_amount: amount,
            dtoken_minted: 0,
            price_usd_1e6,
            collateral_value_usd: collateral_usd,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
