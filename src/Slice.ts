import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { fromPromise } from 'rxjs/observable/fromPromise';
import { Subscription } from 'rxjs/Subscription';
import { StatefulObject } from './StatefulObject';
import { CustomAction, MiddlewareFn, Options, Getter } from './interfaces';
import { AsyncMutation } from './AsyncMutation';

export class Slice<T> {
  constructor(private root: StatefulObject<any>, public path: string) {}

  get value() {
    return this.root.get(this.path);
  }

  get$() {
    return this.root.get$(this.path);
  }

  get exists() {
    return this.root.has(this.path);
  }

  set(data) {
    return this.root.setAt(this.path, data);
  }

  update(data) {
    return this.root.updateAt(this.path, data);
  }

  remove() {
    return this.root.remove(this.path);
  }

  async(dataSource, opts) {
    return this.root.async(this.path, dataSource, opts);
  }
}
