import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { map, filter } from 'rxjs/operators';
import { Action } from './Action';

export class ActionStream<T> extends BehaviorSubject<any> {
  constructor(private _default: any) {
    super(_default);
  }

  ofType(val: string) {
    return this.asObservable().pipe(
      filter(action => {
        return action.type === val;
      })
    );
  }
}
