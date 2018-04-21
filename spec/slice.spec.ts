import { StatefulObject } from '../src/StatefulObject';
import { Observable } from 'rxjs/Observable';
import { first } from 'rxjs/operators';
import { of } from 'rxjs/observable/of';
import { asyncGet } from './utils';
import { Slice } from '../src/Slice';

let state;
let slice;
let defaultState = { hello: 'world' };
let defaultOpts = { name: 'test', logger: null };

describe('Slice should', () => {
  beforeEach(() => {
    state = new StatefulObject(defaultState, defaultOpts);
    slice = state.at('hello');
  });

  afterEach(() => {});

  test('be instantiated as a Slice', () => {
    expect(state).toBeInstanceOf(StatefulObject);
    expect(slice).toBeInstanceOf(Slice);
  });

  test('get its scoped value', () => {
    expect(slice.value).toEqual('world');
    expect(slice.exists).toBeTruthy();
  });

  test('get its value as observable', async () => {
    expect(slice.get$()).toBeInstanceOf(Observable);
    let val = await asyncGet(state.get$());
    expect(val).toBe(defaultState);
    expect(val).not.toBeFalsy();
  });

  test('be able to update itself', () => {
    // console.log(slice.value)
    const newVal = { howdy: 'partner' };
    expect(slice.value).toEqual('world');

    slice.update(newVal);
    expect(slice.value).toEqual(newVal);

    const anotherVal = { hasta: 'la vista' };
    slice.update(anotherVal);
    expect(slice.value).toEqual({ ...newVal, ...anotherVal });
  });

  test('be able to delete itself', () => {
    expect(slice.exists).toBeTruthy();
    slice.remove();
    expect(slice.exists).toBeFalsy();
  });

  test('be able to set itself', () => {
    const newVal = { foo: 'bar' };
    slice.set(newVal);
    expect(slice.value).toEqual(newVal);
  });

  test('be instantiated as a Slice', () => {});

  test('be instantiated as a Slice', () => {});

  test('be instantiated as a Slice', () => {});
});
