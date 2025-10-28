use crate::error::Errors;
use anchor_lang::prelude::*;
/// Calculates how many dTokens to mint for a given deposit amount.
///
/// # Arguments
/// * `deposit_amount` - The amount of underlying token being deposited.
/// * `total_liquidity` - Total underlying liquidity currently in the pool.
/// * `total_dtoken_supply` - Total dTokens minted so far.
///
/// # Returns
/// The amount of dTokens to mint.

pub fn calculate_dtoken_mint_amount(
    deposit_amount: u64,
    total_liquidity: u64,
    total_dtoken_supply: u64,
) -> Result<u64> {
    if total_dtoken_supply == 0 || total_liquidity == 0 {
        // first deposit — 1:1 mint
        return Ok(deposit_amount);
    }

    let mint_amount = (deposit_amount as u128)
        .checked_mul(total_dtoken_supply as u128)
        .unwrap()
        .checked_div(total_liquidity as u128)
        .unwrap();

    Ok(mint_amount as u64)
}

/// Convert a Pyth price (price, exponent) into u64 reprepsenting USD * 1e6 precision.
/// Examples:
/// price = 7160106530699 , expo = -8  -> returns 71_601_065
/// price = 123456789 expo = -6 -> returns 123_456_789
///
pub fn normalize_pyth_price_to_usd_1e6(price: i64, expo: i32) -> Result<u64> {
    //convert i64-> i128 for safe math
    let mut value = price as i128;
    if expo < 0 {
        let scale = 10_i128.pow((-expo) as u32);
        value = value / scale; // shift decimal left
    } else if expo > 0 {
        let scale = 10_i128.pow(expo as u32);
        value = value * scale; // shift decimal right
    }

    let scaled = value
        .checked_mul(1_000_000)
        .ok_or_else(|| error!(Errors::MathOverflow))?;

    // Safe conversion to u64
    Ok(scaled as u64)
}

pub fn calculate_health_factor(
    collateral_usd_1e6: u64,
    borrow_usd_1e6: u64,
    liquidation_threshold_bps: u64,
) -> Result<u64> {
    if borrow_usd_1e6 == 0 {
        return Ok(u64::MAX);
    }

    let collateral = collateral_usd_1e6 as u128;
    let borrow = borrow_usd_1e6 as u128;
    let threshold = liquidation_threshold_bps as u128;

    let hf = collateral
        .checked_mul(threshold)
        .ok_or(Errors::MathOverflow)?
        .checked_div(borrow.saturating_mul(10_000))
        .ok_or(Errors::MathOverflow)?;

    Ok(hf as u64)
}

/// Calculates USD value (1e6 precision) of a borrowed token amount.
///
/// # Arguments
/// * `amount` - borrowed amount in smallest units (u64)
/// * `price_usd_1e6` - oracle price in USD, scaled to 1e6 (normalized using normalize_pyth_price_to_usd_1e6)
/// * `decimals` - token decimals (e.g. 6 for USDC, 9 for SOL)
///
/// # Returns
/// * Borrowed value in USD (scaled to 1e6)
pub fn calculate_borrowed_value_usd(amount: u64, price_usd_1e6: u64, decimals: u8) -> Result<u64> {
    let amount_u128 = amount as u128;
    let price_u128 = price_usd_1e6 as u128;
    let scale = 10u128.pow(decimals as u32);

    let value = amount_u128
        .checked_mul(price_u128)
        .ok_or(Errors::MathOverflow)?
        .checked_div(scale)
        .ok_or(Errors::MathOverflow)?;

    Ok(value as u64)
}
