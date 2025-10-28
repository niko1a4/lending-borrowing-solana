use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    /// The user who made the deposit.
    pub user: Pubkey,

    /// The pool into which the deposit was made.
    pub pool: Pubkey,

    /// The mint of the underlying token deposited.
    pub mint: Pubkey,

    /// Amount of underlying tokens deposited (raw, in smallest units).
    pub deposit_amount: u64,

    /// Amount of dTokens minted to the user.
    pub dtoken_minted: u64,

    /// Oracle price used for conversion (USD * 1e6 precision).
    pub price_usd_1e6: u64,

    /// Collateral value of this deposit in USD * 1e6 precision.
    pub collateral_value_usd: u64,
}
