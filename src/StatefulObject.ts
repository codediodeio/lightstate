import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { fromPromise } from 'rxjs/observable/fromPromise';
import { Subscription } from 'rxjs/Subscription';
import { ActionStream } from './ActionStream';
import { set, has, unset, get, filter, conforms } from 'lodash';
import { map, tap, distinctUntilChanged, finalize } from 'rxjs/operators';
import { CustomAction, MiddlewareFn, Options, Getter } from './interfaces';
import { rando, bypass, logger } from './functions';

export class StatefulObject<T> extends BehaviorSubject<any> {
  devTools: any;
  logger: MiddlewareFn | false;
  middleware: MiddlewareFn;
  actions$: BehaviorSubject<any>;
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

    const browserDevTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__
    if (this.opts.devTools && browserDevTools) {
      this.devTools = browserDevTools.connect(
        this.opts.devTools
      );
    }
    this.execute(null, _default, this.actName('INIT'), this.opts);
  }

  /// READS

  get$(path?: Getter) {
    let obs = this.asObservable();
    if (typeof path === 'function') {
      obs = obs.pipe(map(val => path(val)), distinctUntilChanged());
    }

    if (typeof path === 'string') {
      obs = obs.pipe(map(val => get(val, path)), distinctUntilChanged());
    }
    return obs;
  }

  get(path?: Getter) {
    let val = this.value;
    if (typeof path === 'function') {
      return path(this.value);
    }
    if (typeof path === 'string') {
      return get(val, path);
    }
    return val;
  }

  has(path: string) {
    return has(this.value, path);
  }

  /// MUTATIONS

  set(data: any) {
    this.execute(this.value, data, this.actName('SET'), this.opts);
  }

  setAt(path: string, data: any) {
    const curr = this.value;
    const val = set(curr, path, data);
    const next = { ...this.value, ...val };
    this.execute(this.value, data, this.actName(`SET@${path}`), this.opts);
  }

  update(data: any) {
    const next = { ...this.value, ...data };
    this.execute(this.value, next, this.actName('UPDATE'), this.opts);
  }

  updateAt(path: string, data: any, opts?: any) {
    // const val = set(this.value, path, data)
    const curr = this.value;
    let exists = get(curr, path);
    if (exists) {
      data = { ...exists, ...data };
    }
    const val = set(curr, path, data);
    const next = { ...this.value, ...val };
    const name = get(opts, 'name') || 'UPDATE';
    this.execute(this.value, next, this.actName(`${name}@${path}`), this.opts);
  }

  remove(path: string) {
    const val = this.value;
    unset(val, path);
    const next = { ...this.value, ...val };
    this.execute(this.value, next, this.actName(`REMOVE@${path}`), this.opts);
  }

  reset() {
    this.execute(this.value, this._default, this.actName('RESET'), this.opts);
  }

  clear() {
    this.execute(this.value, {}, this.actName('CLEAR'), this.opts);
  }

  dispatch(act: CustomAction) {
    const next = act.handler(this.value, act.payload);
    this.execute(this.value, next, this.actName(act.type), this.opts);
  }

  signal(name: string) {
    const curr = this.value;
    this.execute(curr, curr, name, this.opts);
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

  where(path: string, rules: any) {
    const curr = this.get(path);
    return filter(curr, conforms(rules));
  }

  where$(path: string, rules: any) {
    return this.get$(path).pipe(map(curr => filter(curr, conforms(rules))));
  }

  /// MIDDLEWARE

  use(middleware: MiddlewareFn) {
    this.middleware = middleware;
  }

  private execute(state, next, action, opts) {
    next = this.middleware(state, next, action, opts);
    this.runDebuggers(state, next, action, opts);
    this.next(next);
    this.actions$.next(action);
  }

  private runDebuggers(state, next, action, opts) {
    if (this.devTools) this.devTools.send(action, next);
    if (this.logger) this.logger(state, next, action, opts);
  }

  /// UTILS

  private actName(val) {
    return `[${this.opts.name}] ${val}`;
  }

  private isAsync(data) {
    if (data instanceof Observable) return 'Observable';
    if (data instanceof Promise) return 'Promise';
    return false;
  }
}