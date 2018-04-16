import { StatefulObject } from '../src/StatefulObject';
import { Observable } from 'rxjs/Observable';
import { first } from 'rxjs/operators';
import { of } from 'rxjs/observable/of';

let state;
let defaultState = { hello: 'world' };
let defaultOpts = { name: 'test', logger: null };

describe('StatefulObject should', () => {
  beforeEach(() => {
    state = new StatefulObject(defaultState, defaultOpts);
  });

  afterEach(() => {});

  test('be defined', () => {
    expect(state).toBeDefined();
  });

  test.skip('should not expose the next method', () => {
    expect(state.next('foo')).toThrowError();
  });

  test('have a value', () => {
    expect(state.value).toBe(defaultState);
  });

  test('start with an INIT action', () => {
    expect(state.actions$.value.type).toBe('[test] INIT');
  });

  test('get a plain JS value', () => {
    expect(state.get()).toBe(defaultState);
  });

  test('get an Observable', async () => {
    expect(state.get$()).toBeInstanceOf(Observable);
    let val = await asyncGet(state.get$());
    expect(val).toBe(defaultState);

    state.set({ hola: 'mundo' });
    val = await asyncGet(state.get$('hola'));
    expect(val).toBe('mundo');
  });

  test('mutate destructively on set', () => {
    const newState = { foo: 'bar' };
    state.set(newState);
    expect(state.get()).toEqual(newState);
  });

  test('mutate destructively on set to a deep path', () => {
    const newState = { foo: 'bar' };
    state.setAt('deep.down', newState);
    expect(state.get('deep.down')).toEqual(newState);
  });

  test('mutate non-destructively on update', () => {
    const newState = { foo: 'bar' };
    state.update(newState);
    expect(state.get()).toEqual({ ...defaultState, ...newState });
  });

  test('remove values from the state', () => {
    const newState = { foo: { bar: 'deleteme' } };
    state.update(newState);
    expect(state.get('foo.bar')).toEqual('deleteme');

    state.remove('foo.bar');
    expect(state.get('foo.bar')).toBeUndefined();
  });

  test('clear the state', () => {
    state.clear();
    expect(state.get()).toEqual({});
  });

  test('reset to defaults', () => {
    const newState = { foo: 'bar' };
    state.update(newState);
    state.reset();
    expect(state.get()).toEqual(defaultState);
  });

  test('update the action stream', () => {
    const newState = { foo: 'bar' };
    state.update(newState);
    expect(state.actions$.value.type).toEqual('[test] UPDATE');

    state.clear();
    expect(state.actions$.value.type).toEqual('[test] CLEAR');
  });

  test('get values with dot notation', async () => {
    const newState = { foo: { bar: { baz: 'deep' } } };
    state.update(newState);
    expect(state.get('foo.bar.baz')).toEqual('deep');
    const val = await asyncGet(state.get$('foo.bar.baz'));
    expect(val).toBe('deep');
  });

  test('subscribe to an observable and update state', async () => {
    const newState = { tasty: 'beer' };
    const obsv = of(newState);
    expect(state.get('drinks')).toBeUndefined();
    expect(state.subs).toEqual({});

    state.async('drinks', obsv);
    expect(state.subs.drinks).toBeDefined();

    let val = await asyncGet(state.get$('drinks'));
    expect(val).toEqual(newState);
  });

  test('apply custom middleware', () => {
    const middleware = (state, next, action) => {
      return { ...next, gotcha: true };
    };

    expect(state.get('gotcha')).toBeFalsy();
    state.use(middleware);
    state.update({ howdy: 'partner' });

    expect(state.get('gotcha')).toBeTruthy();
  });

  test.skip('cancel uncompleted async operations', () => {});

  test.skip('work with promises', () => {});

  test.skip('emit observable complete', () => {});

  test.skip('query an array of objects', () => {});
});

/// HELPERS

function asyncGet(observable) {
  return observable.pipe(first()).toPromise();
}
