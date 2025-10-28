use crate::state::Config;
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
    pub system_program: Program<'info, System>,
}

impl<'info> InitConfig<'info> {
    pub fn init_config(&mut self, bumps: &InitConfigBumps) -> Result<()> {
        self.config.set_inner(Config {
            admin: self.initializer.key(),
            fee_authority: self.initializer.key(),
            paused: false,
            pool_count: 0,
            bump: bumps.config,
        });
        Ok(())
    }
}
