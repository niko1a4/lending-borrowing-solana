use anchor_lang::error_code;

#[error_code]
pub enum Errors {
    #[msg("Caller not admin")]
    NotAdmin,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Amount is zero")]
    AmountZero,
    #[msg("Exceeds max borrowable amount")]
    ExceedsLTV,
    #[msg("Bad health factor")]
    BadHealthFactor,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("User not liquidatable")]
    NotLiquidatable,
    #[msg("Nothing to liquidate")]
    NothingToLiquidate,
    #[msg("InsufficientCollateralToSeize")]
    InsufficientCollateralToSeize,
    #[msg("InvalidOraclePrice")]
    InvalidOraclePrice,
    #[msg("InvalidPrice")]
    InvalidPrice,
}
