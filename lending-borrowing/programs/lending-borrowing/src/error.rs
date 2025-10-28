use anchor_lang::error_code;

#[error_code]
pub enum Errors {
    #[msg("Caller not admin")]
    NotAdmin,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Amount is zero")]
    AmountZero,
}
