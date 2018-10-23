pragma solidity ^0.4.24;


/**
 * @title Example
 */
contract Example {

  uint256 _result = 0;

  event Sum(uint256 _a, uint256 _b, uint256 _result);

  function sum(uint256 _a, uint256 _b) external returns (uint256){
    _result = _a + _b;
    emit Sum(_a, _b, _result);
    return _result;
  }

  function getLastResult() external view returns (uint256) {
    return _result;
  }
}
