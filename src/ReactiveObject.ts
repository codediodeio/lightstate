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

export class ReactiveObject<T> extends BehaviorSubject<any> {
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
    this.execute(null, _default, this.actName('INIT'), this.opts);
  }

  /// READS

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

    this.execute(this.value, data, action, this.opts);
  }

  setAt(path: string, data: any): void {
    const action = new Action(this.actName(`SET@${path}`), data);

    const curr = this.value;
    const val = set(curr, path, data);
    const next = { ...this.value, ...val };
    this.execute(this.value, data, action, this.opts);
  }

  update(data: any): void {
    const action = new Action(this.actName(`UPDATE`), data);
    const next = { ...this.value, ...data };
    this.execute(this.value, next, action, this.opts);
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
    this.execute(this.value, next, action, this.opts);
  }

  remove(path: string): void {
    const action = new Action(this.actName(`REMOVE@${path}`));
    const val = this.value;
    unset(val, path);
    const next = { ...this.value, ...val };
    this.execute(this.value, next, action, this.opts);
  }

  reset(): void {
    const action = new Action(this.actName('RESET'));
    this.execute(this.value, this._default, action, this.opts);
  }

  clear(): void {
    const action = new Action(this.actName('CLEAR'));
    this.execute(this.value, {}, action, this.opts);
  }

  dispatch(act: CustomAction) {
    const action = new Action(this.actName(act.type), act.payload);
    const next = act.handler(this.value, act.payload);
    this.execute(this.value, next, action, this.opts);
  }

  signal(name: string) {
    const action = new Action(this.actName(name));
    const curr = this.value;
    this.execute(curr, curr, action, this.opts);
  }

  /// FEED

  feed(path: string, data: Observable<any> | Promise<any>, opts?: any) {
    // Obsv
    if (this.isAsync(data) === 'Observable') {
      this.observableCancelPrev(path);
      this.signal(`OBSERVABLE_START@${path}`);
      const sub = (data as Observable<any>)
        .pipe(
          tap(val => {
            this.updateAt(path, val, { name: 'OBSERVABLE_EMIT' });
          }),
          finalize(() => {
            this.signal(`OBSERVABLE_START@${path}`);
          })
        )
        .subscribe();

      this.subs[path] = sub;
    }
    if (this.isAsync(data) === 'Promise') {
      this.promiseCancelPrev(path);
      this.signal(`PROMISE_START@${path}`);
      const sub = fromPromise(data as Promise<any>)
        .pipe(
          tap(val => {
            this.updateAt(path, val, { name: 'PROMISE_RESOLVE' });
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

  private execute(state, next, action, opts) {
    action = this.stringToAction(action);
    next = this.middleware(state, next, action, opts);
    this.runDebuggers(state, next, action, opts);
    this.next(next);
    this.actions$.next(action);
  }

  private runDebuggers(state, next, action, opts) {
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
