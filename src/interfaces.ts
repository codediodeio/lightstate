export interface CustomAction {
    type: string;
    payload?: any;
    handler?: (state: any, payload: any) => any;
  }
  
  export type MiddlewareFn = (
    current: any,
    next: any,
    action: string,
    opts?: Options
  ) => any;
  
  export interface Options {
    name: string;
    logger?: MiddlewareFn | false;
    devTools?: any; // pass devtools config
    middleware?: MiddlewareFn;
    [key: string]: any;
  }


  export type Getter = Function | string;