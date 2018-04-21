import { Observable } from 'rxjs/Observable';
import { Action } from './Action';

export function stringToAction(action) {
  return action instanceof Action ? action : new Action(action);
}

export function isAsync(data) {
  if (data instanceof Observable) return 'Observable';
  if (data instanceof Promise) return 'Promise';
  return false;
}
