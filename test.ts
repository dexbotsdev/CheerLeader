import { connection } from "./config";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, makeTxVersion, wallet } from './src/constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, MARKET_STATE_LAYOUT_V3, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, calcMarketStartPrice, getWalletTokenAccount } from "./src/raydiumUtil";
 

async function AMMV2() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        let tokenInfo = JSON.parse(data);
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)
        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        const { baseMint, quoteMint, baseLotSize, quoteLotSize, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
    
        const addBaseAmount = new BN(tokenInfo.baseMintAmount)
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)

        const startTime = Math.floor(Date.now() / 2000)
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)
        let poolKeys: any = Liquidity.getAssociatedPoolKeys({
            version: 4,
            marketVersion: 3,
            baseMint,
            quoteMint,
            baseDecimals: tokenInfo.decimals,
            quoteDecimals: 9,
            marketId: targetMarketId,
            programId: PROGRAMIDS.AmmV4,
            marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
        })
        const outputTokenAmount = new TokenAmount(baseToken, 1, false);
        const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);
    
        const { innerTransactions:swap } = await Liquidity.makeSwapInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                tokenAccounts: walletTokenAccounts,
                owner: wallet.publicKey,
            },
            amountIn: inTokenAmount,
            amountOut: outputTokenAmount,
            fixedSide: 'in',
            makeTxVersion,
            lookupTableCache: addLookupTableInfo
        });
       const ammTnx  =  await ammCreatePool({
            startTime,
            addBaseAmount,
            addQuoteAmount,
            baseToken,
            quoteToken,
            targetMarketId,
            wallet: wallet.payer,
            walletTokenAccounts,
        }); 

         
        console.log('AMM CREATE  ',ammTnx.txs.innerTransactions[0].instructions[0])
        console.log('SWP CREATE  ',swap[0].instructions[0])

       
            console.log(ammTnx.txs.innerTransactions[0].instructions[0].data.toString() )
            console.log(swap[0].instructions[0].data.toString() )
       

    })

}


AMMV2()
 

 