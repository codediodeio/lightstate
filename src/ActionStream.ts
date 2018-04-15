import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { filter } from 'rxjs/operators';

export class ActionStream<T> extends BehaviorSubject<any> {

    constructor(private _default: any) {
        super(_default);
    }

    ofType(type: string) {
        return this.asObservable().pipe(filter(val => val === type));
    }
}