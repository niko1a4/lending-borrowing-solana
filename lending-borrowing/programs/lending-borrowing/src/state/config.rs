use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub pool_id: u64,
    pub oracle: Pubkey,
    pub feed_id: [u8; 32],
    pub mint: Pubkey,
    pub mint_dtoken: Pubkey,
    pub vault: Pubkey,
    pub config: Pubkey,
    pub total_liquidity: u64,
    pub total_borrowed: u64,
    pub total_dtoken_supplied: u64,
    pub liquidation_treshold_bps: u16,
    pub ltv_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub pool_bump: u8,
    pub last_accrual_ts: u64,
    pub borrow_index: u128,
    pub borrow_rate_per_sec: u128,
    pub close_factor_bps: u16,
    //interest rate model params
    pub base_rate: u128,
    pub slope1: u128,
    pub slope2: u128,
    pub optimal_utilization: u128,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub fee_authority: Pubkey,
    pub paused: bool,
    pub pool_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub user: Pubkey,
    pub collateral_value_usd: u64,
    pub debt_value_usd: u64,
    pub health_factor: u64,
}

#[account]
#[derive(InitSpace)]
pub struct UserPoolPosition {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub deposited_amount: u64,
    pub borrowed_amount: u64,
    pub user_borrow_index: u128,
}

#[cfg(feature = "test-mode")]
#[account]
#[derive(InitSpace)]
pub struct MockOracle {
    pub price: i64,
    pub conf: u64,         //confidence interval
    pub expo: i32,         //the exponent
    pub publish_time: i64, //unix timestamop when price was published
    pub bump: u8,
}
