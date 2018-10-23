const {assert} = require('chai')
const sinon = require('sinon')
const R = require('ramda')
const Web3 = require('web3')
const ganache = require('ganache-cli')

const SUT = require('./web3-utils')

describe('web3 utils', () => {

  let sandbox = null
  beforeEach(async () => sandbox = await sinon.createSandbox())
  afterEach(async () => await sandbox.restore())

  describe('getWeb3Provider', () => {
    it('should return a new instance of Web3 HttpProvider for the requested network', () => {
      // given ... ganache URL is set as follows
      sandbox.stub(process, 'env').value({
        GANACHE_URL: 'http://GaNucHe:123',
      })

      // when ... we get Web3 Provider for ganache network
      const result = SUT.getWeb3Provider('ganache')

      // then ... should succeed setting the provider to ganache
      assert.match(result.host, /GaNucHe\:123/)
    })
  })

  describe('getWeb3', () => {
    it('should return a new instance of Web3 with the correct provider', () => {
      // given ... network is ganache
      sandbox.stub(process, 'env').value({
        ETH_NETWORK: 'ganache',
        GANACHE_URL: 'http://GaNucHe:123',
      })

      // when ... we get Web3
      const result = SUT.getWeb3()

      // then ... should succeed setting the provider to ganache
      assert.match(result.currentProvider.host, /GaNucHe\:123/)
    })
  })

  describe('getBalance', () => {
    it('should return account balance', async () => {
      // given
      // ... network is ganache
      const web3 = new Web3(ganache.provider())
      // ... web3 will return expected balance
      sandbox.stub(web3.eth, 'getBalance').returns(Promise.resolve('100000000000000'))

      // when ... we get the balance
      const result = await SUT.getBalance('0x123', web3)

      // then ... should return expected structure
      assert.deepEqual(result, {
        balanceWei: '100000000000000.0000',
        balanceGwei: '100000.0000',
        balanceEther: '0.0001',
      })
    })
  })

  describe('createAccount', () => {
    it('should return new address and encrypted keystore', async () => {
      // given
      sandbox.stub(process, 'env').value({
        WEB3_WALLET_PASSWORD: 'secret',
      })
      // ... network is ganache
      const web3 = new Web3(ganache.provider())

      // when ... we create a new account
      const [address, keystore] = await SUT.createAccount(web3)

      // then ... should return address and keystore of new account
      assert.match(address, /0x/)
      assert.equal(address.length, 42)
      assert.match(keystore, /version\":3/)
    })
  })

  describe('addAccount', () => {
    it('should return expected address and encrypted keystore', async () => {
      // given
      sandbox.stub(process, 'env').value({
        WEB3_WALLET_PASSWORD: 'secret',
      })
      // ... network is ganache
      const web3 = new Web3(ganache.provider())

      // when ... we add account using a private key
      const [address, keystore] = await SUT.addAccount('0x89862aeeb28822e6c4926f0d36cc790601955cd3c8f6dbb9f652b8460f7d6b2f', web3)

      // then ... should return expected address and keystore of account
      assert.equal(address.toLowerCase(), '0x4ff8d692631e5c710fe4a7713eea48e0198173d3')
      assert.match(keystore, /version\":3/)
    })
  })

  describe('decryptAccount', () => {
    it('should decrypt provided keystore and return account for provided address', async () => {
      // given
      sandbox.stub(process, 'env').value({
        WEB3_WALLET_PASSWORD: 'secret',
      })
      // ... network is ganache
      const web3 = new Web3(ganache.provider())

      // when ... we decrypt the following address/keystore
      const [address, keystore] = await SUT.createAccount(web3)
      const result = await SUT.decryptAccount(address, keystore, web3)

      // then ... should return address and keystore of new account
      assert.equal(result.address, address)
      assert.equal(result.address.length, 42)
      assert.match(result.privateKey, /0x/)
      assert.equal(result.privateKey.length, 66)
      assert.ok(R.has('signTransaction', result))
      assert.ok(R.has('sign', result))
      assert.ok(R.has('encrypt', result))
      assert.equal(result.index, 0)
    })
  })

  describe('transfer', () => {
    it('should correctly transfer amount and return transaction receipt', async () => {
      // given
      sandbox.stub(process, 'env').value({
        GAS_PRICE_GWEI: '5',
      })
      // ... network is ganache
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()

      // when ... we transfer 1 eth from account 0 to account 1
      const spy = sinon.spy(web3.eth, 'sendTransaction')
      const value = Web3.utils.toWei('1', 'ether')
      const tx = await SUT.transfer({from: accounts[0], to: accounts[1], value}, web3)

      // then
      // ... should return transaction receipt (meaning sum was invoked with send not call)
      assert.hasAllKeys(tx, [
        'transactionHash',
        'transactionIndex',
        'blockHash',
        'blockNumber',
        'gasUsed',
        'cumulativeGasUsed',
        'contractAddress',
        'status',
        'logs',
        'logsBloom',
      ])
      // ... should have succeeded
      assert.equal(tx.status, true)
      // ... should have sent transaction as expected
      const callParams = spy.args[0][0]
      assert.equal(callParams.from.toLowerCase(), accounts[0].toLowerCase())
      assert.equal(callParams.to.toLowerCase(), accounts[1].toLowerCase())
      assert.equal(Web3.utils.hexToNumberString(callParams.value), '1000000000000000000')
      assert.equal(Web3.utils.hexToNumberString(callParams.gasPrice), '5000000000')
      assert.equal(Web3.utils.hexToNumberString(callParams.gas), '21000')
    })
  })
})
