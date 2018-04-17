export interface CustomAction {
  type: string;
  payload?: any;
  handler?: (state: any, payload: any) => any;
}

export type MiddlewareFn = (current: any, next: any, action: any, opts?: Options) => any;

export interface Options {
  name: string;
  logger?: MiddlewareFn | false;
  middleware?: MiddlewareFn;
  devTools?: any;
  [key: string]: any;
}

export type Getter = Function | string;
