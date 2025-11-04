use crate::error::Errors;
use crate::state::{Pool, UserPoolPosition};
use anchor_lang::prelude::*;

pub fn accrue_interest(pool: &mut Pool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    if now <= pool.last_accrual_ts {
        return Ok(());
    }
    let dt = now - pool.last_accrual_ts;
    if dt == 0 {
        return Ok(());
    }
    let rate_per_sec = pool.borrow_rate_per_sec as u128;
    let old_index = pool.borrow_index as u128;
    // rate_per_sec * dt
    let delta = rate_per_sec
        .checked_mul(dt as u128)
        .ok_or(Errors::MathOverflow)?;
    let multiplier = 1_000_000_000_000_000_000u128
        .checked_add(delta)
        .ok_or(Errors::MathOverflow)?;

    let new_index = old_index
        .checked_mul(multiplier)
        .ok_or(Errors::MathOverflow)?
        .checked_div(1_000_000_000_000_000_000u128)
        .ok_or(Errors::MathOverflow)?;
    //update total borrowed by the same ratio
    let new_total_borrowed = (pool.total_borrowed as u128)
        .checked_mul(new_index)
        .ok_or(Errors::MathOverflow)?
        .checked_div(old_index)
        .ok_or(Errors::MathOverflow)? as u64;

    pool.borrow_index = new_index as u128;
    pool.total_borrowed = new_total_borrowed;
    pool.last_accrual_ts = now;
    Ok(())
}

pub fn update_user_borrow_state(user_position: &mut UserPoolPosition, pool: &Pool) -> Result<()> {
    let pool_index = pool.borrow_index as u128;
    let user_index = user_position.user_borrow_index as u128;

    //if user index is already up to date
    if pool_index <= user_index {
        return Ok(());
    }
    let borrrowed_u128 = user_position.borrowed_amount as u128;

    //calculate interesst factor = pool_index / user_index
    let interest_factor = pool_index
        .checked_mul(1_000_000_000_000_000_000u128)
        .ok_or(Errors::MathOverflow)?
        .checked_div(user_index)
        .ok_or(Errors::MathOverflow)?;

    //apply all = new_debt = borrowed * (interest_factor/1e18)
    let new_debt = borrrowed_u128
        .checked_mul(interest_factor)
        .ok_or(Errors::MathOverflow)?
        .checked_div(1_000_000_000_000_000_000u128)
        .ok_or(Errors::MathOverflow)?;

    user_position.borrowed_amount = new_debt as u64;
    user_position.user_borrow_index = pool.borrow_index;
    Ok(())
}

pub fn update_interest_rate(pool: &mut Pool) -> Result<()> {
    const SECONDS_PER_YEAR: u128 = 31_536_000; // 365 * 24 * 3600
    const ONE: u128 = 1_000_000_000_000_000_000; // 1e18

    let utilization = if pool.total_liquidity > 0 {
        (pool.total_borrowed as u128)
            .checked_mul(ONE)
            .ok_or(Errors::MathOverflow)?
            .checked_div(pool.total_liquidity as u128)
            .ok_or(Errors::MathOverflow)?
    } else {
        0
    };
    let base_rate = pool.base_rate;
    let slope1 = pool.slope1;
    let slope2 = pool.slope2;
    let optimal_utilization = pool.optimal_utilization;

    //borrow rate
    let borrow_rate_annual = if utilization <= optimal_utilization {
        base_rate
            .checked_add(
                slope1
                    .checked_mul(utilization)
                    .ok_or(Errors::MathOverflow)?
                    .checked_div(optimal_utilization)
                    .ok_or(Errors::MathOverflow)?,
            )
            .ok_or(Errors::MathOverflow)?
    } else {
        let excess_util = utilization
            .checked_sub(optimal_utilization)
            .ok_or(Errors::MathOverflow)?;
        base_rate
            .checked_add(slope1)
            .ok_or(Errors::MathOverflow)?
            .checked_add(
                slope2
                    .checked_mul(excess_util)
                    .ok_or(Errors::MathOverflow)?
                    .checked_div(
                        ONE.checked_sub(optimal_utilization)
                            .ok_or(Errors::MathOverflow)?,
                    )
                    .ok_or(Errors::MathOverflow)?,
            )
            .ok_or(Errors::MathOverflow)?
    };

    //conver annual rate to per second rate
    let borrow_rate_per_sec = borrow_rate_annual
        .checked_div(SECONDS_PER_YEAR)
        .ok_or(Errors::MathOverflow)?;

    pool.borrow_rate_per_sec = borrow_rate_per_sec;
    Ok(())
}
