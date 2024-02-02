import { BN } from 'bn.js';

import {
  Liquidity,
  MAINNET_PROGRAM_ID,
  MARKET_STATE_LAYOUT_V3,
  TOKEN_PROGRAM_ID,
  Token,
} from '@raydium-io/raydium-sdk';
import {
  Keypair,
  PublicKey,
} from '@solana/web3.js';
 
import {
  buildAndSendTx,
  getWalletTokenAccount,
} from './raydiumUtil';
import { DEFAULT_TOKEN, PROGRAMIDS, RAYDIUMF_PROGRAM_ID, makeTxVersion, wallet } from './constants';
import { connection, tokenInfo, privateKey } from '../config';
import assert from 'assert';
 
const ZERO = new BN(0)
type BN = typeof ZERO

type CalcStartPrice = {
  addBaseAmount: BN
  addQuoteAmount: BN
}

function calcMarketStartPrice(input: CalcStartPrice) {
  return input.addBaseAmount.toNumber() / 10 ** (tokenInfo.decimals) / (input.addQuoteAmount.toNumber() / 10 ** 9)
}

type LiquidityPairTargetInfo = {
  baseToken: Token
  quoteToken: Token
  targetMarketId: PublicKey
}

function getMarketAssociatedPoolKeys(input: LiquidityPairTargetInfo) {
  return Liquidity.getAssociatedPoolKeys({
    version: 4,
    marketVersion: 3,
    baseMint: input.baseToken.mint,
    quoteMint: input.quoteToken.mint,
    baseDecimals: input.baseToken.decimals,
    quoteDecimals: input.quoteToken.decimals,
    marketId: input.targetMarketId,
    programId: PROGRAMIDS.AmmV4,
    marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
  })
}

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>
type TestTxInputInfo = LiquidityPairTargetInfo &
  CalcStartPrice & {
    startTime: number // seconds
    walletTokenAccounts: WalletTokenAccounts
    wallet: Keypair
  }

async function ammCreatePool(input: TestTxInputInfo): Promise<{ txids: string[] }> {
  // -------- step 1: make instructions --------
  const initPoolInstructionResponse = await Liquidity.makeCreatePoolV4InstructionV2Simple({
    connection,
    programId: PROGRAMIDS.AmmV4,
    marketInfo: {
      marketId: input.targetMarketId,
      programId: PROGRAMIDS.OPENBOOK_MARKET,
    },
    baseMintInfo: input.baseToken,
    quoteMintInfo: input.quoteToken,
    baseAmount: input.addBaseAmount,
    quoteAmount: input.addQuoteAmount,
    startTime: new BN(Math.floor(input.startTime)),
    ownerInfo: {
      feePayer: input.wallet.publicKey,
      wallet: input.wallet.publicKey,
      tokenAccounts: input.walletTokenAccounts,
      useSOLBalance: true,
    },
    associatedOnly: false,
    checkCreateATAOwner: true,
    makeTxVersion,
    feeDestinationId: input.wallet.publicKey, // only mainnet use this
  })

  return { txids: await buildAndSendTx(initPoolInstructionResponse.innerTransactions,{skipPreflight:false}) }
}

export async function createTokenPool(tokenPoolInfo:any) {
  const baseToken = tokenPoolInfo.baseMint // USDC
  const quoteToken = tokenPoolInfo.quoteMint // RAY
  const targetMarketId = tokenPoolInfo.marketId
  const addBaseAmount = new BN(10000000000) // 10000 / 10 ** 6,
  const addQuoteAmount = new BN(100000000) // 10000 / 10 ** 9,
  const startTime = Math.floor(Date.now() / 1000) +5*60 // start from 7 days later
  const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

  /* do something with start price if needed */
  const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })


  const marketBufferInfo :any= await connection.getAccountInfo(tokenPoolInfo.marketId)

  const { baseMint, quoteMint, baseLotSize, quoteLotSize } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)


  console.log(baseMint.toString(),quoteMint.toString(),baseLotSize.toString(),quoteLotSize.toString());

  const associatedPoolKeys = await Liquidity.getAssociatedPoolKeys({
    version: 4,
    marketVersion: 3,
    baseMint,
    quoteMint,
    baseDecimals: tokenInfo.decimals,
    quoteDecimals:9,
    marketId: targetMarketId,
    programId: PROGRAMIDS.AmmV4,
    marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
  })
  const { id: ammId, lpMint } = associatedPoolKeys

  const isAlreadyInited = Boolean((await connection?.getAccountInfo(new PublicKey(ammId)))?.data.length)
  console.log(isAlreadyInited, 'has already init this pool')
  
 
   console.log(associatedPoolKeys.lpMint);
  

  ammCreatePool({
    startTime,
    addBaseAmount,
    addQuoteAmount,
    baseToken,
    quoteToken,
    targetMarketId:tokenPoolInfo.marketId,
    wallet:privateKey,
    walletTokenAccounts,
  }).then(({ txids }) => {
    /** continue with txids */
    console.log('txids', txids)
  })
}