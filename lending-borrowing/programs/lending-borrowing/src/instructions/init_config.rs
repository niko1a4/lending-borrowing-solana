#[cfg(feature = "test-mode")]
use crate::state::MockOracle;
use crate::{event::InitConfigEvent, state::Config};
use anchor_lang::prelude::*;
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(
        init,
        payer = initializer,
        seeds = [b"config", initializer.key().as_ref()],
        bump,
        space= 8 + Config::INIT_SPACE,
    )]
    pub config: Account<'info, Config>,
    #[cfg(feature = "test-mode")]
    #[account(
        init,
        payer=initializer,
        space= 8+ MockOracle::INIT_SPACE,
        seeds= [b"mock-oracle", config.key().as_ref()],
        bump,
    )]
    pub mock_oracle: Account<'info, MockOracle>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitConfig<'info> {
    pub fn init_config(&mut self, bumps: &InitConfigBumps) -> Result<()> {
        #[cfg(feature = "test-mode")]
        msg!("TEST MODE IS ACTIVE");

        #[cfg(not(feature = "test-mode"))]
        msg!("TEST MODE IS INACTIVE");
        self.config.set_inner(Config {
            admin: self.initializer.key(),
            fee_authority: self.initializer.key(),
            paused: false,
            pool_count: 0,
            bump: bumps.config,
        });
        #[cfg(feature = "test-mode")]
        {
            let current_time = Clock::get()?.unix_timestamp;
            self.mock_oracle.set_inner(MockOracle {
                price: 100_00000000,
                conf: 50000,
                expo: -8,
                publish_time: current_time,
                bump: bumps.mock_oracle,
            });
        };
        emit!(InitConfigEvent {
            config: self.config.key(),
        });
        Ok(())
    }
}
