import { connection, privateKey } from "./config";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_TOKEN, PROGRAMIDS, wallet } from "./src/constants";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, MARKET_STATE_LAYOUT_V3, Token } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, calcMarketStartPrice, getWalletTokenAccount } from "./src/raydiumUtil";


async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        const tokenInfo = JSON.parse(data);
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)
        const addBaseAmount = new BN(tokenInfo.baseMintAmount) // 10000 / 10 ** 6,
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount) // 10000 / 10 ** 9,
        const startTime = Math.floor(Date.now() / 1000) + 5 * 60  
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        const { baseMint, quoteMint, baseLotSize, quoteLotSize } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
        console.log(baseMint.toString(), quoteMint.toString(), baseLotSize.toString(), quoteLotSize.toString());
        const associatedPoolKeys = Liquidity.getAssociatedPoolKeys({
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
        const { id: ammId, lpMint } = associatedPoolKeys

        const isAlreadyInited = Boolean((await connection?.getAccountInfo(new PublicKey(ammId)))?.data.length)
        console.log(isAlreadyInited ? 'has already init this pool' : 'Creating AMM Pool ')
        if (isAlreadyInited) {
            console.log(' Pool Already Exists ');
            return;
        }

        console.log(' Creating new AMM Pool for marketId '+ tokenInfo.marketId);

        ammCreatePool({
            startTime,
            addBaseAmount,
            addQuoteAmount,
            baseToken,
            quoteToken,
            targetMarketId,
            wallet: privateKey,
            walletTokenAccounts,
        }).then(({ txids }) => {
            /** continue with txids */
            console.log('txids', txids)
        })



    })

}


start()