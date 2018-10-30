const sinon = require('sinon')
const chai = require('chai')
const {assert} = require('chai')
const Web3 = require('web3')
const ganache = require('ganache-cli')
const path = require('path')
const fs = require('fs')
const R = require('ramda')
const find = require('find')
const solc = require('solc')
const tmp = require('tmp')
const chaiAsPromised = require('chai-as-promised')

const SUT = require('./contract-utils')

chai.use(chaiAsPromised)

describe('contract-utils', () => {

  let sandbox
  let tmpCleanup = null
  beforeEach(async () => sandbox = await sinon.createSandbox())
  afterEach(async () => {
    await sandbox.restore()
    if (tmpCleanup) tmpCleanup()
  })

  describe('call', () => {
    it('should correctly call sum and return result', async () => {
      // given
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()
      // ... an instance of Example contract
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)
      const instance = instances['Example.sol:Example']

      // when ... we call sum method with with 1 & 2 from account 0
      const method = instance.methods.sum(1, 2)
      const spy = sinon.spy(method, 'call')
      const result = await SUT.call(method, {from: accounts[0]})

      // then
      // ... should return result of sum operation (meaning sum was invoked with call not send)
      assert.equal(result, 3)
      // ... should have invoked sum call as expected
      const contractAddress = instance._address
      const callParams = spy.args[0][0]
      assert.equal(callParams.from.toLowerCase(), accounts[0].toLowerCase())
      assert.equal(callParams.to.toLowerCase(), contractAddress.toLowerCase())
    })
  })

  describe('send', () => {
    it('should correctly send sum and return transaction receipt', async () => {
      // given
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()
      // ... an instance of Example contract
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)
      const instance = instances['Example.sol:Example']

      // when ... we send sum method with 1 & 2 from account 0
      const method = instance.methods.sum(1, 2)
      const spy = sinon.spy(method, 'send')
      const tx = await SUT.send(method, {from: accounts[0]})

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
        'logsBloom',
        'events',
      ])
      // ... should have succeeded
      assert.equal(tx.status, true)
      // ... should have invoked sum send as expected
      const contractAddress = instance._address
      const callParams = spy.args[0][0]
      assert.equal(callParams.from.toLowerCase(), accounts[0].toLowerCase())
      assert.equal(callParams.to.toLowerCase(), contractAddress.toLowerCase())
    })

    it('should calculate gas using GAS_PRICE_GWEI env variable', async () => {
      // given
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()
      // ... an instance of Example contract
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)
      const instance = instances['Example.sol:Example']
      // ... and GAS_PRICE_GWEI env variable is set to 123
      sandbox.stub(process, 'env').value({GAS_PRICE_GWEI: '123'})

      // when ... we send sum method with with 1 & 2 from account 0
      const method = instance.methods.sum(1, 2)
      const estimateGasPrice = await method.estimateGas({from: accounts[0]})
      const spy = sinon.spy(method, 'send')
      const tx = await SUT.send(method, {from: accounts[0]})

      // then
      const callParams = spy.args[0][0]
      // ... should have used GAS_PRICE_GWEI env variable for gas price
      const gasPriceWei = Web3.utils.hexToNumber(callParams.gasPrice)
      assert.equal(gasPriceWei, Web3.utils.toWei('123', 'gwei'))
      // ... should have correctly estimated gas
      const gasWei = Web3.utils.hexToNumber(callParams.gas)
      assert.equal(gasWei, estimateGasPrice)
      // ... should have used exactly the estimated amount of gas
      assert.equal(tx.gasUsed, gasWei)
    })
  })

  describe('event', () => {
    it('should return Sum event from transaction receipt', async () => {
      // given
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()
      // ... an instance of Example contract
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)
      const instance = instances['Example.sol:Example']
      // ... and GAS_PRICE_GWEI env variable is set to 123
      sandbox.stub(process, 'env').value({GAS_PRICE_GWEI: '123'})
      // ... and a sum method transaction has been processed
      const tx = await SUT.send(instance.methods.sum(1, 2), {from: accounts[0]})

      // when ... we get the Sum events from the transaction receipt
      const SumEvents = await SUT.events('Sum', tx)

      // then
      // ... should return single event
      assert.equal(SumEvents.length, 1)
      // ... should return expected properties
      assert.deepEqual(SumEvents[0], {
        '0': '1',
        '1': '2',
        '2': '3',
        _a: '1',
        _b: '2',
        _result: '3',
      })
    })

    it('should return Sum event from transaction receipt (2)', async () => {
      // given
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()
      // ... an instance of Example contract
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)
      const instance = instances['Example.sol:Example']
      // ... and GAS_PRICE_GWEI env variable is set to 123
      sandbox.stub(process, 'env').value({GAS_PRICE_GWEI: '123'})
      // ... and multiple Sum events
      await SUT.send(instance.methods.sum(1, 2), {from: accounts[0]})
      await SUT.send(instance.methods.sum(3, 4), {from: accounts[0]})
      await SUT.send(instance.methods.sum(5, 6), {from: accounts[0]})
      // ... transactions in period
      const results = await instance.getPastEvents('Sum', {fromBlock: 0, toBlock: 'latest'})

      // when ... we get the Sum events from the matched events
      const SumEvents = await SUT.events('Sum', results)

      // then
      // ... should return all 3 events
      assert.equal(SumEvents.length, 3)
      // ... should return expected properties
      assert.deepEqual(SumEvents[0], {
        '0': '1',
        '1': '2',
        '2': '3',
        _a: '1',
        _b: '2',
        _result: '3',
      })
      assert.deepEqual(SumEvents[1], {
        '0': '3',
        '1': '4',
        '2': '7',
        _a: '3',
        _b: '4',
        _result: '7',
      })
      assert.deepEqual(SumEvents[2], {
        '0': '5',
        '1': '6',
        '2': '11',
        _a: '5',
        _b: '6',
        _result: '11',
      })
    })

    describe('event: single returnValue', () => {
      it('should return returnValues, when passed a single event', async () => {
        // when ... we get an event by providing the event
        // TODO: use factory TransactionReceiptEvent
        const txEvent = {
          blockNumber: 123,
          address: '0x123',
          returnValues: 'MY EVENT VALUES',
          event: 'MyEvent',
        }
        const result = await SUT.events('MyEvent', txEvent)

        // then ... should return the event's returnValues
        assert.deepEqual(result, 'MY EVENT VALUES')
      })
    })

    describe('tx receipts: single event', () => {
      it('should return target event returnValues in an array, when passed a tx receipt containing a single event', async () => {
        // when ... we get an event by providing the following transaction receipt
        // TODO: use factory TransactionReceipt(single event)
        const tx = {
          events: {
            MyEvent:  {returnValues: 'MY EVENT VALUES'},
            NotMyEvent: {returnValues: 'NOT MY EVENT VALUES'},
          },
        }
        const result = await SUT.events('MyEvent', tx)

        // then ... should return the event's returnValues
        assert.deepEqual(result, ['MY EVENT VALUES'])
      })

      it('should return empty array, when passed a tx receipt containing a single event that does not match', async () => {
        // when ... we get an event by providing the following transaction receipt
        // TODO: use factory TransactionReceipt(single event)
        const tx = {
          events: {
            NotMyEvent: {returnValues: 'NOT MY EVENT VALUES'},
          },
        }
        const result = await SUT.events('MyEvent', tx)

        // then ... should return empty array
        assert.deepEqual(result, [])
      })
    })

    describe('tx receipts: multiple events', () => {
      it('should return target event returnValues for all events, when passed a tx receipt containing multiple events', async () => {
        // when ... we get an event by providing the following transaction receipt
        // TODO: use factory TransactionReceipt(multiple events)
        const tx = {
          events: {
            NotMyEvent: [
              {returnValues: 'NOT MY EVENT 1 VALUES'},
              {returnValues: 'NOT MY EVENT 2 VALUES'},
            ],
            MyEvent: [
              {returnValues: 'MY EVENT 1 VALUES'},
              {returnValues: 'MY EVENT 2 VALUES'},
            ],
            AlsoNotMyEvent: {returnValues: 'ALSO NOT MY EVENT VALUES'},
          },
        }
        const result = await SUT.events('MyEvent', tx)

        // then ... should return the event's returnValues
        assert.deepEqual(result, [
          'MY EVENT 1 VALUES',
          'MY EVENT 2 VALUES',
        ])
      })

      it('should return empty array, when passed a tx receipt containing multiple events that do not match', async () => {
        // when ... we get an event by providing the following transaction receipt
        // TODO: use factory TransactionReceipt(multiple events)
        const tx = {
          events: {
            NotMyEvent: [
              {returnValues: 'NOT MY EVENT 1 VALUES'},
              {returnValues: 'NOT MY EVENT 2 VALUES'},
            ],
            AlsoNotMyEvent: {returnValues: 'ALSO NOT MY EVENT VALUES'},
          },
        }
        const result = await SUT.events('MyEvent', tx)

        // then ... should return empty array
        assert.deepEqual(result, [])
      })
    })
  })

  describe('findFirstPathRecursively', () => {
    it('should return full path of matched file path', () => {
      // given
      // ... the following files exist in our base directory
      sandbox.stub(find, 'fileSync').returns([
        'src/contracts/common/interfaces/IERC123.sol',
        'src/contracts/common/ERC123.sol',
        'src/contracts/Contract53/Contract53Mintable.sol',
      ])

      // when ... we find the following file recursively within the following base directory
      const result = SUT.findFirstPathRecursively('Contract53Mintable.sol', 'src/contracts')

      // then ... should return full path of match
      assert.equal(result, 'src/contracts/Contract53/Contract53Mintable.sol')
    })

    it('should return null if file cannot be found', () => {
      // given
      // ... the following files exist in our base directory
      sandbox.stub(find, 'fileSync').returns([
        'src/contracts/common/interfaces/IERC123.sol',
        'src/contracts/common/ERC123.sol',
        'src/contracts/Contract53/Contract53Mintable.sol',
      ])

      // when ... we find a file that does not exist within base
      const result = SUT.findFirstPathRecursively('DOES_NOT_EXIST.sol', 'src/contracts')

      // then ... should return null
      assert.equal(result, null)
    })
  })

  describe('findImports', () => {
    it('should return contents of missing import wrapped in an object', () => {
      // given
      // ... the following directory exists with provided files and contents
      const {name, removeCallback} = tmp.dirSync({
        prefix: 'DIRNAME-',
        unsafeCleanup: true,
      })
      tmpCleanup = removeCallback
      fs.writeFileSync(path.resolve(name, 'import1.sol'), 'IMPORT 1 CONTENTS')
      fs.writeFileSync(path.resolve(name, 'import2.sol'), 'IMPORT 2 CONTENTS')
      fs.writeFileSync(path.resolve(name, 'import3.sol'), 'IMPORT 3 CONTENTS')
      // ... and base will resolve as above directory
      sandbox.stub(path, 'resolve').returns(name)

      // when ... we try to find the following missing import
      const result = SUT.findImports('import2.sol')

      // then ... should return contents of missing import wrapped in an object
      assert.deepEqual(result, {contents: 'IMPORT 2 CONTENTS'})
    })

    it('should return no contents if missing import cannot be found', () => {
      // given ... contracts directory points to fixtures
      sandbox.stub(process, 'env').value({CONTRACTS_DIRECTORY: 'fixtures'})

      // when ... we try to find a missing import that does not exist
      const result = SUT.findImports('import2.sol')

      // then ... should return no contents if missing import cannot be found
      assert.deepEqual(result, {contents: ''})
    })
  })

  describe('prepareSourcesForCompile', () => {
    it('should correctly generate a sources object using the provided paths', () => {
      // given
      // ... the following directory exists with provided files and contents
      const {name, removeCallback} = tmp.dirSync({
        prefix: 'DIRNAME-',
        unsafeCleanup: true,
      })
      tmpCleanup = removeCallback
      fs.writeFileSync(path.resolve(name, 'contract1.sol'), 'CONTRACT 1 CONTENTS')
      fs.writeFileSync(path.resolve(name, 'contract2.sol'), 'CONTRACT 2 CONTENTS')
      fs.writeFileSync(path.resolve(name, 'contract3.sol'), 'CONTRACT 3 CONTENTS')
      // ... and base will resolve as above directory
      sandbox.stub(path, 'resolve')
        .onCall(0).returns(`${name}/contract1.sol`)
        .onCall(1).returns(`${name}/contract2.sol`)
        .returns(`${name}/contract3.sol`)

      // when ... we prepare sources for SolC compile with the following paths
      const paths = [
        `${name}/contract1`,
        `${name}/contract2`,
        `${name}/contract3`,
      ]
      const result = SUT.prepareSourcesForCompile(paths)

      // then
      // ... should return an object
      // ... with the filenames as keys
      // ... and file contents as values
      assert.deepEqual(result, {
        'contract1.sol': 'CONTRACT 1 CONTENTS',
        'contract2.sol': 'CONTRACT 2 CONTENTS',
        'contract3.sol': 'CONTRACT 3 CONTENTS',
      })
    })

    it('should return empty contents for any files that could not be found', () => {
      // given
      // ... the following directory exists with provided files and contents
      const {name, removeCallback} = tmp.dirSync({
        prefix: 'DIRNAME-',
        unsafeCleanup: true,
      })
      tmpCleanup = removeCallback
      fs.writeFileSync(path.resolve(name, 'contract1.sol'), 'CONTRACT 1 CONTENTS')
      fs.writeFileSync(path.resolve(name, 'contract3.sol'), 'CONTRACT 3 CONTENTS')
      // ... and base will resolve as above directory
      sandbox.stub(path, 'resolve')
        .onCall(0).returns(`${name}/contract1.sol`)
        .onCall(1).returns(`${name}/DOES_NOT_EXIST.sol`)
        .returns(`${name}/contract3.sol`)

      sandbox.stub(console, 'log')

      // when ... we prepare sources, and one of our paths do not exist
      const paths = [
        `${name}/contract1`,
        `${name}/DOES_NOT_EXIST`,
        `${name}/contract3`,
      ]
      const result = SUT.prepareSourcesForCompile(paths)

      // then
      // ... should still succeed for all valid paths, but return no contents for missing file
      assert.deepEqual(result, {
        'contract1.sol': 'CONTRACT 1 CONTENTS',
        'DOES_NOT_EXIST.sol': '',
        'contract3.sol': 'CONTRACT 3 CONTENTS',
      })
    })

    it('should return an empty object if provided no paths', () => {
      // when ... we prepare sources, but provide no paths
      const paths = []
      const result = SUT.prepareSourcesForCompile(paths)

      // then ... return an empty object
      assert.deepEqual(result, {})
    })
  })

  describe('compile', () => {
    it('should return SolC compiled contracts', async () => {
      // given
      // ... solc compiler will succeed and return the following contracts
      const solcSpy = sandbox.spy(solc, 'compile')
      // ... contracts directory points to fixtures
      sandbox.stub(process, 'env').value({CONTRACTS_DIRECTORY: 'fixtures'})

      // when ... we compile the Example contract
      const paths = ['Example']
      const result = await SUT.compile(paths)

      // should
      // ... have correctly compiled provided contracts with SolC compiler
      assert.hasAllKeys(solcSpy.args[0][0].sources, ['Example.sol'])
      // ... and should have compiled expected contracts
      assert.hasAllKeys(result, ['Example.sol:Example'])
    })

    it('should throw an Error if SolC compile returns errors', async () => {
      // given
      // ... all files have the following content
      sandbox.stub(fs, 'readFileSync').returns('FILE CONTENTS')
      // ... solc compiler fails returning the following errors
      sandbox.stub(solc, 'compile').returns({
        errors: ['NOTHING WENT WELL'],
        contracts: 'COMPILED CONTRACTS'
      })

      // when ... we compile the following paths
      const paths = [
        'common/ERC123',
        'common/ERC456',
        'Contract53/Contract53Mintable',
      ]
      await assert.isRejected(SUT.compile(paths), Error, 'NOTHING WENT WELL')
    })
  })

  describe('deploy', () => {
    it('should deploy all target contract to target network', async () => {
      // given
      // ... we are using the ganache virtual network
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()

      // when ... we deploy all the test compiled contracts (Example)
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instance = await SUT.deploy(accounts[0], compiledContracts['Example.sol:Example'], web3)

      // then ... should return expected contract instance
      assert.ok(R.has('sum', instance.methods))
      assert.ok(R.has('getLastResult', instance.methods))
    })
  })

  describe('deployAll', () => {
    it('should deploy all target contracts to target network', async () => {
      // given
      // ... we are using the ganache virtual network
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()

      // when ... we deploy all the test compiled contracts (Example)
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)

      // then
      // ... should return expected contract instances
      assert.hasAllKeys(instances, ['Example.sol:Example'])
    })
  })

  describe('getContract', () => {
    it('should return a new instance of Web3 Contract for the target contract', async () => {
      // given
      const web3 = new Web3(ganache.provider())
      const accounts = await web3.eth.getAccounts()
      // ... an instance of Example contract is deployed on virtual ganache network
      const filePath = path.resolve(process.cwd(), path.join('fixtures', 'test-compiled-contracts.json'))
      const compiledContracts = JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}))
      const instances = await SUT.deployAll(accounts[0], compiledContracts, web3)

      // when ... we get Contract instance using summary JSON
      const summary = require(path.resolve(path.join(process.cwd(), 'fixtures/test-contracts-summary.json')))
      const _getContract = SUT.getContract('ganache', web3.eth.Contract, 'Example')
      const instance = _getContract(summary)

      // then ... should return expected instance
      assert.hasAllDeepKeys(instance.methods, instances['Example.sol:Example'].methods)
    })
  })
})
