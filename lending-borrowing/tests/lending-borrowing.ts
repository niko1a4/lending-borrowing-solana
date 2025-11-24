import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { LendingBorrowing } from "../target/types/lending_borrowing";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  getOrCreateAssociatedTokenAccount,
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
    console.log(" Config initialized");

    // Fetch and verify accounts
    const configAccount = await program.account.config.fetch(configPda);
    const mockOracleAccount = await program.account.mockOracle.fetch(mockOracle);

    console.log("Config:", configAccount);
    console.log("Mock Oracle:", mockOracleAccount);

    // Verify mock oracle
    assert.equal(mockOracleAccount.price.toString(), "10000000000");
    assert.equal(mockOracleAccount.expo, -8);
    console.log(" Mock oracle verified");

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
        7000, 8000, 500, 5000,
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
    console.log(" Pool created");

    // Create user ATA
    userAta = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      mintX,
      admin.publicKey
    );
    console.log(" User ATA created");

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

    console.log(" Pool configured correctly");
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
    console.log(" Minted tokens");

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
    console.log(" Tokens deposited");

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
    console.log(" Position updated");

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
    console.log("\nTESTING REPAYMENT WITH INTEREST ACCRUAL");

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
    console.log(" Repayment executed");

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
  it("withdrawscollateral after debt is cleared", async () => {
    console.log("\n TESTING WITHDRAWAL");
    //get initial state
    const poolBefore = await program.account.pool.fetch(poolPda);
    const userPoolPositionBefore = await program.account.userPoolPosition.fetch(userPoolPosition);
    const userPositionBefore = await program.account.userPosition.fetch(userPosition);
    const userDTokenAta = getAssociatedTokenAddressSync(dTokenMint.publicKey, admin.publicKey);
    const userDTokenBefore = await getAccount(provider.connection, userDTokenAta);
    const userAtaBefore = await getAccount(provider.connection, userAta);
    const vaultBefore = await getAccount(provider.connection, vaultAta);

    console.log("Initial state before withdrawal:");
    console.log("  User deposited amount:", userPoolPositionBefore.depositedAmount.toString());
    console.log("  User borrowed amount:", userPoolPositionBefore.borrowedAmount.toString());
    console.log("  User collateral value USD:", userPositionBefore.collateralValueUsd.toString());
    console.log("  User debt value USD:", userPositionBefore.debtValueUsd.toString());
    console.log("  User dToken balance:", userDTokenBefore.amount.toString());
    console.log("  User token ATA balance:", userAtaBefore.amount.toString());
    console.log("  Pool total liquidity:", poolBefore.totalLiquidity.toString());
    console.log("  Pool total dToken supplied:", poolBefore.totalDtokenSupplied.toString());
    console.log("  Vault balance:", vaultBefore.amount.toString());

    //verify user has no debt (it should b e 0 from previous test)
    assert.equal(
      userPoolPositionBefore.borrowedAmount.toNumber(),
      0,
      "User should have no debt before withdrawal"
    );

    //calculate how much dTokens can user withdraw
    const depositedAmount = userPoolPositionBefore.depositedAmount.toNumber();
    const totalLiquidity = poolBefore.totalLiquidity.toNumber();
    const totalDTokenSupplied = poolBefore.totalDtokenSupplied.toNumber();

    //calculate dToken amount for 500 underlying tokens
    //dtoken_amount = (underlying_amount * total_dtoken_supplied)/total_liquidity
    const underlyingToWithdraw = 500_000_000; //500 tokens
    const dTokenToWithdraw = Math.floor((underlyingToWithdraw * totalDTokenSupplied) / totalLiquidity);

    console.log("\nWithdrawal calculation:");
    console.log("  Underlying tokens to withdraw:", underlyingToWithdraw);
    console.log("  DTokens to burn:", dTokenToWithdraw);
    console.log("  Exchange rate: 1 dToken =", (totalLiquidity / totalDTokenSupplied).toFixed(6), "underlying");

    const withdrawDTokenAmount = new BN(dTokenToWithdraw);

    //withdraw
    await program.methods
      .withdraw(withdrawDTokenAmount)
      .accounts({
        user: admin.publicKey,
        mint: mintX,
        mintDtoken: dTokenMint.publicKey,
        pool: poolPda,
        config: configPda,
        vault: vaultAta,
        userDtokenAta: userDTokenAta,
        userTokenAta: userAta,
        userPoolPosition: userPoolPosition,
        userPosition: userPosition,
        oracle: mockOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Withdrawal executed");

    // get state after withdrawal
    const poolAfter = await program.account.pool.fetch(poolPda);
    const userPoolPositionAfter = await program.account.userPoolPosition.fetch(userPoolPosition);
    const userPositionAfter = await program.account.userPosition.fetch(userPosition);
    const userDTokenAfter = await getAccount(provider.connection, userDTokenAta);
    const userAtaAfter = await getAccount(provider.connection, userAta);
    const vaultAfter = await getAccount(provider.connection, vaultAta);

    console.log("\nAfter withdrawal:");
    console.log("  User deposited amount:", userPoolPositionAfter.depositedAmount.toString());
    console.log("  User collateral value USD:", userPositionAfter.collateralValueUsd.toString());
    console.log("  User dToken balance:", userDTokenAfter.amount.toString());
    console.log("  User token ATA balance:", userAtaAfter.amount.toString());
    console.log("  Pool total liquidity:", poolAfter.totalLiquidity.toString());
    console.log("  Pool total dToken supplied:", poolAfter.totalDtokenSupplied.toString());
    console.log("  Vault balance:", vaultAfter.amount.toString());

    //calculate token movements
    const dTokensBurned = BigInt(userDTokenBefore.amount.toString()) -
      BigInt(userDTokenAfter.amount.toString());
    const tokensReceived = BigInt(userAtaAfter.amount.toString()) -
      BigInt(userAtaBefore.amount.toString());
    const vaultDecrease = BigInt(vaultBefore.amount.toString()) -
      BigInt(vaultAfter.amount.toString());

    console.log("\nToken movements:");
    console.log("  DTokens burned:", dTokensBurned.toString());
    console.log("  Underlying tokens received:", tokensReceived.toString());
    console.log("  Vault decrease:", vaultDecrease.toString());

    assert.equal(
      dTokensBurned.toString(),
      withdrawDTokenAmount.toString(),
      "DTokens burned should match withdrawal amount"
    );

    assert.equal(
      tokensReceived.toString(),
      vaultDecrease.toString(),
      "Tokens received should equal vault decrease"
    );
    assert.ok(
      Math.abs(Number(tokensReceived) - underlyingToWithdraw) <= 1,
      "Underlying tokens received should match expected amount (with rounding tolerance)"
    );
    const liquidityDecrease = poolBefore.totalLiquidity.toNumber() -
      poolAfter.totalLiquidity.toNumber();
    const dTokenSupplyDecrease = poolBefore.totalDtokenSupplied.toNumber() -
      poolAfter.totalDtokenSupplied.toNumber();

    console.log("\nPool state changes:");
    console.log("  Total liquidity decreased by:", liquidityDecrease);
    console.log("  Total dToken supply decreased by:", dTokenSupplyDecrease);

    assert.equal(
      liquidityDecrease,
      Number(tokensReceived),
      "Pool liquidity should decrease by withdrawn amount"
    );

    assert.equal(
      dTokenSupplyDecrease,
      Number(dTokensBurned),
      "Pool dToken supply should decrease by burned amount"
    );

    const depositDecrease = userPoolPositionBefore.depositedAmount.toNumber() -
      userPoolPositionAfter.depositedAmount.toNumber();

    console.log("\nUser position changes:");
    console.log("  Deposited amount decreased by:", depositDecrease);

    assert.equal(
      depositDecrease,
      Number(tokensReceived),
      "User deposited amount should decrease by withdrawn amount"
    );
    const collateralDecrease = userPositionBefore.collateralValueUsd.toNumber() -
      userPositionAfter.collateralValueUsd.toNumber();

    // Expected collateral decrease: 500 tokens * $100 = $50k (in 1e6 format = 50_000_000_000)
    const expectedCollateralDecrease = 50_000_000_000;

    console.log("  Collateral value USD decreased by:", collateralDecrease);
    console.log("  Expected decrease:", expectedCollateralDecrease);

    const tolerance = 1000;
    assert.ok(
      Math.abs(collateralDecrease - expectedCollateralDecrease) <= tolerance,
      `Collateral value should decrease correctly (within tolerance). Expected: ${expectedCollateralDecrease}, Got: ${collateralDecrease}, Diff: ${Math.abs(collateralDecrease - expectedCollateralDecrease)}`
    );

    console.log("\n All withdrawal checks passed");
  });
  it("liquidates unhealthy position after price crash", async () => {
    console.log("\nTESTING LIQUIDATION ");

    // create a new borrower
    console.log("\n Creating new borrower ");

    const borrower = Keypair.generate();

    // airdrop SOL to borrower
    const airdropSig = await provider.connection.requestAirdrop(
      borrower.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // create borrowers token account
    const borrowerAta = await createAssociatedTokenAccount(
      provider.connection,
      borrower,
      mintX,
      borrower.publicKey
    );

    // derive borrowrs PDAs
    const [borrowerPoolPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-pool-position"), borrower.publicKey.toBuffer(), poolPda.toBuffer()],
      program.programId
    );

    const [borrowerPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-position"), borrower.publicKey.toBuffer()],
      program.programId
    );

    const borrowerDTokenAta = getAssociatedTokenAddressSync(dTokenMint.publicKey, borrower.publicKey);

    console.log(" New borrower created:", borrower.publicKey.toBase58());

    // borrwoer position collateral
    const depositAmount = new BN(1_000_000_000); // 1000 tokens

    // mint tokens to borrower
    await mintTo(
      provider.connection,
      admin.payer,
      mintX,
      borrowerAta,
      admin.payer,
      depositAmount.toNumber()
    );

    // deposit
    await program.methods
      .depositTokens(depositAmount)
      .accounts({
        user: borrower.publicKey,
        underlyingMint: mintX,
        dtokenMint: dTokenMint.publicKey,
        config: configPda,
        pool: poolPda,
        vault: vaultAta,
        userAta: borrowerAta,
        userDtokenAta: borrowerDTokenAta,
        userPoolPosition: borrowerPoolPosition,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([borrower])
      .rpc();

    // update position
    await program.methods
      .updateDepositPosition(depositAmount)
      .accounts({
        user: borrower.publicKey,
        underlyingMint: mintX,
        config: configPda,
        pool: poolPda,
        userPosition: borrowerPosition,
        userPoolPosition: borrowerPoolPosition,
        oracle: mockOracle,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    console.log(" Borrower deposited 1000 tokens ($100,000 at $100/token)");

    // borrower borrows close to ltv limit
    const borrowAmount = new BN(600_000_000); // 600 tokens = $60,000 (60% of $100k)

    await program.methods
      .borrow(borrowAmount)
      .accounts({
        user: borrower.publicKey,
        underlyingMint: mintX,
        pool: poolPda,
        config: configPda,
        userAta: borrowerAta,
        userPoolPosition: borrowerPoolPosition,
        userPosition: borrowerPosition,
        vault: vaultAta,
        oracle: mockOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    console.log(" Borrower borrowed 700 tokens ($70,000)");

    // Check initial state
    const borrowerPositionBefore = await program.account.userPosition.fetch(borrowerPosition);
    const borrowerPoolPositionBefore = await program.account.userPoolPosition.fetch(borrowerPoolPosition);
    const poolBefore = await program.account.pool.fetch(poolPda);

    console.log("\nInitial position (at $100 per token):");
    console.log("  Collateral value USD:", borrowerPositionBefore.collateralValueUsd.toString());
    console.log("  Debt value USD:", borrowerPositionBefore.debtValueUsd.toString());
    console.log("  Borrowed amount (tokens):", borrowerPoolPositionBefore.borrowedAmount.toString());
    console.log("  Deposited amount (tokens):", borrowerPoolPositionBefore.depositedAmount.toString());
    console.log("  Liquidation threshold:", poolBefore.liquidationTresholdBps, "bps");

    // calculate initial HF
    const initialHF = (Number(borrowerPositionBefore.collateralValueUsd) *
      poolBefore.liquidationTresholdBps) /
      (Number(borrowerPositionBefore.debtValueUsd) * 10000);
    console.log("  Initial health factor:", initialHF.toFixed(4));

    // crash the price!
    console.log("\n-> Crashing token price ");

    const oldPrice = new BN("10000000000"); // $100
    const newPrice = new BN("4000000000");   // $40 (60% crash)

    await program.methods
      .updateMockOracle(newPrice, -8)
      .accounts({
        admin: admin.publicKey,
        mockOracle: mockOracle,
        config: configPda,
      })
      .rpc();

    console.log(" Price updated: $100 → $40");

    // verify oracle
    const mockOracleAfterUpdate = await program.account.mockOracle.fetch(mockOracle);
    assert.equal(mockOracleAfterUpdate.price.toString(), newPrice.toString());

    // calculate expected HF after crash
    console.log("\nExpected state after price crash:");
    console.log("  NEW Collateral value: 1000 tokens * $40 = $40,000");
    console.log("  ORIGINAL Debt value: $60,000 (doesn't change with price!)");
    const expectedNewCollateralUSD = 40000;
    const originalDebtUSD = 60000;
    const liquidationThreshold = 0.70;
    const expectedHF = (expectedNewCollateralUSD * liquidationThreshold) / originalDebtUSD;
    console.log("  HF = ($40,000 * 0.70) / $60,000 =", expectedHF.toFixed(4));
    console.log("  Status:", expectedHF < 1 ? "LIQUIDATABLE " : "HEALTHY ");

    // setup liquidator
    console.log("\nSetting up liquidator");

    const liquidator = Keypair.generate();

    const liquidatorAirdrop = await provider.connection.requestAirdrop(
      liquidator.publicKey,
      3 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(liquidatorAirdrop);

    const liquidatorDebtAtaAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      mintX,
      liquidator.publicKey
    );
    const liquidatorDebtAta = liquidatorDebtAtaAccount.address;
    const liquidatorCollateralAtaAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      mintX,
      liquidator.publicKey
    );
    const liquidatorCollateralAta = liquidatorCollateralAtaAccount.address;
    // Mint tokens to liquidator
    await mintTo(
      provider.connection,
      admin.payer,
      mintX,
      liquidatorDebtAta,
      admin.payer,
      borrowAmount.toNumber()
    );

    console.log(" Liquidator setup complete");

    //  execute liquidation
    console.log("\n-> Executing liquidation <-");

    const closeFactor = poolBefore.closeFactorBps;
    const maxRepay = Math.floor(
      (borrowerPoolPositionBefore.borrowedAmount.toNumber() * closeFactor) / 10000
    );
    const repayAmount = new BN(Math.min(maxRepay, borrowAmount.toNumber()));

    console.log("  Close factor:", closeFactor, "bps");
    console.log("  Max repayable (close factor):", maxRepay);
    console.log("  Repay amount:", repayAmount.toString());


    const liquidatorAtaBefore = await getAccount(provider.connection, liquidatorDebtAta);

    await program.methods
      .liquidate(repayAmount)
      .accounts({
        liquidator: liquidator.publicKey,
        borrower: borrower.publicKey,
        debtMint: mintX,
        debtPool: poolPda,
        config: configPda,
        borrowerDebtPosition: borrowerPoolPosition,
        borrowerPosition: borrowerPosition,
        debtPoolVault: vaultAta,
        liquidatorDebtAta: liquidatorDebtAta,
        collateralMint: mintX,
        collateralPool: poolPda,
        borrowerCollateralPosition: borrowerPoolPosition,
        collateralPoolVault: vaultAta,
        liquidatorCollateralAta: liquidatorCollateralAta,
        debtOracle: mockOracle,
        collateralOracle: mockOracle,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([liquidator])
      .rpc();

    console.log(" Liquidation executed!");

    // verify results
    const liquidatorAtaAfter = await getAccount(provider.connection, liquidatorDebtAta);

    // calculate net change (collateral received - debt paid)
    const netTokenChange = BigInt(liquidatorAtaAfter.amount.toString()) -
      BigInt(liquidatorAtaBefore.amount.toString());

    console.log("\n--- Liquidation Results ---");
    console.log("  Liquidator balance before:", liquidatorAtaBefore.amount.toString());
    console.log("  Liquidator balance after:", liquidatorAtaAfter.amount.toString());
    console.log("  Net token change:", netTokenChange.toString());

    // calculate expected values
    const repayTokens = repayAmount.toNumber();
    const repayValueUSD = (repayTokens * 40) / 1_000_000; // at $40 per token
    const seizeValueUSD = repayValueUSD * 1.05; // with 5% bonus
    const expectedSeizeTokens = Math.floor((seizeValueUSD * 1_000_000) / 40);
    const expectedNetProfit = expectedSeizeTokens - repayTokens;

    console.log("\n--- Expected vs Actual ---");
    console.log("  Repay amount:", repayTokens);
    console.log("  Expected seize amount:", expectedSeizeTokens);
    console.log("  Expected net profit:", expectedNetProfit);
    console.log("  Actual net change:", netTokenChange.toString());

    // verify liquidator profited
    assert.ok(netTokenChange > 0n, "Liquidator should have net positive tokens");
    assert.ok(
      Math.abs(Number(netTokenChange) - expectedNetProfit) <= 1,
      "Net change should match expected profit (with rounding tolerance)"
    );

    console.log("\n All liquidation checks passed!!");
  });
});