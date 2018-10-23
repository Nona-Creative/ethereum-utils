const R = require('ramda')

// ----------------------------------------------
// capitalize
// ----------------------------------------------

const capitalize = R.converge(R.concat, [R.compose(R.toUpper, R.head), R.tail])
module.exports.capitalize = capitalize
