const moment = require('moment');

module.exports = {
  formatDate: function (date, format) {
    return moment.utc(date).format(`${format}`);
  },
  subtract: function (a, b) {
    return a - b;
  },
  add: function (a, b) {
    return a + b;
  },
  eq: function (a, b) {
    return a === b;
  },
  gt: function (a, b) {
    return a > b;
  },
  lt: function (a, b) {
    return a < b;
  },
  range: function (min, max) {
    return Array.from({ length: (max - min + 1) }, (_, i) => i + min);
  },
  json: function(context){
    return JSON.stringify(context)
  },
  length: function(array){
    return array.length
  },
  remember: function(previous, original){
    return previous ? previous : original;
  },
  select: function(value, comparer){
    return value == comparer ? 'selected' : ''
  },
  check: function(value, comparer){
    return value == comparer ? 'checked' : ''
  },
  limit: function(array, limit){
    return array.slice(0,limit)
  },
  isPairValid: function(el1, el2){
    if(el1.length && !el2.length) return false
    if(!el1.length && el2.length) return false
    return true
  },
  listFromLength: function(length){
    return Array.from({ length }, (_, i) => i + 1);
  },
  or: function (...conditions) {
    return conditions.some(Boolean);
  },
  arrayMatch: function(array, search, value1, value2){
    //console.log('arr -',array, 'search - ', search,value1,value2)
    if (!Array.isArray(array) || array.length === 0) {
      //console.warn('Provided array is not valid or empty.');
      return value2;
    }
    const find = array.filter(item => item.toString() === search.toString());
    return find.toString() === search.toString() ? value1 : value2
  },
  json2query: function(json){
    return new URLSearchParams(json).toString()
  }
  
}