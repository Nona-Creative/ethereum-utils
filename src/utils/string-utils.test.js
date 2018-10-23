const {assert} = require('chai')
const parametrize = require('js-parametrize')

const {capitalize} = require('./string-utils')

describe('string utils', () => {
  describe('capitalize', () => {
    parametrize([
      ['abcdef', 'Abcdef'],
      ['abcDef', 'AbcDef'],
      ['Abcdef', 'Abcdef'],
      ['abc def', 'Abc def'],
    ], (str,  expected) => {
      it('should capitalize as expected', () => {
        assert.equal(capitalize(str), expected)
      })
    })
  })
})
