import { sampleSize } from 'lodash';


export function logger(current, next, action, opts) {
    const info = {
      prev: current,
      next
    };
    console.log(action, info);
    return next;
  }
  
  export function rando(qty = 3) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUFWXYZ1234567890';
    return `sob-${sampleSize(chars, qty).join('')}`;
  }
  
  export function bypass(state, next, action) { return next };
  