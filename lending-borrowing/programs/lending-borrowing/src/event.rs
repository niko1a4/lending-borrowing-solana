use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub deposit_amount: u64,
    pub dtoken_minted: u64,
    pub price_usd_1e6: u64,
    pub collateral_value_usd: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub price_usd_1e6: u64,
    pub timestamp: i64,
}

#[event]
pub struct BorrowEvent {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub price_usd_1e6: u64,
    pub timestamp: i64,
}

#[event]
pub struct CreatePoolEvent {
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RepayEvent {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub remaining_debt: u64,
    pub new_total_borrowed: u64,
    pub timestamp: i64,
}

#[event]
pub struct InitConfigEvent {
    pub config: Pubkey,
}
