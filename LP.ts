import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountMeta, AccountMetaReadonly, CacheLTA, ComputeBudgetConfig, InstructionType, LOOKUP_TABLE_CACHE, Liquidity, LiquiditySwapFixedInInstructionParamsV4, LiquiditySwapFixedOutInstructionParamsV4, LiquiditySwapInstructionParams, LiquiditySwapInstructionSimpleParams, Logger, MakeInstructionOutType, ModelDataPubkey, RENT_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID, Token, TokenAccount, TokenAmount, TxVersion, buildSimpleTransaction, i8, parseBigNumberish, splitTxAndSigners, struct, u16, u32, u64, u8 } from "@raydium-io/raydium-sdk";
import { Connection, PublicKey, TransactionInstruction, Signer, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { buildAndSendTx, getATAAddress } from "./src/raydiumUtil";
import { addLookupTableInfo, wallet } from "./src/constants";
import { sendAndConfirmTransactions } from "./createPool";

const logger = Logger.from('Liquidity')


class LP extends Liquidity {

  static override makeSwapInstruction(params: LiquiditySwapInstructionParams) {
    const { poolKeys, userKeys, amountIn, amountOut, fixedSide } = params
    const { version } = poolKeys

    if (version === 4 || version === 5) {
      if (fixedSide === 'in') {
        return this.makeSwapFixedInInstruction(
          {
            poolKeys,
            userKeys,
            amountIn,
            minAmountOut: amountOut,
          },
          version,
        )
      } else if (fixedSide === 'out') {
        return this.makeSwapFixedOutInstruction(
          {
            poolKeys,
            userKeys,
            maxAmountIn: amountIn,
            amountOut,
          },
          version,
        )
      }

      return logger.throwArgumentError('invalid params', 'params', params)
    }

    return logger.throwArgumentError('invalid version', 'poolKeys.version', version)
  }

  static override makeSwapFixedInInstruction(
    { poolKeys, userKeys, amountIn, minAmountOut }: LiquiditySwapFixedInInstructionParamsV4,
    version: number,
  ) {
    const LAYOUT = struct([u8('instruction'), u64('amountIn'), u64('minAmountOut')])
    const data = Buffer.alloc(LAYOUT.span)
    LAYOUT.encode(
      {
        instruction: 9,
        amountIn: parseBigNumberish(amountIn),
        minAmountOut: parseBigNumberish(minAmountOut),
      },
      data,
    )

    const keys = [
      // system
      AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
      // amm
      AccountMeta(poolKeys.id, false),
      AccountMetaReadonly(poolKeys.authority, false),
      AccountMeta(poolKeys.openOrders, false),
    ]

    if (version === 4) {
      keys.push(AccountMeta(poolKeys.targetOrders, false))
    }

    keys.push(AccountMeta(poolKeys.baseVault, false), AccountMeta(poolKeys.quoteVault, false))

    if (version === 5) {
      keys.push(AccountMeta(ModelDataPubkey, false))
    }

    keys.push(
      // serum
      AccountMetaReadonly(poolKeys.marketProgramId, false),
      AccountMeta(poolKeys.marketId, false),
      AccountMeta(poolKeys.marketBids, false),
      AccountMeta(poolKeys.marketAsks, false),
      AccountMeta(poolKeys.marketEventQueue, false),
      AccountMeta(poolKeys.marketBaseVault, false),
      AccountMeta(poolKeys.marketQuoteVault, false),
      AccountMetaReadonly(poolKeys.marketAuthority, false),
      // user
      AccountMeta(userKeys.tokenAccountIn, false),
      AccountMeta(userKeys.tokenAccountOut, false),
      AccountMetaReadonly(userKeys.owner, true),
    )

    return {
      address: {},
      innerTransaction: {
        instructions: [
          new TransactionInstruction({
            programId: poolKeys.programId,
            keys,
            data,
          }),
        ],
        signers: [],
        lookupTableAddress: [poolKeys.lookupTableAccount].filter((i) => i && !i.equals(PublicKey.default)),
        instructionTypes: [version === 4 ? InstructionType.ammV4SwapBaseIn : InstructionType.ammV5SwapBaseIn],
      },
    }
  }

  static override makeSwapFixedOutInstruction(
    { poolKeys, userKeys, maxAmountIn, amountOut }: LiquiditySwapFixedOutInstructionParamsV4,
    version: number,
  ) {
    const LAYOUT = struct([u8('instruction'), u16('maxAmountIn'), u16('amountOut')])
    const data = Buffer.alloc(LAYOUT.span)
    LAYOUT.encode(
      {
        instruction: 11,
        maxAmountIn: Number(maxAmountIn),
        amountOut: Number(amountOut),
      },
      data,
    )

    const keys = [
      // system
      AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
      // amm
      AccountMeta(poolKeys.id, false),
      AccountMetaReadonly(poolKeys.authority, false),
      AccountMeta(poolKeys.openOrders, false),
      AccountMeta(poolKeys.targetOrders, false),
      AccountMeta(poolKeys.baseVault, false),
      AccountMeta(poolKeys.quoteVault, false),
    ]

    if (version === 5) {
      keys.push(AccountMeta(ModelDataPubkey, false))
    }

    keys.push(
      // serum
      AccountMetaReadonly(poolKeys.marketProgramId, false),
      AccountMeta(poolKeys.marketId, false),
      AccountMeta(poolKeys.marketBids, false),
      AccountMeta(poolKeys.marketAsks, false),
      AccountMeta(poolKeys.marketEventQueue, false),
      AccountMeta(poolKeys.marketBaseVault, false),
      AccountMeta(poolKeys.marketQuoteVault, false),
      AccountMetaReadonly(poolKeys.marketAuthority, false),
      // user
      AccountMeta(userKeys.tokenAccountIn, false),
      AccountMeta(userKeys.tokenAccountOut, false),
      AccountMetaReadonly(userKeys.owner, true),
    )

    return {
      address: {},
      innerTransaction: {
        instructions: [
          new TransactionInstruction({
            programId: poolKeys.programId,
            keys,
            data,
          }),
        ],
        signers: [],
        lookupTableAddress: [poolKeys.lookupTableAccount].filter((i) => i && !i.equals(PublicKey.default)),
        instructionTypes: [version === 4 ? InstructionType.ammV4SwapBaseOut : InstructionType.ammV5SwapBaseOut],
      },
    }
  }

  static override async makeSwapInstructionSimple<T extends TxVersion>(
    params: LiquiditySwapInstructionSimpleParams & {
      makeTxVersion: T
      lookupTableCache?: CacheLTA
      computeBudgetConfig?: ComputeBudgetConfig
    },
  ) {
    const {
      connection,
      poolKeys,
      userKeys,
      amountIn,
      amountOut,
      fixedSide,
      config,
      makeTxVersion,
      lookupTableCache,
      computeBudgetConfig,
    } = params
    const { tokenAccounts, owner, payer = owner } = userKeys

    logger.debug('amountIn:', amountIn)
    logger.debug('amountOut:', amountOut)
    logger.assertArgument(
      !amountIn.isZero() && !amountOut.isZero(),
      'amounts must greater than zero',
      'currencyAmounts',
      {
        amountIn: amountIn.toFixed(),
        amountOut: amountOut.toFixed(),
      },
    )

    const { bypassAssociatedCheck, checkCreateATAOwner } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false },
      // custom
      ...config,
    }

    // handle currency in & out (convert SOL to WSOL)
    const tokenIn = amountIn instanceof TokenAmount ? amountIn.token : Token.WSOL
    const tokenOut = amountOut instanceof TokenAmount ? amountOut.token : Token.WSOL

    const tokenAccountIn = this._selectTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      tokenAccounts,
      mint: tokenIn.mint,
      owner,
      config: { associatedOnly: false },
    })
    const tokenAccountOut = this._selectTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      tokenAccounts,
      mint: tokenOut.mint,
      owner,
    })

    const [amountInRaw, amountOutRaw] = [amountIn.raw, amountOut.raw]

    const frontInstructions: TransactionInstruction[] = []
    const endInstructions: TransactionInstruction[] = []
    const frontInstructionsType: InstructionType[] = []
    const endInstructionsType: InstructionType[] = []
    const signers: Signer[] = []

    const _tokenAccountIn = await this._handleTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      connection,
      side: 'in',
      amount: amountInRaw,
      mint: tokenIn.mint,
      tokenAccount: tokenAccountIn,
      owner,
      payer,
      frontInstructions,
      endInstructions,
      signers,
      bypassAssociatedCheck,
      frontInstructionsType,
      checkCreateATAOwner,
    })
    const _tokenAccountOut = await this._handleTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      connection,
      side: 'out',
      amount: 0,
      mint: tokenOut.mint,
      tokenAccount: tokenAccountOut,
      owner,
      payer,
      frontInstructions,
      endInstructions,
      signers,
      bypassAssociatedCheck,
      frontInstructionsType,
      checkCreateATAOwner,
    })

    const ins = this.makeSwapInstruction({
      poolKeys,
      userKeys: {
        tokenAccountIn: _tokenAccountIn,
        tokenAccountOut: _tokenAccountOut,
        owner,
      },
      amountIn: amountInRaw,
      amountOut: amountOutRaw,
      fixedSide,
    })

    return {
      address: {},
      innerTransactions: await splitTxAndSigners({
        connection,
        makeTxVersion,
        computeBudgetConfig,
        payer,
        innerTransaction: [
          { instructionTypes: frontInstructionsType, instructions: frontInstructions, signers },
          ins.innerTransaction,
          { instructionTypes: endInstructionsType, instructions: endInstructions, signers: [] },
        ],
        lookupTableCache,
      }),
    }
  }

  static override async makeCreatePoolV4InstructionV2Simple<T extends TxVersion>({
    connection,
    programId,
    marketInfo,
    baseMintInfo,
    quoteMintInfo,
    baseAmount,
    quoteAmount,
    startTime,
    ownerInfo,
    associatedOnly = false,
    computeBudgetConfig,
    checkCreateATAOwner = false,
    makeTxVersion,
    lookupTableCache,
    feeDestinationId,
  }: {
    connection: Connection
    programId: PublicKey
    marketInfo: {
      marketId: PublicKey
      programId: PublicKey
    }
    baseMintInfo: {
      mint: PublicKey
      decimals: number
    }
    quoteMintInfo: {
      mint: PublicKey
      decimals: number
    }

    baseAmount: BN
    quoteAmount: BN
    startTime: BN

    ownerInfo: {
      feePayer: PublicKey
      wallet: PublicKey
      tokenAccounts: TokenAccount[]
      useSOLBalance?: boolean // if has WSOL mint
    }
    associatedOnly: boolean
    checkCreateATAOwner: boolean
    computeBudgetConfig?: ComputeBudgetConfig
  } & {
    makeTxVersion: T
    lookupTableCache?: CacheLTA
    feeDestinationId: PublicKey
  }) {
    const frontInstructions: TransactionInstruction[] = []
    const endInstructions: TransactionInstruction[] = []
    const frontInstructionsType: InstructionType[] = []
    const endInstructionsType: InstructionType[] = []
    const signers: Signer[] = []

    const mintAUseSOLBalance = ownerInfo.useSOLBalance && baseMintInfo.mint.equals(Token.WSOL.mint)
    const mintBUseSOLBalance = ownerInfo.useSOLBalance && quoteMintInfo.mint.equals(Token.WSOL.mint)

    const ownerTokenAccountBase = await this._selectOrCreateTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      mint: baseMintInfo.mint,
      tokenAccounts: mintAUseSOLBalance ? [] : ownerInfo.tokenAccounts,
      owner: ownerInfo.wallet,

      createInfo: mintAUseSOLBalance
        ? {
            connection,
            payer: ownerInfo.feePayer,
            amount: baseAmount,

            frontInstructions,
            frontInstructionsType,
            endInstructions: mintAUseSOLBalance ? endInstructions : [],
            endInstructionsType: mintAUseSOLBalance ? endInstructionsType : [],
            signers,
          }
        : undefined,

      associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
      checkCreateATAOwner,
    })

    const ownerTokenAccountQuote = await this._selectOrCreateTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      mint: quoteMintInfo.mint,
      tokenAccounts: mintBUseSOLBalance ? [] : ownerInfo.tokenAccounts,
      owner: ownerInfo.wallet,

      createInfo: mintBUseSOLBalance
        ? {
            connection,
            payer: ownerInfo.feePayer,
            amount: quoteAmount,

            frontInstructions,
            frontInstructionsType,
            endInstructions: mintBUseSOLBalance ? endInstructions : [],
            endInstructionsType: mintBUseSOLBalance ? endInstructionsType : [],
            signers,
          }
        : undefined,

      associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
      checkCreateATAOwner,
    })

    if (ownerTokenAccountBase === undefined || ownerTokenAccountQuote === undefined)
      throw Error("you don't has some token account")

    const poolInfo = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      marketId: marketInfo.marketId,
      baseMint: baseMintInfo.mint,
      quoteMint: quoteMintInfo.mint,
      baseDecimals: baseMintInfo.decimals,
      quoteDecimals: quoteMintInfo.decimals,
      programId,
      marketProgramId: marketInfo.programId,
    })

    const ins = this.makeCreatePoolV4InstructionV2({
      programId,
      ammId: poolInfo.id,
      ammAuthority: poolInfo.authority,
      ammOpenOrders: poolInfo.openOrders,
      lpMint: poolInfo.lpMint,
      coinMint: poolInfo.baseMint,
      pcMint: poolInfo.quoteMint,
      coinVault: poolInfo.baseVault,
      pcVault: poolInfo.quoteVault,
      ammTargetOrders: poolInfo.targetOrders,
      marketProgramId: poolInfo.marketProgramId,
      marketId: poolInfo.marketId,
      userWallet: ownerInfo.wallet,
      userCoinVault: ownerTokenAccountBase,
      userPcVault: ownerTokenAccountQuote,
      userLpVault: getATAAddress(ownerInfo.wallet, poolInfo.lpMint, TOKEN_PROGRAM_ID).publicKey,
      ammConfigId: poolInfo.configId,
      feeDestinationId,

      nonce: poolInfo.nonce,
      openTime: startTime,
      coinAmount: baseAmount,
      pcAmount: quoteAmount,
    }).innerTransaction

    return {
      address: {
        programId,
        ammId: poolInfo.id,
        ammAuthority: poolInfo.authority,
        ammOpenOrders: poolInfo.openOrders,
        lpMint: poolInfo.lpMint,
        coinMint: poolInfo.baseMint,
        pcMint: poolInfo.quoteMint,
        coinVault: poolInfo.baseVault,
        pcVault: poolInfo.quoteVault,
        withdrawQueue: poolInfo.withdrawQueue,
        ammTargetOrders: poolInfo.targetOrders,
        poolTempLp: poolInfo.lpVault,
        marketProgramId: poolInfo.marketProgramId,
        marketId: poolInfo.marketId,
      },
      innerTransactions: await splitTxAndSigners({
        connection,
        makeTxVersion,
        computeBudgetConfig,
        payer: ownerInfo.feePayer,
        innerTransaction: [
          { instructionTypes: frontInstructionsType, instructions: frontInstructions, signers },
          ins,
          { instructionTypes: endInstructionsType, instructions: endInstructions, signers: [] },
        ],
        lookupTableCache,
      }),
    }
  }

  static override makeCreatePoolV4InstructionV2({
    programId,
    ammId,
    ammAuthority,
    ammOpenOrders,
    lpMint,
    coinMint,
    pcMint,
    coinVault,
    pcVault,
    ammTargetOrders,
    marketProgramId,
    marketId,
    userWallet,
    userCoinVault,
    userPcVault,
    userLpVault,
    nonce,
    openTime,
    coinAmount,
    pcAmount,
    lookupTableAddress,
    ammConfigId,
    feeDestinationId,
  }: {
    programId: PublicKey
    ammId: PublicKey
    ammAuthority: PublicKey
    ammOpenOrders: PublicKey
    lpMint: PublicKey
    coinMint: PublicKey
    pcMint: PublicKey
    coinVault: PublicKey
    pcVault: PublicKey
    ammTargetOrders: PublicKey
    marketProgramId: PublicKey
    marketId: PublicKey
    userWallet: PublicKey
    userCoinVault: PublicKey
    userPcVault: PublicKey
    userLpVault: PublicKey

    lookupTableAddress?: PublicKey
    ammConfigId: PublicKey
    feeDestinationId: PublicKey

    nonce: number
    openTime: BN
    coinAmount: BN
    pcAmount: BN
  }): MakeInstructionOutType {
    const dataLayout = struct([u8('instruction'), u8('nonce'), u64('openTime'), u64('pcAmount'), u64('coinAmount')])

    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ammId, isSigner: false, isWritable: true },
      { pubkey: ammAuthority, isSigner: false, isWritable: false },
      { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
      { pubkey: lpMint, isSigner: false, isWritable: true },
      { pubkey: coinMint, isSigner: false, isWritable: false },
      { pubkey: pcMint, isSigner: false, isWritable: false },
      { pubkey: coinVault, isSigner: false, isWritable: true },
      { pubkey: pcVault, isSigner: false, isWritable: true },
      { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
      { pubkey: ammConfigId, isSigner: false, isWritable: false },
      { pubkey: feeDestinationId, isSigner: false, isWritable: true },
      { pubkey: marketProgramId, isSigner: false, isWritable: false },
      { pubkey: marketId, isSigner: false, isWritable: false },
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: userCoinVault, isSigner: false, isWritable: true },
      { pubkey: userPcVault, isSigner: false, isWritable: true },
      { pubkey: userLpVault, isSigner: false, isWritable: true },
    ]

  
    
    const data = Buffer.alloc(dataLayout.span)
    dataLayout.encode({ instruction: 1, nonce, openTime,coinAmount,pcAmount }, data)
    console.log(data.length); 
    const ins = new TransactionInstruction({
      keys,
      programId,
      data,
    })
    return {
      address: {},
      innerTransaction: {
        instructions: [ins],
        signers: [],
        lookupTableAddress: lookupTableAddress ? [lookupTableAddress] : undefined,
        instructionTypes: [InstructionType.ammV4CreatePoolV2],
      },
    }
  }
}


export default LP