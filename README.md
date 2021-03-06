[![CircleCI](https://circleci.com/gh/codediodeio/lightstate.svg?style=svg)](https://circleci.com/gh/codediodeio/lightstate)

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

# Notes

Status: Experimental

Part of a lesson on Continuous Integration for AngularFirebase.com

# LightState

_Why?_ Because the best code is the code you don't write. Convention over configuration.

_What?_ LightState is a magic state container designed for optimal developer happiness.

* Not a library, just a drop-in tool
* Simple data selection and mutation
* Automatic actions
* Automatic Observable/Promise management
* Intercept state changes with middleware
* Redux Dev Tools support out of the box
* Only dependency is RxJS

LightState is not opinionated. You can have one global state or multiple smaller states.

## Let there be State...

```
npm i lightstate -s
```

## Quick Start

LightState provides you with one thing - `StatefulObject`.

```js
// Define it
const state = new StatefulObject({ favorites: null });

// Slice it
const slice = state.at('favorites');

// Read it
slice.get$(); // as Rx Observable
slice.value; // as JS object

// Mutate it
slice.update({ beer: 'La Fin du Monde' });
```

Make sure to install [Redux Dev Tools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) to watch your state magically manage itself.

### Conventional Actions

Lightstate removes the mental boilerplate of redux by generating actions based on predictible [conventions](https://en.wikipedia.org/wiki/Convention_over_configuration).

When you mutate the state, it creates an action based on the following convention (you can override this behavior).

name - optional name of the stateful object
action - name of the action
path - where the action occured in dot notation

```text
[name] action@path
```

Synchronous mutations will look this this.

```text
[userState] UPDATE@profile.displayName
[userState] CLEAR
```

Async operations have their own convention. (1) start (2) mutate (3) complete/cancel/err.

```text
[userState] OBSERVABLE_START@reviews.phoenix
[userState] OBSERVABLE_UPDATE@reviews.phoenix
[userState] OBSERVABLE_COMPLETE@reviews.phoenix
```

### Options

You can can pass options as a second argument.

* `name` give your container a unique name for action creation (a random name is assigned by default).
* `devTools` devtools config or false (enabled by default)
* `logger` console log state changes (enabled by default)
* `middleware` a function that can intercept state changes
* `[key:string]` add your own options, then intercept them with middleware

```js
const opts = {
    name: 'user',
    devTools: false,
    middleware: myMiddlewareFunction
}
const state = new StatefulObject( default, opts )
```

## Select

All selectors can return a plain object, or `Observable` with a `$` convention.

```js
// From Root state
state.get('hello.world'); // JS Object
state.get$('hello.world'); // Rx Observable

// From Slice
const slice = state.at('hello.world');
slice.value; // JS Object
slice.get$(); // Rx Observable
```

See if a property exists

```js
state.has('some.deeply.nested.array[23]');
// returns boolean
```

Perform advanced collection filtering when you have an array of objects.

```js
state.where$('users', {
  age: v => v > 21,
  city: v => v === 'NYC'
});
// returns filtered Observable array
```

## Mutate

Set will override the entire object with new data.

```js
state.set({ username: 'nash' });
```

Update will only mutate the specified values.

```js
state.update({ age: 30 });
```

Modify deeply nested properties

```js
state.updateAt('users.userABC.profile', { name: 'doug' });
state.setAt(...);
```

Also

```js
state.clear(); // next state {}
state.reset(); // reset to initial state
```

## Slice

In most cases, you will need a reference to a specific slice of the stateful object.

```ts
const beer = state.at('beers.budlight.platinum');
```

A slice is just a scoped reference to the parent object, allowing you to to make references to deeply nested paths in the state.

```js
beer.update({ abv: 6.0 });
```

## Dispatch Custom Actions

You should use the mutation API above most of the time, but sometimes you might want to dispatch and handle an action manually.

Dispatch allows you to pass an action name, payload, and handler function (similar to a reducer function), then you return the next state.

```js
const handler = (state, payload) => {
  return { ...state, username: payload };
};
state.dispatch('CHANGE_USERNAME', payload, handler);
```

## Async Data

Async state management is a challenge on the web. The tool can automatically subscribe to Observables and resolve Promises, then make updates with the resolved values. It also keeps track of all running subscriptions in the state object, so you can manage, cancel, and analyze streaming subscriptions

### Method 1 - Automatic

```ts
const observable = http.get(...);

this.state.async('tasks.items', observable);
// note that it also works with promises
```

The `feed` method will subscribe to the Observable (or Promise), patch the emitted values to the state, and dispatch two actions:

1.  `OBSERVABLE_START@path` on subscribe
2.  `OBSERVABLE_SET@path` update with emitted data

Bonus features: If you feed multiple Observables to a path, it will automatically cancel previous requests. It will also let you know when your observable sends the complete signal.

3.  `OBSERVABLE_COMPLETE@path` on complete
4.  `OBSERVABLE_CANCEL@path` if unsubscribed automatically

You can access all active subscriptions the stateful object with `state.subs`

Works great with realtime data feeds like Firebase.

### Method 2 - Manually

You can dispatch arbitrary actions to signal the start of something async. This can be useful debugging or reacting to the action stream (see method 3).

```js
this.state.signal('MAKE_GET_REQUEST');
http.get(url).pipe(tap(data => {
    state.update(data)
})
.subscribe()
```

### Method 3 - React to an Action Stream

Inspired by NgRx Effects, you can listen to actions and react.

```ts
this.state.actions$
  .ofType('[mystate] MY_ACTION')
  .pipe(
    tap(action => {
      // do stuff
    })
  )
  .subscribe();
```

## Middleware

You can intercept state changes with middleware. For example, this package uses middleware to implement a logger and Redux Devtools. Just return the next state.

```ts
const yourMiddleware = (current, next, action, opts) => {
  console.log(current, next, action, opts);
  next = { ...next, hello: 'middleware' };
  return next;
};
```

You can pass middleware through options or by calling `use`. Note: Only one middleware function is allowed per StatefulObject.

```ts
const state = new StatefulObject({ name: 'bubba' }, opts);
state.use(yourMiddleware);
```

## Usage in Angular

If you have highly complex requirements, look into a fully integrated solution like NGXS or NgRX.

**Global Store, Redux Pattern**. If you want global store, create a service that instantiates a single `StatefulObject` then pass it around with Angular's DI.

**Smart parent, dumb children**. It's common to make a parent component stateful, then pass the state context down via `@Input()`. Don't be afraid to use multiple state containers. Each container gets a unique name and it's own instance in devtools.

**Get Creative**. This is not an opinionated library. Architect your own state management solution with this swiss army knife.
