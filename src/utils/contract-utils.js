const R = require('ramda')
const Web3 = require('web3')
const BigNumber = require('big-number')
const find = require('find')
const path = require('path')
const fs = require('fs')
const solc = require('solc')

//-----------------------------------------
// call
// call method on contract instance
//-----------------------------------------

const call = async (method, {from, ...params}) => (
  await method.call({from, ...params})
)

module.exports.call = call

//-----------------------------------------
// send
// invoke method as a transaction on contract instance
//-----------------------------------------

const send = async (method, {from, ...params}, waitForReceipt = false) => {
  const gas = await method.estimateGas({from, ...params})
  const gasPriceGwei = R.propOr('6.2', 'GAS_PRICE_GWEI', process.env)
  const gasPrice = new BigNumber(Web3.utils.toWei(gasPriceGwei, 'gwei'))
  const data = {gas, gasPrice: gasPrice.toString(), from, ...params}
  return new Promise((resolve, reject) => {
    try {
      method.send(data)
        .on('transactionHash', transactionHash => (
          waitForReceipt ? null : resolve(transactionHash)
        ))
        .on('receipt', receipt => (
          waitForReceipt ? resolve(receipt) : null
        ))
    } catch (e) {
      console.log(e)
      reject(e)
    }
  })
}

module.exports.send = send

//-----------------------------------------
// events
// get all matches for target event
// from transaction receipt
// or transaction receipt event
//-----------------------------------------

const _events = (name, source) => {
  // source is invalid
  if (R.isNil(source)) return []

  // source is invalid or array of returnValues
  if (!R.has('events', source) && !R.has('returnValues', source)) {
    return R.map(R.prop('returnValues'))(source)
  }

  // source is transaction receipt event
  if (R.has('returnValues', source)) {
    return source.returnValues
  }

  // source is transaction receipt
  const matches = R.compose(
    R.ifElse(R.has('returnValues'), R.of, R.identity),
    R.propOr([], name),
  )(source.events)

  return _events(name, matches)
}

const events = R.curry(_events)

module.exports.events = events

//-----------------------------------------
// findImports
//-----------------------------------------

// returns the path of the first match for provided file path from provided base dir
// TODO: remove base var
const _findFirstPathRecursively = (filePath, base) => {
  const predicate = R.compose(R.head, R.match(new RegExp(`${filePath}$`)))
  return R.compose(
    R.ifElse(R.isEmpty, R.always(null), R.head),
    R.filter(predicate),
    find.fileSync,
  )(base)
}

const findFirstPathRecursively = R.curry(_findFirstPathRecursively)

module.exports.findFirstPathRecursively = findFirstPathRecursively

// find missing imports for SolC
// takes a path and returns the contents of the found file in an object {contents: ...}
const findImports = importPath => {
  return R.compose(
    contents => ({contents}),
    R.ifElse(
      R.isNil,
      R.always(''),
      R.tryCatch(
        x => fs.readFileSync(x, 'utf8'),
        R.compose(
          R.always(''),
          R.tap(x => console.log(x)),
        ),
      ),
    ),
    findFirstPathRecursively(importPath)
  )(path.resolve(process.cwd(), R.propOr('contracts', 'CONTRACTS_DIRECTORY', process.env)))
}

module.exports.findImports = findImports

//-----------------------------------------
// compile
//-----------------------------------------

const _compilePrepareSourcesKey = R.compose(
  R.last,
  R.split('/'),
  x => `${x}.sol`,
)

const _compilePrepareSourcesValue = R.compose(
  R.tryCatch(
    x => fs.readFileSync(x, 'utf8'),
    R.compose(
      R.always(''),
      R.tap(x => console.log(x)),
    ),
  ),
  x => path.resolve(process.cwd(), R.propOr('contracts', 'CONTRACTS_DIRECTORY', process.env), ...x),
  R.split('/'),
  x => `${x}.sol`,
)

// takes a list of paths and returns an object
// with the filenames as keys
// and file contents as values
const prepareSourcesForCompile = R.converge(
  R.zipObj,
  [
    R.map(_compilePrepareSourcesKey),
    R.map(_compilePrepareSourcesValue),
  ],
)

module.exports.prepareSourcesForCompile = prepareSourcesForCompile

// compile provided contracts
const compile = async contractImports => {
  const sources = prepareSourcesForCompile(contractImports)
  const {errors, contracts} = solc.compile({sources}, 1, findImports)

  if (errors) {
    throw Error(errors)
  }

  return contracts
}

module.exports.compile = compile

//-----------------------------------------
// deploy
// deploy single compiled contracts
//-----------------------------------------

const deploy = async (account, compiledContract, web3) => {
  // build contract
  const abi = JSON.parse(compiledContract.interface)
  const data = compiledContract.bytecode
  const contract = new web3.eth.Contract(abi).deploy({data})

  // skip contracts that did not build (they are probably interfaces)
  if (contract === null) {
    return
  }

  // deploy
  const gas = await contract.estimateGas()
  return await contract.send({from: account, gas})
}

module.exports.deploy = deploy

//-----------------------------------------
// deploy
// deploy multiple compiled contracts
//-----------------------------------------

const deployAll = async (account, contracts, web3) => {
  // prepare provided contracts
  const promises = R.map(
    async contract => await deploy(account, contract, web3),
    Object.values(contracts),
  )

  // deploy provided contracts
  const values = await Promise.all(promises)

  // return those that compiled and deployed (are not null)
  return R.filter(
    R.compose(R.not, R.equals(null)),
    R.zipObj(R.keys(contracts), values),
  )
}

module.exports.deployAll = deployAll

// ----------------------------------------------
// create contract instance
// ----------------------------------------------

const _getContract = (network, Class, name, summary) => (
  R.converge(
    R.ifElse(
      (abi, address) => abi !== null && address !== null,
      (abi, address) => new Class(abi, address),
      R.always(null),
    ),
    [
      R.path([name, 'abi']),
      R.path([name, 'addresses', network]),
    ],
  )(summary)
)

const getContract = R.curry(_getContract)

module.exports.getContract = getContract
