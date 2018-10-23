const Web3 = require('web3')
const R = require('ramda')
const BigNumber = require('big-number')

const {capitalize} = require('./string-utils')

// ----------------------------------------------
// providers
// ----------------------------------------------

const getProviderUrls = () => ({
  ganache: R.propOr('http://localhost:8545', 'GANACHE_URL', process.env),
  rinkeby: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
  ropsten: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`,
  kovan: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
  mainnet: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
})

// ----------------------------------------------
// get web3 provider
// ----------------------------------------------

const getWeb3Provider = network => (
  R.compose(
    url => new Web3.providers.HttpProvider(url),
    R.prop(network),
    getProviderUrls,
  )()
)

module.exports.getWeb3Provider = getWeb3Provider

// ----------------------------------------------
// get web3
// ----------------------------------------------

const getWeb3 = () => R.compose(
  provider => new Web3(provider),
  getWeb3Provider,
)(process.env.ETH_NETWORK)

module.exports.getWeb3 = getWeb3

// ----------------------------------------------
// get balance
// ----------------------------------------------

const _amountForUnits = units => R.compose(
  R.zipObj(units),
  x => R.map(y => parseFloat(Web3.utils.fromWei(x, y)).toFixed(4), units),
)

const _formatBalances = R.converge(R.zipObj, [
  R.compose(R.map(x => `balance${capitalize(x)}`), R.keys),
  R.values,
])

const getBalance = async (address, web3) => {
  const balanceWei = await web3.eth.getBalance(address)
  return R.compose(
    _formatBalances,
    _amountForUnits(['wei', 'gwei', 'ether']),
  )(balanceWei)
}

module.exports.getBalance = getBalance

// ----------------------------------------------
// add account
// ----------------------------------------------

const addAccount = async (privateKey, web3) => {
  web3.eth.accounts.wallet.clear()

  // create wallet with 1 account
  web3.eth.accounts.wallet.create(0)

  // add account using privateKey
  web3.eth.accounts.wallet.add(privateKey)

  // encrypt wallet & stringify
  const encrypted = web3.eth.accounts.wallet.encrypt(process.env.WEB3_WALLET_PASSWORD)
  const value = JSON.stringify(encrypted)
  const account = R.head(web3.eth.accounts.wallet)
  return [account.address, value]
}

module.exports.addAccount = addAccount

// ----------------------------------------------
// create account
// ----------------------------------------------

const createAccount = async web3 => {
  web3.eth.accounts.wallet.clear()

  // create wallet with 1 account
  web3.eth.accounts.wallet.create(1)

  // encrypt wallet & stringify
  const encrypted = web3.eth.accounts.wallet.encrypt(process.env.WEB3_WALLET_PASSWORD)
  const value = JSON.stringify(encrypted)
  const account = R.head(web3.eth.accounts.wallet)
  return [account.address, value]
}

module.exports.createAccount = createAccount

// ----------------------------------------------
// decrypt account
// decrypt provided keystore and return unlocked account
// ----------------------------------------------

const decryptAccount = async (address, keystore, web3) => {
  const encryptedAccount = JSON.parse(keystore)
  web3.eth.accounts.wallet.decrypt(encryptedAccount, process.env.WEB3_WALLET_PASSWORD)
  return web3.eth.accounts.wallet[address]
}

module.exports.decryptAccount = decryptAccount

//-----------------------------------------
// transfer
// transfer amount of wei as "send" transaction
//-----------------------------------------

const transfer = async ({from, to, value, ...params}, web3) => {
  const gasPriceGwei = R.propOr('6.2', 'GAS_PRICE_GWEI', process.env)
  const gasPrice = new BigNumber(Web3.utils.toWei(gasPriceGwei, 'gwei'))
  const data = {from, to, value, gasPrice: gasPrice.toString()}
  const gas = await web3.eth.estimateGas(data)
  return await web3.eth.sendTransaction({...data, gas, ...params})
}

module.exports.transfer = transfer
