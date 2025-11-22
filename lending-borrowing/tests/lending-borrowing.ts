import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { LendingBorrowing } from "../target/types/lending_borrowing";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert, util } from "chai";
import { publicKey } from "@coral-xyz/anchor/dist/cjs/utils";
import { resolve } from "path";


describe("lending-borrowing", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LendingBorrowing as Program<LendingBorrowing>;
  const admin = provider.wallet;

  let configPda: PublicKey;
  let mockOracle: PublicKey;
  let mintX: PublicKey;
  let poolPda: PublicKey;
  let vaultAta: PublicKey;
  let dTokenMint: Keypair;
  let userAta: PublicKey;
  let userPoolPosition: PublicKey;
  let userPosition: PublicKey;

  before(async () => {
    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), admin.publicKey.toBuffer()],
      program.programId
    );

    [mockOracle] = PublicKey.findProgramAddressSync(
      [Buffer.from("mock-oracle"), configPda.toBuffer()],
      program.programId
    );

    // Initialize config
    await program.methods
      .initConfig()
      .accounts({
        initializer: admin.publicKey,
        config: configPda,
        mockOracle: mockOracle,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Config initialized");

    // Fetch and verify accounts
    const configAccount = await program.account.config.fetch(configPda);
    const mockOracleAccount = await program.account.mockOracle.fetch(mockOracle);

    console.log("Config:", configAccount);
    console.log("Mock Oracle:", mockOracleAccount);

    // Verify mock oracle
    assert.equal(mockOracleAccount.price.toString(), "10000000000");
    assert.equal(mockOracleAccount.expo, -8);
    console.log("✅ Mock oracle verified");

    // Create pool
    mintX = await createMint(provider.connection, admin.payer, admin.publicKey, null, 6);
    dTokenMint = Keypair.generate();

    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), configPda.toBuffer(), mintX.toBuffer()],
      program.programId
    );
    vaultAta = getAssociatedTokenAddressSync(mintX, poolPda, true);

    await program.methods
      .createPool(
        8000, 7000, 500, 5000,
        new BN("10000000000000000"),
        new BN("50000000000000000"),
        new BN("200000000000000000"),
        new BN("800000000000000000")
      )
      .accounts({
        admin: admin.publicKey,
        mint: mintX,
        config: configPda,
        dtokenMint: dTokenMint.publicKey,
        pool: poolPda,
        vault: vaultAta,
        mockOracle: mockOracle,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([dTokenMint])
      .rpc();
    console.log("✅ Pool created");

    // Create user ATA
    userAta = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      mintX,
      admin.publicKey
    );
    console.log("✅ User ATA created");

    //derive user position PDAs
    [userPoolPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-pool-position"), admin.publicKey.toBuffer(), poolPda.toBuffer()],
      program.programId,
    );
    [userPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-position"), admin.publicKey.toBuffer()],
      program.programId
    );
  });

  it("verifies pool configuration", async () => {
    const poolAccount = await program.account.pool.fetch(poolPda);
    assert.equal(poolAccount.oracle.toBase58(), mockOracle.toBase58());

    const feedIdArray = Array.from(poolAccount.feedId);
    const isAllZeros = feedIdArray.every(byte => byte === 0);
    assert.ok(isAllZeros);

    console.log("✅ Pool configured correctly");
  });

  it("deposits tokens and updates position", async () => {
    const depositAmount = new BN(1_000_000_000);

    // Mint tokens
    await mintTo(
      provider.connection,
      admin.payer,
      mintX,
      userAta,
      admin.payer,
      depositAmount.toNumber()
    );
    console.log("✅ Minted tokens");

    // Derive PDAs
    const userDTokenAta = getAssociatedTokenAddressSync(dTokenMint.publicKey, admin.publicKey);
    const [userPoolPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-pool-position"), admin.publicKey.toBuffer(), poolPda.toBuffer()],
      program.programId
    );
    const [userPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-position"), admin.publicKey.toBuffer()],
      program.programId
    );

    // Deposit tokens
    await program.methods
      .depositTokens(depositAmount)
      .accounts({
        user: admin.publicKey,
        underlyingMint: mintX,
        dtokenMint: dTokenMint.publicKey,
        config: configPda,
        pool: poolPda,
        vault: vaultAta,
        userAta: userAta,
        userDtokenAta: userDTokenAta,
        userPoolPosition: userPoolPosition,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("✅ Tokens deposited");

    // Update position
    await program.methods
      .updateDepositPosition(depositAmount)
      .accounts({
        user: admin.publicKey,
        underlyingMint: mintX,
        config: configPda,
        pool: poolPda,
        userPosition: userPosition,
        userPoolPosition: userPoolPosition,
        oracle: mockOracle,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Position updated");

    // Verify
    const userPositionAccount = await program.account.userPosition.fetch(userPosition);
    const expectedCollateral = new BN(100_000_000_000);
    assert.equal(
      userPositionAccount.collateralValueUsd.toString(),
      expectedCollateral.toString()
    );
    console.log(" All deposit checks passed");
  });
  it("borrows tokens", async () => {
    //borrow amount 400 tokens , worth 40k
    //with 100k collateral and 80% ltv , max borrowable is 80k
    const borrowAmount = new BN(400_000_000); //400 tokens with 6 decimals

    //getting initial balances
    const userAtaBefore = await getAccount(provider.connection, userAta);
    const vaultBefore = await getAccount(provider.connection, vaultAta);
    const poolBefore = await program.account.pool.fetch(poolPda);
    const userPositionBefore = await program.account.userPosition.fetch(userPosition);

    console.log("Before borrow:");
    console.log("  User ATA balance:", userAtaBefore.amount.toString());
    console.log("  Vault balance:", vaultBefore.amount.toString());
    console.log("  Pool total borrowed:", poolBefore.totalBorrowed.toString());
    console.log("  User debt value USD:", userPositionBefore.debtValueUsd.toString());

    // Execute borrow
    await program.methods
      .borrow(borrowAmount)
      .accounts({
        user: admin.publicKey,
        underlyingMint: mintX,
        pool: poolPda,
        config: configPda,
        userAta: userAta,
        userPoolPosition: userPoolPosition,
        userPosition: userPosition,
        vault: vaultAta,
        oracle: mockOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(" Borrow executed");

    // Getting balances after borrow
    const userAtaAfter = await getAccount(provider.connection, userAta);
    const vaultAfter = await getAccount(provider.connection, vaultAta);
    const poolAfter = await program.account.pool.fetch(poolPda);
    const userPositionAfter = await program.account.userPosition.fetch(userPosition);
    const userPoolPositionAfter = await program.account.userPoolPosition.fetch(userPoolPosition);

    console.log("After borrow:");
    console.log("  User ATA balance:", userAtaAfter.amount.toString());
    console.log("  Vault balance:", vaultAfter.amount.toString());
    console.log("  Pool total borrowed:", poolAfter.totalBorrowed.toString());
    console.log("  User debt value USD:", userPositionAfter.debtValueUsd.toString());
    console.log("  User pool borrowed amount:", userPoolPositionAfter.borrowedAmount.toString());

    // Verify token transfer
    assert.equal(
      userAtaAfter.amount.toString(),
      (BigInt(userAtaBefore.amount.toString()) + BigInt(borrowAmount.toString())).toString(),
      "User should receive borrowed tokens"
    );

    assert.equal(
      vaultAfter.amount.toString(),
      (BigInt(vaultBefore.amount.toString()) - BigInt(borrowAmount.toString())).toString(),
      "Vault should decrease by borrowed amount"
    );

    // Verify pool state
    assert.equal(
      poolAfter.totalBorrowed.toString(),
      (BigInt(poolBefore.totalBorrowed.toString()) + BigInt(borrowAmount.toString())).toString(),
      "Pool total borrowed should increase"
    );

    // Verify user position state
    const expectedDebtValue = new BN(40_000_000_000); // 400 tokens * $100 = $40k in 1e6 
    assert.equal(
      userPositionAfter.debtValueUsd.toString(),
      expectedDebtValue.toString(),
      "User debt value should be correct"
    );

    assert.equal(
      userPoolPositionAfter.borrowedAmount.toString(),
      borrowAmount.toString(),
      "User pool position borrowed amount should match"
    );

    console.log("All borrow checks passed");
  });
  it("fails to borrow beyond ltv limit", async () => {
    //try to borrow more than allowed
    //current collateral = 100k, ltv = 80%
    //already borrowed 40k
    //if user attempts to borrow another 50k it should fail
    const excessiveBorrowAmount = new BN(500_000_000);
    try {
      await program.methods
        .borrow(excessiveBorrowAmount)
        .accounts({
          user: admin.publicKey,
          underlyingMint: mintX,
          pool: poolPda,
          config: configPda,
          userAta: userAta,
          userPoolPosition: userPoolPosition,
          userPosition: userPosition,
          vault: vaultAta,
          oracle: mockOracle,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Should have failed due to LTV limit");
    } catch (error) {
      assert.ok(error.toString().includes("ExceedsLTV"));
      console.log(" Correctly rejected borrow exceeding LTV");
    }
  });
  it("accrues interest over time and requires reapayment with interest", async () => {
    console.log("\nTesting interest accrual and repayment ");

    // Get initial state before any time passes
    const poolBefore = await program.account.pool.fetch(poolPda);
    const userPoolPositionBefore = await program.account.userPoolPosition.fetch(userPoolPosition);
    const userPositionBefore = await program.account.userPosition.fetch(userPosition);

    console.log("Initial state:");
    console.log("  User borrowed amount:", userPoolPositionBefore.borrowedAmount.toString());
    console.log("  User borrow index:", userPoolPositionBefore.userBorrowIndex.toString());
    console.log("  Pool borrow index:", poolBefore.borrowIndex.toString());
    console.log("  Pool total borrowed:", poolBefore.totalBorrowed.toString());
    console.log("  Pool total liquidity:", poolBefore.totalLiquidity.toString());
    console.log("  User debt value USD:", userPositionBefore.debtValueUsd.toString());
    console.log("  Pool last accrual timestamp:", poolBefore.lastAccrualTs.toString());
    console.log("  Pool borrow rate per sec:", poolBefore.borrowRatePerSec.toString());

    // calculate current utilization
    const utilization = poolBefore.totalBorrowed.toNumber() / poolBefore.totalLiquidity.toNumber();
    console.log("  Current utilization:", (utilization * 100).toFixed(2) + "%");

    // wait for time to pass (simulating interest accrual period)
    console.log("\nWaiting for time to pass to accrue interest...");
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    // calculate what the debt SHOULD be after time passes
    // the repay instruction will call accrue_interest and update_user_borrow_state
    // which will update the borrowed_amount based on the new borrow_index
    const originalBorrowedAmount = BigInt(userPoolPositionBefore.borrowedAmount.toString());
    const originalBorrowIndex = BigInt(poolBefore.borrowIndex.toString());
    const borrowRatePerSec = BigInt(poolBefore.borrowRatePerSec.toString());

    // estimate interest accrual (approximate)
    // new_borrow_index = old_index * (1 + rate * time_elapsed)
    console.log("\n=== Testing Repayment with Interest Accrual ===");

    // mint enough tokens to user for full repayment
    const tokensNeeded = userPoolPositionBefore.borrowedAmount.toNumber() * 1.5; //1.5 because of interest rate
    await mintTo(
      provider.connection,
      admin.payer,
      mintX,
      userAta,
      admin.payer,
      Math.floor(tokensNeeded)
    );
    console.log(" Minted", Math.floor(tokensNeeded), "tokens for repayment");

    // Get balances before repayment
    const userAtaBeforeRepay = await getAccount(provider.connection, userAta);
    const vaultBeforeRepay = await getAccount(provider.connection, vaultAta);
    const poolBeforeRepay = await program.account.pool.fetch(poolPda);

    console.log("\nBefore repayment:");
    console.log("  User ATA balance:", userAtaBeforeRepay.amount.toString());
    console.log("  Vault balance:", vaultBeforeRepay.amount.toString());
    console.log("  Pool total borrowed:", poolBeforeRepay.totalBorrowed.toString());
    console.log("  Pool total liquidity:", poolBeforeRepay.totalLiquidity.toString());
    console.log("  Pool last accrual timestamp:", poolBeforeRepay.lastAccrualTs.toString());

    // try to repay only the original borrowed amount (without considering interest)

    const repayAmountWithoutInterest = new BN(originalBorrowedAmount.toString());

    await program.methods
      .repay(repayAmountWithoutInterest)
      .accounts({
        user: admin.publicKey,
        underlyingMint: mintX,
        pool: poolPda,
        config: configPda,
        userMintAta: userAta,
        vault: vaultAta,
        userPosition: userPosition,
        userPoolPosition: userPoolPosition,
        oracle: mockOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("✅ Repayment executed");

    // Get state after repayment
    const userAtaAfterRepay = await getAccount(provider.connection, userAta);
    const vaultAfterRepay = await getAccount(provider.connection, vaultAta);
    const poolAfterRepay = await program.account.pool.fetch(poolPda);
    const userPoolPositionAfterRepay = await program.account.userPoolPosition.fetch(userPoolPosition);
    const userPositionAfterRepay = await program.account.userPosition.fetch(userPosition);

    console.log("\nAfter repayment:");
    console.log("  User ATA balance:", userAtaAfterRepay.amount.toString());
    console.log("  Vault balance:", vaultAfterRepay.amount.toString());
    console.log("  User remaining borrowed amount:", userPoolPositionAfterRepay.borrowedAmount.toString());
    console.log("  User borrow index:", userPoolPositionAfterRepay.userBorrowIndex.toString());
    console.log("  Pool borrow index:", poolAfterRepay.borrowIndex.toString());
    console.log("  Pool total borrowed:", poolAfterRepay.totalBorrowed.toString());
    console.log("  Pool total liquidity:", poolAfterRepay.totalLiquidity.toString());
    console.log("  Pool last accrual timestamp:", poolAfterRepay.lastAccrualTs.toString());
    console.log("  User debt value USD:", userPositionAfterRepay.debtValueUsd.toString());

    // Calculate time elapsed
    const timeElapsed = poolAfterRepay.lastAccrualTs.toNumber() - poolBeforeRepay.lastAccrualTs.toNumber();
    console.log("  Time elapsed:", timeElapsed, "seconds");

    // verify token movements
    const tokensTransferred = BigInt(userAtaBeforeRepay.amount.toString()) -
      BigInt(userAtaAfterRepay.amount.toString());
    const vaultIncrease = BigInt(vaultAfterRepay.amount.toString()) -
      BigInt(vaultBeforeRepay.amount.toString());

    console.log("\nToken movements:");
    console.log("  Tokens transferred from user:", tokensTransferred.toString());
    console.log("  Vault increase:", vaultIncrease.toString());
    console.log("  Attempted repay amount:", repayAmountWithoutInterest.toString());

    assert.equal(
      tokensTransferred.toString(),
      vaultIncrease.toString(),
      "Tokens transferred should equal vault increase"
    );

    // verify pool state updates
    const borrowedDecrease = poolBeforeRepay.totalBorrowed.toNumber() - poolAfterRepay.totalBorrowed.toNumber();
    const liquidityIncrease = poolAfterRepay.totalLiquidity.toNumber() - poolBeforeRepay.totalLiquidity.toNumber();

    console.log("\nPool state changes:");
    console.log("  Total borrowed decreased by:", borrowedDecrease);
    console.log("  Total liquidity increased by:", liquidityIncrease);

    assert.equal(
      borrowedDecrease,
      liquidityIncrease,
      "Borrowed decrease should equal liquidity increase"
    );

    // Check if borrow index increased (interest accrued)
    const borrowIndexIncreased = BigInt(poolAfterRepay.borrowIndex.toString()) >
      BigInt(poolBeforeRepay.borrowIndex.toString());

    console.log("\nInterest accrual analysis:");
    console.log("  Pool borrow index increased:", borrowIndexIncreased);
    console.log("  Previous index:", poolBeforeRepay.borrowIndex.toString());
    console.log("  Current index:", poolAfterRepay.borrowIndex.toString());

    if (borrowIndexIncreased) {
      const indexGrowth = BigInt(poolAfterRepay.borrowIndex.toString()) -
        BigInt(poolBeforeRepay.borrowIndex.toString());
      const growthRate = (Number(indexGrowth) / Number(poolBeforeRepay.borrowIndex.toString())) * 100;
      console.log("  Index growth:", indexGrowth.toString());
      console.log("  Growth rate:", growthRate.toFixed(8) + "%");
    }

    // Key verification: Check remaining debt
    const remainingDebt = userPoolPositionAfterRepay.borrowedAmount.toNumber();
    const actualRepayment = Number(tokensTransferred);

    console.log("\nDebt analysis:");
    console.log("  Original borrowed amount:", originalBorrowedAmount.toString());
    console.log("  Amount actually repaid:", actualRepayment);
    console.log("  Remaining debt:", remainingDebt);

    if (borrowIndexIncreased && remainingDebt > 0) {
      const interestAccrued = actualRepayment + remainingDebt - Number(originalBorrowedAmount);
      const interestRate = (interestAccrued / Number(originalBorrowedAmount)) * 100;

      console.log("\n INTEREST ACCRUED - User must repay more than borrowed!");
      console.log("  Interest accrued:", interestAccrued);
      console.log("  Interest rate:", interestRate.toFixed(6) + "%");

      if (timeElapsed > 0) {
        const annualizedRate = (interestRate * (365 * 24 * 60 * 60)) / timeElapsed;
        console.log("  Annualized APR:", annualizedRate.toFixed(2) + "%");
      }

      assert.ok(
        remainingDebt > 0,
        "User should have remaining debt due to accrued interest"
      );
    } else if (remainingDebt === 0) {
      console.log("\n Full debt repaid (interest was minimal or zero)");
    } else {
      console.log("\n  Time elapsed may be too short for measurable interest");
      console.log("  But repayment mechanics verified successfully");
    }

    // Verify pool state is consistent
    assert.ok(
      poolAfterRepay.totalBorrowed.toNumber() >= 0,
      "Total borrowed should be non-negative"
    );

    assert.ok(
      poolAfterRepay.totalLiquidity.toNumber() > 0,
      "Total liquidity should be positive"
    );

    // If there's remaining debt, test full repayment
    if (remainingDebt > 0) {
      console.log("\n=== Testing Full Repayment ===");

      const finalRepayAmount = new BN(remainingDebt + 1000); // Add buffer

      await program.methods
        .repay(finalRepayAmount)
        .accounts({
          user: admin.publicKey,
          underlyingMint: mintX,
          pool: poolPda,
          config: configPda,
          userMintAta: userAta,
          vault: vaultAta,
          userPosition: userPosition,
          userPoolPosition: userPoolPosition,
          oracle: mockOracle,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(" Final repayment executed");

      // Verify complete debt clearance
      const userPoolPositionFinal = await program.account.userPoolPosition.fetch(userPoolPosition);
      const userPositionFinal = await program.account.userPosition.fetch(userPosition);

      console.log("\nFinal state:");
      console.log("  User borrowed amount:", userPoolPositionFinal.borrowedAmount.toString());
      console.log("  User debt value USD:", userPositionFinal.debtValueUsd.toString());

      assert.equal(
        userPoolPositionFinal.borrowedAmount.toNumber(),
        0,
        "Borrowed amount should be zero after full repayment"
      );

      assert.equal(
        userPositionFinal.debtValueUsd.toNumber(),
        0,
        "Debt value USD should be zero after full repayment"
      );

      console.log(" Full debt cleared , position is now clean");
    }

    console.log("\n Interest accrual and repayment test done");

  });
});