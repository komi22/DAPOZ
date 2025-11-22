"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.arrayEqualityCheck = arrayEqualityCheck;
function arrayEqualityCheck(a, b) {
  if (Array.isArray(a) && Array.isArray(b) && a.length === 0 && b.length === 0) {
    // empty arrays are always equal, regardless of reference
    return true;
  }
  return a === b;
}