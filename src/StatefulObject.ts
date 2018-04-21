import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { fromPromise } from 'rxjs/observable/fromPromise';
import { Subscription } from 'rxjs/Subscription';
import { ActionStream } from './ActionStream';
import { set, has, unset, get, filter, conforms, isPlainObject } from 'lodash';
import { map, tap, distinctUntilChanged, finalize } from 'rxjs/operators';
import { CustomAction, MiddlewareFn, Options, Getter } from './interfaces';
import { rando, bypass, logger } from './functions';
import { Slice } from './Slice';
import { Action } from './Action';
import { ActionDefaults as a } from './ActionDefaults';
import { stringToAction, isAsync } from './utils';
import { AsyncMutation } from './AsyncMutation';

export class StatefulObject<T> {
  devTools: any;
  logger: MiddlewareFn | false;
  middleware: MiddlewareFn;
  actions$: BehaviorSubject<any>;
  subs: { [key: string]: AsyncMutation };
  _state: any;

  constructor(private _default: any, public opts?: Options) {
    const defaultName = get(opts, 'name') || rando();
    this.opts = {
      name: defaultName,
      devTools: { name: defaultName },
      logger: logger,
      ...opts
    };

    this.subs = {};

    this.middleware = this.opts.middleware || bypass;
    this.actions$ = new ActionStream(null);
    this._state = new BehaviorSubject(null);

    if (this.opts.logger) {
      this.logger = this.opts.logger;
    }

    const browserDevTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    if (this.opts.devTools && browserDevTools) {
      this.devTools = browserDevTools.connect(this.opts.devTools);
    }
    const initAction = new Action(this.actName('INIT'));
    this.next(_default, initAction);
  }

  /// SLICE

  at(path: string) {
    return new Slice(this, path);
  }

  /// READS

  /**
   * Grab a state slice as an observable.
   * @param path    Pass a string value get('some.data'), or callback: state => state.some.data
   * @returns       Observable of selected state
   */
  get$<T>(path?: Getter): Observable<T> {
    let obs = this._state.asObservable();
    if (typeof path === 'function') {
      obs = obs.pipe(map(val => path(val)), distinctUntilChanged());
    }

    if (typeof path === 'string') {
      obs = obs.pipe(map(val => get(val, path)), distinctUntilChanged());
    }
    return obs;
  }

  /**
   * Grab a state slice as a plain js object.
   * @param  {Getter} path?
   * @returns selected state as its stored primitive: object, string, etc.
   */
  get<T>(path?: Getter): T {
    let val = this.value;
    if (typeof path === 'function') {
      return path(this.value);
    }
    if (typeof path === 'string') {
      return get(val, path);
    }
    return val;
  }

  has(path: string): boolean {
    return has(this.value, path);
  }

  /// MUTATIONS

  set(data: any): void {
    const action = new Action(this.actName(a.Set), data);
    this.next(data, action);
  }

  setAt(path: string, data: any, opts = {} as any): void {
    const name = opts.name || a.Set;
    const action = new Action(this.actName(`${name}@${path}`), data);

    const curr = this.value;
    const next = set(curr, path, data);
    this.next(next, action);
  }

  update(data: any): void {
    const action = new Action(this.actName(a.Update), data);
    const next = { ...this.value, ...data };
    this.next(next, action);
  }

  updateAt(path: string, data: any, opts = {} as any): void {
    // Format Action
    const name = opts.name || a.Update;
    const action = new Action(this.actName(`${name}@${path}`), data);

    // Mutate Next
    const curr = this.value;
    let exists = get(curr, path);
    if (isPlainObject(exists)) {
      data = { ...exists, ...data };
    }

    const val = set(curr, path, data);
    const next = { ...this.value, ...val };

    // Execute
    this.next(next, action);
  }

  remove(path: string): void {
    const action = new Action(this.actName(`${a.Remove}@${path}`));
    const val = this.value;
    unset(val, path);
    const next = { ...this.value, ...val };
    this.next(next, action);
  }

  reset(): void {
    const action = new Action(this.actName(a.Reset));
    this.next(this._default, action);
  }

  clear(): void {
    const action = new Action(this.actName(a.Clear));
    this.next({}, action);
  }

  dispatch(customAction: CustomAction): void {
    const action = new Action(this.actName(customAction.type), customAction.payload);
    const next = customAction.handler(this.value, customAction.payload);
    this.next(next, action);
  }

  signal(name: string): void {
    const action = new Action(this.actName(name));
    this.next(this.value, action);
  }

  /// FEED

  // TODO why wont this union type allow "of(string)"?

  /**
   * Unwrap a Promise or Observable, then update the state with the emitted value
   * @param async    Pass a string value get('some.data'), or callback: state => state.some.data
   * @returns       void
   */
  async(path: string, dataSource: Observable<any> | Promise<any> | any, opts = {} as any): AsyncMutation {
    const current = this.subs[path];
    if (current) {
      current.stop();
    }

    const mutation = new AsyncMutation(this, path, dataSource, opts);
    this.subs[path] = mutation;
    mutation.run();
    return mutation;
  }

  private cancelPrev(path, actionName) {
    const prev = this.subs[path];
    if (prev) {
      this.signal(this.actName(`${actionName}@${path}`));
      prev.stop();
    }
  }

  /// QUERIES

  where(path: string, rules: any): object[] {
    const curr = this.get(path);
    return filter(curr, conforms(rules));
  }

  where$(path: string, rules: any): Observable<object[]> {
    return this.get$(path).pipe(map(curr => filter(curr, conforms(rules))));
  }

  /// MIDDLEWARE

  use(middleware: MiddlewareFn): void {
    this.middleware = middleware;
  }

  next(next, action?: Action) {
    this.actions$.next(action);
    action = stringToAction(action);
    next = this.middleware(this.value, next, action, this.opts);
    this.runDebuggers(this.value, next, action, this.opts);
    this._state.next(next);
  }

  /// HELPERS

  get value() {
    return this._state.value;
  }

  private runDebuggers(state, next, action, opts) {
    if (this.devTools) this.devTools.send(action, next);
    if (this.logger) this.logger(state, next, action, opts);
  }

  private actName(val) {
    return `[${this.opts.name}] ${val}`;
  }
}
