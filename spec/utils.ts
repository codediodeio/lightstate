import { Observable } from 'rxjs/Observable';
import { first } from 'rxjs/operators';
import { of } from 'rxjs/observable/of';

export function asyncGet(observable) {
  return observable.pipe(first()).toPromise();
}
