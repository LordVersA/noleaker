/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */

/** A member that was replaced, recorded so tests (and strict mode) can find every patch. */
export interface PatchedMember {
  owner: any;
  key: string;
  kind: 'method' | 'getter' | 'setter' | 'constructor';
}

/**
 * Helpers that make patched functions look native: right name/length, no `prototype`, and a
 * `[native code]` toString. One instance per realm, shared by every patch module.
 *
 * `strict` is the stealth switch. It can be turned on after the patches exist (the settings
 * arrive after the page's first instructions): it then re-shapes every patched function to copy
 * the own-property descriptors of the one it replaced, and from then on removes this
 * extension's frames from the stack of any error that passes through a patch.
 */
export interface Native {
  strict: boolean;
  /** Turn strict mode on or off, re-shaping already patched functions when it turns on. */
  setStrict(strict: boolean): void;
  /** Every member replaced through this instance. */
  patched: PatchedMember[];
  nativeStrings: WeakMap<object, string>;
  define(obj: any, key: PropertyKey, value: unknown): void;
  method(
    name: string,
    length: number,
    impl: (this: any, ...args: any[]) => any,
    original?: Function,
  ): any;
  patch(obj: any, key: string, make: (orig: any) => (this: any, ...args: any[]) => any): void;
  /** Replace an accessor's getter. Does nothing if the property is missing. */
  patchGetter(obj: any, key: string, value: (orig: () => unknown, self: any) => unknown): void;
  /** Replace a global function or constructor with a Proxy that has `handler`'s traps. */
  patchProxy(
    owner: any,
    name: string,
    Native: any,
    handler: Pick<ProxyHandler<any>, 'construct' | 'apply'>,
  ): any;
  /** Replace a global constructor with a Proxy whose arguments are rewritten by `wrapArgs`. */
  patchCtor(owner: any, name: string, Native: any, wrapArgs: (args: any[]) => any[]): any;
  /** Replace an accessor's setter. Does nothing if the property is missing. */
  patchSetter(
    obj: any,
    key: string,
    make: (origSet: (this: any, v: unknown) => void) => (this: any, v: unknown) => void,
  ): void;
}

const instances = new WeakMap<object, Native>();

/** Drop this extension's frames from an error's stack (they would reveal its URL). */
export function scrubStack(error: unknown): void {
  try {
    const e = error as { stack?: unknown };
    if (e && typeof e === 'object' && typeof e.stack === 'string') {
      e.stack = e.stack
        .split('\n')
        .filter((line) => !line.includes('chrome-extension://'))
        .join('\n');
    }
  } catch {
    // a frozen or exotic error object: leave it
  }
}

/** Give `fn` the own keys and name/length descriptors of `original`. */
function mirrorShape(fn: Function, original: Function): void {
  const wanted = Reflect.ownKeys(original);
  for (const key of Reflect.ownKeys(fn)) {
    if (!wanted.includes(key)) delete (fn as any)[key];
  }
  for (const key of ['length', 'name'] as const) {
    const desc = Object.getOwnPropertyDescriptor(original, key);
    if (desc) {
      delete (fn as any)[key];
      Object.defineProperty(fn, key, desc);
    }
  }
}

export function createNative(g: any, options: { strict?: boolean } = {}): Native {
  const existing = instances.get(g);
  if (existing) {
    if (options.strict !== undefined) existing.setStrict(options.strict);
    return existing;
  }

  const nativeStrings = new WeakMap<object, string>();
  const patched: PatchedMember[] = [];
  const shapes: [Function, Function][] = [];
  const protoFn: any = g.Function.prototype;

  function define(obj: any, key: PropertyKey, value: unknown): void {
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  /** Run `body`; in strict mode an error that escapes it loses this extension's stack frames. */
  function guarded<T>(body: () => T): T {
    try {
      return body();
    } catch (e) {
      if (native.strict) scrubStack(e);
      throw e;
    }
  }

  const toStringProxy = new Proxy(protoFn.toString, {
    apply: (target, thisArg, args) =>
      guarded(() => nativeStrings.get(thisArg) ?? Reflect.apply(target, thisArg, args)),
  });
  nativeStrings.set(toStringProxy, 'function toString() { [native code] }');
  define(protoFn, 'toString', toStringProxy);

  function method(
    name: string,
    length: number,
    impl: (this: any, ...args: any[]) => any,
    original?: Function,
  ): any {
    const fn = {
      [name](this: any, ...args: any[]) {
        return guarded(() => impl.apply(this, args));
      },
    }[name]!;
    Object.defineProperty(fn, 'length', { value: length, configurable: true });
    if (original) {
      shapes.push([fn, original]);
      if (native.strict) mirrorShape(fn, original);
    }
    nativeStrings.set(fn, `function ${name}() { [native code] }`);
    return fn;
  }

  function patch(
    obj: any,
    key: string,
    make: (orig: any) => (this: any, ...args: any[]) => any,
  ): void {
    const orig = obj[key];
    define(obj, key, method(key, orig.length, make(orig), orig));
    patched.push({ owner: obj, key, kind: 'method' });
  }

  function patchGetter(
    obj: any,
    key: string,
    value: (orig: () => unknown, self: any) => unknown,
  ): void {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc?.get) return;
    const orig = desc.get;
    const getter = method(
      `get ${key}`,
      0,
      function (this: any) {
        return value(() => orig.call(this), this);
      },
      orig,
    );
    Object.defineProperty(obj, key, { ...desc, get: getter });
    patched.push({ owner: obj, key, kind: 'getter' });
  }

  function patchSetter(
    obj: any,
    key: string,
    make: (origSet: (this: any, v: unknown) => void) => (this: any, v: unknown) => void,
  ): void {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc?.set) return;
    const orig = desc.set;
    const setter = method(`set ${key}`, 1, make(orig), orig);
    Object.defineProperty(obj, key, { ...desc, set: setter });
    patched.push({ owner: obj, key, kind: 'setter' });
  }

  function patchProxy(
    owner: any,
    name: string,
    Native: any,
    handler: Pick<ProxyHandler<any>, 'construct' | 'apply'>,
  ): any {
    const P = new Proxy(Native, {
      construct: (target, args, newTarget) =>
        guarded(() =>
          handler.construct
            ? handler.construct(target, args, newTarget)
            : Reflect.construct(target, args, newTarget),
        ),
      apply: (target, thisArg, args) =>
        guarded(() =>
          handler.apply
            ? handler.apply(target, thisArg, args)
            : Reflect.apply(target, thisArg, args),
        ),
    });
    nativeStrings.set(P, `function ${name}() { [native code] }`);
    define(owner, name, P);
    define(Native.prototype, 'constructor', P);
    patched.push({ owner, key: name, kind: 'constructor' });
    return P;
  }

  function patchCtor(owner: any, name: string, Native: any, wrapArgs: (args: any[]) => any[]): any {
    return patchProxy(owner, name, Native, {
      construct: (target, args, newTarget) => Reflect.construct(target, wrapArgs(args), newTarget),
      apply: (target, thisArg, args) => Reflect.apply(target, thisArg, wrapArgs(args)),
    });
  }

  function setStrict(strict: boolean): void {
    const turningOn = strict && !native.strict;
    native.strict = strict;
    if (turningOn) for (const [fn, original] of shapes) mirrorShape(fn, original);
  }

  const native: Native = {
    strict: options.strict ?? false,
    setStrict,
    patched,
    nativeStrings,
    define,
    method,
    patch,
    patchGetter,
    patchSetter,
    patchProxy,
    patchCtor,
  };
  instances.set(g, native);
  return native;
}
