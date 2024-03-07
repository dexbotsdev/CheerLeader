import { Connection, Keypair } from "@solana/web3.js"
import bs58 from 'bs58'

const deployerKey='4dA4TfHXitcFhB5cdQgoQMN7V8jY4stZjzUPk6ybh9n3iJ5w8wVQ3u2exy7A5urvHveH3YV14Gqi7498B68cewnf'

const senderKey='5TcMCt9Tkm98QR9GP8n5oQb28vTbDDyruciwNDSzBcCVDSxbm7wbsZRvtNPCwQ4pNy56YiEmKMhRQywk22mXvHm8'



export const tokenInfo={ 
    tokenName:"WIFBONK",
    decimals:9,
    symbol:"WIFBONK",
    supply: "1000000",
    image: "assets/logo.png", 
    description:"The $WIFBONK is TOKEN By  Team BONK", 
    imgType: 'image/png',
    imgName: 'SOLANA_SPL_TOKEN',  
    addLP: 90, //%ge of supply tokens
    addSol: 1,  
    devnet:false,
    amountToSwap:1,
    senderShare:20, // % ge of Supply that is pre sent to senderwallet
    swapWalletsCount:4,   // bundle limit of jito is 5  including tips, so limit swap wallets to 4
    supplyWalletsCount:5,
    walletAmountsFixed :true,
    walletFixedTokens: 4, //%ge of supply tokens -- Only if its fixed
    fixedSolTransfer:0.05
}

 

 
export const devnetKey  = Keypair.fromSecretKey(bs58.decode(deployerKey))
export const mainnetKey = Keypair.fromSecretKey(bs58.decode(deployerKey))
export const NFT_STORAGE_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDAxQzM4ZGVhN0QwQTcxRkIyY0NGOGIzYzliMWVmMDk3Mjc0MUY2ODYiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTkxNDE5MDY3MCwibmFtZSI6Im9yZGluYW5jZSJ9.DR8xEjrABHIXPV3tBktejuG7br0r672brDF4Fy-fvBY'

console.log(bs58.encode(devnetKey.secretKey))

export const privateKey = tokenInfo.devnet ? devnetKey:mainnetKey;

export const sender = Keypair.fromSecretKey(bs58.decode(senderKey))
export const RPC_URL = tokenInfo.devnet? 'https://solana-devnet.g.alchemy.com/v2/nRseMC35yPyR6XOdzvbktQ6dlT4Z1OMk':
    'https://solana-mainnet.g.alchemy.com/v2/w3QZWz-Bh19CfQn6C0N6oX2ExF_nqO8X';

export const connection = new Connection(RPC_URL,'confirmed') 
 