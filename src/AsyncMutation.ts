import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { fromPromise } from 'rxjs/observable/fromPromise';
import { Subscription } from 'rxjs/Subscription';
import { ActionStream } from './ActionStream';
import { set, has, unset, get, filter, conforms, isPlainObject } from 'lodash';
import { map, tap, distinctUntilChanged, finalize } from 'rxjs/operators';
import { CustomAction, MiddlewareFn, Options, Getter } from './interfaces';
import { StatefulObject } from './StatefulObject';
import { isAsync } from './utils';
import { ActionDefaults as a } from './ActionDefaults';

export class AsyncMutation {
  sub: Subscription;

  constructor(private root: StatefulObject<any>, private path: string, private source, private opts) {}

  run() {
    if (isAsync(this.source) === 'Observable') {
      this.handleObservable();
    }

    if (isAsync(this.source) === 'Promise') {
      this.handlePromise();
    }
  }

  pause() {
    // TODO
  }

  stop() {
    if (isAsync(this.source) === 'Observable') {
      this.root.signal(`${a.ObservableCancel}@${this.path}`);
    }

    if (isAsync(this.source) === 'Promise') {
      this.root.signal(`${a.PromiseCancel}@${this.path}`);
    }
    return this.sub.unsubscribe();
  }

  private handleObservable() {
    this.root.signal(`${a.ObservableStart}@${this.path}`);
    this.sub = (this.source as Observable<any>)
      .pipe(
        tap(val => {
          this.root.setAt(this.path, val, { name: a.ObservableSet });
        }),
        finalize(() => {
          this.root.signal(`${a.ObservableComplete}@${this.path}`);
        })
      )
      .subscribe();
  }

  private handlePromise() {
    this.root.signal(`${a.PromiseStart}@${this.path}`);
    this.sub = fromPromise(this.source as Promise<any>)
      .pipe(
        tap(val => {
          this.root.setAt(this.path, val, { name: `${a.PromiseSet}` });
        })
      )
      .subscribe();
  }
}
