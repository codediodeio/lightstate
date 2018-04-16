import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { fromPromise } from 'rxjs/observable/fromPromise';
import { Subscription } from 'rxjs/Subscription';
import { ActionStream } from './ActionStream';
import { set, has, unset, get, filter, conforms } from 'lodash';
import { map, tap, distinctUntilChanged, finalize } from 'rxjs/operators';
import { CustomAction, MiddlewareFn, Options, Getter } from './interfaces';
import { rando, bypass, logger } from './functions';

export class Action {
  constructor(public type: string, public payload?: any) {}
}

export class StatefulObject<T> extends BehaviorSubject<any> {
  devTools: any;
  logger: MiddlewareFn | false;
  middleware: MiddlewareFn;
  actions$: ActionStream<any>;
  subs: { [key: string]: Subscription };

  constructor(private _default: any, public opts?: Options) {
    super(null);
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

  /// READS

  /**
   * Grab a state slice as an observable.
   * @param path    Pass a string value get('some.data'), or callback: state => state.some.data
   * @returns       Observable of selected state
   */
  get$<T>(path?: Getter): Observable<T> {
    let obs = this.asObservable();
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
    const action = new Action(this.actName('SET'), data);
    this.next(data, action);
  }

  setAt(path: string, data: any, opts = {} as any): void {
    const name = opts.name || 'SET';
    const action = new Action(this.actName(`${name}@${path}`), data);

    const curr = this.value;
    const next = set(curr, path, data);
    this.next(next, action);
  }

  update(data: any): void {
    const action = new Action(this.actName(`UPDATE`), data);
    const next = { ...this.value, ...data };
    this.next(next, action);
  }

  updateAt(path: string, data: any, opts = {} as any): void {
    // Format Action
    const name = opts.name || 'UPDATE';
    const action = new Action(this.actName(`${name}@${path}`), data);

    // Mutate Next
    const curr = this.value;
    let exists = get(curr, path);
    if (exists) {
      data = { ...exists, ...data };
    }
    const val = set(curr, path, data);
    const next = { ...this.value, ...val };

    // Execute
    this.next(next, action);
  }

  remove(path: string): void {
    const action = new Action(this.actName(`REMOVE@${path}`));
    const val = this.value;
    unset(val, path);
    const next = { ...this.value, ...val };
    this.next(next, action);
  }

  reset(): void {
    const action = new Action(this.actName('RESET'));
    this.next(this._default, action);
  }

  clear(): void {
    const action = new Action(this.actName('CLEAR'));
    this.next({}, action);
  }

  dispatch(act: CustomAction): void {
    const action = new Action(this.actName(act.type), act.payload);
    const next = act.handler(this.value, act.payload);
    this.next(next, action);
  }

  signal(name: string): void {
    const action = new Action(this.actName(name));
    this.next(this.value, action);
  }

  /// FEED

  // TODO why wont this union type allow "of(string)"?
  async(path: string, dataSource: Observable<any> | Promise<any> | any, opts = {} as any): void {
    // Obsv
    if (this.isAsync(dataSource) === 'Observable') {
      this.observableCancelPrev(path);
      this.signal(`OBSERVABLE_START@${path}`);
      const sub = (dataSource as Observable<any>)
        .pipe(
          tap(val => {
            this.setAt(path, val, { name: 'OBSERVABLE_SET' });
          }),
          finalize(() => {
            this.signal(`OBSERVABLE_COMPLETE@${path}`);
          })
        )
        .subscribe();

      this.subs[path] = sub;
    }
    if (this.isAsync(dataSource) === 'Promise') {
      this.promiseCancelPrev(path);
      this.signal(`PROMISE_START@${path}`);
      const sub = fromPromise(dataSource as Promise<any>)
        .pipe(
          tap(val => {
            this.setAt(path, val, { name: 'PROMISE_SET' });
          })
        )
        .subscribe();

      this.subs[path] = sub;
    }
  }

  private observableCancelPrev(path) {
    if (this.subs[path]) {
      this.signal(`OBSERVABLE_CANCEL@${path}`);
      this.subs[path].unsubscribe();
    }
  }

  private promiseCancelPrev(path) {
    if (this.subs[path]) {
      this.signal(`PROMISE_CANCEL@${path}`);
      this.subs[path].unsubscribe();
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
    action = this.stringToAction(action);
    next = this.middleware(this.value, next, action, this.opts);
    this.runDebuggers(this.value, next, action, this.opts);
    super.next(next);
  }

  private runDebuggers(state, next, action, opts) {
    console.log('DEV', action);
    if (this.devTools) this.devTools.send(action, next);
    if (this.logger) this.logger(state, next, action, opts);
  }

  private stringToAction(action) {
    return action instanceof Action ? action : new Action(action);
  }

  /// UTILS ///

  private actName(val) {
    return `[${this.opts.name}] ${val}`;
  }

  private isAsync(data) {
    if (data instanceof Observable) return 'Observable';
    if (data instanceof Promise) return 'Promise';
    return false;
  }
}
